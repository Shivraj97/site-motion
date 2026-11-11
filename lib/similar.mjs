// similar: how close a variant looks to its parent, colours set aside (release plan, the variant gate).
// A variant must read as new work next to its parent; a recolour or a re-styled copy must not pass.
//
// Each frame becomes an edge map: luminance, shrunk to SIZE wide, Sobel gradient magnitude, softened, then
// scaled to its own 98th percentile. Edges are the same whether a shape is ink on paper or paper on ink, so a
// palette swap, dark mode or a style pack barely moves the score, while a new composition does.
// Two maps are compared with SSIM over 8×8 windows, each window weighted by how much structure it holds, so
// the empty paper that every scene has does not count as "the same".
// A scene pair is scored on the poster (still vs still) and on the motion: each of the variant's frames
// against its best match among the parent's, averaged. The score is the higher of the two.
import { launch } from "./chrome.mjs";
import { probe } from "./render.mjs";
import { decodePng } from "./png.mjs";

export const SIZE = 200; // edge-map width; 1600×900 → 200×112
export const FRAMES = 8; // loop frames per scene, besides the still
// Fails above this. Calibrated on the variant pilot (10 Nov 2026), default tokens, native look:
//   the same scene recoloured or restyled (night, mint, ledger × ink, outline, soft-ui)   0.67–0.99
//   the same scene with other data (water slide with 5 stages, loom with 4 tools)       0.50–0.83
//   unrelated concepts (13 pairs, incl. galton-router vs water-slide-funnel)           −0.06–0.21
//   the 8 pilot variants against their parents                                         −0.03–0.12
// Blind spot: edges are compared in place, so the same scene scaled or re-typeset (ledger-stamp's
// legible layout scores ≈ 0) passes. The poster review and lint's "differs on ≥ 2 axes" cover that.
export const SIMILAR_MAX = 0.35;

// RGBA image → edge map { w, h, d: Float32Array } in 0..1
export function edgeMap(img, width = SIZE) {
  const k = img.width / width, w = Math.round(img.width / k), h = Math.round(img.height / k);
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    const x0 = Math.floor(x * k), x1 = Math.min(img.width, Math.floor((x + 1) * k)), y0 = Math.floor(y * k), y1 = Math.min(img.height, Math.floor((y + 1) * k));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * img.width + xx) * 4;
      s += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]; n++;
    }
    lum[y * w + x] = n ? s / n / 255 : 0;
  }
  const at = (x, y) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  let g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    g[y * w + x] = Math.hypot(gx, gy);
  }
  g = blur(blur(g, w, h), w, h); // tolerate a shift of a pixel or two at this size
  const sorted = Float32Array.from(g).sort();
  const top = sorted[Math.floor(sorted.length * 0.98)] || 1e-6;
  for (let i = 0; i < g.length; i++) g[i] = Math.min(1, g[i] / top);
  return { w, h, d: g };
}

function blur(a, w, h) {
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += a[yy * w + xx]; n++; }
    }
    out[y * w + x] = s / n;
  }
  return out;
}

// structure-weighted SSIM between two edge maps of the same size, in −1..1 (1 = the same picture)
export function ssim(A, B, win = 8, step = 4) {
  if (A.w !== B.w || A.h !== B.h) throw new Error(`edge maps differ in size: ${A.w}×${A.h} vs ${B.w}×${B.h}`);
  const C1 = 0.01 ** 2, C2 = 0.03 ** 2, N = win * win;
  let sum = 0, weight = 0;
  for (let y = 0; y + win <= A.h; y += step) for (let x = 0; x + win <= A.w; x += step) {
    let ma = 0, mb = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const p = (y + j) * A.w + x + i; ma += A.d[p]; mb += B.d[p]; }
    ma /= N; mb /= N;
    let va = 0, vb = 0, cov = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
      const p = (y + j) * A.w + x + i, a = A.d[p] - ma, b = B.d[p] - mb;
      va += a * a; vb += b * b; cov += a * b;
    }
    va /= N - 1; vb /= N - 1; cov /= N - 1;
    const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
    // a window counts by the structure in it (either side): blank paper on both sides says nothing
    const wgt = va + vb + (ma + mb) * 0.01;
    sum += s * wgt; weight += wgt;
  }
  return weight ? sum / weight : 1;
}

// { still, frames: [map…] } for each side → { poster, motion, score }
export function scorePair(a, b) {
  const poster = ssim(a.still, b.still);
  const pool = [b.still, ...b.frames];
  const best = a.frames.map((f) => Math.max(...pool.map((g) => ssim(f, g))));
  const motion = best.reduce((s, v) => s + v, 0) / Math.max(1, best.length);
  return { poster, motion, score: Math.max(poster, motion) };
}

// the times a scene is sampled at: its still, then FRAMES spread evenly over the loop
export function sampleTimes(meta, n = FRAMES) {
  const span = meta.duration - meta.loop;
  return Array.from({ length: n }, (_, k) => +(meta.loop + (span * (k + 0.5)) / n).toFixed(3));
}

// edge maps for one built scene file (headless Chrome at quarter size: 400×225 is plenty for a 200-wide map)
export async function sceneMaps(html) {
  let page = await launch({ width: 800, height: 600, scale: 1 });
  const meta = await probe(page, html);
  page.close();
  page = await launch({ width: meta.width, height: meta.height, scale: 0.25 });
  try {
    await probe(page, html);
    const at = async (t) => {
      await page.eval(`__sm.seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      return edgeMap(decodePng(await page.shot()));
    };
    const still = await at(meta.still);
    const frames = [];
    for (const t of sampleTimes(meta)) frames.push(await at(t));
    return { still, frames };
  } finally {
    page.close();
  }
}

export function verdict(score, max = SIMILAR_MAX) {
  return { ok: score.score <= max, detail: `poster ${score.poster.toFixed(2)}, motion ${score.motion.toFixed(2)} (fails above ${max})` };
}
