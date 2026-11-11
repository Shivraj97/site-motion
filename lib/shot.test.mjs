import { test } from "node:test";
import assert from "node:assert/strict";
import { colourBuckets, gridHtml, readShot, tokensFromShot } from "./shot.mjs";

// a synthetic screen: warm paper, a white card, dark text strokes and an orange button
function screen(width = 300, height = 200) {
  const data = Buffer.alloc(width * height * 4);
  const put = (x0, y0, w, h, [r, g, b]) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * width + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  };
  put(0, 0, width, height, [245, 243, 237]);
  put(150, 20, 130, 160, [255, 255, 255]);
  for (let k = 0; k < 6; k++) put(20, 30 + k * 12, 100, 3, [13, 20, 35]);
  put(20, 150, 110, 24, [181, 57, 14]);
  return { width, height, data };
}

test("colourBuckets ranks colours by coverage", () => {
  const b = colourBuckets(screen(), 1);
  assert.equal(Math.round(b[0].c.r * 255), 245);
  assert.ok(Math.abs(b.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
});

test("readShot finds paper, ink and accent, and guesses the frame", () => {
  const r = readShot(screen());
  const hex = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));
  assert.deepEqual(hex(r.paper), [245, 243, 237]);
  assert.deepEqual(hex(r.ink), [13, 20, 35]);
  assert.deepEqual(hex(r.accent), [181, 57, 14]);
  assert.equal(r.frame, "browser");
  assert.equal(readShot(screen(200, 420)).frame, "phone");
});

test("tokensFromShot derives a full token file and says the font is a guess", () => {
  const { tokens, notes } = tokensFromShot(readShot(screen()), { name: "calc" });
  assert.equal(tokens.color.paper, "#f5f3ed");
  assert.equal(tokens.color.accent, "#b5390e");
  for (const k of ["surface", "raised", "muted", "line", "accentInk", "onAccent"]) assert.match(tokens.color[k], /^#[0-9a-f]{6}$/);
  assert.ok(notes.some((n) => /can't be read from pixels/.test(n)));
});

test("gridHtml labels lines in image pixels, also inside a crop", () => {
  const { html, W } = gridHtml("data:,", { width: 2880, height: 1800, step: 100 });
  assert.equal(W, 2000);
  assert.match(html, />2800</);
  const crop = gridHtml("data:,", { width: 2880, height: 1800, step: 20, crop: [640, 600, 400, 100] });
  assert.match(crop.html, />680</);
  assert.doesNotMatch(crop.html, />600<\/text><text x="3"/);
});
