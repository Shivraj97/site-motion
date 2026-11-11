import { test } from "node:test";
import assert from "node:assert/strict";
import { psnr, seamVerdict, sampleTimes } from "./check.mjs";

const img = (w, h, fill) => ({ width: w, height: h, data: Buffer.alloc(w * h * 4, fill) });

test("psnr: identical is Infinity, a small change is high, a big change is low", () => {
  const a = img(4, 4, 100);
  assert.equal(psnr(a, img(4, 4, 100)), Infinity);
  const b = img(4, 4, 100); b.data[0] = 101;
  assert.ok(psnr(a, b) > 50);
  assert.ok(psnr(a, img(4, 4, 200)) < 10);
  assert.throws(() => psnr(a, img(2, 2, 100)), /size mismatch/);
});

test("a seam passes when it is seamless outright or looks like the frame steps beside it", () => {
  assert.equal(seamVerdict(55, [30, 31]).ok, true);
  assert.equal(seamVerdict(22.5, [21.8, 23, 24, 22]).ok, true, "busy at the seam: a normal step there");
  assert.equal(seamVerdict(22.5, [52, 53, 54, 55]).ok, false, "a jump where the scene is otherwise still");
});

test("baseline samples six times across the timeline plus the still", () => {
  const t = sampleTimes({ duration: 14, still: 9 });
  assert.equal(t.length, 7);
  assert.ok(t.every((x) => x > 0 && x < 14));
  assert.ok(t.includes(9));
});
