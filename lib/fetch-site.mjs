// Fetch a page's HTML and up to 6 stylesheets for extract-tokens, safely enough to run on a public endpoint.
//
//   import { fetchSite, assertPublicUrl } from "./fetch-site.mjs";
//   const { url, html, css, notes } = await fetchSite("https://example.com");
//
// The guard (assertPublicUrl) is exported for the Vercel function to reuse:
//   - http/https only, default ports or 80/443 only, no credentials in the URL;
//   - the host is resolved and every address must be public: loopback, private, link-local, CGNAT, metadata
//     (169.254.169.254, fd00:ec2::254), multicast, reserved and documentation ranges are refused, for IPv4 and IPv6,
//     including IPv4 embedded in IPv6 (::ffff:a.b.c.d, NAT64, 6to4);
//   - the check runs again on every redirect (3 at most), and the socket itself connects through a lookup that
//     re-checks the address it is about to use, so DNS rebinding between check and connect doesn't get through.
// Limits: 5 s for everything, HTML up to 1.5 MB, each stylesheet up to 1 MB (bodies past the cap are truncated).
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { cssImports, stylesheetLinks } from "./extract-tokens.mjs";

export const LIMITS = { timeoutMs: 5000, maxHtml: 1.5 * 1024 * 1024, maxCss: 1024 * 1024, maxSheets: 6, maxRedirects: 3 };
const UA = "Mozilla/5.0 (compatible; site-motion-theme/0.1; +https://github.com/site-motion)";

export class FetchError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = "FetchError"; }
}

/* ───────────── address checks ───────────── */

const v4ToInt = (ip) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => [v4ToInt(base), bits]);

function v4Private(ip) {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

// "::ffff:1.2.3.4" / "fe80::1%en0" → eight 16-bit groups
function v6Groups(ip) {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    s = s.slice(0, -tail[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const [head, rest] = s.split("::");
  const a = head ? head.split(":") : [];
  const b = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const fill = rest !== undefined ? Array(8 - a.length - b.length).fill("0") : [];
  return [...a, ...fill, ...b].map((x) => parseInt(x || "0", 16));
}
const groupsToV4 = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");

function v6Private(ip) {
  const g = v6Groups(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return true;
  const zeroTo = (k) => g.slice(0, k).every((x) => x === 0);
  if (zeroTo(8)) return true; // ::
  if (zeroTo(7) && g[7] === 1) return true; // ::1
  if (zeroTo(5) && g[5] === 0xffff) return v4Private(groupsToV4(g[6], g[7])); // ::ffff:a.b.c.d
  if (zeroTo(6)) return true; // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Private(groupsToV4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return v4Private(groupsToV4(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (incl. fd00:ec2::254 metadata)
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

// true for any address a public fetcher must not reach (unparseable counts as private)
export function isPrivateAddress(ip) {
  const kind = net.isIP(String(ip).replace(/%.*$/, ""));
  if (kind === 4) return v4Private(ip);
  if (kind === 6) return v6Private(ip);
  return true;
}

export const defaultLookup = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

// Throws FetchError unless `input` is an http(s) URL on port 80/443 whose host resolves only to public addresses.
// Returns { url: URL, addresses: [{ address, family }] }.
export async function assertPublicUrl(input, { lookup = defaultLookup } = {}) {
  let u;
  try { u = input instanceof URL ? input : new URL(String(input)); } catch { throw new FetchError("bad_url", `not a URL: ${input}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("bad_scheme", `only http and https URLs are allowed (got ${u.protocol})`);
  if (u.username || u.password) throw new FetchError("bad_url", "URLs with credentials are not allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchError("bad_port", `only ports 80 and 443 are allowed (got ${u.port})`);
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new FetchError("blocked_host", `host ${host || "(empty)"} is not public`);
  }
  let addresses;
  if (net.isIP(host)) addresses = [{ address: host, family: net.isIP(host) }];
  else {
    try { addresses = await lookup(host); } catch (e) { throw new FetchError("dns", `could not resolve ${host} (${e.code || e.message})`); }
    if (!Array.isArray(addresses)) addresses = [addresses];
    if (!addresses.length) throw new FetchError("dns", `${host} has no addresses`);
  }
  const bad = addresses.find((a) => isPrivateAddress(a.address));
  if (bad) throw new FetchError("blocked_address", `${host} resolves to a non-public address (${bad.address})`);
  return { url: u, addresses };
}

/* ───────────── transport ───────────── */

// Socket-level lookup: every address Node is about to connect to is checked again (DNS rebinding).
function guardedLookup(lookup) {
  return (hostname, options, cb) => {
    if (typeof options === "function") { cb = options; options = {}; }
    Promise.resolve(lookup(hostname)).then((list) => {
      list = Array.isArray(list) ? list : [list];
      if (options.family) list = list.filter((a) => a.family === options.family);
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad || !list.length) return cb(Object.assign(new Error(bad ? `blocked address ${bad.address}` : `no address for ${hostname}`), { code: bad ? "EBLOCKED" : "ENOTFOUND" }));
      if (options.all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    }, (e) => cb(e));
  };
}

// One GET with no redirect following. Resolves { status, headers, body: string, truncated }.
export function httpGet(url, { signal, maxBytes, lookup = defaultLookup, accept = "*/*" }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, {
      method: "GET",
      signal,
      lookup: guardedLookup(lookup),
      headers: { "user-agent": UA, accept, "accept-encoding": "gzip, deflate, br", "accept-language": "en" },
    }, (res) => {
      const enc = String(res.headers["content-encoding"] || "").toLowerCase();
      let stream = res;
      if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      const chunks = [];
      let size = 0, truncated = false, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated });
      };
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return finish(); }
      stream.on("data", (chunk) => {
        if (done) return;
        const room = maxBytes - size;
        if (chunk.length > room) { chunks.push(chunk.subarray(0, room)); size = maxBytes; truncated = true; finish(); req.destroy(); return; }
        chunks.push(chunk);
        size += chunk.length;
      });
      stream.on("end", finish);
      stream.on("error", (e) => (done ? null : (chunks.length ? finish() : reject(e))));
    });
    req.on("error", (e) => {
      if (e.code === "EBLOCKED") reject(new FetchError("blocked_address", e.message));
      else if (e.name === "AbortError" || signal?.aborted) reject(new FetchError("timeout", "the site took longer than 5 s to respond"));
      else reject(new FetchError("network", `${u.hostname}: ${e.code || e.message}`));
    });
    req.end();
  });
}

/* ───────────── fetchSite ───────────── */

// GET with guarded redirects. `get` is the transport (stubbed in tests).
async function guardedGet(url, { get, lookup, signal, maxBytes, accept, maxRedirects }) {
  let current = url;
  for (let hop = 0; ; hop++) {
    const { url: checked } = await assertPublicUrl(current, { lookup });
    if (signal.aborted) throw new FetchError("timeout", "the site took longer than 5 s to respond");
    const res = await get(checked.href, { signal, maxBytes, lookup, accept });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop >= maxRedirects) throw new FetchError("too_many_redirects", `more than ${maxRedirects} redirects`);
      current = new URL(res.headers.location, checked).href;
      continue;
    }
    return { ...res, url: checked.href };
  }
}

export async function fetchSite(input, opts = {}) {
  const { get = httpGet, lookup = defaultLookup } = opts;
  const lim = { ...LIMITS, ...opts };
  const notes = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), lim.timeoutMs);
  const signal = controller.signal;
  try {
    const raw = String(input).trim();
    const start = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const page = await guardedGet(start, { get, lookup, signal, maxBytes: lim.maxHtml, accept: "text/html,application/xhtml+xml", maxRedirects: lim.maxRedirects });
    if (page.status >= 400) throw new FetchError("http_status", `the site answered ${page.status}`);
    const type = String(page.headers["content-type"] || "");
    if (type && !/html|xml/i.test(type)) throw new FetchError("not_html", `not an HTML page (${type.split(";")[0]})`);
    if (page.truncated) notes.push(`HTML was larger than ${(lim.maxHtml / 1048576).toFixed(1)} MB; read the first part only`);

    const queue = stylesheetLinks(page.body, page.url);
    const css = [];
    const seen = new Set();
    const fetchSheet = async (href) => {
      try {
        const res = await guardedGet(href, { get, lookup, signal, maxBytes: lim.maxCss, accept: "text/css,*/*;q=0.1", maxRedirects: lim.maxRedirects });
        if (res.status >= 400) { notes.push(`stylesheet ${href} answered ${res.status}`); return null; }
        if (/text\/html/i.test(String(res.headers["content-type"] || ""))) { notes.push(`stylesheet ${href} returned HTML; skipped`); return null; }
        if (res.truncated) notes.push(`stylesheet ${href} was larger than 1 MB; read the first part only`);
        return { href: res.url, body: res.body };
      } catch (e) {
        notes.push(`stylesheet ${href} skipped (${e.code === "timeout" ? "out of time" : e.message})`);
        return null;
      }
    };
    // linked sheets in parallel, then one level of @import while the budget lasts
    let batch = queue.filter((h) => !seen.has(h) && seen.add(h)).slice(0, lim.maxSheets);
    if (queue.length > lim.maxSheets) notes.push(`page links ${queue.length} stylesheets; read the first ${lim.maxSheets}`);
    for (let round = 0; batch.length && round < 2; round++) {
      const got = (await Promise.all(batch.map(fetchSheet))).filter(Boolean);
      css.push(...got.map((x) => x.body));
      const room = lim.maxSheets - seen.size;
      batch = room > 0 ? got.flatMap((x) => cssImports(x.body, x.href)).filter((h) => !seen.has(h) && seen.add(h)).slice(0, room) : [];
    }
    return { url: page.url, html: page.body, css, notes };
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if (signal.aborted) throw new FetchError("timeout", "the site took longer than 5 s to respond");
    throw new FetchError("network", e.message);
  } finally {
    clearTimeout(timer);
  }
}
