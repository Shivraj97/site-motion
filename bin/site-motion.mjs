#!/usr/bin/env node
// site-motion: animated website assets from your design tokens.
//   site-motion build <scene> [--tokens name|file] [--content file.json] [--out file.html] [--transparent]
//   site-motion render <file.html> [--formats mp4,webm,gif,webp,png,sheet] [--fps 30] [--scale 2] [--range full|loop] [--out dir]
//   site-motion make <scene> --tokens … --content … [--formats …]     (build + render)
//   site-motion init <scene> [--tokens preset] [--name brand]   (writes ./brand.json and ./<scene>.json to edit)
//   site-motion theme <url> [--out brand.json] [--fast] [--scheme dark] [--shot file.png]   (drafts tokens from a live site)
//   site-motion add <scene> [--dir public/motion] [--tokens preset|file] [--content file.json] [--force]   (copies the scene's source into your project)
//   site-motion rehearse <scene> [--tokens …] [--out dir]   (a product demo's last pass: every check, compact view, phone-width sheet, review note)
//   site-motion check <scene…|all> [--tokens …] [--baseline write|compare] [--baseline-dir .sm-baseline]   (determinism, seam, contrast, text-fit, baseline; --jumps for one-frame jumps, always on for ui-demo scenes)
//   site-motion init [--tokens preset|file] [--style pack|code] [--dir public/motion]   (no scene: writes site-motion.json)
//   site-motion style list | show | set <pack|code|file> [--only motion,tempo]   (the project's look; partial apply with --only)
//   site-motion style export [--format css|tailwind|dtcg|design-md] [--out file]   (the look for your own components; DESIGN.md: replaces only its section)
//   site-motion lint <scene…|all> | --project   (determinism, colours from tokens, and no raw values on the axes a scene follows)
//   site-motion similar <variant…|variants> [--against <scene>] [--tokens …] [--max 0.35]   (the variant gate: too close to its parent, colours set aside?)
//   site-motion score <scene[@look]…|all> | --project [--style …] [--strict] [--json file]   (does the set look like one site? names the odd one out)
//   site-motion plan [--pages home,features,pricing] [--about "…"] | --brief brief.md | --url https://…   (one scene per
//                    section of the whole site, in one look; writes the plan and a contact sheet to approve)
//   site-motion plan show | sheet | swap <slot> <scene> | apply   (review, re-draw, change a pick, add them all)
//   site-motion sync   (after a brand or look change: rewrite every added scene's tokens.json, style.json and embed)
//   site-motion list
// With a site-motion.json in this folder or above, add, build, make and sync use its tokens and style; flags win.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildHtml, listStyles, loadStyle, proNote, ROOT } from "../lib/build.mjs";
import { render } from "../lib/render.mjs";

const [, , command, ...args] = process.argv;
// a flag straight after the command is not the target: `init --tokens mint` has no target
const target = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
const rest = target ? args.slice(1) : args;
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = rest[i + 1];
  if (next === undefined || next.startsWith("--")) opts[key] = true;
  else { opts[key] = next; i++; }
}

let projectCache;
async function project() {
  if (projectCache === undefined) projectCache = (await import("../lib/project.mjs")).findProject() || null;
  return projectCache;
}
async function inputs() {
  const { resolveInputs } = await import("../lib/project.mjs");
  return resolveInputs({ project: await project(), cli: { tokens: opts.tokens, style: opts.style } });
}
const styleName = (style) => (style && typeof style === "object" ? style.name : String(style || "native"));

async function build() {
  const { tokens, style } = await inputs();
  const html = buildHtml({ scene: target, tokens, content: opts.content, transparent: !!opts.transparent, style, view: opts.view, play: opts.play });
  const tokenName = basename(String(tokens)).replace(/\.json$/, "");
  const contentName = opts.content ? basename(opts.content).replace(/\.json$/, "") : basename(target);
  const look = styleName(style) === "native" ? "" : `-${styleName(style).replace(/[^\w.+-]/g, "")}`;
  const out = resolve(opts.out || join("out", `${contentName}-${tokenName}${look}.html`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`built ${out}  ${(html.length / 1024).toFixed(0)} KB`);
  return out;
}

const formats = String(opts.formats || "mp4,webp,png").split(",");
const renderOpts = { formats, fps: opts.fps ? Number(opts.fps) : undefined, scale: opts.scale ? Number(opts.scale) : 1, range: opts.range, gifWidth: opts["gif-width"] ? Number(opts["gif-width"]) : 960 };

function init() {
  const preset = String(opts.tokens || "default");
  const tokensFile = resolve(`${opts.name || "brand"}.json`);
  const contentFile = resolve(`${basename(target)}.json`);
  const src = { tokens: join(ROOT, "tokens", `${preset}.json`), content: join(ROOT, "scenes", basename(target), "content.json") };
  if (!existsSync(join(ROOT, "scenes", basename(target)))) fail(proNote(target) || `No scene "${target}". Scenes: ${readdirSync(join(ROOT, "scenes")).join(", ")}`);
  if (!existsSync(src.tokens)) fail(`No token preset "${preset}". Presets: ${readdirSync(join(ROOT, "tokens")).map((f) => f.replace(/\.json$/, "")).join(", ")}`);
  for (const [from, to] of [[src.tokens, tokensFile], [src.content, contentFile]]) {
    if (existsSync(to)) console.log(`kept    ${to} (already exists)`);
    else { copyFileSync(from, to); console.log(`created ${to}`); }
  }
  console.log(`\nEdit the colours and fonts in ${basename(tokensFile)} and the copy in ${basename(contentFile)}, then:\n  node ${process.argv[1]} make ${basename(target)} --tokens ./${basename(tokensFile)} --content ./${basename(contentFile)}`);
}

// theme <url>: measure the rendered page in headless Chrome (every request SSRF-guarded), else read its HTML and CSS;
// write the tokens and check build accepts them.
//   --fast              skip Chrome: read source only (also used when no Chrome is installed)
//   --scheme dark       measure the site's dark mode (prefers-color-scheme: dark)
//   --shot file.png     save the screenshot the measurement was taken from
//   --html page.html [--css a.css,b.css]   read saved files instead (target is then just the source label)
async function theme() {
  const { extractTokens } = await import("../lib/extract-tokens.mjs");
  const { fetchSite } = await import("../lib/fetch-site.mjs");
  const { extractRendered, hasChrome } = await import("../lib/extract-rendered.mjs");
  const { loadTokens } = await import("../lib/build.mjs");
  const { readFileSync } = await import("node:fs");
  const scheme = opts.scheme === "dark" ? "dark" : "light";
  let result, how;
  if (!opts.html && !opts.fast && hasChrome()) {
    try {
      const t = Date.now();
      result = await extractRendered(target, { scheme, shot: !!opts.shot });
      how = `measured in Chrome (${((Date.now() - t) / 1000).toFixed(1)} s)`;
      if (opts.shot && result.shot) { writeFileSync(resolve(String(opts.shot)), result.shot); console.log(`shot    ${resolve(String(opts.shot))}`); }
    } catch (error) {
      if (/^(blocked_|bad_)/.test(error.code || "")) throw error;
      console.log(`rendered read failed (${error.message}); reading source instead`);
    }
  } else if (!opts.html && !opts.fast) {
    console.log("no Chrome found (set CHROME_PATH); reading source instead");
  }
  if (!result) {
    const page = opts.html
      ? { url: target, html: readFileSync(opts.html, "utf8"), css: opts.css ? String(opts.css).split(",").map((f) => readFileSync(f, "utf8")) : [], notes: [] }
      : await fetchSite(target);
    const r = extractTokens({ html: page.html, css: page.css, url: page.url, colorScheme: scheme });
    result = { ...r, url: page.url, notes: [...page.notes, ...r.notes] };
    how = `read source (${(page.html.length / 1024).toFixed(0)} KB HTML, ${page.css.length} stylesheet${page.css.length === 1 ? "" : "s"})`;
  }
  const { tokens, notes } = result;
  const out = resolve(opts.out || "brand.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(tokens, null, 2) + "\n");
  loadTokens(out);
  console.log(`read    ${result.url}  ${how}`);
  for (const n of notes) console.log(`  · ${n}`);
  const c = tokens.color;
  console.log(`\npaper ${c.paper}  ink ${c.ink}  accent ${c.accent}  palette ${tokens.palette.join(" ")}`);
  console.log(`wrote   ${out}\n\nTry it:  node ${process.argv[1]} build loom --tokens ${opts.out || "brand.json"}`);
}

// shot <image>: a screenshot → a working folder for the shot-demo scene (see SKILL.md, "From a screenshot")
// shot grid <image> [--crop x,y,w,h] [--step 50]: a ruled copy, labelled in image pixels, for naming hotspots
async function shotCmd() {
  const { scaffoldShot, gridPng, toPng } = await import("../lib/shot.mjs");
  const rel = (q) => relative(process.cwd(), q) || ".";
  if (target === "grid") {
    const image = rest.find((a) => !a.startsWith("--"));
    if (!image) fail("usage: site-motion shot grid <image> [--crop x,y,w,h] [--step 50] [--out grid.png]");
    const crop = opts.crop ? String(opts.crop).split(",").map(Number) : null;
    const out = resolve(String(opts.out || (crop ? `grid-${crop.join("-")}.png` : "grid.png")));
    writeFileSync(out, await gridPng(toPng(image), { step: Number(opts.step || (crop ? 50 : 100)), crop }));
    console.log(`grid    ${rel(out)}  (labels are image pixels)`);
    return;
  }
  const name = String(opts.name || basename(target).replace(/\.[^.]+$/, ""));
  const out = String(opts.out || join("shots", name));
  const frame = opts.frame ? String(opts.frame) : null;
  if (frame && !["browser", "window", "phone", "none"].includes(frame)) fail("--frame is browser, window, phone or none");
  const r = await scaffoldShot({ image: target, name, out, frame, url: opts.url ? String(opts.url) : "" });
  const c = r.tokens.color;
  console.log(`read    ${r.read.width}×${r.read.height}  → ${frame || r.read.frame} frame, ${r.read.density}x capture`);
  console.log(`colours paper ${c.paper}  ink ${c.ink}  accent ${c.accent}  (top: ${r.read.top.slice(0, 5).map((t) => `${t.hex} ${t.share}%`).join(", ")})`);
  for (const n of r.notes) console.log(`  · ${n}`);
  console.log(`wrote   ${rel(r.dir)}/  (${r.files.join(", ")})`);
  const me = `node ${relative(process.cwd(), process.argv[1])}`;
  console.log(`\nNext: read grid.png, name the hotspots in content.json (image pixels), write the beats, then\n  ${me} make shot-demo --content ${rel(join(r.dir, "content.json"))} --tokens ${rel(join(r.dir, "tokens.json"))} --formats png,sheet`);
}

async function add() {
  const { addScene, defaultAddDir } = await import("../lib/add.mjs");
  const { projectForAdd, recordScene, resolveInputs } = await import("../lib/project.mjs");
  const { sceneDir, sceneMeta } = await import("../lib/build.mjs");
  const { withParent } = await import("../lib/variant.mjs");
  // a variant has no look of its own: it is drawn in its concept's home pack, so it locks the project to that
  const own = sceneMeta(sceneDir(target));
  let parentMeta = null;
  try { parentMeta = own.variantOf ? sceneMeta(sceneDir(own.variantOf)) : null; } catch {}
  const meta = withParent(own, parentMeta);
  // the first add in a project locks the look to this scene's home pack; later adds follow the lockfile
  const { project: p, created } = projectForAdd({ meta, cli: { tokens: opts.tokens, style: opts.style }, dir: String(opts.dir || defaultAddDir()) });
  const { tokens, style } = resolveInputs({ project: p, cli: { tokens: opts.tokens } });
  const dir = resolve(p.dir, String(opts.dir || p.data.dir || defaultAddDir(p.dir)));
  const embed = { view: opts.view ? String(opts.view) : null, play: opts.play ? String(opts.play) : null };
  const r = addScene({ scene: target, dir, tokens, content: opts.content || null, style, force: !!opts.force, ...embed });
  recordScene(p, r.name, embed);
  const rel = (q) => relative(process.cwd(), q) || ".";
  if (created) console.log(`locked  style "${p.data.style}" (from ${r.name}) in ${rel(p.file)}: every scene you add next matches it`);
  else console.log(`style   "${styleName(style)}" (from ${rel(p.file)})`);
  console.log(`added   ${rel(r.sceneOut)}/  (scene.js, scene.css, content.json, tokens.json, style.json, index.html)`);
  if (!(meta.directable || []).length && styleName(style) !== "native") console.log(`note    ${r.name} isn't ported to style packs yet, so it keeps its own look`);
  console.log(`runtime ${rel(r.runtimeOut)}/  (stage.js, tokens.cjs, style.cjs${r.vendors.length ? ", " + r.vendors.join(", ") : ""})`);
  console.log(`embed   ${rel(r.bundle)}  (one self-contained file)`);
  console.log(`\nYou own these files. Edit the copy in content.json, the brand in tokens.json, the motion in scene.js.`);
  console.log(`Preview: serve the folder and open ${rel(r.sceneOut)}/index.html (it re-reads the JSON on refresh).`);
  const { VIEWS } = await import("../lib/build.mjs");
  const size = embed.view && VIEWS[embed.view];
  console.log(`Embed:   <iframe src="/${rel(r.bundle).replace(/^public\//, "")}" style="width:100%;aspect-ratio:${size ? size.join("/") : "16/9"};border:0" loading="lazy" title="${r.name}"></iframe>`);
  console.log(`Rebuild every embed after edits or a look change:\n  node ${process.argv[1]} sync`);
}

async function initProject() {
  const { findProject, writeProject, PROJECT_FILE } = await import("../lib/project.mjs");
  const { defaultAddDir } = await import("../lib/add.mjs");
  const existing = findProject();
  if (existing && relative(process.cwd(), existing.dir) === "") fail(`${existing.file} already exists. Change the look with: site-motion style set <pack>`);
  const style = opts.style ? String(opts.style) : "native";
  if (style !== "native") loadStyle(style); // validate before writing
  const tokens = opts.tokens ? String(opts.tokens) : "default";
  const file = resolve(PROJECT_FILE);
  writeProject(file, { tokens: existsSync(resolve(tokens)) ? "./" + relative(process.cwd(), resolve(tokens)) : tokens, style, dir: String(opts.dir || defaultAddDir()), scenes: [] });
  console.log(`created ${file}\n  tokens ${tokens}\n  style  ${style}${style === "native" ? "  (the first scene you add will lock its look)" : ""}`);
}

async function styleCmd() {
  const S = (await import("node:module")).createRequire(import.meta.url)("../runtime/style.cjs");
  const { writeProject, projectStyle } = await import("../lib/project.mjs");
  const sub = target || "show";
  if (sub === "list") {
    for (const name of listStyles()) {
      const pack = loadStyle(name);
      const raw = JSON.parse((await import("node:fs")).readFileSync(join(ROOT, "styles", `${name}.json`), "utf8"));
      console.log(`${name.padEnd(12)} ${S.encode(pack)}  ${raw.description || ""}`);
    }
    console.log(`\nknobs: ${Object.entries(S.KNOBS).map(([k, v]) => `${k} (${v.join("|")})`).join("; ")}`);
    return;
  }
  if (sub === "export") {
    // works with or without a project: the lockfile's look and brand, or --style / --tokens
    const { exportStyle, mergeDesignMd, FORMATS } = await import("../lib/style-export.mjs");
    const { loadTokens } = await import("../lib/build.mjs");
    const { readFileSync } = await import("node:fs");
    const format = String(opts.format || "css");
    if (!FORMATS.includes(format)) fail(`--format must be one of ${FORMATS.join(", ")}`);
    const { tokens, style } = await inputs();
    const pack = typeof style === "string" ? loadStyle(existsSync(resolve(style)) ? resolve(style) : style) : style;
    const tokenSet = loadTokens(typeof tokens === "string" && existsSync(resolve(tokens)) ? resolve(tokens) : tokens);
    let text;
    try { text = exportStyle(pack, tokenSet, format); } catch (error) { fail(error.message); }
    if (!opts.out) { process.stdout.write(text); return; }
    const out = resolve(String(opts.out));
    // DESIGN.md is yours: only the marked site-motion section is replaced (or appended once)
    if (format === "design-md") text = mergeDesignMd(existsSync(out) ? readFileSync(out, "utf8") : null, text);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    console.log(`wrote ${relative(process.cwd(), out) || out}  (${format}, look ${pack.name}${pack.name.startsWith("sm1.") ? "" : " " + (await import("node:module")).createRequire(import.meta.url)("../runtime/style.cjs").encode(pack)})`);
    return;
  }
  const p = await project();
  if (!p) fail("no site-motion.json here or above. Create one with: site-motion init --style <pack>");
  if (sub === "show") {
    const pack = projectStyle(p);
    console.log(`${relative(process.cwd(), p.file) || p.file}\n  style  ${p.data.style}${Object.keys(p.data.overrides || {}).length ? "  overrides " + JSON.stringify(p.data.overrides) : ""}\n  code   ${S.encode(pack)}`);
    if (pack) for (const k of Object.keys(S.KNOBS)) console.log(`  ${k.padEnd(10)} ${pack[k]}`);
    return;
  }
  if (sub === "set") {
    const ref = rest.find((a) => !a.startsWith("--") && a !== opts.only);
    if (!ref) fail("style set needs a pack, code or file: site-motion style set ink");
    const next = loadStyle(ref);
    let data;
    if (opts.only) {
      // partial apply: take only these knobs from the new pack, keep everything else
      const only = String(opts.only).split(",").map((k) => k.trim());
      for (const k of only) if (!S.KNOBS[k]) fail(`--only: unknown knob "${k}" (knobs: ${Object.keys(S.KNOBS).join(", ")})`);
      if (!next) fail("--only needs a pack to take knobs from, not native");
      const overrides = { ...(p.data.overrides || {}) };
      for (const k of only) overrides[k] = next[k];
      data = { ...p.data, overrides };
    } else data = { ...p.data, style: ref, overrides: {} };
    p.data = writeProject(p.file, data);
    const pack = projectStyle(p);
    console.log(`style   ${p.data.style}${opts.only ? ` with ${opts.only} from ${ref}` : ""}  (${S.encode(pack)})\nRun site-motion sync to restyle the ${p.data.scenes.length} scene(s) already added.`);
    return;
  }
  fail(`unknown: style ${sub}. Use style list | show | set <pack> | export --format css|tailwind|dtcg|design-md`);
}

async function sync() {
  const { syncScene, defaultAddDir } = await import("../lib/add.mjs");
  const { resolveInputs } = await import("../lib/project.mjs");
  const p = await project();
  if (!p) fail("no site-motion.json here or above, so nothing to sync");
  const { tokens, style } = resolveInputs({ project: p });
  const dir = resolve(p.dir, p.data.dir || defaultAddDir(p.dir));
  for (const name of p.data.scenes) {
    const embed = p.data.embeds?.[name] || {};
    const r = syncScene({ sceneOut: join(dir, name), tokens, style, ...embed });
    const how = [embed.view && `view ${embed.view}`, embed.play && `play ${embed.play}`].filter(Boolean).join(", ");
    console.log(`synced  ${relative(process.cwd(), r.bundle)}  (style ${r.style}${how ? ", " + how : ""})`);
  }
  if (!p.data.scenes.length) console.log("no scenes added yet");
}

// Inside a project, a bare scene name means your added copy (the one you edited), not the library original.
async function projectCopy(name) {
  const p = await project();
  if (!p || /[\\/]/.test(String(name))) return name;
  const { defaultAddDir } = await import("../lib/add.mjs");
  const copy = join(resolve(p.dir, String(p.data.dir || defaultAddDir(p.dir))), String(name));
  return existsSync(join(copy, "scene.js")) ? copy : name;
}

async function check() {
  const { checkHtml, report } = await import("../lib/check.mjs");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const names = target === "all" ? sceneArgs() : await Promise.all(sceneArgs().map(projectCopy));
  // a project's brand and look (site-motion.json) unless flags say otherwise
  const { tokens, style } = await inputs();
  const mode = opts.baseline === true ? "compare" : opts.baseline;
  const baseline = mode ? { dir: resolve(String(opts["baseline-dir"] || ".sm-baseline"), basename(String(tokens)).replace(/\.json$/, "")), mode } : null;
  const tmp = mkdtempSync(join(tmpdir(), "sm-check-"));
  let failed = 0;
  for (const name of names) {
    const html = join(tmp, `${basename(name)}.html`);
    writeFileSync(html, buildHtml({ scene: name, tokens, style }));
    // product-UI demos always get the jump check (a snapped state is the classic faux-UI tell); others with --jumps
    const metaFile = join(existsSync(join(String(name), "meta.json")) ? String(name) : join(ROOT, "scenes", String(name)), "meta.json");
    const family = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")).family : null;
    const result = await checkHtml(html, { name: basename(name), baseline, jumps: !!opts.jumps || family === "ui-demo", framing: family === "ui-demo" });
    console.log(report(result));
    if (!result.ok) failed++;
  }
  console.log(`\n${names.length - failed}/${names.length} passed`);
  if (failed) process.exitCode = 1;
}

// rehearse: the last pass before a product demo ships. Every check at the design size, the seam and text again through
// the compact view, contact sheets at the shown width and at phone width, and a note for what was and wasn't looked at.
async function rehearse() {
  const { checkHtml, report } = await import("../lib/check.mjs");
  const { tokens, style } = await inputs();
  const scene = await projectCopy(target), name = basename(String(target));
  const dir = resolve(String(opts.out || join("out", "rehearsal", name)));
  mkdirSync(dir, { recursive: true });
  const hero = join(dir, `${name}.html`), compact = join(dir, `${name}-compact.html`);
  writeFileSync(hero, buildHtml({ scene, tokens, style, content: opts.content }));
  writeFileSync(compact, buildHtml({ scene, tokens, style, content: opts.content, view: "compact" }));
  const full = await checkHtml(hero, { name, jumps: true, framing: true });
  console.log(report(full));
  const small = await checkHtml(compact, { name: name + " (compact)" });
  console.log(report(small));
  await render(hero, { out: dir, formats: ["png", "sheet"] });
  await render(compact, { out: dir, formats: ["sheet"], sheetWidth: 390 });
  const note = join(dir, "REHEARSAL.md");
  if (!existsSync(note)) writeFileSync(note, `# Rehearsal: ${name}\n\n**Started from:** \n\n**Changed:** \n\n**Looked at:** poster, ${name}.sheet.png, ${name}-compact.sheet.png\n\n**Fresh-eye pass:** does the first frame read as a product? Is every cursor move caused by something? Does the payoff answer the click?\n\n**Not checked:** \n`);
  console.log(`\nsheets  ${relative(process.cwd(), dir)}\nnote    ${relative(process.cwd(), note)}`);
  if (full.ok && small.ok) console.log("rehearsal passed.");
  else { console.log("rehearsal failed: fix the lines marked ✗, framing first, then hierarchy, motion and polish."); process.exitCode = 1; }
}

// a variant against its parent (or --against <scene>): edge maps of the poster and the loop, colours set aside
async function similar() {
  const { readFileSync: read, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { sceneDir } = await import("../lib/build.mjs");
  const { sceneMaps, scorePair, verdict, SIMILAR_MAX } = await import("../lib/similar.mjs");
  const metaOf = (name) => JSON.parse(read(join(sceneDir(name), "meta.json"), "utf8"));
  const names = target === "variants"
    ? readdirSync(join(ROOT, "scenes")).filter((n) => n.includes("--") && existsSync(join(ROOT, "scenes", n, "meta.json")) && metaOf(n).variantOf)
    : sceneArgs();
  const tokens = opts.tokens || "default", max = opts.max ? Number(opts.max) : SIMILAR_MAX;
  const tmp = mkdtempSync(join(tmpdir(), "sm-similar-"));
  const maps = new Map();
  const mapsOf = async (name) => {
    if (!maps.has(name)) {
      const html = join(tmp, `${basename(name)}.html`);
      writeFileSync(html, buildHtml({ scene: name, tokens, style: "native" }));
      maps.set(name, await sceneMaps(html));
    }
    return maps.get(name);
  };
  let failed = 0;
  for (const name of names) {
    const against = opts.against ? String(opts.against) : metaOf(name).variantOf;
    if (!against) { console.log(`skip  ${basename(name)}: not a variant (pass --against <scene>)`); continue; }
    const v = verdict(scorePair(await mapsOf(name), await mapsOf(against)), max);
    console.log(`${v.ok ? "pass" : "FAIL"}  ${basename(name)} vs ${basename(against)}  ${v.detail}`);
    if (!v.ok) failed++;
  }
  if (failed) process.exitCode = 1;
}

// the scene names after the command: `all`, or every bare word before the first flag
const sceneArgs = () => (target === "all" ? readdirSync(join(ROOT, "scenes")).filter((n) => existsSync(join(ROOT, "scenes", n, "scene.js"))) : [target, ...rest.slice(0, (rest.findIndex((a) => a.startsWith("--")) + 1 || rest.length + 1) - 1)]);

async function lint() {
  const { lintScene, lintReport } = await import("../lib/lint-scene.mjs");
  const { sceneDir } = await import("../lib/build.mjs");
  let failed = 0, findings = 0;
  // --project: the copies this project added (the files you edit), not the library's
  let dirs;
  if (opts.project) {
    const p = await project();
    if (!p) fail("lint --project needs a site-motion.json here or above");
    const base = resolve(p.dir, String(p.data.dir || "motion"));
    dirs = p.data.scenes.map((n) => join(base, n)).filter((d) => existsSync(join(d, "scene.js")));
  } else dirs = sceneArgs().map((n) => sceneDir(n));
  for (const dir of dirs) {
    const result = lintScene(dir);
    console.log(lintReport(result, (f) => relative(process.cwd(), join(dir, f)) || f));
    if (result.findings.length) { failed++; findings += result.findings.length; }
  }
  const n = dirs.length;
  console.log(`\n${n - failed}/${n} clean${findings ? `, ${findings} finding${findings === 1 ? "" : "s"}. Route the value through the look (h.ui…, var(--sm-…, native)), or keep it with a reason: // sm-native: why` : ""}`);
  if (failed) process.exitCode = 1;
}

// score <scene[@look]…|all> or score --project: build each scene (in the project's look, --style, or its own @look),
// measure its poster frame, and name the odd one out
async function score() {
  const { scoreHtml, oddOneOut, scoreReport } = await import("../lib/style-score.mjs");
  const { loadTokens } = await import("../lib/build.mjs");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { tokens, style } = await inputs();
  const tokenSet = loadTokens(typeof tokens === "string" && existsSync(resolve(tokens)) ? resolve(tokens) : tokens);
  const tmp = mkdtempSync(join(tmpdir(), "sm-score-"));
  let jobs;
  if (opts.project) {
    // the scenes this project added, as built: their own embeds include any edits you made to them
    const p = await project();
    if (!p) fail("score --project needs a site-motion.json here or above");
    const dir = resolve(p.dir, String(p.data.dir || "motion"));
    jobs = p.data.scenes.map((name) => ({ name, html: join(dir, `${name}.html`) })).filter((j) => existsSync(j.html));
    if (!jobs.length) fail(`no built scenes in ${dir} (run site-motion sync)`);
  } else {
    jobs = sceneArgs().map((arg) => {
      const [name, look] = arg.split("@");
      const html = join(tmp, `${basename(name)}${look ? "@" + look : ""}.html`);
      writeFileSync(html, buildHtml({ scene: name, tokens, style: look || style }));
      return { name: arg, html };
    });
  }
  if (jobs.length < 3) fail("score compares a set: give it at least three scenes");
  const rows = [];
  const { sceneMeta, sceneDir } = await import("../lib/build.mjs");
  for (const j of jobs) {
    process.stderr.write(`measuring ${j.name}…\r`);
    const row = await scoreHtml(j.html, { name: j.name, tokens: tokenSet });
    try { row.follows = sceneMeta(sceneDir(j.name.split("@")[0])).directable || []; } catch {}
    rows.push(row);
  }
  const findings = oddOneOut(rows);
  console.log(scoreReport(rows, findings));
  if (opts.json) writeFileSync(resolve(String(opts.json)), JSON.stringify({ rows, findings }, null, 2));
  if (findings.length && opts.strict) process.exitCode = 1;
}

// plan: one scene per section of the whole site, in one look, approved on one contact sheet before anything is added
//   plan [--pages home,features,pricing] [--about "what the product does"] | --brief brief.md | --url https://… [--no-sheet]
//        [--motif [concept]]   one motif: the home page from one concept and its variants (bare: the hero's best concept)
//   plan show | sheet | swap <slot> <scene> | apply
async function planCmd() {
  const P = await import("../lib/plan.mjs");
  const { writeProject, recordScene, resolveInputs, projectStyle, PROJECT_FILE } = await import("../lib/project.mjs");
  const { loadTokens } = await import("../lib/build.mjs");
  const { readFileSync } = await import("node:fs");
  const S = (await import("node:module")).createRequire(import.meta.url)("../runtime/style.cjs");
  const sub = target || "new";
  let p = await project();
  const needPlan = () => { if (!p?.data.plan) fail("no plan yet. Make one with: site-motion plan --pages home,features (or --brief file, or --url https://…)"); };
  const withCode = (plan) => ({ ...plan, code: S.encode(projectStyle(p)) });

  async function sheet() {
    const { renderPlanSheet } = await import("../lib/plan-sheet.mjs");
    const { tokens, style } = resolveInputs({ project: p });
    const pack = typeof style === "string" ? loadStyle(style) : style;
    const tokenSet = loadTokens(typeof tokens === "string" && existsSync(resolve(tokens)) ? resolve(tokens) : tokens);
    const { png, findings } = await renderPlanSheet({ plan: withCode(p.data.plan), pack, tokens, tokenSet, title: p.data.plan.title, progress: (m) => process.stderr.write(`drawing ${m}            \r`) });
    const out = resolve(String(opts.sheet || join(p.dir, "site-motion-plan.png")));
    writeFileSync(out, png);
    process.stderr.write(" ".repeat(60) + "\r");
    console.log(`\nsheet   ${relative(process.cwd(), out) || out}`);
    console.log(!findings.length ? "score   one look: no scene stands out" : findings[0].minor ? `score   close to one look. Note: ${findings[0].sentence}` : `score   odd one out: ${findings[0].sentence}`);
  }

  if (sub === "new") {
    let sections = [], product = String(opts.about || ""), title = product;
    if (opts.brief) {
      const b = P.parseBrief(readFileSync(resolve(String(opts.brief)), "utf8"));
      sections = b.sections; product ||= b.product; title = b.product || title;
    } else if (opts.url) {
      const { fetchSite } = await import("../lib/fetch-site.mjs");
      for (const url of String(opts.url).split(",")) {
        const r = await fetchSite(url.trim(), { maxSheets: 0 }).catch((e) => fail(`${url}: ${e.message}`));
        const path = new URL(r.url).pathname.replace(/\/+$/, "");
        const page = path ? path.split("/").pop().toLowerCase() : "home";
        const found = P.sectionsFromHtml(r.html, page);
        console.log(`read    ${r.url}  ${found.length} section${found.length === 1 ? "" : "s"}`);
        sections.push(...found);
        title ||= new URL(r.url).hostname.replace(/^www\./, "");
      }
    } else sections = P.sectionsFromPages(String(opts.pages || "home").split(",").map((x) => x.trim()).filter(Boolean), product);
    if (!sections.length) fail("found no sections to plan (a page with no h1/h2 headings? try --brief)");
    const locked = p && p.data.style && p.data.style !== "native" ? String(p.data.style) : opts.style ? String(opts.style) : null;
    const plan = P.planSite(sections, P.sceneCatalog(), { product, look: locked, available: listStyles(), motif: opts.motif === true ? true : opts.motif ? String(opts.motif) : null });
    plan.title = title || undefined;
    if (!p) {
      const { defaultAddDir } = await import("../lib/add.mjs");
      const file = resolve(PROJECT_FILE);
      const data = writeProject(file, { tokens: opts.tokens ? String(opts.tokens) : "default", style: plan.look, dir: String(opts.dir || defaultAddDir()), scenes: [], plan });
      p = { file, dir: resolve("."), data: { overrides: {}, ...data } };
      console.log(`created ${PROJECT_FILE}, locked to the look "${plan.look}" (the hero's)`);
    } else {
      const style = p.data.style && p.data.style !== "native" ? p.data.style : plan.look;
      p.data = writeProject(p.file, { ...p.data, style, plan });
    }
    console.log("\n" + P.planTable(withCode(p.data.plan)));
    if (!opts["no-sheet"]) await sheet();
    console.log(`\n${opts["no-sheet"] ? "Draw the sheet with: site-motion plan sheet. " : "Look at the sheet. "}Swap a pick with: site-motion plan swap <slot> <scene>   then: site-motion plan sheet\nWhen it's right: site-motion plan apply   (adds every scene, in this look)`);
    return;
  }
  needPlan();
  if (sub === "show") { console.log(P.planTable(withCode(p.data.plan))); return; }
  if (sub === "sheet") { await sheet(); return; }
  if (sub === "swap") {
    const [slot, scene] = rest.filter((a) => !a.startsWith("--"));
    if (!p.data.plan.slots[slot]) fail(`no slot "${slot}". Slots: ${Object.keys(p.data.plan.slots).join(", ")}`);
    const found = P.sceneCatalog().find((s) => s.name === scene);
    if (!found) fail(proNote(scene) || `no scene "${scene}". Scenes: ${P.sceneCatalog().map((s) => s.name).join(", ")}`);
    const other = Object.entries(p.data.plan.slots).find(([k, v]) => k !== slot && v.scene === scene);
    p.data.plan.slots[slot] = { ...p.data.plan.slots[slot], scene, why: "picked by hand", weak: false, follows: found.directable.length > 0, alt: undefined };
    p.data = writeProject(p.file, p.data);
    console.log(`${slot} → ${scene}${other ? `  (also on ${other[0]}: one scene folder serves both, with one set of copy)` : ""}${found.directable.length ? "" : "  (keeps its own look)"}\nRe-draw the sheet: site-motion plan sheet`);
    return;
  }
  if (sub === "apply") {
    const { addScene, defaultAddDir } = await import("../lib/add.mjs");
    const { tokens, style } = resolveInputs({ project: p });
    const dir = resolve(p.dir, String(p.data.dir || defaultAddDir(p.dir)));
    const done = new Set(p.data.scenes || []);
    for (const [slot, pick] of Object.entries(p.data.plan.slots)) {
      if (done.has(pick.scene)) { console.log(`ok      ${slot.padEnd(18)} ${pick.scene} (already added)`); continue; }
      const r = addScene({ scene: pick.scene, dir, tokens, content: pick.content ? resolve(p.dir, pick.content) : null, style, force: !!opts.force });
      recordScene(p, r.name);
      done.add(pick.scene);
      console.log(`added   ${slot.padEnd(18)} ${relative(process.cwd(), r.bundle)}`);
    }
    console.log(`\nEvery scene is in ${relative(process.cwd(), dir) || "."}/ in the "${p.data.style}" look. Put each embed in its section:`);
    const { VIEWS } = await import("../lib/build.mjs");
    const ratio = (scene) => { const v = p.data.embeds?.[scene]?.view; return v && VIEWS[v] ? VIEWS[v].join("/") : "16/9"; };
    for (const [slot, pick] of Object.entries(p.data.plan.slots)) console.log(`  ${slot.padEnd(18)} <iframe src="/${relative(p.dir, join(dir, pick.scene + ".html")).replace(/^public\//, "")}" style="width:100%;aspect-ratio:${ratio(pick.scene)};border:0" loading="lazy" title="${pick.scene}"></iframe>`);
    console.log(`\nNext: write each scene's copy in its content.json, then site-motion sync. Check the set with site-motion score --project.`);
    return;
  }
  fail(`unknown: plan ${sub}. Use plan [--pages …|--brief …|--url …] | plan show | sheet | swap <slot> <scene> | apply`);
}

function fail(message) {
  console.error(`site-motion: ${message}`);
  process.exit(1);
}

try {
if (command === "init" && target) {
  init();
} else if (command === "init") {
  await initProject();
} else if (command === "style") {
  await styleCmd();
} else if (command === "sync") {
  await sync();
} else if (command === "rehearse" && target) {
  await rehearse();
} else if (command === "check" && target) {
  await check();
} else if (command === "plan") {
  await planCmd();
} else if (command === "score" && (target || opts.project)) {
  await score();
} else if (command === "lint" && (target || opts.project)) {
  await lint();
} else if (command === "similar" && target) {
  await similar();
} else if (command === "add" && target) {
  await add();
} else if (command === "theme" && target) {
  await theme();
} else if (command === "shot" && target) {
  await shotCmd();
} else if (command === "list") {
  console.log("scenes:  " + readdirSync(join(ROOT, "scenes")).join(", "));
  if (existsSync(join(ROOT, "PRO-SCENES.json"))) { const pro = JSON.parse(readFileSync(join(ROOT, "PRO-SCENES.json"), "utf8")); console.log(`pro:     ${Object.keys(pro.scenes).length} more scenes are site-motion Pro; watch them at ${pro.site}`); }
  console.log("tokens:  " + readdirSync(join(ROOT, "tokens")).map((f) => f.replace(/\.json$/, "")).join(", "));
  console.log("styles:  " + listStyles().join(", ") + "  (or native)");
} else if (command === "build" && target) {
  await build();
} else if (command === "render" && target) {
  await render(target, { ...renderOpts, out: opts.out });
} else if (command === "make" && target) {
  const html = await build();
  await render(html, { ...renderOpts, out: opts["render-out"] || join(dirname(html), basename(html, ".html")) });
} else {
  console.log("usage: site-motion list | init | add <scene> | style list|show|set|export | sync | check <scene|all> | rehearse <scene> | lint <scene|all> | similar <variant|variants> | score <scene…> | plan | init <scene> | build <scene> | render <file.html> | make <scene> | theme <url> | shot <image> | shot grid <image>   (see header of bin/site-motion.mjs)");
  process.exit(command ? 1 : 0);
}
} catch (error) {
  const hint = /No tokens at/.test(error.message) ? `\n  Make one with: node ${process.argv[1]} init ${target || "<scene>"}  (or use a preset: --tokens mint|ledger|night)` : "";
  fail(error.message + hint);
}
