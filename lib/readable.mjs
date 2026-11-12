// readable: how big a scene's words are on screen. A scene is drawn at its design size (1600 × 900) and the page
// scales it to the slot it sits in, so 13 px labels become 6 px in a 750 px card. This measures every visible piece
// of text (font size × its own transforms, in design px) at the sample times, keeps each one's largest moment, and
// says how wide the embed must be for the words to read.
export const MIN_TEXT = 10; // on-screen px; under this a label is a texture, not a word
export const SHARE = 0.9; // "readable" means 9 in 10 words reach MIN_TEXT

// in the page: [{ text, px }] for every visible piece of text, px in design pixels
const COLLECT = (skip) => `(() => {
  const root = document.querySelector(".sm-stage"); if (!root) return [];
  const skip = ${JSON.stringify(skip)};
  const k0 = root.getBoundingClientRect().width / root.offsetWidth || 1;
  const alpha = (el) => { let a = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden") return 0; a *= +s.opacity; } return a; };
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!own || own.length < 2 || !/[\\p{L}\\p{N}]/u.test(own)) continue;
    if (skip.length && el.closest(skip.join(","))) continue;
    if (alpha(el) < 0.35) continue;
    const s = getComputedStyle(el), fs = parseFloat(s.fontSize) || 0;
    let k = 1;
    if (el instanceof SVGElement) { const m = el.getScreenCTM(); k = m ? Math.hypot(m.a, m.b) / k0 : 1; }
    else if (el.offsetHeight) k = el.getBoundingClientRect().height / el.offsetHeight / k0;
    if (!(k > 0) || !isFinite(k)) k = 1;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({ text: own.slice(0, 40), px: +(fs * k).toFixed(2) });
  }
  return out;
})()`;

const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

// sizes of every word across the loop: each text keeps its biggest moment (a label that grows in counts at full size)
export async function textSizes(page, times, { skip = [] } = {}) {
  const best = new Map();
  for (const t of times) {
    await page.eval(`__sm.seek(${t}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    for (const w of await page.eval(COLLECT(skip))) if (!best.has(w.text) || best.get(w.text) < w.px) best.set(w.text, w.px);
  }
  return [...best.entries()].map(([text, px]) => ({ text, px }));
}

// the summary for a stage viewW design px wide: the size 9 in 10 words reach, and the width that makes it MIN_TEXT
export function readability(words, viewW, { width = null, min = MIN_TEXT } = {}) {
  if (!words.length) return { words: 0, ok: true, detail: "no text" };
  const p10 = quantile(words.map((w) => w.px), 1 - SHARE), median = quantile(words.map((w) => w.px), 0.5);
  const readableFrom = Math.ceil((min * viewW) / p10);
  const out = { words: words.length, p10, median, readableFrom };
  if (!width) return { ...out, ok: true, detail: `9 in 10 words read at ${min} px from ${readableFrom} px wide (text ${p10}–${median} px at design size; pass --width <slot px> to hold a slot to it)` };
  const k = width / viewW;
  const small = words.filter((w) => w.px * k < min).sort((a, b) => a.px - b.px);
  const ok = small.length <= words.length * (1 - SHARE);
  return { ...out, width, ok, small: small.length, detail: `at ${width} px wide: ${small.length} of ${words.length} words under ${min} px${small.length ? ` (${small.slice(0, 4).map((w) => `"${w.text}" ${(w.px * k).toFixed(1)} px`).join(", ")}${small.length > 4 ? ", …" : ""})` : ""}; readable from ${readableFrom} px wide${ok ? "" : ": give it a wider slot, a bare cut, its legible layout (content.legible) or fewer words"}` };
}
