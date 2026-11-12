/* site-motion tokens: one normaliser shared by the build (Node) and the page (inlined before stage.js).
 * Scenes read tokens.color.* directly and as CSS variables, so every optional colour a scene may use is
 * filled in here when a token file (or a theme drafted from a URL) leaves it out.
 */
(function (root) {
  "use strict";
  const REQUIRED = ["paper", "surface", "ink", "muted", "line", "accent"];
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const FONT = /^[\w\s'",.\-()]+$/;
  const FONT_IMPORT = /^https:\/\/fonts\.(?:googleapis\.com|bunny\.net)\/css2?\?[\w\s=&:;@,.%+\-]+$/;

  const hex = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, p) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * p));
  const lum = (c) => {
    const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const kebab = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

  // WCAG AA for body text. Brand colours stay as they are for fills, rules and glows; text in a brand colour uses
  // its <name>Text shade: the smallest step towards ink (white on dark paper) that reads at AA on every background
  // it sits on, so a pale accent keeps its hue and only darkens as much as it has to.
  // A colour that already reads is kept as it is. One that has to move aims a little past the line (AIM), because a
  // browser draws text antialiased over blended fills and a shade that lands exactly on 4.5 can measure 4.44 on screen.
  const AA = 4.5, AIM = 4.65;
  function readable(fg, backgrounds, toward) {
    const reads = (c, bar) => backgrounds.every((bg) => contrast(c, bg) >= bar);
    if (reads(fg, AA)) return fg;
    const ok = (c) => reads(c, AIM);
    for (const target of [toward, lum(toward) < 0.5 ? "#000000" : "#ffffff"]) {
      if (!ok(mix(fg, target, 1))) continue;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const p = (lo + hi) / 2; if (ok(mix(fg, target, p))) hi = p; else lo = p; }
      return mix(fg, target, hi);
    }
    return lum(toward) < 0.5 ? "#000000" : "#ffffff";
  }
  // text drawn on a fill a scene mixes itself (a tinted block face, a palette chip): `prefer` when it already reads
  // at AA there, otherwise the nearest shade of it that does, darkening on a light fill and lightening on a dark one
  const textOn = (bg, prefer) => readable(prefer || "#000000", [bg], lum(bg) > 0.18 ? "#000000" : "#ffffff");
  // the theme's own text colour for a fill: its ink when that reads (a pastel chip on a light theme), its paper when
  // that reads instead (the same pastel chip on a dark theme, where the ink is light), else the nearest shade that does
  const inkOn = (bg, c) => {
    for (const x of [c.ink, c.paper]) if (contrast(x, bg) >= AA) return x;
    return textOn(bg, contrast(c.ink, bg) >= contrast(c.paper, bg) ? c.ink : c.paper);
  };

  // throws on a token set no scene can draw with; otherwise returns a copy with every optional colour present
  function normalize(input, where = "tokens") {
    const t = JSON.parse(JSON.stringify(input || {}));
    const c = (t.color = t.color || {});
    for (const key of REQUIRED) if (!c[key]) throw new Error(`${where}: color.${key} is required`);
    for (const [k, v] of Object.entries(c)) if (typeof v !== "string" || !HEX.test(v)) throw new Error(`${where}: color.${k} must be a hex colour like #1a2b3c`);
    if (!Array.isArray(t.palette) || t.palette.length < 3) throw new Error(`${where}: palette needs at least 3 colours`);
    t.palette.forEach((v, i) => { if (!HEX.test(v)) throw new Error(`${where}: palette[${i}] must be a hex colour`); });
    const dark = lum(c.paper) < 0.2;
    // scenes index the palette up to [5]; a shorter brand palette grows with tints and shades of its own colours
    const n = t.palette.length;
    while (t.palette.length < 6) { const i = t.palette.length; t.palette.push(mix(t.palette[i % n], i % 2 ? c.paper : c.ink, 0.32)); }
    c.raised = c.raised || mix(c.paper, c.ink, dark ? 0.08 : 0.05);
    c.faint = c.faint || mix(c.paper, c.ink, 0.35);
    c.accentInk = c.accentInk || (dark ? mix(c.accent, "#ffffff", 0.35) : mix(c.accent, c.ink, 0.45));
    c.onAccent = c.onAccent || (contrast(c.accent, "#ffffff") >= contrast(c.accent, c.ink) ? "#ffffff" : c.ink);
    c.positive = c.positive || (dark ? "#4cc46a" : "#2f9e44");
    c.warning = c.warning || (dark ? "#f0b24f" : "#d9822b");
    // attention: something that waits on a person (held, needs approval); warning: something went wrong.
    // A brand that doesn't tell them apart gets one colour for both.
    c.attention = c.attention || c.warning;
    // text shades: readable on paper, on surface and on the colour's own pale tint (status pills and badges use up
    // to a 20% tint of the colour as their background)
    const ink = dark ? "#ffffff" : c.ink;
    // muted is a text colour by role (captions, labels, timestamps), so it must read at AA on every surface a scene
    // puts it on. A brand's muted that falls just short (#6a6f66 on #eef0ea is 4.48:1) moves the smallest step
    // towards ink; one that already reads is left exactly as the brand set it. Scenes shade their own grounds a little
    // past raised (a sky, a table band), so the check runs against one step darker than raised too.
    c.muted = readable(c.muted, [c.paper, c.surface, c.raised, mix(c.raised, c.ink, dark ? 0.04 : 0.06)], ink);
    for (const k of ["accent", "positive", "warning", "attention"]) {
      const key = k + "Text";
      c[key] = c[key] || readable(c[k], [c.paper, c.surface, mix(c.surface, c[k], 0.2)], ink);
    }
    // accent as a fill under onAccent text (a seal, a badge): the accent itself when onAccent already reads on it,
    // otherwise the nearest shade, moving away from onAccent, where it does
    c.accentFill = c.accentFill || readable(c.accent, [c.onAccent], lum(c.onAccent) > lum(c.accent) ? (dark ? "#000000" : c.ink) : "#ffffff");
    // text on a solid status fill (a check disc, a "passed" banner, a "fragile" sticker): ink when it reads there,
    // otherwise the nearest shade that does. On a dark theme the light ink fails on a bright green, so it starts from
    // the paper instead.
    for (const k of ["positive", "warning", "attention"]) {
      const key = "on" + k[0].toUpperCase() + k.slice(1);
      c[key] = c[key] || textOn(c[k], dark ? c.paper : c.ink);
    }
    t.font = t.font || {};
    t.font.sans = t.font.sans || "system-ui, sans-serif";
    t.font.mono = t.font.mono || "ui-monospace, Menlo, monospace";
    for (const [k, v] of Object.entries(t.font)) {
      if (k === "import") { if (v && !FONT_IMPORT.test(v)) throw new Error(`${where}: font.import must be a Google Fonts (or Bunny Fonts) css URL`); }
      else if (typeof v !== "string" || !FONT.test(v)) throw new Error(`${where}: font.${k} has characters a font stack can't contain`);
    }
    t.radius = t.radius || { sm: 6, md: 12, lg: 20 };
    for (const [k, v] of Object.entries(t.radius)) if (typeof v !== "number") throw new Error(`${where}: radius.${k} must be a number`);
    return t;
  }

  function css(tokens) {
    const lines = [];
    for (const [k, v] of Object.entries(tokens.color)) lines.push(`--c-${kebab(k)}:${v}`);
    tokens.palette.forEach((v, i) => lines.push(`--p-${i}:${v}`, `--p-${i}-on:${inkOn(v, tokens.color)}`));
    for (const [k, v] of Object.entries(tokens.font || {})) if (k !== "import") lines.push(`--font-${kebab(k)}:${v}`);
    for (const [k, v] of Object.entries(tokens.radius || {})) lines.push(`--r-${kebab(k)}:${v}px`);
    if (tokens.color.stroke) lines.push("--stroke-w:1.5px");
    return `:root{${lines.join(";")}}`;
  }

  const api = { normalize, css, mix, contrast, lum, textOn, inkOn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SMTokens = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
