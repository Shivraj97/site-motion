// Screenshot → product demo. A raw screenshot of someone's product becomes a `shot-demo` scene: the image
// sits in a browser, window or phone frame, and a cursor, camera, typed edits, a spotlight and callouts act
// on named hotspots drawn in the screenshot's own pixels.
//
// What this file does deterministically (no model, no network):
//   readShot(png)            size, frame guess, and the colours the screen is made of (paper, ink, accent)
//   tokensFromShot(read)     a token file from those colours, through the same derivation as `theme <url>`
//   gridHtml(...)            a copy of the screenshot ruled every N image pixels, labelled in image pixels,
//                            so an agent reading a downscaled image still names exact coordinates
//   scaffoldShot(...)        a working folder: shot.png, shot.jpg (embed), grid.png, tokens.json, content.json
// What it leaves to the agent: looking at the screen, choosing the one action the demo shows, naming the
// hotspots and writing the beats. See SKILL.md, "From a screenshot".
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { decodePng } from "./png.mjs";
import { deriveTokens, deltaE, chroma, contrast, luminance, toHex } from "./extract-tokens.mjs";

const SATURATED = 0.06;

// any image ffmpeg can read → PNG bytes (Chrome screenshots, macOS ⌘⇧4 PNGs, JPEGs, WebPs, HEIC via sips)
export function toPng(file) {
  const ext = extname(file).toLowerCase();
  if (ext === ".png") return readFileSync(file);
  const tmp = mkdtempSync(join(tmpdir(), "sm-shot-"));
  const out = join(tmp, "in.png");
  try {
    if (ext === ".heic" && process.platform === "darwin") execFileSync("sips", ["-s", "format", "png", file, "--out", out], { stdio: "ignore" });
    else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-frames:v", "1", "-pix_fmt", "rgba", out]);
    return readFileSync(out);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const rgb = (r, g, b) => ({ r: r / 255, g: g / 255, b: b / 255, a: 1 });

// the colours a screen is made of: 5-bit buckets over a sample of pixels, each with its mean colour and share
export function colourBuckets(img, step = 3) {
  const { width, height, data } = img;
  const map = new Map();
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let e = map.get(key);
      if (!e) map.set(key, (e = { n: 0, r: 0, g: 0, b: 0 }));
      e.n++; e.r += r; e.g += g; e.b += b; n++;
    }
  }
  return [...map.values()]
    .map((e) => ({ c: rgb(e.r / e.n, e.g / e.n, e.b / e.n), share: e.n / n }))
    .sort((a, b) => b.share - a.share);
}

// png: PNG bytes, or an already-decoded { width, height, data } (RGBA)
export function readShot(png) {
  const img = Buffer.isBuffer(png) ? decodePng(png) : png;
  const { width, height } = img;
  const buckets = colourBuckets(img);
  const notes = [];
  const paper = buckets[0].c;
  // ink: the colour with real coverage that reads hardest against the paper, preferring neutrals (body text)
  const inkPool = buckets.filter((b) => b.share >= 0.002 && contrast(b.c, paper) >= 4.5);
  const ink = (inkPool.sort((a, b) => contrast(b.c, paper) * (chroma(b.c) < SATURATED ? 1.4 : 1) * Math.log1p(b.share * 1e3) - contrast(a.c, paper) * (chroma(a.c) < SATURATED ? 1.4 : 1) * Math.log1p(a.share * 1e3))[0] || { c: luminance(paper) > 0.4 ? rgb(17, 17, 17) : rgb(245, 245, 245) }).c;
  if (!inkPool.length) notes.push("no text colour reached 4.5:1 on the background; using near-black/white ink");
  // accent: saturated, and used enough to be a choice (a button, a bar), not a stray icon pixel
  const sat = buckets.filter((b) => b.share >= 0.0008 && chroma(b.c) >= SATURATED);
  const score = (b) => chroma(b.c) * Math.log1p(b.share * 2e3);
  sat.sort((a, b) => score(b) - score(a));
  const accent = sat[0]?.c || ink;
  if (!sat.length) notes.push("no saturated colour with real coverage: a monochrome screen, so the accent is the ink");
  const extras = [];
  for (const b of sat.slice(1)) {
    if (extras.length >= 2) break;
    if ([accent, ...extras].every((c) => deltaE(c, b.c) > 0.12)) extras.push(b.c);
  }
  // frame: tall shots are phones; a 2x or 3x capture is usual for anything from a Mac or a phone
  const aspect = height / width;
  const frame = aspect > 1.4 ? "phone" : "browser";
  const density = frame === "phone" ? (width >= 1000 ? 3 : width >= 700 ? 2 : 1) : width >= 2400 ? 2 : 1;
  return { width, height, aspect, frame, density, paper, ink, accent, extras, notes, top: buckets.slice(0, 8).map((b) => ({ hex: toHex(b.c), share: +(b.share * 100).toFixed(1) })) };
}

// fonts can't be read from pixels: Inter and JetBrains Mono stand in until someone names the real face
const STAND_IN = { sans: { name: "Inter", kind: "s", spec: "wght@400;500;600;700", how: "a guess: fonts can't be read from pixels, set the product's face in tokens.json" }, mono: { name: "JetBrains Mono", kind: "m", spec: "wght@400;500", how: "stand-in" , from: "(none set)" } };

export function tokensFromShot(read, { name = "screenshot", url = "" } = {}) {
  const { tokens, notes } = deriveTokens({ paper: read.paper, ink: read.ink, accent: read.accent, extras: read.extras, fonts: STAND_IN, radiusPx: null, url, title: name, notes: [...read.notes] });
  tokens.name = `${name} (from a screenshot)`;
  tokens.source = url || "screenshot";
  return { tokens, notes: notes.filter((n) => !/^radius: none found/.test(n)) };
}

// A ruled copy of the screenshot. Labels are in IMAGE pixels, so coordinates read off it go straight into
// content.json whatever size the reader saw it at. `crop` [x, y, w, h] rules a close-up more finely.
export function gridHtml(dataUrl, { width, height, step = 100, crop = null }) {
  const [cx, cy, cw, ch] = crop || [0, 0, width, height];
  // the output is at most ~2000 px wide: enough to read, small enough to view whole
  const k = Math.min(1, 2000 / cw);
  const W = Math.round(cw * k), H = Math.round(ch * k);
  const label = Math.max(13, Math.round(Math.min(W, 2000) / 90));
  const lines = [];
  const first = (v) => Math.ceil(v / step) * step;
  for (let x = first(cx); x <= cx + cw; x += step) {
    const major = x % (step * 2) === 0, px = (x - cx) * k;
    lines.push(`<line x1="${px}" y1="0" x2="${px}" y2="${H}" class="${major ? "M" : "m"}"/>`);
    if (major) lines.push(`<text x="${px + 3}" y="${label + 2}">${x}</text>`);
  }
  for (let y = first(cy); y <= cy + ch; y += step) {
    const major = y % (step * 2) === 0, py = (y - cy) * k;
    lines.push(`<line x1="0" y1="${py}" x2="${W}" y2="${py}" class="${major ? "M" : "m"}"/>`);
    if (major) lines.push(`<text x="3" y="${py - 4}">${y}</text>`);
  }
  const html = `<!doctype html><html><head><style>
html,body{margin:0;background:#888}
.w{position:relative;width:${W}px;height:${H}px;overflow:hidden}
img{position:absolute;left:${-cx * k}px;top:${-cy * k}px;width:${width * k}px;height:${height * k}px}
svg{position:absolute;inset:0}
line.M{stroke:#ff0066;stroke-width:1.5;opacity:.75} line.m{stroke:#ff0066;stroke-width:1;stroke-dasharray:4 4;opacity:.45}
text{font:700 ${label}px ui-monospace,Menlo,monospace;fill:#ff0066;paint-order:stroke;stroke:#fff;stroke-width:4px}
</style></head><body><div class="w"><img src="${dataUrl}"><svg width="${W}" height="${H}">${lines.join("")}</svg></div></body></html>`;
  return { html, W, H };
}

export async function gridPng(png, { step = 100, crop = null } = {}) {
  const { launch } = await import("./chrome.mjs");
  const { width, height } = decodePng(png);
  const { html, W, H } = gridHtml(`data:image/png;base64,${png.toString("base64")}`, { width, height, step, crop });
  const tmp = mkdtempSync(join(tmpdir(), "sm-grid-"));
  const file = join(tmp, "grid.html");
  writeFileSync(file, html);
  const page = await launch({ width: W, height: H, scale: 1 });
  try {
    await page.goto("file://" + file);
    await page.eval("Promise.all([...document.images].map((i) => i.decode()))");
    return await page.shot();
  } finally {
    page.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

// the embed copy: a JPEG at the capture's own size (the camera zooms up to ~2x into it), much smaller than PNG
function embedCopy(pngFile, out) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pngFile, "-q:v", "4", out]);
}

export function starterContent({ read, assetRef, frame, url, name }) {
  const kind = frame || read.frame;
  return {
    title: name,
    label: `A screenshot of ${name} in a ${kind === "phone" ? "phone" : kind === "none" ? "card" : "browser window"}. Write what happens here once the beats exist: who clicks what, and what the screen shows after.`,
    image: assetRef,
    imageSize: [read.width, read.height],
    frame: kind,
    url: url || "",
    hotspots: {},
    edits: [],
    spotlight: [],
    callouts: [],
    cursor: [],
    camera: [
      { at: 0.6, dur: 4.5, zoom: 1.12, focus: [read.width * 0.5, read.height * 0.4], ease: "inOut" },
      { at: 6.5, dur: 2.5, zoom: 1 },
    ],
    times: { reset: 8.6 },
    duration: 10,
    debug: true,
  };
}

export async function scaffoldShot({ image, name, out, frame = null, url = "" }) {
  const png = toPng(image);
  const read = readShot(png);
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const pngFile = join(dir, "shot.png");
  if (resolve(image) !== pngFile) writeFileSync(pngFile, png);
  embedCopy(pngFile, join(dir, "shot.jpg"));
  writeFileSync(join(dir, "grid.png"), await gridPng(png));
  const { tokens, notes } = tokensFromShot(read, { name, url });
  writeFileSync(join(dir, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");
  // asset refs resolve from where the build runs; record the path relative to here
  const assetRef = "asset:" + relative(process.cwd(), join(dir, "shot.jpg"));
  const contentFile = join(dir, "content.json");
  if (!existsSync(contentFile)) writeFileSync(contentFile, JSON.stringify(starterContent({ read, assetRef, frame, url, name }), null, 2) + "\n");
  return { dir, read, tokens, notes, files: ["shot.png", "shot.jpg", "grid.png", "tokens.json", "content.json"] };
}
