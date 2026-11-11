// layout: two things a contact sheet shows too late and too small to trust the eye with.
//   text-fit  every word on screen fits the box it sits in: not cut off by an ellipsis or a clipped edge, and not
//             spilling past the card, pill or button around it (measured at the baseline sample times)
//   jumps     nothing snaps: a frame step much bigger than the steps beside it is a one-frame jump (a state set
//             without a tween, a measure taken before fonts loaded, a tween that starts at its end value)
// Pure functions (spill, findJumps) are exported for tests; textFitAt and jumpsIn drive a page check.mjs loaded.
import { psnr } from "./check.mjs";

// how far (px) a text rect reaches outside its box rect, on its worst side; ≤ 0 means it fits
export function spill(text, box) {
  return Math.max(box.left - text.left, text.right - box.right, box.top - text.top, text.bottom - box.bottom);
}

// Runs in the page. A "box" is the nearest element (the text's own, or an ancestor) that draws an edge: a
// background, a shadow ring, or clipping. The stage and the camera's world are never boxes. Text cut by its own
// box (an ellipsis, a clipped line) fails; text past a clipping ancestor is hidden by design and is not judged.
const TEXT_FIT = `(() => {
  const stage = document.querySelector(".sm-stage");
  if (!stage) return [];
  const seen = (n) => { let o = 1; for (let e = n; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return 0; o *= +s.opacity; } return o; };
  const isBox = (e) => {
    if (e === stage || e.classList.contains("ui-world")) return false;
    const s = getComputedStyle(e);
    const bg = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
    return bg || s.backgroundImage !== "none" || s.boxShadow !== "none" || s.overflowX !== "visible";
  };
  const out = [];
  for (const e of stage.querySelectorAll("*")) {
    if (e instanceof SVGElement || e.closest("[data-sm-decor]")) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (seen(e) < 0.1) continue;
    const s = getComputedStyle(e), text = e.textContent.trim().replace(/\\s+/g, " ").slice(0, 60);
    if ((s.overflowX !== "visible" || s.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 1) {
      out.push({ text, why: "cut off, " + (e.scrollWidth - e.clientWidth) + "px too wide for its box" });
      continue;
    }
    let box = isBox(e) ? e : null;
    for (let a = e.parentElement; !box && a && a !== stage; a = a.parentElement) if (isBox(a)) box = a;
    // a box that clips hides what passes its edge on purpose (a price rolling in a window, a card entering a
    // slot); only an edge that draws but does not clip can have text spill over it
    if (!box || getComputedStyle(box).overflowX !== "visible") continue;
    // only the element's own text: a child (a press ring opening past a button) isn't text and may overflow
    const rects = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect(); });
    const t = { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
    const b = box.getBoundingClientRect();
    const over = Math.max(b.left - t.left, t.right - b.right, b.top - t.top, t.bottom - b.bottom);
    if (over > 1.5) out.push({ text, why: "spills " + Math.round(over) + "px out of its box" });
  }
  return out;
})()`;

// Framing: the main window or phone is staged, not boxed. It fills at least two thirds of the stage along one side
// and runs off at least one edge; a window with air on all four sides reads as a card on a slide.
export const FRAME_FILL = 2 / 3;
export function framingVerdict(m) {
  if (m.none) return { ok: true, detail: "no device frame" };
  if (m.float) return { ok: true, detail: "floating on purpose (data-framing)" };
  const fill = Math.max(m.fillW, m.fillH), edges = m.off.length;
  const ok = fill >= FRAME_FILL && edges > 0;
  const size = `fills ${Math.round(m.fillW * 100)}% × ${Math.round(m.fillH * 100)}%`;
  return { ok, detail: edges ? `${size}, runs off the ${m.off.join(", ")}` : `${size} with air on all four sides (let it run off an edge)` };
}
const FRAMING = `(() => {
  const stage = document.querySelector(".sm-stage");
  const frames = [...stage.querySelectorAll(".ui-frame")].filter((f) => !f.parentElement.closest(".ui-frame"));
  if (!frames.length) return { none: true };
  const s = stage.getBoundingClientRect();
  const [{ f, r }] = frames.map((f) => ({ f, r: f.getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  if (f.dataset.framing === "float") return { float: true };
  const off = [];
  if (r.left < s.left - 1) off.push("left");
  if (r.top < s.top - 1) off.push("top");
  if (r.right > s.right + 1) off.push("right");
  if (r.bottom > s.bottom + 1) off.push("bottom");
  return { fillW: r.width / s.width, fillH: r.height / s.height, off };
})()`;

/** Framing at rest, on the first frame (the camera hasn't moved yet). */
export async function framingOf(page) {
  await seek(page, 0);
  return framingVerdict(await page.eval(FRAMING));
}

async function seek(page, t) {
  await page.eval(`__sm.seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

/** Text fit at each time: { ok, detail, findings: [{ t, text, why }] } */
export async function textFitAt(page, times) {
  const findings = [], keys = new Set();
  for (const t of times) {
    await seek(page, t);
    for (const f of await page.eval(TEXT_FIT)) {
      const key = f.text + "|" + f.why.replace(/\d+px/, "");
      if (keys.has(key)) continue;
      keys.add(key);
      findings.push({ t, ...f });
    }
  }
  const detail = findings.length
    ? findings.slice(0, 4).map((f) => `"${f.text}" ${f.why} at t=${f.t}`).join("; ") + (findings.length > 4 ? `; and ${findings.length - 4} more` : "")
    : `every word fits its box at ${times.length} sample times`;
  return { ok: findings.length === 0, detail, findings };
}

// A jump is a step that is big (below JUMP_DB) and stands out from BOTH sides: ≥ JUMP_GAP dB worse than the median
// step just before it and the median step just after it. A camera coming to rest (busy, then still) or a transition
// starting (still, then busy) differs from one side only; one card appearing in a single frame differs from both.
export const JUMP_DB = 26;
export const JUMP_GAP = 9;
const median = (list) => { const v = [...list].sort((a, b) => a - b); return v[v.length >> 1]; };
export function findJumps(steps, around = 3) {
  const out = [];
  steps.forEach((s, i) => {
    if (s.db >= JUMP_DB) return;
    const sides = [steps.slice(Math.max(0, i - around), i), steps.slice(i + 1, i + 1 + around)].filter((x) => x.length).map((x) => median(x.map((n) => n.db)));
    if (sides.length && sides.every((m) => m - s.db >= JUMP_GAP)) out.push({ t: s.t, db: s.db, median: Math.min(...sides) });
  });
  return out;
}

/** Every step of the timeline at `every` frames, on a page launched at half scale (a jump does not need detail). */
export async function jumpsIn(page, meta, every = 2) {
  const fps = meta.fps || 30, dt = every / fps, steps = [];
  await seek(page, 0);
  let prev = await page.shot();
  for (let t = dt; t <= meta.duration + 1e-6; t += dt) {
    await seek(page, Math.min(t, meta.duration - 1 / fps));
    const next = await page.shot();
    steps.push({ t: +t.toFixed(3), db: psnr(prev, next) });
    prev = next;
  }
  // the seam has its own check; the intro → loop handover at `loop` is an ordinary step and stays in
  const jumps = findJumps(steps);
  const fmt = (j) => `t=${j.t} (${j.db.toFixed(1)} dB against ${j.median === Infinity ? "still" : j.median.toFixed(1) + " dB"} around it)`;
  return {
    ok: jumps.length === 0,
    detail: jumps.length ? `${jumps.length} one-frame jump${jumps.length === 1 ? "" : "s"}: ${jumps.slice(0, 4).map(fmt).join(", ")}` : `no one-frame jumps in ${steps.length} steps`,
    jumps,
    steps,
  };
}
