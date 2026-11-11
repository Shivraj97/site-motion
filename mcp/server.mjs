#!/usr/bin/env node
// site-motion MCP server: lets coding agents (Claude Code, Cursor, Codex…) list scenes, draft tokens from a
// site, build a scene and render it. stdio transport, JSON-RPC 2.0, one JSON message per line. No dependencies.
//
//   node mcp/server.mjs            (an MCP client starts it; see mcp/README.md)
//
// Relative paths in tool arguments resolve against SITE_MOTION_WORKDIR, else the directory the client started
// the server in. build_scene runs in-process (lib/build.mjs is pure); theme_from_url and render_scene run the CLI
// as a child process, so Chrome and ffmpeg can never write to this process's stdout (the protocol channel), a
// crash can't take the server down, and the CLI's network guards (lib/fetch-site.mjs, lib/guard-proxy.mjs) apply
// unchanged.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { buildHtml, listStyles, loadStyle, loadTokens, ROOT } from "../lib/build.mjs";
import { exportStyle, mergeDesignMd, FORMATS as STYLE_FORMATS } from "../lib/style-export.mjs";
import { findProject, resolveInputs } from "../lib/project.mjs";

const SMStyle = createRequire(import.meta.url)("../runtime/style.cjs");
const SMTokens = createRequire(import.meta.url)("../runtime/tokens.cjs");

// stdout is the protocol channel: anything a library logs goes to stderr instead
console.log = console.info = console.debug = (...args) => console.error(...args);

const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const WORKDIR = resolve(process.env.SITE_MOTION_WORKDIR || process.cwd());
const CLI = join(ROOT, "bin", "site-motion.mjs");
const FORMATS = ["mp4", "webm", "webp", "gif", "png", "sheet"];
const at = (p) => resolve(WORKDIR, String(p));
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
const presets = () => readdirSync(join(ROOT, "tokens")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const sceneNames = () => readdirSync(join(ROOT, "scenes")).filter((n) => existsSync(join(ROOT, "scenes", n, "scene.js"))).sort();

class ToolError extends Error {}

const INSTRUCTIONS = `site-motion makes animated website scenes (hero and feature animations) themed only from a brand's design tokens.
Workflow: list_scenes → pick the scene whose story fits the product → (theme_from_url to draft tokens from the brand's site, then check its notes) → build_scene with the tokens and a partial content object using the product's real nouns and numbers → render_scene with formats ["png","sheet"] first and look at the contact sheet → fix content → render_scene with ["mp4","webp"].
Colours come only from tokens; copy only from content (never edit a scene for copy). Use fictional names for third-party brands.
One look per site: if list_scenes reports a project (a site-motion.json), leave tokens and style out of build_scene and the project's brand and style pack apply to every scene. Without a project, pick one style pack from list_scenes (the home pack of the first scene chosen) and pass that same style to every build_scene for the site.
A whole site: plan_site maps every section (from page names, a brief, or the live site's headings) to one scene in one look and draws a contact sheet. Show the sheet to the user and get their approval (swap picks they don't like) before plan_site action "apply" adds the scenes.
Beyond the scenes: export_style gives the same look as CSS variables, a Tailwind v4 @theme, DTCG tokens or a DESIGN.md section. When you build the site's own buttons, cards and transitions, use those values (shadows, radii, easing, label style) instead of inventing new ones.`;

const TOOLS = [
  {
    name: "list_scenes",
    title: "List site-motion scenes",
    description: "List the animated scenes (each tells one product story: approvals, integrations, reliability, metrics…), their renderer, the content keys each accepts, and the token presets. Pass `scene` to get that scene's full default content, which is the shape build_scene's `content` overrides.",
    inputSchema: {
      type: "object",
      properties: { scene: { type: "string", description: "Optional scene name; returns its full default content." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "theme_from_url",
    title: "Draft brand tokens from a website",
    description: "Measure a live website and draft site-motion design tokens (colours, palette, fonts, radius) from it, plus the extractor's notes on what it guessed. With Chrome installed it measures the rendered page; otherwise it reads HTML and CSS. Requests to private or internal addresses are refused. Check the notes and correct by eye before using the tokens. Takes 5-40 s.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL of the brand's site." },
        scheme: { type: "string", enum: ["light", "dark"], description: "Measure the light (default) or dark colour scheme." },
        fast: { type: "boolean", description: "Skip Chrome and read HTML and CSS only (faster, less accurate)." },
        out: { type: "string", description: "Optional path to also save the tokens as JSON (e.g. brand.json)." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  {
    name: "build_scene",
    title: "Build a scene as one HTML file",
    description: "Build a scene into one standalone, offline HTML file that plays live (embed it in an <iframe> or render it with render_scene). Takes seconds.",
    inputSchema: {
      type: "object",
      properties: {
        scene: { type: "string", description: "Scene name from list_scenes (e.g. ledger-stamp), or a path to a custom scene folder." },
        tokens: {
          description: "A preset name (default, mint, ledger, night…), a path to a token JSON file, or a token object: { name, color: { paper, surface, ink, muted, line, accent, … }, palette: [3+ hex], font: { sans, mono, display?, import? }, radius: { sm, md, lg } }. Defaults to \"default\".",
          oneOf: [{ type: "string" }, { type: "object" }],
        },
        content: {
          description: "Partial content object (only the keys you change; deep-merged over the scene's defaults), or a path to a content JSON file.",
          oneOf: [{ type: "object" }, { type: "string" }],
        },
        style: {
          description: "The look: a style pack name from list_scenes (ink, soft-ui, outline, dimensional, field), a short code (sm1.…), a pack object of knobs, or \"native\" (the scene's own look). Defaults to the project's style pack, else native. Use one style for every scene on a site.",
          oneOf: [{ type: "string" }, { type: "object" }],
        },
        out: { type: "string", description: "Output .html path. Defaults to out/<scene>-<tokens>.html." },
        transparent: { type: "boolean", description: "Transparent page background instead of the paper colour." },
      },
      required: ["scene"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "export_style",
    title: "Export the site's look for its own components",
    description: "The project's look (style pack + brand tokens) as code the site's own UI can use, so buttons, cards and transitions match the animations: css (custom properties + .sm-label/.sm-motif/.sm-texture), tailwind (a Tailwind v4 @theme block + @utility), dtcg (W3C design tokens JSON) or design-md (a DESIGN.md section of rules for coding agents). With out, writes the file; for design-md only the marked site-motion section of an existing DESIGN.md is replaced.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: STYLE_FORMATS, description: "Defaults to css." },
        style: { description: "A style pack name, a short code (sm1.…) or a pack object. Defaults to the project's style pack.", oneOf: [{ type: "string" }, { type: "object" }] },
        tokens: { description: "A preset name, a token file path or a token object. Defaults to the project's tokens, else \"default\".", oneOf: [{ type: "string" }, { type: "object" }] },
        out: { type: "string", description: "A file to write (e.g. DESIGN.md, app/look.css). Without it, the text is returned." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "plan_site",
    title: "Plan every animation on a site, in one look",
    description: "Maps each section of a whole site to one scene, all in one look, and draws a contact sheet (attached) with a consistency verdict. Sections come from `pages` (templates: home, features, pricing, security, integrations, about…), a `brief` (markdown: '## page' then '- hero: words' lines; or a file path), or `url` (the live site's own headings). Writes the plan into site-motion.json (creating it, locked to the hero's look). Then: action \"swap\" with slot+scene to change a pick, \"sheet\" to re-draw, \"apply\" to add every planned scene. Get the user's approval of the sheet before apply. A pick marked weak (?) had no strong match: check it.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["new", "show", "sheet", "swap", "apply"], description: "Defaults to new." },
        pages: { type: "array", items: { type: "string" }, description: "Page names for new, e.g. [\"home\", \"features\", \"pricing\"]." },
        about: { type: "string", description: "One line on what the product does; steers every pick." },
        brief: { type: "string", description: "A brief as markdown text, or a path to one." },
        url: { type: "string", description: "A live page (or comma-separated pages) to read sections from." },
        slot: { type: "string", description: "For swap: the slot, e.g. home.feature-2." },
        scene: { type: "string", description: "For swap: the scene to put there." },
        sheet: { type: "boolean", description: "Draw the contact sheet after new (default true)." },
        motif: { type: ["string", "boolean"], description: "For new: one motif. Build the home page from one concept and its variants (hero, feature, cta…). A concept name, or true for the hero's best concept." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "render_scene",
    title: "Render a built scene to video and images",
    description: "Export a built scene HTML frame-exact with headless Chrome and ffmpeg. Formats: png (poster), sheet (4x3 contact sheet), mp4, webm, webp (animated, loop only), gif. Render [\"png\",\"sheet\"] first (seconds) and look at the sheet; motion formats take 1-5 minutes. Returns the output paths and attaches the contact sheet (or poster) as an image.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path to the HTML from build_scene." },
        formats: { type: "array", items: { type: "string", enum: FORMATS }, description: "Defaults to [\"mp4\",\"webp\",\"png\"]." },
        range: { type: "string", enum: ["full", "loop"], description: "full = intro + one loop (default for mp4/webm); loop = the seamless loop only (default for gif/webp)." },
        scale: { type: "number", minimum: 1, maximum: 3, description: "Device pixel ratio, e.g. 2 for retina. Default 1." },
        fps: { type: "number", minimum: 1, maximum: 60, description: "Frames per second. Defaults to the scene's own rate." },
        out: { type: "string", description: "Output folder. Defaults to a folder next to the HTML, named after it." },
        attachImage: { type: "boolean", description: "Attach the contact sheet (or poster) to the result as an image. Default true." },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

// ---------- tools

function listScenes({ scene } = {}) {
  if (scene !== undefined) {
    const name = String(scene);
    if (!sceneNames().includes(name)) throw new ToolError(`No scene "${name}". Scenes: ${sceneNames().join(", ")}`);
    const dir = join(ROOT, "scenes", name);
    return { scene: name, ...readJson(join(dir, "meta.json")), defaultContent: readJson(join(dir, "content.json")) ?? {} };
  }
  const scenes = sceneNames().map((name) => {
    const meta = readJson(join(ROOT, "scenes", name, "meta.json")) ?? {};
    const content = readJson(join(ROOT, "scenes", name, "content.json")) ?? {};
    return {
      name,
      title: content.title,
      story: meta.story,
      stories: meta.stories,
      renderer: meta.renderer,
      blurb: meta.blurb,
      featured: !!meta.featured,
      order: meta.order,
      home: meta.home,
      directable: meta.directable || [],
      contentKeys: Object.keys(content),
    };
  });
  scenes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
  const styles = listStyles().map((name) => ({ name, code: SMStyle.encode(loadStyle(name)), description: readJson(join(ROOT, "styles", `${name}.json`))?.description }));
  const found = findProject(WORKDIR);
  const project = found ? { file: found.file, tokens: found.data.tokens, style: found.data.style, overrides: found.data.overrides || {}, scenes: found.data.scenes } : null;
  return { scenes, tokenPresets: presets(), styles, project, note: "A scene follows a style pack only on the axes in its `directable` list; the rest keeps its own look." };
}

function exportStyleTool({ format = "css", style, tokens, out } = {}) {
  if (!STYLE_FORMATS.includes(format)) throw new ToolError(`format must be one of ${STYLE_FORMATS.join(", ")}`);
  const fromProject = resolveInputs({ project: findProject(WORKDIR) });
  let pack, tokenSet;
  try {
    pack = style === undefined ? fromProject.style : typeof style === "object" && style ? SMStyle.normalize(style, "style") : loadStyle(typeof style === "string" && existsSync(at(style)) ? at(style) : style);
    const t = tokens === undefined ? fromProject.tokens : tokens;
    tokenSet = typeof t === "object" && t ? SMTokens.normalize(t, "tokens") : loadTokens(typeof t === "string" && existsSync(at(t)) ? at(t) : t);
    if (typeof pack === "string") pack = loadStyle(pack);
  } catch (error) {
    throw new ToolError(error.message);
  }
  let text;
  try { text = exportStyle(pack, tokenSet, format); } catch (error) { throw new ToolError(error.message); }
  const look = { name: pack.name, code: SMStyle.encode(pack) };
  if (!out) return { format, look, text };
  const file = at(out);
  if (format === "design-md") text = mergeDesignMd(existsSync(file) ? readFileSync(file, "utf8") : null, text);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { format, look, file, bytes: Buffer.byteLength(text) };
}

async function planSiteTool({ action = "new", pages, about, brief, url, slot, scene, sheet = true, motif } = {}, ctx) {
  const args = ["plan"];
  if (action !== "new") args.push(action);
  let tmp = null;
  if (action === "new") {
    const given = [pages, brief, url].filter((x) => x !== undefined).length;
    if (given > 1) throw new ToolError("Give one of pages, brief or url.");
    if (brief !== undefined) {
      const file = existsSync(at(brief)) ? at(brief) : (tmp = mkdtempSync(join(tmpdir(), "sm-brief-")), join(tmp, "brief.md"));
      if (tmp) writeFileSync(file, String(brief));
      args.push("--brief", file);
    } else if (url !== undefined) args.push("--url", String(url));
    else args.push("--pages", (Array.isArray(pages) && pages.length ? pages : ["home"]).map(String).join(","));
    if (about) args.push("--about", String(about));
    if (!sheet) args.push("--no-sheet");
    if (motif === true) args.push("--motif");
    else if (motif) args.push("--motif", String(motif));
  } else if (action === "swap") {
    if (!slot || !scene) throw new ToolError("swap needs slot and scene.");
    args.push(String(slot), String(scene));
  } else if (!["show", "sheet", "apply"].includes(action)) throw new ToolError("action is new, show, sheet, swap or apply.");
  try {
    const r = await runCli(args, { cwd: WORKDIR, ctx, label: "planning", timeoutMs: 15 * 60_000 });
    if (r.code !== 0) throw new ToolError(cliError(r));
    const found = findProject(WORKDIR);
    const sheetFile = r.stdout.match(/^sheet\s+(.+)$/m)?.[1];
    const sheetPath = sheetFile ? resolve(WORKDIR, sheetFile) : null;
    const result = { action, file: found?.file, look: found?.data.style, plan: found?.data.plan?.slots, score: r.stdout.match(/^score\s+(.+)$/m)?.[1], ...(sheetPath ? { sheet: sheetPath } : {}), ...(action === "apply" ? { log: r.stdout.trim() } : {}) };
    const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
    if (sheetPath && existsSync(sheetPath) && statSync(sheetPath).size < 4 * 1024 * 1024) content.push({ type: "image", data: readFileSync(sheetPath).toString("base64"), mimeType: "image/png" });
    return { result, content };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function buildScene({ scene, tokens, content, style, out, transparent = false } = {}) {
  // one look per site: what the caller leaves out comes from the project's site-motion.json
  const project = findProject(WORKDIR);
  const fromProject = resolveInputs({ project });
  if (tokens === undefined) tokens = project ? fromProject.tokens : "default";
  let pack;
  try {
    pack = style === undefined ? fromProject.style : typeof style === "object" && style ? SMStyle.normalize(style, "style") : loadStyle(typeof style === "string" && existsSync(at(style)) ? at(style) : style);
  } catch (error) {
    throw new ToolError(error.message);
  }
  if (typeof scene !== "string" || !scene) throw new ToolError("`scene` is required: a name from list_scenes.");
  // a bare name must be one of ours; anything with a slash is a custom scene folder
  let sceneArg, sceneName;
  if (/[\\/]/.test(scene)) {
    sceneArg = at(scene);
    if (!existsSync(join(sceneArg, "scene.js"))) throw new ToolError(`No scene.js in ${sceneArg}`);
    sceneName = basename(sceneArg);
  } else {
    if (!sceneNames().includes(scene)) throw new ToolError(`No scene "${scene}". Scenes: ${sceneNames().join(", ")}`);
    sceneArg = join(ROOT, "scenes", scene);
    sceneName = scene;
  }

  const tmp = mkdtempSync(join(tmpdir(), "sm-mcp-"));
  try {
    let tokensFile, tokenName;
    if (tokens && typeof tokens === "object" && !Array.isArray(tokens)) {
      tokensFile = join(tmp, "tokens.json");
      writeFileSync(tokensFile, JSON.stringify(tokens));
      tokenName = slug(tokens.name) || "custom";
    } else if (typeof tokens === "string" && presets().includes(tokens)) {
      tokensFile = join(ROOT, "tokens", `${tokens}.json`);
      tokenName = tokens;
    } else if (typeof tokens === "string") {
      tokensFile = at(tokens);
      if (!existsSync(tokensFile)) throw new ToolError(`No token preset or file "${tokens}". Presets: ${presets().join(", ")}; or pass a token object or a path to a token JSON file.`);
      tokenName = basename(tokensFile).replace(/\.json$/, "");
    } else {
      throw new ToolError("`tokens` must be a preset name, a file path or a token object.");
    }

    let contentFile, overrides = null;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      contentFile = join(tmp, "content.json");
      writeFileSync(contentFile, JSON.stringify(content));
      overrides = content;
    } else if (typeof content === "string") {
      contentFile = at(content);
      if (!existsSync(contentFile)) throw new ToolError(`No content file at ${contentFile}`);
      overrides = readJson(contentFile);
    } else if (content !== undefined && content !== null) {
      throw new ToolError("`content` must be an object of overrides or a path to a content JSON file.");
    }

    const file = at(out || join("out", `${sceneName}-${tokenName}.html`));
    if (extname(file) !== ".html") throw new ToolError(`\`out\` must end in .html (got ${file})`);
    let html;
    try {
      html = buildHtml({ scene: sceneArg, tokens: tokensFile, content: contentFile, transparent: !!transparent, style: pack || "native" });
    } catch (error) {
      throw new ToolError(error.message.replaceAll(join(tmp, "tokens.json"), "(your token object)").replaceAll(join(tmp, "content.json"), "(your content object)"));
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);

    const defaults = readJson(join(sceneArg, "content.json")) ?? {};
    const unknown = overrides && typeof overrides === "object" ? Object.keys(overrides).filter((k) => !(k in defaults)) : [];
    return {
      file,
      kb: Math.round(html.length / 1024),
      scene: sceneName,
      tokens: tokenName,
      style: pack ? { name: pack.name, code: SMStyle.encode(pack) } : "native",
      ...(unknown.length ? { warnings: [`content keys the scene does not use (typo?): ${unknown.join(", ")}. Known keys: ${Object.keys(defaults).join(", ")}`] } : {}),
      next: `render_scene { "file": ${JSON.stringify(file)}, "formats": ["png", "sheet"] }, look at the sheet, then render mp4/webp.`,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function themeFromUrl({ url, scheme, fast, out } = {}, ctx) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { throw new ToolError(`Not a URL: ${url}`); }
  if (!/^https?:$/.test(parsed.protocol)) throw new ToolError("Only http(s) URLs can be themed.");
  if (scheme !== undefined && scheme !== "light" && scheme !== "dark") throw new ToolError("`scheme` is light or dark.");

  const tmp = mkdtempSync(join(tmpdir(), "sm-mcp-theme-"));
  try {
    const draft = join(tmp, "brand.json");
    const args = ["theme", parsed.href, "--out", draft];
    if (scheme === "dark") args.push("--scheme", "dark");
    if (fast) args.push("--fast");
    const r = await runCli(args, { cwd: tmp, ctx, label: "measuring", timeoutMs: 180_000 });
    if (r.code !== 0 || !existsSync(draft)) throw new ToolError(cliError(r));
    const tokens = readJson(draft);
    const lines = r.stdout.split("\n");
    const read = lines.find((l) => l.startsWith("read "));
    const result = {
      url: read ? read.replace(/^read\s+/, "").split(/\s{2,}/)[0] : parsed.href,
      method: read ? read.replace(/^read\s+\S+\s+/, "").trim() : undefined,
      tokens,
      notes: lines.filter((l) => l.startsWith("  · ")).map((l) => l.slice(4)),
    };
    const fallback = lines.find((l) => /^(rendered read failed|no Chrome found)/.test(l));
    if (fallback) result.notes.unshift(fallback);
    if (out) {
      const file = at(out);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(tokens, null, 2) + "\n");
      result.saved = file;
    }
    result.next = `build_scene { "scene": "<name>", "tokens": ${out ? JSON.stringify(result.saved) : "<this tokens object>"} }`;
    return result;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function renderScene({ file, formats, range, scale, fps, out, attachImage = true } = {}, ctx) {
  if (typeof file !== "string" || !file) throw new ToolError("`file` is required: the HTML path from build_scene.");
  const html = at(file);
  if (!existsSync(html) || extname(html) !== ".html") throw new ToolError(`No built scene at ${html} (build one with build_scene).`);
  const list = formats === undefined ? ["mp4", "webp", "png"] : Array.isArray(formats) ? formats.map(String) : String(formats).split(",");
  const bad = list.filter((f) => !FORMATS.includes(f));
  if (!list.length || bad.length) throw new ToolError(`Unknown format ${bad.join(", ") || "(none)"}. Formats: ${FORMATS.join(", ")}`);
  if (range !== undefined && range !== "full" && range !== "loop") throw new ToolError("`range` is full or loop.");
  if (scale !== undefined && !(Number(scale) >= 1 && Number(scale) <= 3)) throw new ToolError("`scale` is between 1 and 3.");
  if (fps !== undefined && !(Number(fps) >= 1 && Number(fps) <= 60)) throw new ToolError("`fps` is between 1 and 60.");

  const dir = out ? at(out) : join(dirname(html), basename(html, ".html"));
  const args = ["render", html, "--formats", list.join(","), "--out", dir];
  if (range) args.push("--range", range);
  if (scale !== undefined) args.push("--scale", String(Number(scale)));
  if (fps !== undefined) args.push("--fps", String(Number(fps)));
  const r = await runCli(args, { cwd: dirname(html), ctx, label: "rendering", timeoutMs: 30 * 60_000 });
  if (r.code !== 0) throw new ToolError(cliError(r));

  const outputs = {};
  for (const line of r.stdout.split("\n")) {
    const m = line.match(/^(mp4|webm|gif|webp|png|sheet)\s+(.+?)\s{2}(\d+) KB$/);
    if (m) outputs[m[1]] = { file: m[2], kb: Number(m[3]) };
  }
  const seconds = Number(r.stdout.match(/rendered in ([\d.]+) s/)?.[1]);
  const problems = r.stderr.split("\n").map((l) => l.trim()).filter((l) => l && l !== "page problems:");
  const result = { outputs, seconds, ...(problems.length ? { pageProblems: problems } : {}) };

  const image = outputs.sheet?.file || outputs.png?.file;
  const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (attachImage && image && existsSync(image) && statSync(image).size < 4 * 1024 * 1024) {
    content.push({ type: "image", data: readFileSync(image).toString("base64"), mimeType: "image/png" });
  }
  return { result, content };
}

// ---------- child processes (the CLI), with progress and cancellation

const children = new Set();

function cliError(r) {
  const msg = (r.stderr.match(/site-motion: ([\s\S]*)/)?.[1] || r.stderr || r.stdout).trim();
  return msg ? msg.split("\n").slice(-12).join("\n") : `site-motion exited with ${r.code}`;
}

function killTree(child) {
  // the CLI runs in its own process group, so Chrome and ffmpeg go down with it
  try { process.platform === "win32" ? child.kill() : process.kill(-child.pid, "SIGKILL"); } catch {}
}

function runCli(args, { cwd, ctx, label, timeoutMs }) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    children.add(child);
    let stdout = "", stderr = "", ticks = 0;
    const started = Date.now();
    const progress = (message) => ctx.progress(++ticks, message);
    child.stdout.on("data", (d) => {
      stdout += d;
      // relay the CLI's own lines as progress, minus its temp-file and next-step chatter
      for (const line of String(d).split("\n")) if (line.trim() && !/^(wrote|Try it|built) /.test(line)) progress(line.trim());
    });
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setInterval(() => progress(`${label}… ${Math.round((Date.now() - started) / 1000)} s`), 2000);
    const timeout = setTimeout(() => { killTree(child); stderr += `\nsite-motion: timed out after ${timeoutMs / 1000} s`; }, timeoutMs);
    const onAbort = () => killTree(child);
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", fail);
    // Chrome's helper processes inherit the CLI's stdout and can outlive it by a minute, which holds the pipe
    // (and 'close') open: when the CLI itself exits, take the rest of its process group down too.
    child.on("exit", () => killTree(child));
    child.on("close", (code) => {
      clearInterval(timer);
      clearTimeout(timeout);
      ctx.signal.removeEventListener("abort", onAbort);
      children.delete(child);
      if (ctx.signal.aborted) fail(new ToolError("cancelled"));
      else done({ code, stdout, stderr });
    });
  });
}

// ---------- JSON-RPC over stdio

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const inflight = new Map(); // request id → AbortController

async function callTool(id, params) {
  const { name, arguments: args = {} } = params || {};
  const progressToken = params?._meta?.progressToken;
  const controller = new AbortController();
  inflight.set(id, controller);
  const ctx = {
    signal: controller.signal,
    progress: (progress, message) => {
      if (progressToken !== undefined && !controller.signal.aborted) send({ method: "notifications/progress", params: { progressToken, progress, message } });
    },
  };
  try {
    let value;
    if (name === "list_scenes") value = listScenes(args);
    else if (name === "build_scene") value = buildScene(args);
    else if (name === "export_style") value = exportStyleTool(args);
    else if (name === "plan_site") value = await planSiteTool(args, ctx);
    else if (name === "theme_from_url") value = await themeFromUrl(args, ctx);
    else if (name === "render_scene") value = await renderScene(args, ctx);
    if (controller.signal.aborted) return; // cancelled: the spec says send nothing
    const content = value.content || [{ type: "text", text: JSON.stringify(value, null, 2) }];
    const structured = value.content ? value.result : value;
    send({ id, result: { content, structuredContent: structured, isError: false } });
  } catch (error) {
    if (controller.signal.aborted) return;
    const known = error instanceof ToolError;
    if (!known) console.error(error);
    send({ id, result: { content: [{ type: "text", text: known ? error.message : `site-motion failed: ${error.message}` }], isError: true } });
  } finally {
    inflight.delete(id);
  }
}

function handle(msg) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return send({ id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } });
  const { id, method, params } = msg;
  if (method === undefined) return; // a response to something we never ask
  if (id === undefined) {
    // notifications
    if (method === "notifications/cancelled") inflight.get(params?.requestId)?.abort();
    return;
  }
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return send({
        id,
        result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "site-motion", title: "site-motion", version: VERSION },
          instructions: INSTRUCTIONS,
        },
      });
    }
    case "ping":
      return send({ id, result: {} });
    case "tools/list":
      return send({ id, result: { tools: TOOLS } });
    case "tools/call":
      if (!TOOLS.some((t) => t.name === params?.name)) return send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      return void callTool(id, params);
    default:
      return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: "Parse error" } }); }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});
// stdin closed: finish what is running (a piped batch of calls still gets its answers), then exit.
// A client that is shutting down sends SIGTERM as well, which stops everything at once.
rl.on("close", () => {
  const exitWhenIdle = () => (inflight.size ? setTimeout(exitWhenIdle, 100) : process.exit(0));
  exitWhenIdle();
});
process.stdout.on("error", () => { for (const child of children) killTree(child); process.exit(0); }); // client gone (EPIPE)
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { for (const child of children) killTree(child); process.exit(0); });
