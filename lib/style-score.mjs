// score: does a set of scenes look like one site? Measures each scene's poster frame and names the odd one out
// in a plain sentence. Cheap, explainable metrics instead of an image-embedding model:
//   line      median drawn line width (SVG strokes and CSS borders/rings, in px at 1×)
//   shadows   share of boxes that cast a shadow (blur or an outward offset; inset rings don't count)
//   corners   median corner radius of boxes and SVG rects (pills and circles left out: they're shapes)
//   labels    the dominant label voice: font family kind + case (mono caps, sans sentence, …)
//   palette   share of the frame that is off the brand: farther than ΔE2000 6 from every token colour and its tints
//             (calibrated: frames in their own brand stay ≤ 0.1%, colourful scenes in another brand reach 5–6%; a scene
//             with little colour in it can't show a wrong brand from one frame, and won't be flagged)
// Motion can't be judged from a still; the score says so rather than guessing.
// Pure functions (deltaE2000, offPalette, oddOneOut, verdicts) are exported for tests; scoreHtml drives Chrome.
import { launch } from "./chrome.mjs";
import { probe } from "./render.mjs";
import { decodePng } from "./png.mjs";

// ---------- colour science ----------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function lab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
// CIEDE2000 (Sharma, Wu, Dalal 2005)
export function deltaE2000(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) * deg; return v < 0 ? v + 360 : v; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) <= 180 ? hbp / 2 : h1p + h2p < 360 ? (hbp + 360) / 2 : (hbp - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const hex = (c) => { const m = c.replace("#", ""); const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m.slice(0, 6); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** The brand's reachable colours: every token colour and palette entry, with tints toward paper and surface
 *  (anything drawn at partial opacity lands on one of those), and shades between ink and every other colour. */
export function brandColours(tokens) {
  const base = [...Object.values(tokens.color), ...(tokens.palette || [])].filter((c) => typeof c === "string" && c.startsWith("#")).map(hex);
  const grounds = [tokens.color.paper, tokens.color.surface, tokens.color.ink].filter(Boolean).map(hex);
  const out = [];
  for (const c of base) for (const g of grounds) for (let k = 0; k <= 10; k++) out.push(mixRgb(c, g, k / 10));
  return out.map(lab);
}

/** Share of sampled pixels farther than `limit` ΔE2000 from every brand colour. image: { width, height, data } RGBA. */
export function offPalette(image, labs, { step = 6, limit = 6 } = {}) {
  let off = 0, n = 0;
  const cache = new Map();
  for (let y = 0; y < image.height; y += step) for (let x = 0; x < image.width; x += step) {
    const i = (y * image.width + x) * 4;
    const key = (image.data[i] >> 2) << 12 | (image.data[i + 1] >> 2) << 6 | (image.data[i + 2] >> 2);
    let far = cache.get(key);
    if (far === undefined) {
      const p = lab([image.data[i], image.data[i + 1], image.data[i + 2]]);
      let best = Infinity;
      for (const q of labs) { const d = deltaE2000(p, q); if (d < best) best = d; if (best < limit) break; }
      far = best >= limit;
      cache.set(key, far);
    }
    n++; if (far) off++;
  }
  return n ? off / n : 0;
}

// ---------- in-page measurement (runs inside the scene page) ----------
const MEASURE = `(() => {
  const root = document.querySelector(".sm-stage") || document.body;
  const box = root.getBoundingClientRect();
  const k = box.width / (window.__sm?.width || box.width) || 1; // stage scale, so widths are reported at 1×
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; let n = el; while (n && n !== root) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; n = n.parentElement; } return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom; };
  const px = (v) => parseFloat(v) || 0;
  const lines = [], radii = [], labels = {};
  let boxes = 0, casting = 0;
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (el instanceof SVGGeometryElement) {
      if (s.stroke !== "none" && px(s.strokeWidth) > 0 && +s.strokeOpacity > 0) { const m = el.getScreenCTM(); lines.push(px(s.strokeWidth) * (m ? Math.hypot(m.a, m.b) : 1) / k); }
      if (el.tagName === "rect") { const rx = px(el.getAttribute("rx")); const short = Math.min(+el.getAttribute("width") || 0, +el.getAttribute("height") || 0); if (rx > 0 && rx < short / 2 - 0.5) radii.push(rx); }
      continue;
    }
    if (el instanceof SVGElement) continue;
    const painted = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.boxShadow !== "none" || px(s.borderTopWidth) > 0;
    if (painted && r.width > 12 && r.height > 12) {
      boxes++;
      const layers = s.boxShadow === "none" ? [] : s.boxShadow.split(/,(?![^(]*\\))/);
      for (const l of layers) {
        const nums = (l.replace(/rgba?\\([^)]*\\)/g, "").match(/-?[\\d.]+px/g) || []).map(px);
        if (/inset/.test(l)) { if (nums[3] > 0) lines.push(nums[3] / k); continue; }
        if (nums.length >= 3 && (nums[2] > 0 || nums[1] !== 0) && !/rgba\\([^)]*,\\s*0\\)/.test(l)) { casting++; break; }
        if (nums.length >= 4 && nums[2] === 0 && nums[3] > 0) lines.push(nums[3] / k);
      }
      const rad = px(s.borderTopLeftRadius);
      if (rad > 0 && rad < Math.min(r.width, r.height) / 2 - 0.5) radii.push(rad / k);
    }
    for (const side of ["Top", "Right", "Bottom", "Left"]) { const w = px(s["border" + side + "Width"]); if (w > 0 && s["border" + side + "Style"] !== "none") lines.push(w / k); }
    // labels: elements a scene marks as labels (eyebrow, label, kicker, legend, caption, tag classes) or sets in
    // caps; one vote each. Plain small text (amounts, names, data cells) is content, not the label voice.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
    const cls = typeof el.className === "string" ? el.className : "";
    if (own.length >= 2 && own.length <= 60 && /[a-z]/i.test(own) && (/(^|[-_ ])(eyebrow|label|kicker|legend|caption|tag)(\b|[-_])/.test(cls) || s.textTransform === "uppercase")) {
      const fam = s.fontFamily.toLowerCase();
      const kind = /mono|courier|menlo|consolas/.test(fam) ? "mono" : /serif/.test(fam.replace(/sans-serif/g, "")) || /georgia|times/.test(fam) ? "serif" : "sans";
      const caps = s.textTransform === "uppercase" ? "caps" : s.fontStyle === "italic" ? "italic" : "sentence";
      const voice = kind + " " + caps;
      labels[voice] = (labels[voice] || 0) + 1;
    }
  }
  return { lines, radii, boxes, casting, labels, canvas: root.querySelectorAll("canvas").length };
})()`;

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Measure one built scene HTML at its poster frame. */
export async function scoreHtml(html, { name, tokens, keepShot = false }) {
  let page = await launch({ width: 800, height: 600, scale: 1 });
  const meta = await probe(page, html);
  page.close();
  page = await launch({ width: meta.width, height: meta.height, scale: 1 });
  try {
    await probe(page, html);
    await page.eval(`__sm.seek(${meta.still}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const m = await page.eval(MEASURE);
    const png = await page.shot();
    const shot = decodePng(png);
    const voices = Object.entries(m.labels).sort((a, b) => b[1] - a[1]);
    return {
      name,
      line: m.lines.length >= 3 ? +median(m.lines).toFixed(2) : null,
      shadows: m.boxes >= 3 ? +(m.casting / m.boxes).toFixed(2) : null,
      corners: m.radii.length >= 2 ? +median(m.radii).toFixed(1) : null,
      labels: voices.length ? voices[0][0] : null,
      palette: +offPalette(shot, brandColours(tokens)).toFixed(3),
      counts: { lines: m.lines.length, boxes: m.boxes, radii: m.radii.length, canvas: m.canvas },
      ...(keepShot ? { png } : {}), // the poster frame itself, for contact sheets (plan)
    };
  } finally {
    page.close();
  }
}

// ---------- the verdict ----------
// Scenes differ by content, so a look is judged by agreement, not by exact values:
//   numbers (line, corners, palette): flagged only when a scene sits outside the range of every other scene by a
//     margin and is far from their median, e.g. "9px corners, where the others run 3–6px". Line and corners are
//     compared as ratios (a 1px vs 2px line is as far apart as 2px vs 4px); palette as a share of the frame.
//   categories (elevation: flat or casting shadows; labels: the voice): flagged when a scene differs from a clear
//     majority (two thirds of the others).
// A metric a scene can't show (no SVG lines, too few boxes, no labels at its poster frame) is skipped for it.
const NUMERIC = {
  line: { ratio: 1.6, margin: 1.25, say: (v) => `${v}px lines`, range: (a, b) => `${a}–${b}px`, what: "line weight" },
  corners: { ratio: 1.8, margin: 1.3, say: (v) => `${v}px corners`, range: (a, b) => `${a}–${b}px`, what: "corners" },
  palette: { diff: 0.03, gap: 0.02, say: (v) => `${Math.round(v * 100)}% of the frame off the brand palette`, range: (a, b) => `${Math.round(a * 100)}–${Math.round(b * 100)}%`, what: "colour" },
};
// which knob family each metric reads, so a finding on a scene that doesn't follow that axis can say so
const AXIS_OF = { line: "stroke", corners: "corner", palette: "color", elevation: "elevation", labels: "label" };
export const elevationOf = (shadows) => (shadows === null || shadows === undefined ? null : shadows >= 0.05 ? "casts shadows" : "flat");

export function oddOneOut(rows) {
  const findings = [];
  for (const [key, spec] of Object.entries(NUMERIC)) {
    const have = rows.filter((r) => r[key] !== null && r[key] !== undefined);
    if (have.length < 3) continue;
    for (const r of have) {
      const others = have.filter((o) => o !== r).map((o) => o[key]);
      const m = median(others), lo = Math.min(...others), hi = Math.max(...others), v = r[key];
      let off = false, z = 0;
      if (spec.ratio) {
        const far = Math.max(v / Math.max(m, 1e-6), m / Math.max(v, 1e-6));
        off = far >= spec.ratio && (v > hi * spec.margin || v < lo / spec.margin);
        z = far;
      } else {
        off = Math.abs(v - m) >= spec.diff && (v > hi + spec.gap || v < lo - spec.gap);
        z = 1 + Math.abs(v - m) * 10;
      }
      // a ratio under 2.2 (or under 6 points of palette) on its own is a note, not a mismatch
      const minor = spec.ratio ? z < 2.2 : Math.abs(v - m) < 0.06;
      if (off) findings.push({ name: r.name, key, z, minor, value: v, set: m, sentence: `${r.name} is off on ${spec.what}: ${spec.say(v)}, where the others run ${spec.range(lo, hi)}.` });
    }
  }
  const categorical = [
    ["elevation", (r) => elevationOf(r.shadows), (r, v, top) => `${r.name} is off on elevation: it ${v === "flat" ? "is flat" : "casts shadows"}, where the rest of the set ${top === "flat" ? "is flat" : "casts shadows"}.`],
    ["labels", (r) => r.labels, (r, v, top) => `${r.name} is off on labels: ${v}, where the rest of the set uses ${top}.`],
  ];
  for (const [key, get, say] of categorical) {
    const have = rows.filter((r) => get(r));
    if (have.length < 3) continue;
    for (const r of have) {
      const others = have.filter((o) => o !== r);
      const counts = {};
      for (const o of others) counts[get(o)] = (counts[get(o)] || 0) + 1;
      const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top !== get(r) && n / others.length >= 2 / 3) findings.push({ name: r.name, key, z: 2 + n / others.length, minor: false, value: get(r), set: top, sentence: say(r, get(r), top) });
    }
  }
  // a scene that doesn't follow the axis can't be fixed by changing the look: say so
  for (const f of findings) {
    const row = rows.find((r) => r.name === f.name);
    if (row?.follows && !row.follows.includes(AXIS_OF[f.key])) f.sentence += ` It doesn't follow ${AXIS_OF[f.key]} yet, so no look changes this; port it, or leave it out of this set.`;
  }
  // a scene with two findings, or one categorical one, is a real mismatch; a lone small number difference stays minor
  for (const f of findings) if (findings.filter((g) => g.name === f.name).length > 1) f.minor = false;
  findings.sort((a, b) => Number(a.minor) - Number(b.minor) || b.z - a.z);
  return findings;
}

export function scoreReport(rows, findings) {
  const cell = (v, f) => (v === null || v === undefined ? "–" : f(v));
  const w = Math.max(20, ...rows.map((r) => r.name.length + 1));
  const lines = [`${"scene".padEnd(w)} line    elevation      corners  palette  labels`];
  for (const r of rows) lines.push(`${r.name.padEnd(w)} ${cell(r.line, (v) => v + "px").padEnd(7)} ${cell(elevationOf(r.shadows), (v) => v).padEnd(14)} ${cell(r.corners, (v) => v + "px").padEnd(8)} ${cell(r.palette, (v) => (v * 100).toFixed(1) + "%").padEnd(8)} ${r.labels || "–"}`);
  lines.push("");
  if (!findings.length) lines.push(`One look: no scene stands out on line, elevation, corners, colour or labels. (Motion isn't scored from a still.)`);
  else if (findings.every((f) => f.minor)) {
    lines.push(`Close to one look. Note${findings.length > 1 ? "s" : ""}:`);
    for (const f of findings) lines.push(`  ${f.sentence}`);
  } else {
    // the scene with the most findings (then the strongest) is the odd one out
    const by = {};
    for (const f of findings.filter((g) => !g.minor)) (by[f.name] ||= []).push(f);
    const worst = Object.entries(by).sort((a, b) => b[1].length - a[1].length || b[1][0].z - a[1][0].z)[0][0];
    lines.push(`Odd one out: ${worst}.`);
    for (const f of findings) lines.push(`  ${f.sentence}`);
  }
  return lines.join("\n");
}
