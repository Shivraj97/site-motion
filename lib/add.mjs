// add <scene>: copy a scene's source into your project so you own it (shadcn-style).
//
//   <dir>/
//     runtime/            tokens.cjs, stage.js and any vendor library the scene asks for (shared by every scene you add)
//     <scene>/
//       scene.js          the scene itself: edit freely
//       scene.css
//       content.json      the copy (scene defaults merged with --content)
//       tokens.json       the brand (preset, token file, or a theme drafted from a URL)
//       style.json        the look: a style pack shared by every scene in the project, or "native"
//       index.html        dev page: reads content.json and tokens.json live, so an edit + refresh shows it (needs http, not file://)
//     <scene>.html        one self-contained file to embed in production (rebuild it after edits)
//
// The scene folder is a valid scene directory, so build, render and make all accept it as their target.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { assetRefs, buildHtml, findAsset, loadStyle, loadTokens, ROOT, sceneDir } from "./build.mjs";

const read = (path) => readFileSync(path, "utf8");

function merge(base, over) {
  if (Array.isArray(over) || typeof over !== "object" || over === null) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
}

export function vendorsOf(sceneSource) {
  const m = sceneSource.match(/@vendor\s+([\w ,-]+)/);
  return m ? m[1].split(/[\s,]+/).filter(Boolean) : [];
}

function vendorFile(name) {
  const file = [join(ROOT, "vendor", `${name}.min.js`), join(ROOT, "vendor", `${name}.js`), join(ROOT, "runtime", `${name}.js`)].find(existsSync);
  if (!file) throw new Error(`scene asks for vendor "${name}" but neither vendor/${name}.min.js, vendor/${name}.js nor runtime/${name}.js exists`);
  return file;
}

// The dev page. Data loads first (stage.js mounts as soon as scene.js calls SiteMotion.scene), then the
// scripts in order. Same markup and base CSS as a built page, so what you see here is what build ships.
function devPage({ title, label, scripts }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="scene.css">
<style>
html,body{margin:0;padding:0;background:var(--c-paper);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.sm-host{position:relative;width:100%;overflow:hidden}
.sm-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;isolation:isolate;font-family:var(--font-sans);color:var(--c-ink);background:var(--c-paper)}
.sm-exporting .sm-host{width:auto;height:auto}
.sm-exporting *,.sm-exporting *::before,.sm-exporting *::after{transition:none!important}
.sm-stage *{box-sizing:border-box}
.sm-note{font:14px/1.5 system-ui,sans-serif;padding:24px;max-width:560px}
</style></head>
<body><div class="sm-host" role="img" aria-label="${esc(label)}"></div>
<script>
// site-motion dev page: edit content.json, tokens.json or scene.js, then refresh.
(async () => {
  const load = (src) => new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fail(new Error("could not load " + src)); document.body.appendChild(s); });
  try {
    const get = (f, fallback) => fetch(f, { cache: "no-store" }).then((r) => { if (r.ok) return r.json(); if (fallback !== undefined) return fallback; throw new Error(f + ": HTTP " + r.status); });
    const [content, tokens, style, meta] = await Promise.all([get("content.json"), get("tokens.json"), get("style.json", "native"), get("meta.json", {})]);
    // asset: files (a screenshot, a model) were copied next to this page by add: serve them by their relative path
    window.SM_ASSETS = Object.fromEntries([...new Set([...JSON.stringify(content).matchAll(/"asset:([^"]+)"/g)].map((m) => m[1]))].map((r) => [r, r]));
    await load(${JSON.stringify(scripts[0])});
    const t = SMTokens.normalize(tokens, "tokens.json");
    const css = document.createElement("style");
    css.textContent = SMTokens.css(t);
    document.head.prepend(css);
    if (t.font && t.font.import) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = t.font.import; document.head.appendChild(l); }
    if (content.label || content.title) document.querySelector(".sm-host").setAttribute("aria-label", content.label || content.title);
    const data = document.createElement("script");
    data.id = "sm-data"; data.type = "application/json";
    data.textContent = JSON.stringify({ content, tokens: t, style: { pack: style, directable: meta.directable || [] } });
    document.body.appendChild(data);
    for (const src of ${JSON.stringify(scripts.slice(1))}) await load(src);
  } catch (error) {
    console.error("site-motion:", error);
    const fileUrl = location.protocol === "file:";
    document.querySelector(".sm-host").innerHTML = '<p class="sm-note"><b>site-motion could not start this scene.</b><br>' +
      (fileUrl ? "This dev page reads content.json and tokens.json, which browsers block on file://. Serve the folder (for example <code>npx serve</code>) or open the bundled <code>.html</code> next to this folder." : String(error.message || error)) + "</p>";
  }
})();
</script>
</body></html>
`;
}

// Writes the files; returns what it did so the CLI (and tests) can report it.
// view / play (product demos): how the embed is cut and when it plays; recorded so sync rebuilds it the same way.
export function addScene({ scene, dir, tokens = "default", content = null, style = "native", force = false, cwd = process.cwd(), view = null, play = null }) {
  const src = sceneDir(scene);
  const name = basename(src);
  const outDir = resolve(cwd, dir);
  const sceneOut = join(outDir, name);
  const runtimeOut = join(outDir, "runtime");
  if (existsSync(join(sceneOut, "scene.js")) && !force) {
    throw new Error(`${relative(cwd, sceneOut) || sceneOut} already exists. Pass --force to overwrite it (your edits there would be lost).`);
  }
  const tokenSet = loadTokens(existsSync(resolve(cwd, String(tokens))) ? resolve(cwd, String(tokens)) : String(tokens));
  const defaults = existsSync(join(src, "content.json")) ? JSON.parse(read(join(src, "content.json"))) : {};
  if (content && !existsSync(resolve(cwd, content))) throw new Error(`No content file at ${content}`);
  const merged = content ? merge(defaults, JSON.parse(read(resolve(cwd, content)))) : defaults;
  // asset: files (a screenshot for shot-demo, a model) are found where build finds them, then copied into the scene
  // folder under the same relative path, so the copy builds, syncs and previews on its own
  const assets = assetRefs(merged).map((ref) => {
    const to = resolve(sceneOut, ref);
    if (!to.startsWith(sceneOut + sep)) throw new Error(`asset:${ref} points outside the scene folder; use a path like "shots/screen.png"`);
    const from = findAsset(ref, src, cwd);
    if (!from) throw new Error(`content references asset:${ref} but no file at ${relative(cwd, join(src, ref))}, assets/${ref} or ./${ref}`);
    return { from, to };
  });

  const written = [];
  const write = (file, text) => { writeFileSync(file, text); written.push(file); };
  const copy = (from, to) => { copyFileSync(from, to); written.push(to); };

  // runtime: shared, refreshed on every add so all scenes in the folder run the same version
  mkdirSync(runtimeOut, { recursive: true });
  for (const f of ["tokens.cjs", "style.cjs", "stage.js"]) copy(join(ROOT, "runtime", f), join(runtimeOut, f));
  const sceneSource = read(join(src, "scene.js"));
  const vendors = vendorsOf(sceneSource).map((v) => { const f = vendorFile(v); copy(f, join(runtimeOut, basename(f))); return basename(f); });

  mkdirSync(sceneOut, { recursive: true });
  write(join(sceneOut, "scene.js"), sceneSource);
  write(join(sceneOut, "scene.css"), existsSync(join(src, "scene.css")) ? read(join(src, "scene.css")) : "");
  write(join(sceneOut, "content.json"), JSON.stringify(merged, null, 2) + "\n");
  write(join(sceneOut, "tokens.json"), JSON.stringify(tokenSet, null, 2) + "\n");
  const pack = typeof style === "string" ? loadStyle(existsSync(resolve(cwd, style)) ? resolve(cwd, style) : style) : style;
  write(join(sceneOut, "style.json"), JSON.stringify(pack || "native", null, 2) + "\n");
  if (existsSync(join(src, "meta.json"))) copy(join(src, "meta.json"), join(sceneOut, "meta.json"));
  for (const a of assets) { mkdirSync(dirname(a.to), { recursive: true }); copy(a.from, a.to); }
  const title = merged.title || name;
  write(join(sceneOut, "index.html"), devPage({
    title, label: merged.label || title,
    scripts: ["../runtime/tokens.cjs", "../runtime/style.cjs", "../runtime/stage.js", ...vendors.map((v) => `../runtime/${v}`), "scene.js"],
  }));

  // the production embed, built from the copied files so it matches the dev page exactly
  const bundle = join(outDir, `${name}.html`);
  write(bundle, buildHtml({ scene: sceneOut, tokens: join(sceneOut, "tokens.json"), style: pack || "native", view, play }));

  return { name, sceneOut, runtimeOut, bundle, vendors, written, assets: assets.map((a) => a.to), style: pack ? pack.name : "native" };
}

// After the project's brand or look changes: rewrite each added scene's tokens.json and style.json, refresh the
// shared runtime and rebuild the embed. scene.js, scene.css and content.json are the user's and are never touched.
// view / play come from the project's record of how the scene was added, so a demo keeps its cut and play mode.
export function syncScene({ sceneOut, tokens, style, view = null, play = null }) {
  const name = basename(sceneOut);
  if (!existsSync(join(sceneOut, "scene.js"))) throw new Error(`${sceneOut} has no scene.js (was it added with site-motion add?)`);
  const runtimeOut = join(sceneOut, "..", "runtime");
  mkdirSync(runtimeOut, { recursive: true });
  for (const f of ["tokens.cjs", "style.cjs", "stage.js"]) copyFileSync(join(ROOT, "runtime", f), join(runtimeOut, f));
  // first-party helpers a scene asks for (ui-kit) evolve with the skill, so they refresh too; vendored libraries are pinned
  for (const v of vendorsOf(readFileSync(join(sceneOut, "scene.js"), "utf8"))) {
    const own = join(ROOT, "runtime", `${v}.js`);
    if (existsSync(own) && !existsSync(join(ROOT, "vendor", `${v}.js`)) && !existsSync(join(ROOT, "vendor", `${v}.min.js`))) copyFileSync(own, join(runtimeOut, `${v}.js`));
  }
  const tokenSet = loadTokens(tokens);
  writeFileSync(join(sceneOut, "tokens.json"), JSON.stringify(tokenSet, null, 2) + "\n");
  const pack = typeof style === "string" ? loadStyle(style) : style;
  writeFileSync(join(sceneOut, "style.json"), JSON.stringify(pack || "native", null, 2) + "\n");
  const bundle = join(sceneOut, "..", `${name}.html`);
  writeFileSync(bundle, buildHtml({ scene: sceneOut, tokens: join(sceneOut, "tokens.json"), style: pack || "native", view, play }));
  return { name, bundle, style: pack ? pack.name : "native" };
}

// Default target folder: public/motion when the project has a public/ dir (Next, Vite, Astro), else ./motion.
export const defaultAddDir = (cwd = process.cwd()) => (existsSync(join(cwd, "public")) ? join("public", "motion") : "motion");
