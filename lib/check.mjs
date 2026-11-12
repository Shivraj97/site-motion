// check: the rules every scene must keep, measured instead of eyeballed.
//   determinism  seeking A, then B, then A again gives the same pixels both times
//   seam         the jump from the last frame back to `loop` is no bigger than an ordinary frame step
//   contrast     every word on screen reads at WCAG AA (4.5:1, large text 3:1) at the baseline sample times (contrast.mjs)
//   text-fit     every word fits the box it sits in: not cut off, not spilling past its card or pill (layout.mjs)
//   jumps        (with { jumps: true }) no frame step is far bigger than the steps beside it: nothing snaps (layout.mjs)
//   framing      (with { framing: true }) the main device frame is staged: big enough and running off an edge (layout.mjs)
//   baseline     with --baseline write, saves stills at fixed times; with compare, each still must stay ≥ 50 dB PSNR
// Pure functions (psnr, seamVerdict, sampleTimes) are exported for tests; checkHtml drives headless Chrome.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";
import { probe } from "./render.mjs";
import { decodePng } from "./png.mjs";
import { contrastAt } from "./contrast.mjs";
import { textFitAt, jumpsIn, framingOf } from "./layout.mjs";
import { textSizes, readability } from "./readable.mjs";

export const BASELINE_DB = 50;
export const DETERMINISM_DB = 60;

// PSNR over RGB in dB; identical images give Infinity.
export function psnr(a, b) {
  const A = Buffer.isBuffer(a) ? decodePng(a) : a, B = Buffer.isBuffer(b) ? decodePng(b) : b;
  if (A.width !== B.width || A.height !== B.height) throw new Error(`size mismatch ${A.width}×${A.height} vs ${B.width}×${B.height}`);
  let sum = 0;
  const d = A.data, e = B.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] - e[i], g = d[i + 1] - e[i + 1], bl = d[i + 2] - e[i + 2];
    sum += r * r + g * g + bl * bl;
  }
  if (sum === 0) return Infinity;
  const mse = sum / ((d.length / 4) * 3);
  return 10 * Math.log10((255 * 255) / mse);
}

// A seam is invisible when the jump from the last frame back to the loop start looks like the frame steps right
// beside it: the steps just before the end and just after the loop start. Comparing against steps elsewhere in
// the loop misleads, because a scene can be calm for most of its loop and busy at the seam (grain-tally) or change
// in steps (lens-of-order re-speckles its dither 8 times a second). Passes when seamless outright (≥ 50 dB) or no
// worse than the biggest neighbouring step minus 3 dB.
export function seamVerdict(seamDb, neighbourDbs) {
  const biggest = neighbourDbs.length ? Math.min(...neighbourDbs) : Infinity;
  return { ok: seamDb >= BASELINE_DB || seamDb >= biggest - 3, seamDb, neighbourDb: biggest };
}

// Stills for the baseline: six evenly across the timeline (avoiding the exact ends) plus the poster frame.
export function sampleTimes(meta) {
  const times = [1, 2, 3, 4, 5, 6].map((k) => +((meta.duration * k) / 7).toFixed(3));
  times.push(+meta.still.toFixed(3));
  return [...new Set(times)];
}

const fmt = (db) => (db === Infinity ? "identical" : `${db.toFixed(1)} dB`);

async function shotAt(page, t) {
  await page.eval(`__sm.seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  return page.shot();
}

/**
 * Check one built scene file.
 * baseline: { dir, mode: "write" | "compare" } or null
 * Returns { name, ok, checks: [{ name, ok, detail }], problems }
 */
export async function checkHtml(html, { name, baseline = null, jumps = false, framing = false, width = null, minText = undefined } = {}) {
  let page = await launch({ width: 800, height: 600, scale: 1 });
  const meta = await probe(page, html);
  page.close();
  page = await launch({ width: meta.width, height: meta.height, scale: 1 });
  const checks = [];
  const add = (n, ok, detail) => checks.push({ name: n, ok, detail });
  try {
    await probe(page, html);
    const fps = meta.fps || 30;

    // determinism: A, B, A — B sits far from A so any accumulated state would show
    const tA = meta.still, tB = (meta.still + meta.duration * 0.45) % meta.duration;
    const a1 = await shotAt(page, tA);
    await shotAt(page, tB);
    const a2 = await shotAt(page, tA);
    // SVG and text antialiasing can wobble by a level or two on a few pixels between seeks (71–88 dB seen):
    // invisible, so the bar is identical or ≥ DETERMINISM_DB. Real state leaks show up far below that.
    const repeatDb = a1.equals(a2) ? Infinity : psnr(a1, a2);
    add("determinism", repeatDb >= DETERMINISM_DB, repeatDb === Infinity ? "byte-identical after seeking away and back" : `${fmt(repeatDb)} after seeking away and back (needs ≥ ${DETERMINISM_DB} dB)`);

    // seam: last frame → first loop frame, against ordinary steps sampled across the loop
    const last = await shotAt(page, meta.duration - 1 / fps);
    const first = await shotAt(page, meta.loop);
    const seamDb = psnr(last, first);
    // every frame step within 0.25 s of the seam on each side, so effects that change in steps (a dither
    // re-speckling 8 times a second) are in the sample, not only smooth motion
    const f = 1 / fps, n = Math.max(2, Math.round(0.25 * fps)), beside = [];
    const walk = async (from) => { let prev = await shotAt(page, from); for (let k = 1; k <= n; k++) { const next = await shotAt(page, from + k * f); beside.push(psnr(prev, next)); prev = next; } };
    await walk(meta.duration - (n + 1) * f);
    await walk(meta.loop);
    const seam = seamVerdict(seamDb, beside);
    add("seam", seam.ok, `seam ${fmt(seam.seamDb)} vs the steps beside it ${fmt(seam.neighbourDb)}`);

    const contrast = await contrastAt(page, sampleTimes(meta));
    add("contrast", contrast.ok, contrast.detail);

    const fit = await textFitAt(page, sampleTimes(meta));
    add("text-fit", fit.ok, fit.detail);

    // readable: how big the words are where the embed is shown (meta.width is the stage, or a bare cut's width)
    const words = await textSizes(page, sampleTimes(meta));
    const read = readability(words, meta.width, { width, min: minText });
    add("readable", read.ok, read.detail);

    if (framing) {
      const f = await framingOf(page);
      add("framing", f.ok, f.detail);
    }

    if (jumps) {
      const small = await launch({ width: meta.width, height: meta.height, scale: 0.5 });
      try {
        await probe(small, html);
        const j = await jumpsIn(small, meta);
        add("jumps", j.ok, j.detail);
      } finally {
        small.close();
      }
    }

    if (baseline) {
      const dir = resolve(baseline.dir, name);
      mkdirSync(dir, { recursive: true });
      const worst = { db: Infinity, t: null };
      let missing = 0;
      for (const t of sampleTimes(meta)) {
        const shot = await shotAt(page, t);
        const file = join(dir, `t${t.toFixed(3)}.png`);
        if (baseline.mode === "write") { writeFileSync(file, shot); continue; }
        if (!existsSync(file)) { missing++; continue; }
        const db = psnr(shot, readFileSync(file));
        if (db < worst.db) Object.assign(worst, { db, t });
      }
      if (baseline.mode === "write") add("baseline", true, `wrote ${sampleTimes(meta).length} stills to ${dir}`);
      else if (missing) add("baseline", false, `${missing} baseline stills missing in ${dir} (run with --baseline write first)`);
      else add("baseline", worst.db >= BASELINE_DB, `worst ${fmt(worst.db)}${worst.t !== null ? ` at t=${worst.t}` : ""} (needs ≥ ${BASELINE_DB} dB)`);
    }
  } finally {
    page.close();
  }

  // live: the page as a visitor's browser runs it (no ?export): the stage fits its container and the clock runs.
  // Every check above loads the export path, which skips both; a bug there once blanked every embed in a browser
  // while render, check and rehearse all passed.
  const live = await launch({ width: 1000, height: 700, scale: 1 });
  try {
    await live.goto(pathToFileURL(resolve(html)).href);
    const ready = await live.eval("Promise.race([window.__sm ? window.__sm.ready : Promise.resolve(false), new Promise((r) => setTimeout(() => r(false), 30000))])");
    await live.eval("new Promise((r) => setTimeout(r, 500))");
    const height = await live.eval("(document.querySelector('.sm-host') || {}).clientHeight || 0");
    const errors = [...live.problems];
    add("live", ready !== false && height > 0 && !errors.length, errors.length ? `in a browser: ${errors.slice(0, 2).join(" | ")}` : ready === false ? "in a browser: setup never finished" : height > 0 ? `plays in a browser (fits a 1000 px column at ${height} px tall, no console errors)` : "in a browser: the embed has no height");
  } finally {
    live.close();
  }
  const problems = [...page.problems];
  if (problems.length) add("console", false, problems.slice(0, 3).join(" | "));
  return { name, ok: checks.every((c) => c.ok), checks, problems };
}

export function report(result) {
  const lines = [`${result.ok ? "pass" : "FAIL"}  ${result.name}`];
  for (const c of result.checks) lines.push(`  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(12)} ${c.detail}`);
  return lines.join("\n");
}
