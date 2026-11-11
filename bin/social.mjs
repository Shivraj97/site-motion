#!/usr/bin/env node
// site-motion social: 9:16 cuts (1080×1920) of rendered 16:9 assets, framed in the brand's own type.
//   node bin/social.mjs brands/<brand>/social.json [--only name]
// For each item: crop a region of the source MP4, scale it into a rounded, outlined slot, and put the
// eyebrow, headline, line and footer (wordmark, call to action, URL) around it. Text is rendered by
// Chrome from the brand tokens; ffmpeg composites base frame → video → corner mask.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadTokens, tokensCss } from "../lib/build.mjs";
import { launch } from "../lib/chrome.mjs";

const W = 1080, H = 1920, PAD = 40, RADIUS = 28;
const [, , configPath, ...rest] = process.argv;
if (!configPath) {
  console.log("usage: node bin/social.mjs brands/<brand>/social.json [--only name]");
  process.exit(1);
}
const only = rest.includes("--only") ? rest[rest.indexOf("--only") + 1] : null;
const config = JSON.parse(readFileSync(configPath, "utf8"));
const tokens = loadTokens(config.tokens);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" "));
}
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout);
  return { width: j.streams[0].width, height: j.streams[0].height, duration: Number(j.format.duration) };
}

function page(item, slot, layer) {
  const f = config.footer || {};
  const font = tokens.font?.import ? `<link rel="stylesheet" href="${tokens.font.import}">` : "";
  return `<!doctype html><html><head><meta charset="utf-8">${font}<style>
${tokensCss(tokens)}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${layer === "top" ? "transparent" : "var(--c-paper)"};-webkit-font-smoothing:antialiased}
.copy{position:absolute;left:84px;right:84px;top:132px;color:var(--c-ink);font-family:var(--font-sans)}
.eyebrow{font-family:var(--font-mono);font-size:26px;letter-spacing:.1em;text-transform:uppercase;color:var(--c-muted)}
.h{margin-top:24px;font-family:var(--font-display,var(--font-sans));font-size:84px;line-height:1.02;letter-spacing:-.02em;white-space:pre-line}
.sub{margin-top:26px;font-size:34px;line-height:1.35;color:var(--c-muted)}
.slot{position:absolute;left:${slot.x}px;top:${slot.y}px;width:${slot.w}px;height:${slot.h}px;border-radius:${RADIUS}px}
.base .slot{background:var(--c-raised);box-shadow:0 30px 60px -30px rgba(0,0,0,.35)}
.top .slot{box-shadow:0 0 0 ${RADIUS}px var(--c-paper)${item.frame === false ? "" : ", inset 0 0 0 var(--stroke-w,0px) var(--c-stroke,transparent)"}}
.noframe .slot{background:transparent;box-shadow:none}
.top.noframe .slot{box-shadow:0 0 0 ${RADIUS}px var(--c-paper)}
.foot{position:absolute;left:84px;right:84px;bottom:110px;display:flex;align-items:center;justify-content:space-between;color:var(--c-ink);font-family:var(--font-sans)}
.mark{font-family:var(--font-display,var(--font-sans));font-size:54px;letter-spacing:-.02em}
.url{font-family:var(--font-mono);font-size:24px;color:var(--c-muted);margin-top:6px}
.cta{padding:20px 34px;border-radius:999px;background:var(--c-cta,var(--c-accent));color:var(--c-cta-ink,var(--c-on-accent,var(--c-ink)));font-size:30px;font-weight:500;box-shadow:inset 0 0 0 var(--stroke-w,0px) var(--c-stroke,transparent)}
</style></head><body class="${layer}${item.frame === false ? " noframe" : ""}">
${layer === "top" ? "" : `<div class="copy"><div class="eyebrow">${esc(item.eyebrow || "")}</div><div class="h">${esc(item.headline)}</div>${item.sub ? `<div class="sub">${esc(item.sub)}</div>` : ""}</div>
<div class="foot"><div><div class="mark">${esc(f.wordmark || "")}</div><div class="url">${esc(f.url || "")}</div></div>${f.cta ? `<div class="cta">${esc(f.cta)}</div>` : ""}</div>`}
<div class="slot"></div></body></html>`;
}

// every cut is cropped from a rendered MP4: say which are missing and how to make them, before starting Chrome
const missing = config.items.filter((i) => (!only || i.name === only) && !existsSync(i.source));
if (missing.length) {
  console.error(`Render these first (each cut is cropped from the scene's MP4):\n${missing.map((i) => `  node bin/site-motion.mjs make ${i.name} --tokens ${config.tokens || "default"} --formats mp4   # → ${i.source}`).join("\n")}`);
  process.exit(1);
}

const chrome = await launch({ width: W, height: H });
const outDir = resolve(config.out || "out/social");
mkdirSync(outDir, { recursive: true });
try {
  for (const item of config.items) {
    if (only && item.name !== only) continue;
    const src = probe(item.source);
    const [cx, cy, cw, ch] = item.crop || [0, 0, src.width, src.height];
    // the slot sits centred in the space between the copy (measured) and the footer
    const sw = W - PAD * 2;
    const sh = Math.round((ch * sw) / cw / 2) * 2;
    const measureFile = join(tmpdir(), `sm-measure-${process.pid}.html`);
    writeFileSync(measureFile, page(item, { x: 0, y: 0, w: 0, h: 0 }, "base"));
    await chrome.goto(pathToFileURL(measureFile).href);
    const { copyBottom, footTop } = await chrome.eval("document.fonts.ready.then(() => ({ copyBottom: document.querySelector('.copy').getBoundingClientRect().bottom, footTop: document.querySelector('.foot').getBoundingClientRect().top }))");
    rmSync(measureFile, { force: true });
    const room = footTop - copyBottom;
    const slot = { x: PAD, y: Math.round(copyBottom + Math.max(56, (room - sh) / 2)), w: sw, h: sh };
    if (sh > room - 112) console.warn(`${item.name}: media is ${sh}px tall but only ${Math.round(room - 112)}px fits between copy and footer; crop it shorter`);
    const work = mkdtempSync(join(tmpdir(), "sm-social-"));
    for (const layer of ["base", "top"]) {
      const file = join(work, `${layer}.html`);
      writeFileSync(file, page(item, slot, layer));
      await chrome.goto(pathToFileURL(file).href);
      await chrome.eval("document.fonts.ready.then(() => true)");
      writeFileSync(join(work, `${layer}.png`), await chrome.shot());
    }
    const out = join(outDir, `${item.name}-9x16.mp4`);
    ff([
      "-loop", "1", "-i", join(work, "base.png"),
      "-i", item.source,
      "-loop", "1", "-i", join(work, "top.png"),
      "-filter_complex",
      `[1:v]crop=${cw}:${ch}:${cx}:${cy},scale=${sw}:${sh}:flags=lanczos[m];[0:v][m]overlay=${slot.x}:${slot.y}:shortest=1[a];[a][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
      "-map", "[v]", "-r", "30", "-c:v", "libx264", "-crf", "19", "-preset", "slow", "-movflags", "+faststart", out,
    ]);
    const poster = join(outDir, `${item.name}-9x16-poster.png`);
    ff(["-ss", String((item.still ?? src.duration * 0.7).toFixed(2)), "-i", out, "-frames:v", "1", poster]);
    rmSync(work, { recursive: true, force: true });
    console.log(`${item.name.padEnd(20)} ${out}  ${(statSync(out).size / 1024).toFixed(0)} KB  (${src.duration.toFixed(1)} s)`);
  }
} finally {
  if (chrome.problems.length) console.error("page problems:\n  " + chrome.problems.join("\n  "));
  chrome.close();
}
void dirname;
