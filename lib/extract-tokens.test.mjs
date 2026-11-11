// node --test lib/   — extractor on synthetic fixtures (test/fixtures/, no real third-party CSS) and the fetcher's SSRF guard.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { loadTokens, ROOT } from "./build.mjs";
import { contrast, extractTokens, oklch, parseColor, toHex } from "./extract-tokens.mjs";
import { assertPublicUrl, fetchSite, httpGet, isPrivateAddress } from "./fetch-site.mjs";

const fixture = (name) => readFileSync(join(ROOT, "test", "fixtures", name), "utf8");
const hex = (s) => parseColor(s);
const close = (a, b, tol = 0.03) => {
  const p = oklch(hex(a)), q = oklch(hex(b));
  return Math.abs(p.L - q.L) < tol && Math.abs(p.C - q.C) < tol && (p.C < 0.02 || Math.min(Math.abs(p.h - q.h), 360 - Math.abs(p.h - q.h)) < 8);
};

// every extracted set must load through build.mjs (and the runtime normaliser when it exists)
function assertLoadable(tokens) {
  const dir = mkdtempSync(join(tmpdir(), "sm-theme-"));
  try {
    const file = join(dir, "brand.json");
    writeFileSync(file, JSON.stringify(tokens));
    loadTokens(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  let normalize;
  try { ({ normalize } = createRequire(import.meta.url)("../runtime/tokens.cjs")); } catch {}
  if (normalize) normalize(tokens, "extracted");
  for (const k of ["paper", "surface", "raised", "ink", "muted", "faint", "line", "accent", "accentInk", "onAccent", "positive", "warning"]) {
    assert.match(tokens.color[k], /^#[0-9a-f]{6}$/, `color.${k}`);
  }
  assert.ok(tokens.palette.length >= 3 && tokens.palette.every((c) => /^#[0-9a-f]{6}$/.test(c)), "palette");
  assert.ok(tokens.font.sans && tokens.font.mono && tokens.font.import.startsWith("https://fonts.googleapis.com/css2?"), "fonts");
  assert.ok(Number.isFinite(tokens.radius.md), "radius");
  assert.ok(contrast(hex(tokens.color.ink), hex(tokens.color.paper)) >= 4.5, "ink readable on paper");
  assert.ok(contrast(hex(tokens.color.onAccent), hex(tokens.color.accent)) >= 3, "onAccent readable on accent");
}

/* ───────────── colour parsing ───────────── */

test("parses the colour syntaxes sites ship", () => {
  assert.equal(toHex(hex("#abc")), "#aabbcc");
  assert.equal(toHex(hex("rgb(15 118 110)")), "#0f766e");
  assert.equal(toHex(hex("rgba(15, 118, 110, .5)")), "#0f766e");
  assert.equal(toHex(hex("hsl(222.2 47.4% 11.2%)")), "#0f172a");
  assert.equal(toHex(parseColor("222.2 84% 4.9%", { bare: true })), "#020817");
  assert.equal(toHex(hex("oklch(0% 0 0)")), "#000000");
  assert.equal(toHex(hex("oklch(100% 0 0)")), "#ffffff");
  assert.ok(close(toHex(hex("oklch(54.1% 0.281 293.009)")), "#7f22fe", 0.06));
  assert.equal(hex("color-mix(in oklab, #ff0000 50%, transparent)").a, 0.5);
  assert.equal(hex("nonsense"), null);
});

/* ───────────── fixtures ───────────── */

test("light site: paper/ink from body, accent from the primary button, system font → Inter", () => {
  const { tokens, notes } = extractTokens({ html: fixture("light.html"), css: [fixture("light.css")], url: "https://fernleaf.test/" });
  assertLoadable(tokens);
  assert.equal(tokens.color.paper, "#fbfaf7");
  assert.equal(tokens.color.ink, "#1f2328");
  assert.equal(tokens.color.accent, "#0f766e");
  assert.equal(tokens.source, "https://fernleaf.test/");
  assert.ok(oklch(hex(tokens.color.surface)).L >= oklch(hex(tokens.color.paper)).L, "surface is lighter than paper on a light site");
  assert.ok(oklch(hex(tokens.color.muted)).L > oklch(hex(tokens.color.ink)).L && oklch(hex(tokens.color.line)).L < oklch(hex(tokens.color.paper)).L);
  assert.ok(contrast(hex(tokens.color.accentInk), hex(tokens.color.paper)) >= 7, "accentInk is a text-safe shade");
  assert.equal(tokens.color.onAccent[1] > "c", true, "light text on a dark teal button");
  assert.match(tokens.font.sans, /^'Inter'/);
  assert.match(tokens.font.mono, /^'JetBrains Mono'/);
  assert.deepEqual(tokens.radius, { sm: 4, md: 8, lg: 13 });
  assert.ok(tokens.palette.every((c) => oklch(hex(c)).L > 0.75), "light palette is pastel");
  assert.ok(notes.some((n) => /prefers-color-scheme: dark/.test(n)), "notes the dark variant it skipped");
  assert.ok(notes.some((n) => /system-ui.*substituted Inter|substituted Inter/.test(n)));
});

test("dark site: Tailwind-style utilities and oklch variables give a dark theme", () => {
  const { tokens, notes } = extractTokens({ html: fixture("dark.html"), css: [fixture("dark.css")], url: "https://nightjar.test" });
  assertLoadable(tokens);
  assert.ok(close(tokens.color.paper, "#0a0a0a"), tokens.color.paper);
  assert.ok(close(tokens.color.ink, "#f5f5f5"), tokens.color.ink);
  assert.ok(close(tokens.color.accent, "#7f22fe", 0.06), `accent ${tokens.color.accent} should be the violet-600 button`);
  assert.ok(oklch(hex(tokens.color.surface)).L > oklch(hex(tokens.color.paper)).L);
  assert.ok(oklch(hex(tokens.color.raised)).L > oklch(hex(tokens.color.surface)).L);
  assert.ok(tokens.palette.every((c) => oklch(hex(c)).L < 0.8), "dark palette is mid-tone");
  assert.match(tokens.font.sans, /^'Geist'/);
  assert.match(tokens.font.mono, /^'Geist Mono'/);
  assert.equal(tokens.radius.md, 6);
  assert.ok(notes.includes("dark site → dark theme"));
});

test("custom-property site: --brand wins over a neutral --primary; .dark vars apply only with html.dark", () => {
  const html = fixture("vars.html");
  const light = extractTokens({ html, url: "https://quarry.test" });
  assertLoadable(light.tokens);
  assert.equal(light.tokens.color.paper, toHex(parseColor("hsl(40 33% 98%)")));
  assert.equal(light.tokens.color.ink, toHex(parseColor("hsl(222 47% 11%)")));
  assert.equal(light.tokens.color.accent, toHex(parseColor("hsl(14 90% 53%)")));
  assert.ok(light.notes.some((n) => /accent .* --brand/.test(n)));
  assert.deepEqual(light.tokens.radius, { sm: 6, md: 12, lg: 19 });
  assert.match(light.tokens.font.sans, /^'Inter'/, "'Inter Variable' is Inter");

  const dark = extractTokens({ html: html.replace('<html lang="en">', '<html lang="en" class="dark">'), url: "https://quarry.test" });
  assertLoadable(dark.tokens);
  assert.equal(dark.tokens.color.paper, toHex(parseColor("hsl(222 47% 6%)")));
  assert.ok(dark.notes.includes("dark site → dark theme"));
});

test("Google Fonts site: families come from the <link>, with valid css2 specs", () => {
  const { tokens, notes } = extractTokens({ html: fixture("google-fonts.html"), url: "https://tidewater.test" });
  assertLoadable(tokens);
  assert.match(tokens.font.sans, /^'Bricolage Grotesque', system-ui, sans-serif$/);
  assert.match(tokens.font.mono, /^'DM Mono'/);
  assert.equal(tokens.font.import, "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=block");
  assert.equal(tokens.color.accent, "#2f5d50");
  assert.deepEqual(tokens.radius, { sm: 8, md: 16, lg: 24 }, "pill buttons get card-sized radii");
  assert.ok(notes.some((n) => /Bricolage Grotesque \(Google Fonts link\)/.test(n)));
});

test("licensed-font site: Söhne → Inter and Söhne Mono → JetBrains Mono, both noted; square buttons → radius 0", () => {
  const { tokens, notes } = extractTokens({ html: fixture("licensed-font.html"), url: "https://lumen.test" });
  assertLoadable(tokens);
  assert.match(tokens.font.sans, /^'Inter'/);
  assert.match(tokens.font.mono, /^'JetBrains Mono'/);
  assert.ok(notes.some((n) => /"Söhne" isn't on Google Fonts; substituted Inter/.test(n)), notes.join("\n"));
  assert.ok(notes.some((n) => /"Söhne Mono" isn't on Google Fonts; substituted JetBrains Mono/.test(n)));
  assert.equal(tokens.color.accent, "#3b5bdb");
  assert.deepEqual(tokens.radius, { sm: 0, md: 0, lg: 0 });
});

test("stand-in table covers the common licensed faces", () => {
  const cases = { Graphik: "Inter", "Helvetica Now Display": "Inter", "GT America": "Inter Tight", "Circular Std": "DM Sans", Aeonik: "Manrope", "PP Neue Montreal": "Inter", "system-ui": "Inter" };
  for (const [face, want] of Object.entries(cases)) {
    const { tokens, notes } = extractTokens({ html: `<html><body><button>x</button></body></html>`, css: [`body{font-family:"${face}",sans-serif;background:#fff;color:#111}button{background:#e11d48}`] });
    assert.match(tokens.font.sans, new RegExp(`^'${want}'`), face);
    assert.ok(notes.some((n) => n.includes(`substituted ${want}`)), face);
  }
});

test("monochrome site still yields a usable accent and palette", () => {
  const { tokens, notes } = extractTokens({ html: `<html><body><button class="btn">Go</button></body></html>`, css: [`body{background:#fff;color:#000}.btn{background:#111;color:#fff}`] });
  assertLoadable(tokens);
  assert.equal(tokens.color.accent, "#111111");
  assert.ok(notes.some((n) => /monochrome/.test(n)));
});

test("an empty page falls back to browser defaults without throwing", () => {
  const { tokens, notes } = extractTokens({ html: "", css: [] });
  assertLoadable(tokens);
  assert.equal(tokens.color.paper, "#ffffff");
  assert.ok(notes.some((n) => /no CSS rules/.test(n)));
});

/* ───────────── SSRF guard ───────────── */

const PUBLIC = "93.184.216.34";
const stubLookup = (table) => async (host) => {
  if (!(host in table)) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return [].concat(table[host]).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};
const lookup = stubLookup({ "good.test": PUBLIC, "cdn.good.test": PUBLIC, "intranet.test": "10.0.0.5", "rebind.test": "127.0.0.1", "dual.test": [PUBLIC, "fd00::1"] });

test("isPrivateAddress covers v4 and v6 private, loopback, link-local, CGNAT and metadata ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "2002:0a00:0001::1", "ff02::1", "not-an-ip"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of [PUBLIC, "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:93.184.216.34"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("assertPublicUrl refuses localhost, private IPs, metadata, file: and odd ports", async () => {
  const refuse = async (url, code) => assert.rejects(assertPublicUrl(url, { lookup }), (e) => e.code === code, `${url} → ${code}`);
  await refuse("http://localhost/", "blocked_host");
  await refuse("http://app.localhost:80/", "blocked_host");
  await refuse("http://127.0.0.1/", "blocked_address");
  await refuse("http://2130706433/", "blocked_address"); // 127.0.0.1 in decimal
  await refuse("http://10.0.0.8/admin", "blocked_address");
  await refuse("http://169.254.169.254/latest/meta-data/", "blocked_address");
  await refuse("http://[::1]/", "blocked_address");
  await refuse("http://[::ffff:169.254.169.254]/", "blocked_address");
  await refuse("http://intranet.test/", "blocked_address");
  await refuse("http://dual.test/", "blocked_address");
  await refuse("file:///etc/passwd", "bad_scheme");
  await refuse("gopher://good.test/", "bad_scheme");
  await refuse("http://good.test:8080/", "bad_port");
  await refuse("http://user:pw@good.test/", "bad_url");
  await refuse("http://nowhere.test/", "dns");
  const ok = await assertPublicUrl("https://good.test/page", { lookup });
  assert.equal(ok.url.hostname, "good.test");
});

// a fake transport: routes keyed by URL → { status, headers, body }
const stubGet = (routes, calls = []) => async (url) => {
  calls.push(url);
  const r = routes[url];
  if (!r) return { status: 404, headers: {}, body: "" };
  return { status: r.status || 200, headers: r.headers || { "content-type": "text/html" }, body: r.body || "", truncated: false };
};

test("fetchSite follows a redirect but refuses one that points at a private address", async () => {
  const calls = [];
  const get = stubGet({ "https://good.test/": { status: 302, headers: { location: "http://intranet.test/secret" } } }, calls);
  await assert.rejects(fetchSite("https://good.test/", { get, lookup }), (e) => e.code === "blocked_address");
  assert.deepEqual(calls, ["https://good.test/"], "never requested the private host");

  const get2 = stubGet({ "https://good.test/": { status: 301, headers: { location: "http://169.254.169.254/latest/" } } });
  await assert.rejects(fetchSite("https://good.test/", { get: get2, lookup }), (e) => e.code === "blocked_address");
});

test("fetchSite stops after 3 redirects", async () => {
  const hop = (n) => ({ status: 302, headers: { location: `https://good.test/${n}` } });
  const get = stubGet({ "https://good.test/": hop(1), "https://good.test/1": hop(2), "https://good.test/2": hop(3), "https://good.test/3": hop(4), "https://good.test/4": { body: "<html></html>" } });
  await assert.rejects(fetchSite("https://good.test/", { get, lookup }), (e) => e.code === "too_many_redirects");
  const get3 = stubGet({ "https://good.test/": hop(1), "https://good.test/1": hop(2), "https://good.test/2": hop(3), "https://good.test/3": { body: "<html></html>" } });
  const ok = await fetchSite("https://good.test/", { get: get3, lookup });
  assert.equal(ok.url, "https://good.test/3");
});

test("fetchSite reads linked stylesheets, skips private ones and font CSS, and caps the count", async () => {
  const links = ['<link rel="stylesheet" href="/a.css">', '<link rel="stylesheet" href="https://cdn.good.test/b.css">', '<link rel="stylesheet" href="http://intranet.test/c.css">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">', '<link rel="stylesheet" href="/print.css" media="print">'];
  for (let i = 0; i < 8; i++) links.push(`<link rel="stylesheet" href="/x${i}.css">`);
  const routes = { "https://good.test/": { body: `<html><head>${links.join("")}</head><body></body></html>` }, "https://good.test/a.css": { body: "@import 'imp.css'; body{color:#111}", headers: { "content-type": "text/css" } }, "https://cdn.good.test/b.css": { body: "a{color:#0f766e}", headers: { "content-type": "text/css" } } };
  const calls = [];
  const site = await fetchSite("good.test", { get: stubGet(routes, calls), lookup });
  assert.equal(site.url, "https://good.test/");
  assert.deepEqual(site.css, ["@import 'imp.css'; body{color:#111}", "a{color:#0f766e}"]);
  assert.ok(!calls.some((u) => /intranet|googleapis|print/.test(u)), calls.join("\n"));
  assert.ok(calls.filter((u) => u.endsWith(".css")).length <= 5, "6 sheets at most, one of them refused before any request");
  assert.ok(site.notes.some((n) => /intranet\.test\/c\.css skipped/.test(n)));
  assert.ok(site.notes.some((n) => /read the first 6/.test(n)));
});

test("fetchSite refuses non-HTML and error pages", async () => {
  await assert.rejects(fetchSite("https://good.test/", { get: stubGet({ "https://good.test/": { headers: { "content-type": "application/pdf" } } }), lookup }), (e) => e.code === "not_html");
  await assert.rejects(fetchSite("https://good.test/", { get: stubGet({}), lookup }), (e) => e.code === "http_status");
});

test("httpGet re-checks the address at connect time (DNS rebinding)", async () => {
  await assert.rejects(httpGet("http://rebind.test/", { lookup, maxBytes: 1000, signal: new AbortController().signal }), (e) => e.code === "blocked_address");
});

test("httpGet decompresses and truncates at the byte cap", async (t) => {
  const big = "x".repeat(50_000);
  const server = createServer((req, res) => {
    if (req.url === "/gz") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync("<html>hello</html>")); }
    else { res.writeHead(200, { "content-type": "text/html" }); res.end(big); }
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  } catch (e) {
    t.skip(`can't listen locally (${e.code})`);
    return;
  }
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const signal = new AbortController().signal;
    const gz = await httpGet(`${base}/gz`, { signal, maxBytes: 1000 });
    assert.equal(gz.body, "<html>hello</html>");
    const cut = await httpGet(`${base}/big`, { signal, maxBytes: 1000 });
    assert.equal(cut.body.length, 1000);
    assert.equal(cut.truncated, true);
  } finally {
    server.close();
  }
});

test("fetchSite gives up after the total timeout", async () => {
  const slow = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await assert.rejects(fetchSite("https://good.test/", { get: slow, lookup, timeoutMs: 50 }), (e) => e.code === "timeout");
});
