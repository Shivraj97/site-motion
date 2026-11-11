/* site-motion style packs: the look shared by every scene on a site, on top of the brand tokens.
 * tokens = brand (colours, fonts, radius). A style pack = art direction: line weight, elevation, corners, texture,
 * label voice, type scale, motion curves and tempo, a recurring motif. A scene = the story.
 *
 * A pack is 13 named choices (never free numbers), so it validates strictly and encodes to a short code
 * (`sm1.…`) for URLs and the CLI. "native" is reserved: every scene keeps its own built-in look.
 * A scene only follows the axes it lists in meta.json "directable"; everything else stays native, so a pack
 * can never break a scene that hasn't been ported. Shared by the Node build and the page (inlined before stage.js).
 */
(function (root) {
  "use strict";

  // knob → ordered options (order is part of the short code: append new options, never reorder)
  const KNOBS = {
    stroke: ["ink", "none", "ring", "hair", "fine", "bold"],
    elevation: ["flat", "ring", "soft", "deep", "tinted"],
    corner: ["token", "sharp", "tight", "round"],
    depth: ["flat", "lifted", "iso", "perspective"],
    texture: ["none", "grain", "halftone", "dither", "paper"],
    glow: ["none", "soft", "bloom"],
    colorMode: ["categorical", "accent-on-ink", "tonal", "duotone"],
    label: ["mono-caps", "sans-caps", "sans-sentence", "serif-italic"],
    type: ["standard", "compact", "display"],
    motion: ["studio", "productive", "expressive", "mechanical", "ambient"],
    tempo: ["steady", "brisk", "languid"],
    stagger: ["even", "tight", "cascade"],
    motif: ["none", "ruled", "dot-grid", "corner-ticks", "orbit"],
  };
  const ORDER = Object.keys(KNOBS);
  // which axis (as a scene declares it in meta.json "directable") each knob belongs to
  const AXIS = { stroke: "stroke", elevation: "elevation", corner: "corner", depth: "depth", texture: "texture", glow: "glow", colorMode: "color", label: "label", type: "type", motion: "motion", tempo: "motion", stagger: "motion", motif: "motif" };
  const AXES = [...new Set(Object.values(AXIS))];

  // ---------- resolved values ----------
  const STROKE = { // widths per role: hair < fine < regular < bold; colour role from tokens
    none: { hair: 0, fine: 0, regular: 0, bold: 0, color: "line" },
    ring: { hair: 1, fine: 1, regular: 1, bold: 1, color: "line" },
    hair: { hair: 0.75, fine: 1, regular: 1, bold: 1.5, color: "line" },
    fine: { hair: 1, fine: 1.2, regular: 1.5, bold: 2, color: "faint" },
    ink: { hair: 1, fine: 1.2, regular: 1.5, bold: 3, color: "ink" },
    bold: { hair: 1.5, fine: 2, regular: 2.5, bold: 4, color: "ink" },
  };
  // shadow layers per level 1–3 as [y, blur, spread, alpha]; level 0 is always none
  const ELEVATION = {
    flat: null,
    ring: "ring",
    soft: [[[1, 2, 0, 0.06]], [[12, 32, -18, 0.18]], [[30, 60, -20, 0.35]]],
    deep: [[[2, 6, 0, 0.12]], [[18, 40, -16, 0.32]], [[40, 80, -24, 0.5]]],
    tinted: "tinted",
  };
  const CORNER = { sharp: 0, tight: 0.5, token: 1, round: 1.5 };
  const DEPTH = { flat: { lift: 0, perspective: 0 }, lifted: { lift: 4, perspective: 0 }, iso: { lift: 0, perspective: 0, iso: 30 }, perspective: { lift: 0, perspective: 1200 } };
  const TEXTURE = { none: 0, grain: 0.07, halftone: 0.08, dither: 0.1, paper: 0.05 };
  const GLOW = { none: null, soft: { blur: 14, alpha: 0.25 }, bloom: { blur: 28, alpha: 0.45 } };
  const LABEL = {
    "mono-caps": { font: "var(--font-mono)", transform: "uppercase", tracking: "0.08em", style: "normal" },
    "sans-caps": { font: "var(--font-sans)", transform: "uppercase", tracking: "0.06em", style: "normal" },
    "sans-sentence": { font: "var(--font-sans)", transform: "none", tracking: "0", style: "normal" },
    "serif-italic": { font: "var(--font-display, Georgia, serif)", transform: "none", tracking: "0", style: "italic" },
  };
  // Type never grows: headlines are written to fill their width, so a bigger size re-wraps them. "display" is the
  // same size, lighter and tighter (both only narrow the text); "compact" shrinks it.
  const TYPE = { compact: { k: 0.92, weight: 400, tracking: null }, standard: { k: 1, weight: 400, tracking: null }, display: { k: 1, weight: 300, tracking: "-0.035em" } };
  // easing roles scenes already use with h.tw: signature (entrances), snappy (state), soft (small moves), inOut (exits)
  const MOTION = {
    studio: null, // the built-in curves
    productive: { signature: [0, 0, 0.38, 0.9], snappy: [0.2, 0, 0.38, 0.9], soft: [0.2, 0, 0.38, 0.9], inOut: [0.2, 0, 0.38, 0.9] },
    expressive: { signature: [0.34, 1.4, 0.64, 1], snappy: [0.4, 0.14, 0.3, 1], soft: [0.4, 0.14, 0.3, 1], inOut: [0.4, 0.14, 0.3, 1] },
    mechanical: { signature: [0.7, 0, 0.3, 1], snappy: [0.7, 0, 0.3, 1], soft: [0.6, 0, 0.4, 1], inOut: [0.7, 0, 0.3, 1] },
    ambient: { signature: [0.37, 0, 0.63, 1], snappy: [0.37, 0, 0.63, 1], soft: [0.37, 0, 0.63, 1], inOut: [0.37, 0, 0.63, 1] },
  };
  // the built-in curves (studio), as stage.js defines them; exports use these when a pack keeps "studio"
  const STUDIO_EASE = { signature: [0.16, 1, 0.3, 1], snappy: [0.22, 1, 0.36, 1], soft: [0.33, 1, 0.68, 1], inOut: [0.65, 0, 0.35, 1] };
  const TEMPO = { brisk: 0.85, steady: 1, languid: 1.15 };
  const STAGGER = { tight: 0.7, even: 1, cascade: 1.4 };

  // ---------- colour helpers (same maths as tokens.cjs) ----------
  const hex = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, p) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * p));
  const rgba = (c, a) => `rgba(${hex(c).join(",")},${a})`;
  const lum = (c) => { const [r, g, b] = hex(c).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  // ---------- validation and codes ----------
  const DEFAULTS = Object.fromEntries(ORDER.map((k) => [k, KNOBS[k][0]]));

  function normalize(input, where = "style") {
    if (input === "native" || input == null) return null;
    if (typeof input !== "object" || Array.isArray(input)) throw new Error(`${where}: a style pack is an object of knobs (or "native")`);
    const out = { name: typeof input.name === "string" ? input.name : "custom" };
    for (const k of Object.keys(input)) {
      if (k === "name" || k === "$schema" || k === "description" || k === "family") continue;
      if (!KNOBS[k]) throw new Error(`${where}: unknown knob "${k}" (knobs: ${ORDER.join(", ")})`);
    }
    for (const k of ORDER) {
      const v = input[k] ?? DEFAULTS[k];
      if (!KNOBS[k].includes(v)) throw new Error(`${where}: ${k} must be one of ${KNOBS[k].join(", ")} (got ${JSON.stringify(v)})`);
      out[k] = v;
    }
    return out;
  }

  // sm1.<one base36 digit per knob>; "native" stays "native"
  function encode(pack) {
    if (!pack) return "native";
    return "sm1." + ORDER.map((k) => KNOBS[k].indexOf(pack[k]).toString(36)).join("");
  }
  function decode(code, name) {
    if (code === "native") return null;
    const m = /^sm1\.([0-9a-z]+)$/.exec(String(code).trim());
    if (!m || m[1].length !== ORDER.length) throw new Error(`style code must look like sm1.${"0".repeat(ORDER.length)} (${ORDER.length} digits)`);
    const pack = { name: name || code };
    ORDER.forEach((k, i) => {
      const v = KNOBS[k][parseInt(m[1][i], 36)];
      if (!v) throw new Error(`style code: digit ${i + 1} (${k}) is out of range`);
      pack[k] = v;
    });
    return pack;
  }
  const isCode = (s) => typeof s === "string" && /^sm1\.[0-9a-z]+$/.test(s.trim());

  // ---------- colour modes: rearrange the brand's own colours, never add one ----------
  function applyColorMode(tokens, mode) {
    if (!mode || mode === "categorical") return tokens;
    const t = JSON.parse(JSON.stringify(tokens));
    const c = t.color;
    if (mode === "accent-on-ink") t.palette = [c.accent, mix(c.ink, c.paper, 0.2), mix(c.ink, c.paper, 0.4), mix(c.ink, c.paper, 0.55), c.accentInk, mix(c.ink, c.paper, 0.7)];
    if (mode === "tonal") t.palette = [c.accent, mix(c.accent, c.paper, 0.3), mix(c.accent, c.ink, 0.3), mix(c.accent, c.paper, 0.55), mix(c.accent, c.ink, 0.5), mix(c.accent, c.paper, 0.75)];
    if (mode === "duotone") { const b = t.palette[1] || c.ink; t.palette = [c.accent, b, mix(c.accent, c.paper, 0.4), mix(b, c.paper, 0.4), mix(c.accent, c.ink, 0.35), mix(b, c.ink, 0.35)]; }
    return t;
  }

  // ---------- resolve: choices → concrete values for these tokens ----------
  function resolve(pack, tokens) {
    if (!pack) return null;
    const c = tokens.color;
    const dark = lum(c.paper) < 0.2;
    const shade = dark ? "#000000" : c.ink;
    const stroke = STROKE[pack.stroke];
    const e = ELEVATION[pack.elevation];
    // "no shadow" is a transparent zero shadow, not `none`, so a scene can put it in a list: var(--sm-shadow-1), 0 0 0 1px …
    const NONE = "0 0 0 0 transparent";
    let shadow;
    if (!e) shadow = [NONE, NONE, NONE, NONE];
    else if (e === "ring") shadow = [NONE, `0 0 0 1px ${c.line}`, `0 0 0 1px ${c.line}`, `0 0 0 1px ${c.line}`];
    else if (e === "tinted") shadow = [NONE, `0 2px 0 0 ${mix(c.ink, c.paper, 0.15)}`, `0 4px 0 0 ${mix(c.ink, c.paper, 0.15)}`, `0 7px 0 0 ${mix(c.ink, c.paper, 0.15)}`];
    else shadow = [NONE, ...e.map((layers) => layers.map(([y, blur, spread, a]) => `0 ${y}px ${blur}px ${spread}px ${rgba(shade, dark ? Math.min(1, a * 1.6) : a)}`).join(","))];
    const k = CORNER[pack.corner];
    const radius = Object.fromEntries(Object.entries(tokens.radius || {}).map(([n, v]) => [n, Math.round(v * k * 10) / 10]));
    const glow = GLOW[pack.glow];
    return {
      pack, code: encode(pack),
      stroke: { ...stroke, colorValue: c[stroke.color] || c.line },
      shadow, radius, cornerK: k,
      depth: DEPTH[pack.depth],
      texture: { kind: pack.texture, amount: TEXTURE[pack.texture] },
      glow: glow ? { ...glow, css: `0 0 ${glow.blur}px ${rgba(c.accent, glow.alpha)}` } : null,
      colorMode: pack.colorMode,
      label: LABEL[pack.label],
      typeK: TYPE[pack.type].k,
      type: TYPE[pack.type],
      ease: MOTION[pack.motion],
      tempo: TEMPO[pack.tempo],
      stagger: STAGGER[pack.stagger],
      motif: pack.motif,
    };
  }

  // CSS variables for the axes this scene follows (nothing at all under native); scenes write var(--sm-…, <native>)
  function css(r, directable) {
    if (!r) return "";
    const on = (axis) => directable.includes(axis);
    const v = [];
    if (on("stroke")) { for (const role of ["hair", "fine", "regular", "bold"]) v.push(`--sm-stroke-${role}:${r.stroke[role]}px`); v.push(`--sm-stroke-color:${r.stroke.colorValue}`); }
    if (on("elevation")) r.shadow.forEach((s, i) => v.push(`--sm-shadow-${i}:${s}`));
    if (on("corner")) { for (const [n, px] of Object.entries(r.radius)) v.push(`--sm-radius-${n}:${px}px`); v.push(`--sm-corner-k:${r.cornerK}`); }
    if (on("depth")) { v.push(`--sm-lift:${r.depth.lift}px`); v.push(`--sm-perspective:${r.depth.perspective ? r.depth.perspective + "px" : "none"}`); }
    if (on("glow")) v.push(`--sm-glow:${r.glow ? r.glow.css : "none"}`);
    if (on("label")) { v.push(`--sm-label-font:${r.label.font}`); v.push(`--sm-label-transform:${r.label.transform}`); v.push(`--sm-label-tracking:${r.label.tracking}`); v.push(`--sm-label-style:${r.label.style}`); }
    if (on("type")) { v.push(`--sm-type-k:${r.typeK}`); v.push(`--sm-type-weight:${r.type.weight}`); if (r.type.tracking) v.push(`--sm-type-tracking:${r.type.tracking}`); }
    if (on("texture")) v.push(`--sm-texture-amt:${r.texture.amount}`);
    return v.length ? `:root{${v.join(";")}}` : "";
  }

  // ---------- page-side helpers handed to scenes as h.ui / h.motion / h.dir ----------
  // Every helper takes the scene's own (native) value and returns it unchanged unless the pack directs that axis.
  function makeUi(r, directable, tokens, env) {
    const report = new Set();
    const has = (axis) => !!r && directable.includes(axis);
    const use = (axis) => { if (has(axis)) report.add(axis); return has(axis); };
    const ui = {
      stroke: (role, native) => (use("stroke") ? r.stroke[role] ?? native : native),
      strokeColor: (native) => (use("stroke") ? r.stroke.colorValue : native),
      strokeAttrs: (role, native, color) => {
        const w = ui.stroke(role, native);
        return w > 0 ? { "stroke-width": w, stroke: ui.strokeColor(color) } : { "stroke-width": 0, stroke: "none" };
      },
      shadow: (level, native) => (use("elevation") ? r.shadow[Math.max(0, Math.min(3, level))] : native),
      radius: (size, native) => (use("corner") ? r.radius[size] ?? native * r.cornerK : native),
      glow: (native) => (use("glow") ? (r.glow ? r.glow.css : "none") : native),
      // overlays share one rule: absolutely placed in the stage, never animated, seeded so every frame matches
      texture(parent) {
        if (!use("texture") || r.texture.kind === "none" || !env) return null;
        const node = env.el("div", "sm-texture", parent);
        Object.assign(node.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "50", opacity: String(r.texture.amount * (r.texture.kind === "grain" || r.texture.kind === "paper" ? 2.5 : 1.2)), mixBlendMode: lum(tokens.color.paper) < 0.2 ? "screen" : "multiply", ...bgStyle(textureImage(r.texture.kind, tokens)) });
        return node;
      },
      motif(parent) {
        if (!use("motif") || r.motif === "none" || !env) return null;
        const node = env.el("div", "sm-motif", null);
        parent.insertBefore(node, parent.firstChild);
        Object.assign(node.style, { position: "absolute", inset: "0", zIndex: "-1", pointerEvents: "none", ...bgStyle(motifImage(r.motif, tokens)) });
        return node;
      },
    };
    const motion = {
      stagger: (i, step) => i * step * (use("motion") ? r.stagger : 1),
    };
    const dir = { pack: r ? r.pack.name : "native", code: r ? r.code : "native", has, report: () => [...report].sort() };
    return { ui, motion, dir };
  }

  const svgUrl = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  // a tiled pattern comes back as "<image> 0 0 / <size>" (background shorthand). backgroundImage alone rejects the
  // position and size and drops the whole declaration, which is how dot-grid and halftone rendered as nothing.
  // lib/style-export.mjs uses this too, for the exported CSS.
  function bgStyle(image) {
    const m = /^(.*\))\s+(\S+ \S+) \/ (.+)$/.exec(image);
    return m ? { backgroundImage: m[1], backgroundPosition: m[2], backgroundSize: m[3] } : { backgroundImage: image };
  }
  function textureImage(kind, tokens) {
    const ink = tokens.color.ink;
    if (kind === "grain" || kind === "paper") {
      const f = kind === "grain" ? 0.9 : 0.04;
      return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="${kind === "grain" ? 2 : 4}" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>`);
    }
    if (kind === "halftone") return `radial-gradient(${rgba(ink, 0.5)} 1px, transparent 1.4px) 0 0 / 6px 6px`;
    // dither: a 4×4 Bayer-ish checker of single pixels
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" shape-rendering="crispEdges" fill="${ink}"><rect x="0" y="0" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="2" y="0" width="1" height="1" opacity=".5"/><rect x="0" y="2" width="1" height="1" opacity=".5"/></svg>`);
  }
  function motifImage(kind, tokens) {
    const line = rgba(tokens.color.line, 0.9), faint = rgba(tokens.color.ink, 0.08);
    if (kind === "ruled") return `repeating-linear-gradient(to bottom, transparent 0 39px, ${line} 39px 40px)`;
    if (kind === "dot-grid") return `radial-gradient(${faint} 1.2px, transparent 1.6px) 0 0 / 28px 28px`;
    if (kind === "corner-ticks") return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" fill="none" stroke="${tokens.color.faint}" stroke-width="1.5"><path d="M24 48V24h24M1552 24h24v24M1576 852v24h-24M48 876H24v-24"/></svg>`);
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" fill="none" stroke="${tokens.color.line}" stroke-width="1.2"><circle cx="1180" cy="450" r="520"/><circle cx="1180" cy="450" r="360" stroke-dasharray="2 8"/></svg>`);
  }

  // Tempo: a named, non-linear tween stretches by k but is capped to finish by `end` (the scene's duration),
  // so anything that must settle before the loop seam still does. Linear motion and custom curves are untouched.
  // A tween that starts in a scene's intro (before `loopAt`) is capped to the loop start instead: the intro has to
  // be over when the loop begins, or the first loop frame can't match the last.
  function capTempo(start, dur, curve, k, end, loopAt = 0) {
    if (k === 1 || curve === "linear" || typeof curve !== "string") return dur;
    const limit = loopAt > 0 && start < loopAt ? loopAt : end;
    return Math.min(dur * k, Math.max(dur, limit - start));
  }

  // ---------- page wiring: one call from stage.js mount() ----------
  // Resolves the embedded (or ?style=) pack against the final tokens, writes the CSS variables, and returns
  // the scene helpers plus the easing overrides and tempo the stage applies to h.tw.
  function forPage(input, directable, tokens, env) {
    const pack = normalize(input, "style");
    const dirs = Array.isArray(directable) ? directable : [];
    const r = resolve(pack, tokens);
    const colorTokens = r && dirs.includes("color") ? applyColorMode(tokens, r.colorMode) : tokens;
    const helpers = makeUi(r, dirs, colorTokens, env);
    const motionOn = !!r && dirs.includes("motion");
    return {
      tokens: colorTokens,
      css: css(r, dirs),
      ease: motionOn ? r.ease : null,
      tempo: motionOn ? r.tempo : 1,
      ...helpers,
    };
  }

  const api = { KNOBS, AXES, AXIS, DEFAULTS, STUDIO_EASE, capTempo, normalize, encode, decode, isCode, resolve, applyColorMode, css, makeUi, forPage, textureImage, motifImage, bgStyle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SMStyle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
