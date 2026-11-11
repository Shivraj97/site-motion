import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, ratio, over, required, medianColor, judge, summarize, describe, AA, AA_LARGE } from "./contrast.mjs";

const rgb = (r, g, b) => ({ r, g, b });
const img = (w, h, pick) => {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = pick(x, y), i = (y * w + x) * 4; data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 255; }
  return { width: w, height: h, data };
};

test("parses computed colours, with and without alpha", () => {
  assert.deepEqual(parseColor("rgb(93, 127, 214)"), { r: 93, g: 127, b: 214, a: 1 });
  assert.deepEqual(parseColor("rgba(0, 0, 0, 0.5)"), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor("rgb(10 20 30 / 40%)"), { r: 10, g: 20, b: 30, a: 0.4 });
  assert.equal(parseColor("none"), null);
});

test("ratio matches the WCAG figures HyperFrames reported for ledger", () => {
  assert.equal(ratio(rgb(0, 0, 0), rgb(255, 255, 255)).toFixed(1), "21.0");
  assert.equal(ratio(rgb(93, 127, 214), rgb(255, 255, 255)).toFixed(2), "3.84");
  assert.equal(ratio(rgb(217, 130, 43), rgb(255, 255, 255)).toFixed(2), "2.93");
});

test("large text needs 3:1, everything else 4.5:1", () => {
  assert.equal(required(24, 400), AA_LARGE);
  assert.equal(required(19, 700), AA_LARGE);
  assert.equal(required(19, 500), AA);
  assert.equal(required(12, 900), AA);
});

test("faded text is judged as the eye sees it, blended into its background", () => {
  const half = over(rgb(0, 0, 0), rgb(255, 255, 255), 0.5);
  assert.deepEqual(half, rgb(127.5, 127.5, 127.5));
});

test("the background is the median pixel, so a rule crossing the text box doesn't decide it", () => {
  const page = img(20, 10, (x, y) => (y === 5 ? rgb(0, 0, 0) : rgb(240, 240, 240)));
  assert.deepEqual(medianColor(page, { x: 0, y: 0, w: 20, h: 10 }), rgb(240, 240, 240));
  assert.equal(medianColor(page, { x: 30, y: 30, w: 5, h: 5 }), null, "a box off the image");
});

const white = img(40, 40, () => rgb(255, 255, 255));
const item = (key, color, px = 14, alpha = 1) => ({ key, text: key, color, alpha, px, weight: 400, box: { x: 0, y: 0, w: 40, h: 40 } });

test("solid text in a colour under its bar fails; large text has the lower bar", () => {
  const s1 = judge([item("ok", "rgb(20,20,20)"), item("pale", "rgb(93,127,214)"), item("big", "rgb(93,127,214)", 30)], white);
  const s2 = judge([item("ok", "rgb(20,20,20)")], white);
  const sum = summarize([{ t: 1, verdicts: s1 }, { t: 2, verdicts: s2 }]);
  assert.equal(sum.checked, 3);
  assert.deepEqual(sum.failing.map((f) => f.key), ["pale"], "large text at 3.84:1 passes its 3:1 bar");
  assert.match(describe(sum), /1\/3 text elements below AA: "pale" 3\.84:1 \(needs 4\.5, #5d7fd6 on #ffffff, t=1\)/);
  assert.match(describe(summarize([{ t: 1, verdicts: s2 }]), 2), /1\/1 text elements read at WCAG AA when shown at full strength; 2 skipped as decor/);
});

test("text dimmed on purpose is listed, not failed; the same element at full strength is still judged", () => {
  const dim = judge([item("row", "rgb(21,21,21)", 14, 0.55)], white);
  const full = judge([item("row", "rgb(21,21,21)", 14, 1)], white);
  const sum = summarize([{ t: 1, verdicts: dim }, { t: 2, verdicts: full }]);
  assert.equal(sum.failing.length, 0);
  assert.deepEqual(sum.dimmed.map((f) => [f.key, f.t]), [["row", 1]]);
  assert.match(describe(sum), /note: 1 dimmed on purpose read below AA/);
});

test("text nobody can see (covered, clipped) is not judged", () => {
  const covered = img(40, 40, () => rgb(21, 21, 21));
  assert.equal(judge([item("under-press", "rgb(21,21,21)")], covered, covered).length, 0, "hiding it changed no pixels");
  const drawn = img(40, 40, (x) => (x % 4 ? rgb(255, 255, 255) : rgb(21, 21, 21)));
  assert.equal(judge([item("label", "rgb(21,21,21)")], white, drawn).length, 1);
});

test("a box half under a dark press is judged against what lies under the letters, not the press", () => {
  // left half: the press (dark) covers the text; right half: the card (white), where the letters drew
  const hidden = img(40, 10, (x) => (x < 20 ? rgb(21, 21, 21) : rgb(255, 255, 255)));
  const shown = img(40, 10, (x) => (x < 20 ? rgb(21, 21, 21) : x % 3 ? rgb(255, 255, 255) : rgb(111, 109, 105)));
  const [v] = judge([{ ...item("PAYOUT", "rgb(111,109,105)"), box: { x: 0, y: 0, w: 40, h: 10 } }], hidden, shown);
  assert.deepEqual(v.bg, rgb(255, 255, 255));
  assert.ok(v.ratio > 4.5);
});
