// Assemble one standalone HTML file: stage runtime + scene + content + design tokens.
// The file plays live when embedded on a site, and renders frame-exact when opened with ?export.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SMTokens = require("../runtime/tokens.cjs");
const SMStyle = require("../runtime/style.cjs");

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(path, "utf8");
const kebab = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

export function loadTokens(path) {
  const file = existsSync(path) ? path : join(ROOT, "tokens", `${path}.json`);
  if (!existsSync(file)) throw new Error(`No tokens at ${path} (not a file here, and not a preset in tokens/)`);
  // the same normaliser runs in the page (runtime/tokens.cjs): it validates, then fills every optional colour
  return SMTokens.normalize(JSON.parse(read(file)), `tokens ${file}`);
}

export const tokensCss = (tokens) => SMTokens.css(tokens);

// A style pack by preset name (styles/<name>.json), file path, short code (sm1.…), object, or "native".
// Returns the normalised pack, or null for native (every scene keeps its own look).
export function loadStyle(ref = "native") {
  if (ref == null || ref === "native") return null;
  if (typeof ref === "object") return SMStyle.normalize(ref, "style");
  if (SMStyle.isCode(ref)) return SMStyle.decode(ref);
  const file = existsSync(ref) ? ref : join(ROOT, "styles", `${ref}.json`);
  if (!existsSync(file)) throw new Error(`No style "${ref}" (not a file, a code like sm1.…, or a pack in styles/: ${listStyles().join(", ")})`);
  const raw = JSON.parse(read(file));
  return SMStyle.normalize({ name: basename(file, ".json"), ...raw }, `style ${file}`);
}

export const listStyles = () => (existsSync(join(ROOT, "styles")) ? readdirSync(join(ROOT, "styles")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : []);

export function sceneMeta(dir) {
  const file = join(dir, "meta.json");
  return existsSync(file) ? JSON.parse(read(file)) : {};
}

export function sceneDir(name) {
  const dir = existsSync(name) ? resolve(name) : join(ROOT, "scenes", name);
  if (!existsSync(join(dir, "scene.js"))) throw new Error(`No scene.js in ${dir}`);
  return dir;
}

function merge(base, over) {
  if (Array.isArray(over) || typeof over !== "object" || over === null) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
}

// A scene asks for a library with a comment line: `// @vendor three p5 matter`. The pinned build in
// vendor/<name>.min.js is inlined before the scene, so the page stays one offline file.
function vendorScripts(source, scriptSrc) {
  const m = source.match(/@vendor\s+([\w ,-]+)/);
  if (!m) return "";
  return m[1].split(/[\s,]+/).filter(Boolean).map((name) => {
    const file = [join(ROOT, "vendor", `${name}.min.js`), join(ROOT, "vendor", `${name}.js`), join(ROOT, "runtime", `${name}.js`)].find(existsSync);
    if (!file) throw new Error(`scene asks for vendor "${name}" but neither vendor/${name}.min.js, vendor/${name}.js nor runtime/${name}.js exists`);
    return script(file, scriptSrc);
  }).join("\n");
}

// Inline by default (one offline file). With scriptSrc(file) → URL, shared files load as cached <script src>
// instead: a site with many embeds then downloads p5, Matter or three once.
function script(file, scriptSrc) {
  const src = scriptSrc && scriptSrc(file);
  return src ? `<script src="${src}"></script>` : `<script>${read(file).replace(/<\/script/gi, "<\\/script")}</script>`;
}

// Content can reference files as "asset:models/laptop.glb". Each one is read from assets/ (or from a path
// relative to where you run the build) and embedded as a data: URL, so the page stays one offline file.
const MIME = { glb: "model/gltf-binary", gltf: "model/gltf+json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", json: "application/json" };
function assetScript(content) {
  const refs = [...new Set([...JSON.stringify(content).matchAll(/"asset:([^"]+)"/g)].map((m) => m[1]))];
  if (!refs.length) return "";
  const map = {};
  for (const ref of refs) {
    const file = [join(ROOT, "assets", ref), resolve(ref)].find(existsSync);
    if (!file) throw new Error(`content references asset:${ref} but no file at assets/${ref} or ./${ref}`);
    const ext = ref.split(".").pop().toLowerCase();
    map[ref] = `data:${MIME[ext] || "application/octet-stream"};base64,${readFileSync(file).toString("base64")}`;
  }
  return `<script>window.SM_ASSETS=${JSON.stringify(map)};</script>`;
}

// Named views for product demos: what the visitor sees of the 1600×900 design. Sizes match where a demo gets placed.
export const VIEWS = { hero: null, strip: [1600, 756], card: [800, 600], compact: [720, 900] };
export const PLAY_MODES = ["loop", "once", "hover"];

export function buildHtml({ scene, tokens: tokensPath = "default", content: contentPath, transparent = false, scriptSrc = null, style: styleRef = "native", view = null, play = null }) {
  const dir = sceneDir(scene);
  const tokens = loadTokens(tokensPath);
  const pack = loadStyle(styleRef);
  const directable = sceneMeta(dir).directable || [];
  const defaults = existsSync(join(dir, "content.json")) ? JSON.parse(read(join(dir, "content.json"))) : {};
  if (contentPath && !existsSync(contentPath)) throw new Error(`No content file at ${contentPath}`);
  let content = contentPath ? merge(defaults, JSON.parse(read(contentPath))) : defaults;
  if (view && !(view in VIEWS)) throw new Error(`No view "${view}" (views: ${Object.keys(VIEWS).join(", ")})`);
  if (view && VIEWS[view] && sceneMeta(dir).family !== "ui-demo") throw new Error(`--view is for product demos (meta "family": "ui-demo"); ${basename(dir)} has a fixed stage`);
  if (play && !PLAY_MODES.includes(play)) throw new Error(`No play mode "${play}" (modes: ${PLAY_MODES.join(", ")})`);
  if (view && content.views?.[view]) content = merge(content, content.views[view]); // a demo can retime or reword itself per view
  const css = existsSync(join(dir, "scene.css")) ? read(join(dir, "scene.css")) : "";
  const fontLink = tokens.font?.import ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${tokens.font.import}">` : "";
  const base = `
${tokensCss(tokens)}
html,body{margin:0;padding:0;background:${transparent ? "transparent" : "var(--c-paper)"};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.sm-host{position:relative;width:100%;overflow:hidden}
.sm-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;isolation:isolate;font-family:var(--font-sans);color:var(--c-ink);background:${transparent ? "transparent" : "var(--c-paper)"}}
.sm-exporting .sm-host{width:auto;height:auto}
.sm-exporting *,.sm-exporting *::before,.sm-exporting *::after{transition:none!important}
.sm-stage *{box-sizing:border-box}
`;
  const data = JSON.stringify({ content, tokens, style: { pack: pack || "native", directable }, ...(view && VIEWS[view] ? { view: VIEWS[view] } : {}), ...(play ? { play } : {}) }).replace(/</g, "\\u003c");
  const title = content.title || basename(dir);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${fontLink}
<style>${base}${css}</style></head>
<body><div class="sm-host" role="img" aria-label="${(content.label || title).replace(/"/g, "&quot;")}"></div>
<script id="sm-data" type="application/json">${data}</script>
${assetScript(content)}
${script(join(ROOT, "runtime", "tokens.cjs"), scriptSrc)}
${script(join(ROOT, "runtime", "style.cjs"), scriptSrc)}
${script(join(ROOT, "runtime", "stage.js"), scriptSrc)}
${vendorScripts(read(join(dir, "scene.js")), scriptSrc)}
<script>${read(join(dir, "scene.js"))}</script>
</body></html>`;
}
