import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeMap, ssim, scorePair, sampleTimes, verdict } from "./similar.mjs";

// a 400×225 RGBA picture: paper, with filled boxes [x, y, w, h] in ink
function picture(boxes, { paper = [245, 243, 236], ink = [20, 20, 24] } = {}) {
  const width = 400, height = 225, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...paper, 255], i * 4);
  for (const [x, y, w, h] of boxes) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data.set([...ink, 255], (yy * width + xx) * 4);
  return { width, height, data };
}
const layoutA = [[30, 40, 140, 20], [30, 70, 100, 12], [230, 30, 140, 160]];
const layoutB = [[150, 150, 220, 40], [20, 20, 60, 60], [120, 30, 30, 90], [300, 60, 70, 20]];

test("a recolour, even dark mode, is the same picture", () => {
  const light = edgeMap(picture(layoutA));
  const dark = edgeMap(picture(layoutA, { paper: [18, 20, 24], ink: [236, 235, 228] }));
  const mint = edgeMap(picture(layoutA, { paper: [232, 246, 238], ink: [10, 90, 60] }));
  assert.ok(ssim(light, dark) > 0.9, `dark ${ssim(light, dark)}`);
  assert.ok(ssim(light, mint) > 0.9, `mint ${ssim(light, mint)}`);
  assert.equal(ssim(light, light), 1);
});

test("a new composition is not", () => {
  const a = edgeMap(picture(layoutA)), b = edgeMap(picture(layoutB));
  assert.ok(ssim(a, b) < 0.4, `${ssim(a, b)}`);
});

test("blank paper on both sides says nothing either way", () => {
  const blank = edgeMap(picture([])), a = edgeMap(picture(layoutA));
  assert.ok(ssim(blank, a) < 0.2, "an empty frame is not like a full one");
});

test("the motion score takes each frame's best match, the score the higher of poster and motion", () => {
  const A = edgeMap(picture(layoutA)), B = edgeMap(picture(layoutB));
  const v = { still: B, frames: [A, B] }, p = { still: A, frames: [A] };
  const s = scorePair(v, p);
  assert.ok(s.poster < 0.4);
  assert.ok(s.motion > 0.5, "the variant's frame that matches the parent's still is found");
  assert.equal(s.score, Math.max(s.poster, s.motion));
  assert.equal(verdict({ poster: 0.2, motion: 0.7, score: 0.7 }, 0.6).ok, false);
  assert.equal(verdict({ poster: 0.2, motion: 0.3, score: 0.3 }, 0.6).ok, true);
});

test("frames are spread over the loop, not the intro", () => {
  const t = sampleTimes({ duration: 12, loop: 4 }, 4);
  assert.deepEqual(t, [5, 7, 9, 11]);
});
