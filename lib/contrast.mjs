// contrast: every word a scene shows must read at WCAG AA, in whatever brand it is built with.
// Measured, not guessed: the text colour comes from the page (with its real opacity), the background from pixels,
// read from a second screenshot with every glyph hidden, so pills, cards, tints and photos under the text all count.
//   normal text  4.5:1      large text (≥ 24 px, or ≥ 18.66 px and bold)  3:1
// Fails: text at full strength (≥ 95% opacity) below its bar. Listed but passing: text below it only because the
// scene dims it on purpose (its own opacity, or an overlay marked data-sm-dim="<strength>", like a spotlight,
// that dims everything outside its box). Skipped: text mid-fade at the sample time (its opacity changes within ±0.15 s), text
// under 10% opacity, text covered or clipped (hiding its glyphs changes no pixels), text with an identical copy drawn
// directly over it (the copy is judged instead), and anything inside
// [data-sm-decor] (texture a reader is not meant to read: a watermark, a ghosted backdrop).
// Pure functions are exported for tests; contrastAt drives a page that check.mjs has already loaded.
import { decodePng } from "./png.mjs";

export const AA = 4.5;
export const AA_LARGE = 3;

export function parseColor(text) {
  const m = String(text).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a };
}

const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// a colour drawn at `alpha` over `bg`, as the eye sees it
export const over = (fg, bg, alpha) => ({ r: bg.r + (fg.r - bg.r) * alpha, g: bg.g + (fg.g - bg.g) * alpha, b: bg.b + (fg.b - bg.b) * alpha });

export const required = (px, weight) => (px >= 24 || (px >= 18.66 && weight >= 700) ? AA_LARGE : AA);

// the background under a box: the pixel of median luminance, so a rule or an icon edge crossing the box doesn't decide it
export function medianColor(img, box) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w)), y1 = Math.min(img.height, Math.ceil(box.y + box.h));
  if (x1 <= x0 || y1 <= y0) return null;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  const px = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * img.width + x) * 4;
    const c = { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
    px.push([luminance(c), c]);
  }
  px.sort((a, b) => a[0] - b[0]);
  return px[px.length >> 1][1];
}

// The pixels in a box that change when the glyphs are hidden: where the text actually drew. Text covered by
// something on top (a press over a document, a card sliding over a label) or clipped away draws nowhere, so no
// one can read it and it isn't judged. Where it does draw, the hidden frame at those pixels is exactly what lies
// under the letters, so a box half under the press is judged against the card, not the press.
export function inked(shown, hidden, box) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(shown.width, Math.ceil(box.x + box.w)), y1 = Math.min(shown.height, Math.ceil(box.y + box.h));
  let n = 0;
  const under = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * shown.width + x) * 4;
    n++;
    if (Math.abs(shown.data[i] - hidden.data[i]) + Math.abs(shown.data[i + 1] - hidden.data[i + 1]) + Math.abs(shown.data[i + 2] - hidden.data[i + 2]) > 24) {
      const c = { r: hidden.data[i], g: hidden.data[i + 1], b: hidden.data[i + 2] };
      under.push([luminance(c), c]);
    }
  }
  under.sort((a, b) => a[0] - b[0]);
  return { share: n ? under.length / n : 0, bg: under.length >= 3 ? under[under.length >> 1][1] : null };
}

// one sample's verdicts: items carry { key, text, color, alpha, px, weight, box }; `shown` (optional) is the same
// frame with the text drawn, used to drop text nobody can see and to read the background under the letters
export function judge(items, img, shown) {
  const out = [];
  for (const it of items) {
    const ink = shown ? inked(shown, img, it.box) : null;
    if (ink && ink.share < 0.01) continue;
    const bg = ink?.bg || medianColor(img, it.box);
    const fg = parseColor(it.color);
    if (!bg || !fg) continue;
    const alpha = Math.min(1, fg.a * it.alpha);
    const seen = over(fg, bg, alpha);
    const need = required(it.px, it.weight);
    out.push({ key: it.key, text: it.text, ratio: ratio(seen, bg), need, fg: seen, bg, alpha });
  }
  return out;
}

// Text drawn at (near) full opacity in a colour that misses AA fails: that is a colour choice, and the fix is a
// token (a <name>Text shade). Text under AA only because a scene dims it on purpose (a pending checklist row, a
// document waiting in the queue) is listed as dimmed: worth a look, but it doesn't fail the scene.
export const SOLID = 0.95;

// across samples: each element keeps its worst reading, judged separately for solid and dimmed moments
export function summarize(samples) {
  const worst = new Map();
  for (const { t, verdicts } of samples) for (const v of verdicts) {
    const kind = v.alpha >= SOLID ? "solid" : "dim";
    const key = kind + "|" + v.key;
    const w = worst.get(key);
    if (!w || v.ratio < w.ratio) worst.set(key, { ...v, t, kind });
  }
  const all = [...worst.values()];
  const below = (kind) => all.filter((v) => v.kind === kind && v.ratio < v.need).sort((a, b) => a.ratio - b.ratio);
  return { checked: new Set(all.map((v) => v.key)).size, failing: below("solid"), dimmed: below("dim") };
}

const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// one line per distinct reading: the same label on four documents is one finding
const distinct = (list) => { const seen = new Set(); return list.filter((f) => { const k = f.text + "|" + f.ratio.toFixed(2); return !seen.has(k) && seen.add(k); }); };
const show = (all) => { const list = distinct(all); return list.slice(0, 3).map((f) => `"${f.text.slice(0, 24)}" ${f.ratio.toFixed(2)}:1 (needs ${f.need}, ${hex(f.fg)} on ${hex(f.bg)}, t=${f.t})`).join("; ") + (list.length > 3 ? "; …" : ""); };
export function describe({ checked, failing, dimmed = [] }, skipped = 0) {
  const parts = [failing.length ? `${failing.length}/${checked} text elements below AA: ${show(failing)}` : `${checked}/${checked} text elements read at WCAG AA when shown at full strength`];
  if (dimmed.length) parts.push(`note: ${dimmed.length} dimmed on purpose read below AA (${show(dimmed)})`);
  if (skipped) parts.push(`${skipped} skipped as decor`);
  return parts.join("; ");
}

// Runs in the page. Collects every visible piece of text at t, skipping text whose opacity is moving at t.
const COLLECT = (t) => `(() => {
  const seek = (x) => __sm.seek(Math.max(0, x));
  const decor = (el) => !!el.closest("[data-sm-decor]");
  const alphaOf = (el) => { let a = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement || n.parentNode) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return 0; a *= parseFloat(cs.opacity); } return a; };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
  const nodes = [...document.querySelectorAll(".sm-host *")].filter((el) => own(el).length && !["SCRIPT", "STYLE"].includes(el.tagName));
  seek(${t} - 0.15); const before = nodes.map(alphaOf);
  seek(${t} + 0.15); const after = nodes.map(alphaOf);
  seek(${t});
  // overlays that dim everything outside their own box (a spotlight): data-sm-dim="<strength 0–1>"
  const dims = [...document.querySelectorAll(".sm-host [data-sm-dim]")].map((d) => ({ a: alphaOf(d) * (parseFloat(d.dataset.smDim) || 0.4), r: d.getBoundingClientRect() })).filter((d) => d.a > 0.05);
  const items = []; let skipped = 0;
  nodes.forEach((el, i) => {
    if (decor(el)) { skipped++; return; }
    const alpha = alphaOf(el);
    if (alpha < 0.1 || Math.abs(alpha - before[i]) > 0.02 || Math.abs(alpha - after[i]) > 0.02) return;
    const svg = el instanceof SVGElement, cs = getComputedStyle(el);
    const color = svg ? cs.fill : cs.color;
    if (!color || !color.startsWith("rgb")) return;
    const fillAlpha = svg ? parseFloat(cs.fillOpacity) || 0 : 1;
    let box;
    if (svg) { const r = el.getBoundingClientRect(); box = r; }
    else { const range = document.createRange(); const rs = own(el).map((n) => { range.selectNodeContents(n); return range.getBoundingClientRect(); }).filter((r) => r.width && r.height); if (!rs.length) return; const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)); box = { left: x, top: y, width: Math.max(...rs.map((r) => r.right)) - x, height: Math.max(...rs.map((r) => r.bottom)) - y }; }
    if (box.width < 2 || box.height < 2 || box.left + box.width < 0 || box.top + box.height < 0 || box.left > innerWidth || box.top > innerHeight) return;
    // a copy of the same words drawn over this one (stacked theme layers wiping across each other): the copy on top
    // is the one a reader sees, and it is judged on its own, so this one is not
    const words = el.textContent.trim();
    for (let k = 1; k <= 5; k++) {
      const hit = document.elementFromPoint(box.left + (box.width * k) / 6, box.top + box.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && own(hit).length && hit.textContent.trim() === words) return;
    }
    // text outside an active dim's box is dimmed by it, on purpose
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const dimK = dims.filter((d) => !(cx >= d.r.left && cx <= d.r.right && cy >= d.r.top && cy <= d.r.bottom)).reduce((m, d) => m * (1 - d.a), 1);
    let k = 1;
    if (svg) { const m = el.getScreenCTM(); if (m) k = Math.hypot(m.a, m.b); }
    else if (el.offsetHeight) k = el.getBoundingClientRect().height / el.offsetHeight;
    const path = []; for (let n = el; n && n !== document.body; n = n.parentElement) path.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/)[0] : "") + ":" + [...(n.parentElement?.children || [])].indexOf(n));
    items.push({ key: path.join(">"), text: el.textContent.trim().replace(/\\s+/g, " "), color, alpha: alpha * fillAlpha * dimK, px: parseFloat(cs.fontSize) * k, weight: parseFloat(cs.fontWeight) || 400, box: { x: box.left, y: box.top, w: box.width, h: box.height } });
  });
  return { items, skipped };
})()`;

const HIDE = `(() => { const s = document.createElement("style"); s.id = "sm-contrast-hide";
  s.textContent = ".sm-host, .sm-host * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; caret-color: transparent !important; } .sm-host text, .sm-host tspan, .sm-host textPath { fill: transparent !important; stroke: transparent !important; }";
  document.head.appendChild(s); })()`;
const SHOW = `document.getElementById("sm-contrast-hide")?.remove()`;
const settle = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`;

export async function contrastAt(page, times) {
  const samples = [];
  let skipped = 0;
  for (const t of times) {
    const { items, skipped: s } = await page.eval(COLLECT(t));
    skipped = Math.max(skipped, s);
    await page.eval(`__sm.seek(${t}); ${settle}`);
    const shown = decodePng(await page.shot());
    await page.eval(HIDE);
    await page.eval(`__sm.seek(${t}); ${settle}`);
    const img = decodePng(await page.shot());
    await page.eval(SHOW);
    samples.push({ t, verdicts: judge(items, img, shown) });
  }
  const summary = summarize(samples);
  return { ok: summary.failing.length === 0, summary, detail: describe(summary, skipped) };
}
