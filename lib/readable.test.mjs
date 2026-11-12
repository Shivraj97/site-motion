import { test } from "node:test";
import assert from "node:assert/strict";
import { readability, MIN_TEXT } from "./readable.mjs";

const words = (sizes) => sizes.map((px, i) => ({ text: `w${i}`, px }));

test("readable: says how wide a stage must be for 9 in 10 words to reach the floor", () => {
  const r = readability(words([13, 13, 14, 14, 14, 15, 16, 18, 20, 40]), 1600);
  assert.equal(r.ok, true, "without a slot width it reports, it doesn't fail");
  assert.equal(r.p10, 13);
  assert.equal(r.readableFrom, Math.ceil((MIN_TEXT * 1600) / 13));
});

test("readable: a slot too narrow fails and names the smallest words; a wide one passes", () => {
  const w = words([13, 13, 14, 14, 14, 15, 16, 18, 20, 40]);
  const narrow = readability(w, 1600, { width: 612 });
  assert.equal(narrow.ok, false);
  assert.match(narrow.detail, /"w0" 5\.0 px/);
  assert.equal(readability(w, 1600, { width: 1300 }).ok, true);
});

test("readable: a bare cut's narrower stage reads at a narrower slot", () => {
  const w = words([13, 14, 15, 16, 18, 20, 22, 24, 26, 28]);
  assert.ok(readability(w, 940).readableFrom < readability(w, 1600).readableFrom);
});
