// node --test 'lib/*.test.mjs'   — the rendered (headless Chrome) extractor on synthetic fixtures, served locally.
// Chrome tests skip when no Chrome is installed; the PNG decoder test always runs.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { deflateSync } from "node:zlib";
import { ROOT } from "./build.mjs";
import { extractRendered, hasChrome } from "./extract-rendered.mjs";
import { contrast, extractTokens, oklab, parseColor } from "./extract-tokens.mjs";
import { decodePng } from "./png.mjs";
import { startGuardProxy } from "./guard-proxy.mjs";
import { request } from "node:http";

const FIX = join(ROOT, "test", "fixtures");
const ALIASES = { "/site.css": "light.css", "/app.css": "dark.css" };
const skip = hasChrome() ? false : "no Chrome installed";
const hex = (s) => parseColor(s);
const dE = (a, b) => { const p = oklab(hex(a)), q = oklab(hex(b)); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

let server, base;
before(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(FIX, ALIASES[path] || path);
    if (!file.startsWith(FIX) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const measure = (path, opts = {}) => extractRendered(base + path, { allowOrigins: [base], ...opts });

/* ───────────── png.mjs ───────────── */

test("decodePng reads every filter type", () => {
  const w = 3, h = 5, px = [];
  for (let i = 0; i < w * h * 4; i++) px.push((i * 37 + 11) & 255);
  const row = (y) => px.slice(y * w * 4, (y + 1) * w * 4);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const raw = [];
  for (let y = 0; y < h; y++) {
    const f = y % 5, cur = row(y), prev = y ? row(y - 1) : Array(w * 4).fill(0);
    raw.push(f);
    for (let x = 0; x < w * 4; x++) {
      const a = x >= 4 ? cur[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      raw.push((cur[x] - pred) & 255);
    }
  }
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); return Buffer.concat([len, Buffer.from(type, "latin1"), body, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);
  const out = decodePng(png);
  assert.equal(out.width, w);
  assert.equal(out.height, h);
  assert.deepEqual([...out.data], px);
});

/* ───────────── what only a browser can see ───────────── */

test("js-styled: colours applied by script are measured (source reading misses them)", { skip }, async () => {
  const { tokens } = await measure("/rendered/js-styled.html");
  assert.equal(tokens.color.paper, "#0e1b2b");
  assert.equal(tokens.color.ink, "#e8eef5");
  assert.equal(tokens.color.accent, "#ff7a1a");
  const fast = extractTokens({ html: readFileSync(join(FIX, "rendered/js-styled.html"), "utf8"), url: base });
  assert.equal(fast.tokens.color.paper, "#ffffff", "the static path can't see script-applied styles");
});

test("svg-logo: a brand colour that only exists in the logo SVG becomes the accent", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/svg-logo.html");
  assert.ok(dE(tokens.color.accent, "#e0218a") < 0.03, `accent ${tokens.color.accent}`);
  assert.ok(notes.some((n) => /accent .*logo/.test(n)), notes.join("\n"));
  const fast = extractTokens({ html: readFileSync(join(FIX, "rendered/svg-logo.html"), "utf8"), url: base });
  assert.equal(fast.tokens.color.accent, "#141414", "the static path sees a monochrome site");
});

test("cookie-banner: a fixed consent banner is ignored for paper and accent", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/cookie-banner.html");
  assert.equal(tokens.color.paper, "#f7f7f5");
  assert.equal(tokens.color.accent, "#1d4ed8");
  assert.ok(notes.some((n) => /hid cookie banner before measuring \(not accepted\)/.test(n)), notes.join("\n"));
});

test("layers: the real @layer order decides (the static cascade flattens it)", { skip }, async () => {
  const { tokens } = await measure("/rendered/layers.html");
  assert.equal(tokens.color.paper, "#f6f1e7");
  assert.equal(tokens.color.ink, "#1b1b1b");
  assert.equal(tokens.color.accent, "#b4441f");
});

test("display-font: a heading face distinct from body becomes font.display", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/display-font.html");
  assert.match(tokens.font.sans, /^'DM Sans'/);
  assert.match(tokens.font.display, /^'Bebas Neue'/);
  assert.match(tokens.font.import, /family=Bebas\+Neue/);
  assert.ok(notes.some((n) => /font\.display: "Druk Wide" isn't on Google Fonts; substituted Bebas Neue/.test(n)), notes.join("\n"));
  assert.equal(tokens.color.accent, "#dc2626");
  assert.deepEqual(tokens.radius, { sm: 8, md: 16, lg: 24 });
});

test("guard: requests to private addresses are blocked and counted", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/guard.html");
  assert.ok(notes.some((n) => /blocked 2 non-public hosts/.test(n) && /169\.254\.169\.254/.test(n) && /10\.0\.0\.1/.test(n)), notes.join("\n"));
  assert.equal(tokens.color.accent, "#7c3aed");
});

test("guard: a private start URL is refused before Chrome starts", async () => {
  await assert.rejects(extractRendered("http://169.254.169.254/"), (e) => e.code === "blocked_address");
  await assert.rejects(extractRendered("file:///etc/passwd"), (e) => e.code === "bad_scheme");
});

/* ───────────── heuristics adapted from dembrandt (MIT): consent UI, status colours, class hints, home-link logos ───────────── */

test("consent iframe: the modal and its dimming backdrop are hidden, not accepted", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/consent-iframe.html");
  assert.equal(tokens.color.paper, "#f4f1ea", "the backdrop must not tint the paper");
  assert.equal(tokens.color.accent, "#0e7490", "the consent iframe's red button must not win");
  assert.ok(notes.some((n) => /hid Sourcepoint.* before measuring \(not accepted\)/.test(n)), notes.join("\n"));
});

test("consent in a shadow root: hidden, so its bright accept button isn't the accent", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/consent-shadow.html");
  assert.equal(tokens.color.paper, "#ffffff");
  assert.equal(tokens.color.accent, "#4f46e5");
  assert.ok(notes.some((n) => /hid consent \(shadow DOM\)/.test(n)), notes.join("\n"));
});

test("status colours: error alerts, danger buttons and amber warnings never become the accent or palette", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/status-colours.html");
  assert.equal(tokens.color.accent, "#0d9488");
  assert.ok(notes.some((n) => /skipped status colours/.test(n)));
  assert.ok(!notes.some((n) => /palette includes .*(#dc2626|#d97706)/.test(n)), notes.join("\n"));
});

test("class hints: .btn-primary outranks an equally sized plain button", { skip }, async () => {
  const { tokens } = await measure("/rendered/class-hints.html");
  assert.equal(tokens.color.accent, "#4338ca");
});

test("home-link logo: an SVG inside a localized home link (/en/) gives the accent on a black-button site", { skip }, async () => {
  const { tokens, notes } = await measure("/rendered/home-logo.html");
  assert.ok(dE(tokens.color.accent, "#0284c7") < 0.03, `accent ${tokens.color.accent}`);
  assert.ok(notes.some((n) => /accent .*logo/.test(n)), notes.join("\n"));
});

/* ───────────── guard proxy: the check and the connection use the same address ───────────── */

const viaProxy = (proxyUrl, opts) => new Promise((resolve, reject) => {
  const { hostname, port } = new URL(proxyUrl);
  const req = request({ host: hostname, port, ...opts });
  req.on("connect", (res, socket) => { socket.destroy(); resolve(res.statusCode); });
  req.on("response", (res) => { let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, body })); });
  req.on("error", reject);
  req.end();
});

test("guard proxy refuses private targets, odd ports and rebinding hosts, and passes allowed origins", async () => {
  const lookup = async (host) => ({ "rebind.test": [{ address: "127.0.0.1", family: 4 }], "good.test": [{ address: "93.184.216.34", family: 4 }] })[host] || Promise.reject(new Error("ENOTFOUND"));
  const proxy = await startGuardProxy({ lookup, allow: [base.replace("http://", "")] });
  try {
    assert.equal(await viaProxy(proxy.url, { method: "CONNECT", path: "rebind.test:443" }), 403);
    assert.equal(await viaProxy(proxy.url, { method: "CONNECT", path: "169.254.169.254:443" }), 403);
    assert.equal(await viaProxy(proxy.url, { method: "CONNECT", path: "[::1]:443" }), 403);
    assert.equal(await viaProxy(proxy.url, { method: "CONNECT", path: "good.test:8443" }), 403);
    assert.equal((await viaProxy(proxy.url, { method: "GET", path: "http://rebind.test/secret" })).status, 403);
    assert.equal((await viaProxy(proxy.url, { method: "GET", path: "http://localhost/" })).status, 403);
    assert.deepEqual([...proxy.blocked].sort(), ["169.254.169.254", "::1", "good.test", "localhost", "rebind.test"]);
    const ok = await viaProxy(proxy.url, { method: "GET", path: `${base}/rendered/guard.html` });
    assert.equal(ok.status, 200);
    assert.match(ok.body, /Guard fixture/);
  } finally {
    proxy.close();
  }
});

test("guard: DNS rebinding (public at check time, private at connect time) never connects", { skip }, async () => {
  let calls = 0;
  const lookup = async (host) => {
    if (host !== "rebind.test") throw new Error("ENOTFOUND");
    calls++;
    return [{ address: calls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
  };
  const { tokens, notes } = await measure("/rendered/rebinding.html", { lookup });
  assert.ok(calls >= 2, "the proxy resolved the host again instead of trusting the first check");
  assert.ok(notes.some((n) => /blocked 1 non-public host .*rebind\.test/.test(n)), notes.join("\n"));
  assert.equal(tokens.color.accent, "#0f766e");
});

/* ───────────── parity with the static extractor on the shared fixtures ───────────── */

const SHARED = [["/light.html", ["light.css"]], ["/dark.html", ["dark.css"]], ["/vars.html", []], ["/google-fonts.html", []], ["/licensed-font.html", []]];
for (const [path, sheets] of SHARED) {
  test(`parity ${path}: same paper, accent and sans font as the static path; readable ink`, { skip }, async () => {
    const fast = extractTokens({ html: readFileSync(join(FIX, path), "utf8"), css: sheets.map((f) => readFileSync(join(FIX, f), "utf8")), url: base });
    const { tokens } = await measure(path);
    assert.ok(dE(tokens.color.paper, fast.tokens.color.paper) < 0.03, `paper ${tokens.color.paper} vs ${fast.tokens.color.paper}`);
    assert.ok(dE(tokens.color.accent, fast.tokens.color.accent) < 0.03, `accent ${tokens.color.accent} vs ${fast.tokens.color.accent}`);
    assert.ok(dE(tokens.color.ink, fast.tokens.color.ink) < 0.08, `ink ${tokens.color.ink} vs ${fast.tokens.color.ink}`);
    assert.ok(contrast(hex(tokens.color.ink), hex(tokens.color.paper)) >= 7);
    assert.equal(tokens.font.sans, fast.tokens.font.sans);
  });
}
