import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadStyle, listStyles, loadTokens, buildHtml } from "./build.mjs";

const S = createRequire(import.meta.url)("../runtime/style.cjs");
const tokens = loadTokens("default");
const HEX = /^#[0-9a-f]{6}$/i;

test("every motif and texture is a valid background-image once split (dot-grid and halftone were dropped whole)", () => {
  const kinds = [...S.KNOBS.motif.filter((k) => k !== "none").map((k) => S.motifImage(k, tokens)), ...S.KNOBS.texture.filter((k) => k !== "none").map((k) => S.textureImage(k, tokens))];
  for (const image of kinds) {
    const b = S.bgStyle(image);
    assert.match(b.backgroundImage, /\)$/, `ends at its last function: ${image.slice(0, 60)}`);
    assert.doesNotMatch(b.backgroundImage, /\)\s+\S+ \S+ \/ /, `no "pos / size" left in the image: ${image.slice(0, 60)}`);
  }
  assert.deepEqual(S.bgStyle(S.motifImage("dot-grid", tokens)).backgroundSize, "28px 28px");
  assert.deepEqual(S.bgStyle(S.textureImage("halftone", tokens)).backgroundSize, "6px 6px");
});

test("the five launch packs load, and every pack survives encode → decode", () => {
  assert.deepEqual(listStyles().sort(), ["dimensional", "field", "ink", "outline", "soft-ui"]);
  for (const name of listStyles()) {
    const pack = loadStyle(name);
    const { name: _, ...knobs } = pack;
    const { name: __, ...back } = S.decode(S.encode(pack));
    assert.deepEqual(back, knobs, name);
    assert.equal(loadStyle(S.encode(pack)).stroke, pack.stroke, "a code loads like a preset");
  }
});

test("normalize names the bad knob and its options", () => {
  assert.throws(() => S.normalize({ stroke: "thick" }), /stroke must be one of ink, none, ring/);
  assert.throws(() => S.normalize({ wobble: "lots" }), /unknown knob "wobble"/);
  assert.throws(() => S.decode("sm1.123"), /13 digits/);
  assert.equal(S.normalize("native"), null);
  assert.equal(loadStyle("native"), null);
  assert.throws(() => loadStyle("nope"), /No style "nope"/);
});

test("native, and axes a scene doesn't declare, emit no CSS and leave helpers on the scene's own values", () => {
  assert.equal(S.css(null, S.AXES), "");
  const r = S.resolve(loadStyle("soft-ui"), tokens);
  assert.equal(S.css(r, []), "");
  const only = S.css(r, ["elevation"]);
  assert.match(only, /--sm-shadow-2:/);
  assert.doesNotMatch(only, /--sm-stroke|--sm-radius|--sm-type/);
  const { ui, motion, dir } = S.makeUi(r, ["elevation"], tokens, null);
  assert.equal(ui.stroke("regular", 1.5), 1.5, "stroke not declared → native");
  assert.equal(ui.radius("md", 9), 9, "corner not declared → native");
  assert.notEqual(ui.shadow(2, "NATIVE"), "NATIVE", "elevation declared → pack");
  assert.equal(motion.stagger(3, 0.1), 0.30000000000000004);
  assert.deepEqual(dir.report(), ["elevation"]);
  const native = S.makeUi(null, S.AXES, tokens, null);
  assert.equal(native.ui.shadow(2, "NATIVE"), "NATIVE");
  assert.equal(native.dir.code, "native");
});

test("colour modes only rearrange the brand's colours: valid hex, six of them", () => {
  for (const mode of S.KNOBS.colorMode) {
    const t = S.applyColorMode(tokens, mode);
    assert.ok(t.palette.length >= 6, mode);
    assert.ok(t.palette.every((c) => HEX.test(c)), mode);
  }
  assert.equal(S.applyColorMode(tokens, "categorical"), tokens);
});

test("tempo stretches named tweens but never past the scene's end, and leaves linear motion alone", () => {
  assert.equal(S.capTempo(1, 1, "signature", 1.15, 12), 1.15);
  assert.equal(S.capTempo(11.5, 1, "signature", 1.15, 12), 1, "a tween near the end keeps its length");
  assert.equal(S.capTempo(11.2, 1, "signature", 1.15, 12), 1, "never shorter than native");
  assert.ok(11.2 + S.capTempo(11, 0.5, "signature", 1.15, 12) <= 12);
  assert.equal(S.capTempo(0, 10, "linear", 1.15, 12), 10);
  assert.equal(S.capTempo(0, 2, (x) => x, 1.15, 12), 2);
  assert.equal(S.capTempo(1, 1, "signature", 0.85, 12), 0.85);
});

test("the build embeds the pack and the scene's declared axes; native embeds 'native'", () => {
  const native = buildHtml({ scene: "card-story" });
  assert.match(native, /"style":\{"pack":"native","directable":\[/);
  const ink = buildHtml({ scene: "card-story", style: "ink" });
  assert.match(ink, /"style":\{"pack":\{"name":"ink","stroke":"ink"/);
  assert.match(ink, /SMStyle/);
});

test("type never grows: headlines are written to fill their width, so only shrinking or narrowing is safe", () => {
  for (const type of S.KNOBS.type) {
    const r = S.resolve({ ...loadStyle("ink"), type }, tokens);
    assert.ok(r.typeK <= 1, type);
  }
  assert.match(S.css(S.resolve({ ...loadStyle("ink"), type: "display" }, tokens), ["type"]), /--sm-type-weight:300;--sm-type-tracking:-0.035em/);
});

test("a tween that starts in the intro is capped to the loop start, so the loop's first frame matches its last", () => {
  assert.equal(S.capTempo(0.9, 1.4, "signature", 1.15, 12.2, 2.2), 1.4, "already past the loop start natively: not stretched");
  assert.equal(S.capTempo(0.2, 1, "signature", 1.15, 12.2, 2.2), 1.15, "room to stretch before the loop start");
  assert.ok(Math.abs(S.capTempo(1.5, 0.6, "signature", 1.3, 12.2, 2.2) - 0.7) < 1e-9, "stretched only up to the loop start");
  assert.equal(S.capTempo(3, 1, "signature", 1.15, 12.2, 2.2), 1.15, "in the loop: capped by the scene's end");
});
