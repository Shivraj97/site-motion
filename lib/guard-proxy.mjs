// A local forward proxy that enforces the SSRF guard at connect time for headless Chrome.
//
// Chrome is launched with --proxy-server pointing here, so it never resolves or connects to a site itself. For each
// request the proxy resolves the host, refuses it if ANY address is non-public (fetch-site.mjs isPrivateAddress), and
// connects to the exact address it just checked. There is no gap between check and connect for DNS rebinding to use.
//   - HTTPS: CONNECT host:443 → checked → raw TCP tunnel to the checked IP (TLS stays end-to-end with Chrome).
//   - HTTP: absolute-URI requests on port 80 → checked → forwarded to the checked IP with the original Host header.
//   - Other ports, schemes and loopback are refused, except origins passed in `allow` (tests serve fixtures locally).
//
//   const proxy = await startGuardProxy({ allow: ["127.0.0.1:5173"] });
//   launch({ args: proxyArgs(proxy.url) });  …  proxy.blocked (Set of refused hosts);  proxy.close();
import http from "node:http";
import net from "node:net";
import { defaultLookup, isPrivateAddress } from "./fetch-site.mjs";

// Chrome flags that route all traffic through the proxy and close the side doors
export const proxyArgs = (proxyUrl) => [
  `--proxy-server=${proxyUrl}`,
  "--proxy-bypass-list=<-loopback>", // loopback goes through the proxy too (Chrome bypasses it by default)
  "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", // if anything skipped the proxy it couldn't resolve a name
  "--disable-quic",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--dns-prefetch-disable",
];

const splitHostPort = (s) => {
  const m = s.match(/^\[([^\]]+)\]:(\d+)$/) || s.match(/^([^:]+):(\d+)$/);
  return m ? { host: m[1].toLowerCase(), port: Number(m[2]) } : null;
};

export async function startGuardProxy({ lookup = defaultLookup, allow = [] } = {}) {
  const blocked = new Set();
  const sockets = new Set();
  const allowed = new Set(allow.map((a) => a.toLowerCase()));

  // → the address to connect to, or null (and the host is recorded as blocked)
  async function resolveSafe(host, port, wantPort) {
    if (allowed.has(`${host}:${port}`)) return host;
    if (port !== wantPort || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) { blocked.add(host); return null; }
    let list;
    if (net.isIP(host)) list = [{ address: host }];
    else {
      try { list = [].concat(await lookup(host)); } catch { return null; } // unresolvable: not blocked, just unreachable
    }
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) { blocked.add(host); return null; }
    return list[0].address;
  }

  const server = http.createServer(async (req, res) => {
    let u;
    try { u = new URL(req.url); } catch { res.writeHead(400); return res.end(); }
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const port = Number(u.port || 80);
    const addr = u.protocol === "http:" ? await resolveSafe(host, port, 80) : (blocked.add(host), null);
    if (!addr) { res.writeHead(403, { "content-type": "text/plain" }); return res.end("blocked by site-motion network guard"); }
    const headers = { ...req.headers, host: u.host };
    delete headers["proxy-connection"];
    const up = http.request({ host: addr, port, method: req.method, path: u.pathname + u.search, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });

  server.on("connect", async (req, client, head) => {
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => {});
    const target = splitHostPort(req.url || "");
    const addr = target && (await resolveSafe(target.host, target.port, 443));
    if (!addr) { client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    const up = net.connect(target.port, addr, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) up.write(head);
      up.pipe(client);
      client.pipe(up);
    });
    sockets.add(up);
    up.on("close", () => sockets.delete(up));
    up.on("error", () => client.destroy());
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });

  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    blocked,
    close() {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
