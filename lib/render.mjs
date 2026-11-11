// Frame-exact export: seek the scene to every frame time, screenshot, encode with ffmpeg.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";

const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ffmpeg ${args.join(" ")}`);
};

export async function probe(page, html) {
  await page.goto(pathToFileURL(resolve(html)).href + "?export");
  // never wait forever: a page whose setup hangs or dies before wiring ready fails after 60 s
  const ok = await page.eval("Promise.race([window.__sm ? window.__sm.ready : Promise.resolve(false), new Promise((r) => setTimeout(() => r(false), 60000))])");
  // ready resolves false when the scene's setup threw (a missing asset, no WebGL context…): stop, don't record blank frames
  if (ok === false) throw new Error(`scene setup failed in ${html}:\n  ${page.problems.join("\n  ") || "see the page console"}`);
  return page.eval("({ width: __sm.width, height: __sm.height, duration: __sm.duration, loop: __sm.loop, fps: __sm.fps, still: __sm.still })");
}

/**
 * formats: any of mp4, webm, gif, webp, png (poster), sheet (contact sheet png)
 * range: "full" = intro + one loop (0 → duration), "loop" = the seamless loop only
 */
export async function render(html, { out, formats = ["mp4", "png"], fps, scale = 1, range, gifWidth = 960, sheetWidth = 480, frames: onlyFrames } = {}) {
  const name = basename(html).replace(/\.html$/, "");
  const dir = resolve(out || join("out", name));
  mkdirSync(dir, { recursive: true });
  // first a 1×1 probe for the scene's size, then a page at exactly that size
  let page = await launch({ width: 800, height: 600, scale: 1 });
  const meta = await probe(page, html);
  page.close();
  page = await launch({ width: meta.width, height: meta.height, scale });
  await probe(page, html);
  const rate = fps || meta.fps;
  const results = {};
  const t0 = performance.now();
  try {
    if (formats.includes("png")) {
      await page.eval(`__sm.seek(${meta.still}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const file = join(dir, `${name}-poster.png`);
      writeFileSync(file, await page.shot());
      results.png = file;
    }
    const motion = formats.filter((f) => ["mp4", "webm", "gif", "webp", "sheet"].includes(f));
    if (motion.length) {
      const frames = mkdtempSync(join(tmpdir(), "sm-frames-"));
      const wantLoop = (f) => (range ? range === "loop" : f === "gif" || f === "webp");
      const spans = { full: [0, meta.duration], loop: [meta.loop, meta.duration] };
      const needed = new Set(motion.map((f) => (wantLoop(f) ? "loop" : "full")));
      // render the full timeline once; the loop is a slice of it
      const [from, to] = needed.has("full") ? spans.full : spans.loop;
      const count = onlyFrames ?? Math.round((to - from) * rate);
      for (let i = 0; i < count; i++) {
        const t = from + i / rate;
        await page.eval(`__sm.seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        writeFileSync(join(frames, `f${String(i).padStart(5, "0")}.png`), await page.shot());
      }
      const loopStart = needed.has("full") ? Math.round((meta.loop - from) * rate) : 0;
      const input = (sliceLoop) => ["-framerate", String(rate), "-start_number", String(sliceLoop ? loopStart : 0), "-i", join(frames, "f%05d.png")];
      for (const f of motion) {
        const loopOnly = wantLoop(f) && needed.has("full");
        const file = join(dir, `${name}${wantLoop(f) && f !== "gif" && f !== "webp" ? "-loop" : ""}.${f === "sheet" ? "sheet.png" : f}`);
        if (f === "mp4") ff([...input(loopOnly), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", file]);
        if (f === "webm") ff([...input(loopOnly), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", file]);
        if (f === "gif") {
          // GIF delays are whole hundredths of a second, so only 50, 25 or 20 fps play evenly. Resampling 30 → 25
          // drops one frame in six and judders, so when the capture rate isn't 25 or 50, capture the loop again at 25.
          const G = 25;
          let gifInput = input(loopOnly);
          let gifFrames = null;
          if (rate !== 25 && rate !== 50) {
            gifFrames = mkdtempSync(join(tmpdir(), "sm-gif-"));
            const [g0, g1] = spans[wantLoop(f) ? "loop" : "full"];
            const n = Math.round((g1 - g0) * G);
            for (let i = 0; i < n; i++) {
              await page.eval(`__sm.seek(${g0 + i / G}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
              writeFileSync(join(gifFrames, `g${String(i).padStart(5, "0")}.png`), await page.shot());
            }
            gifInput = ["-framerate", String(G), "-i", join(gifFrames, "g%05d.png")];
          }
          ff([...gifInput, "-vf", `${rate === 50 && !gifFrames ? "fps=25," : ""}scale=${gifWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=200[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, "-loop", "0", file]);
          if (gifFrames) rmSync(gifFrames, { recursive: true, force: true });
        }
        if (f === "webp") ff([...input(loopOnly), "-vf", `scale=${gifWidth}:-1:flags=lanczos`, "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "80", "-loop", "0", file]);
        if (f === "sheet") ff([...input(false), "-vf", `select='not(mod(n\\,${Math.max(1, Math.round(count / 12))}))',scale=${sheetWidth}:-1,tile=4x3:padding=8:color=white`, "-frames:v", "1", file]);
        results[f] = file;
      }
      rmSync(frames, { recursive: true, force: true });
    }
  } finally {
    if (page.problems.length) console.error("page problems:\n  " + page.problems.join("\n  "));
    page.close();
  }
  for (const [f, file] of Object.entries(results)) console.log(`${f.padEnd(5)} ${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  console.log(`rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return results;
}
