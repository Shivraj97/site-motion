// URL → design tokens. Pure and dependency-free: give it a page's HTML and stylesheets and it returns a token
// set that lib/build.mjs accepts, plus a note for every guess it had to make.
//
//   import { extractTokens } from "./extract-tokens.mjs";
//   const { tokens, notes } = extractTokens({ html, css: [sheetA, sheetB], url: "https://example.com" });
//
// How it reads a site: a small CSS parser flattens the sheets (media queries evaluated for a 1440px light-mode
// desktop), a selector matcher runs the cascade for <html>, <body>, buttons, links and headings, and var() is
// resolved against the custom properties those elements inherit. paper and ink come from the body; accent from a
// brand/primary variable, else the saturated colours on buttons and links; everything else is derived in OKLCH.

/* ───────────────────────── colour maths: sRGB ⇄ OKLab/OKLCH, CIELAB, WCAG ───────────────────────── */

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055);
const rgba = (r, g, b, a = 1) => ({ r, g, b, a });

function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const linToColor = (lin, a = 1) => rgba(...lin.map((v) => Math.min(1, Math.max(0, fromLin(Math.min(1, Math.max(0, v)))))), a);

export const oklab = (c) => linToOklab([toLin(c.r), toLin(c.g), toLin(c.b)]);
export function oklch(c) {
  const [L, a, b] = oklab(c);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C: Math.hypot(a, b), h };
}
// OKLCH → sRGB, reducing chroma (keeping L and h) until the colour fits the sRGB gamut
export function fromOklch(L, C, h, a = 1) {
  L = Math.min(1, Math.max(0, L));
  const lab = (c) => oklabToLin([L, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  if (inGamut(lab(C))) return linToColor(lab(C), a);
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(lab(mid))) lo = mid; else hi = mid; }
  return linToColor(lab(lo), a);
}
function fromLinGamut(lin, a = 1) {
  if (inGamut(lin)) return linToColor(lin, a);
  const [L, x, y] = linToOklab(lin.map((v) => Math.max(0, v)));
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return fromOklch(L, Math.hypot(x, y), h, a);
}
export const toHex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
export function luminance(c) {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const deltaE = (a, b) => { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
function mixOk(a, b, t) {
  const p = oklab(a), q = oklab(b);
  return fromLinGamut(oklabToLin(p.map((v, i) => v + (q[i] - v) * t)));
}
// composite a translucent colour over an opaque one
const over = (c, under) => rgba(c.r * c.a + under.r * (1 - c.a), c.g * c.a + under.g * (1 - c.a), c.b * c.a + under.b * (1 - c.a), 1);
const WHITE = rgba(1, 1, 1), BLACK = rgba(0, 0, 0);

function labToColor(L, a, b, alpha) {
  const e = 216 / 24389, k = 24389 / 27;
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.96422, Y = yr, Z = zr * 0.82521; // D50
  const X2 = 0.9554734527 * X - 0.0230985369 * Y + 0.0632593087 * Z; // Bradford D50 → D65
  const Y2 = -0.028369707 * X + 1.009995458 * Y + 0.021041399 * Z;
  const Z2 = 0.0123140017 * X - 0.0205076964 * Y + 1.3303659366 * Z;
  return fromLinGamut([
    3.2409699419 * X2 - 1.5373831776 * Y2 - 0.4986107603 * Z2,
    -0.9692436363 * X2 + 1.8759675015 * Y2 + 0.0415550574 * Z2,
    0.0556300797 * X2 - 0.2039769589 * Y2 + 1.0569715142 * Z2,
  ], alpha);
}

function hslToColor(h, s, l, a) {
  h = ((h % 360) + 360) % 360;
  const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return rgba(f(0), f(8), f(4), a);
}

const NAMED = {
  black: "000000", white: "ffffff", red: "ff0000", green: "008000", blue: "0000ff", yellow: "ffff00", orange: "ffa500",
  purple: "800080", gray: "808080", grey: "808080", silver: "c0c0c0", maroon: "800000", navy: "000080", teal: "008080",
  olive: "808000", lime: "00ff00", aqua: "00ffff", cyan: "00ffff", fuchsia: "ff00ff", magenta: "ff00ff", pink: "ffc0cb",
  gold: "ffd700", indigo: "4b0082", violet: "ee82ee", coral: "ff7f50", tomato: "ff6347", crimson: "dc143c", salmon: "fa8072",
  khaki: "f0e68c", beige: "f5f5dc", ivory: "fffff0", linen: "faf0e6", snow: "fffafa", whitesmoke: "f5f5f5", gainsboro: "dcdcdc",
  lightgray: "d3d3d3", lightgrey: "d3d3d3", darkgray: "a9a9a9", darkgrey: "a9a9a9", dimgray: "696969", dimgrey: "696969",
  slategray: "708090", lightslategray: "778899", darkslategray: "2f4f4f", royalblue: "4169e1", steelblue: "4682b4",
  dodgerblue: "1e90ff", deepskyblue: "00bfff", skyblue: "87ceeb", midnightblue: "191970", darkblue: "00008b",
  cornflowerblue: "6495ed", seagreen: "2e8b57", forestgreen: "228b22", darkgreen: "006400", limegreen: "32cd32",
  mediumseagreen: "3cb371", springgreen: "00ff7f", turquoise: "40e0d0", darkorange: "ff8c00", orangered: "ff4500",
  firebrick: "b22222", darkred: "8b0000", hotpink: "ff69b4", deeppink: "ff1493", orchid: "da70d6", plum: "dda0dd",
  lavender: "e6e6fa", rebeccapurple: "663399", darkviolet: "9400d3", blueviolet: "8a2be2", chocolate: "d2691e",
  sienna: "a0522d", brown: "a52a2a", tan: "d2b48c", wheat: "f5deb3", cornsilk: "fff8dc", honeydew: "f0fff0",
  mintcream: "f5fffa", azure: "f0ffff", aliceblue: "f0f8ff", ghostwhite: "f8f8ff", seashell: "fff5ee", floralwhite: "fffaf0",
  oldlace: "fdf5e6", antiquewhite: "faebd7", papayawhip: "ffefd5", blanchedalmond: "ffebcd", bisque: "ffe4c4",
  mistyrose: "ffe4e1", lavenderblush: "fff0f5", lightyellow: "ffffe0", lemonchiffon: "fffacd", lightblue: "add8e6",
  lightgreen: "90ee90", lightpink: "ffb6c1", lightcyan: "e0ffff", darkcyan: "008b8b", cadetblue: "5f9ea0",
  goldenrod: "daa520", darkgoldenrod: "b8860b", peru: "cd853f", rosybrown: "bc8f8f", slateblue: "6a5acd",
  mediumpurple: "9370db", darkslateblue: "483d8b", darkolivegreen: "556b2f", yellowgreen: "9acd32", chartreuse: "7fff00",
};
const fromHex = (h, a = 1) => rgba(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, a);

const num = (t, pctScale = 1) => {
  if (t === undefined || t === "none") return 0;
  return t.endsWith("%") ? (parseFloat(t) / 100) * pctScale : parseFloat(t);
};
const hue = (t) => {
  const v = parseFloat(t);
  if (t.endsWith("turn")) return v * 360;
  if (t.endsWith("grad")) return v * 0.9;
  if (t.endsWith("rad")) return (v * 180) / Math.PI;
  return t === "none" ? 0 : v;
};
const BARE_HSL = /^(-?[\d.]+)(deg)?\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?$/;
const BARE_RGB = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/;

// Parse one CSS colour value. Returns { r, g, b, a } (0–1, sRGB) or null.
// `bare` also accepts the "222 47% 11%" / "255 0 0" channel lists that shadcn/Tailwind themes keep in variables.
export function parseColor(input, { bare = false } = {}) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return rgba(0, 0, 0, 0);
  if (s[0] === "#") {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) return fromHex(h.slice(0, 3).split("").map((x) => x + x).join(""), h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1);
    if (h.length === 6 || h.length === 8) return fromHex(h, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1);
    return null;
  }
  if (NAMED[s]) return fromHex(NAMED[s]);
  if (bare) {
    let m = s.match(BARE_HSL);
    if (m) return hslToColor(parseFloat(m[1]), m[3] / 100, m[4] / 100, m[5] ? num(m[5]) : 1);
    m = s.match(BARE_RGB);
    if (m && [m[1], m[2], m[3]].every((v) => v <= 255)) return rgba(m[1] / 255, m[2] / 255, m[3] / 255);
  }
  const m = s.match(/^([a-z-]+)\(([\s\S]*)\)$/);
  if (!m) return null;
  const fn = m[1];
  if (fn === "color-mix") return colorMix(m[2]);
  const [main, slash] = m[2].split("/");
  let parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = slash !== undefined ? num(slash.trim()) : 1;
  let space = "srgb";
  if (fn === "color" && /^[a-z]/.test(parts[0] || "")) { space = parts[0]; parts = parts.slice(1); }
  if (slash === undefined && parts.length === 4) { alpha = num(parts[3]); parts = parts.slice(0, 3); }
  if (parts.length < 3 || parts.some((p) => !/^(-?[\d.]+(e-?\d+)?(%|deg|rad|grad|turn)?|none)$/.test(p))) return null;
  if (Number.isNaN(alpha)) alpha = 1;
  switch (fn) {
    case "rgb": case "rgba": return rgba(...parts.slice(0, 3).map((p) => Math.min(1, Math.max(0, num(p, 255) / 255))), alpha);
    case "hsl": case "hsla": return hslToColor(hue(parts[0]), num(parts[1].endsWith("%") ? parts[1] : parts[1] + "%"), num(parts[2].endsWith("%") ? parts[2] : parts[2] + "%"), alpha);
    case "oklch": return fromOklch(num(parts[0]), num(parts[1], 0.4), hue(parts[2]), alpha);
    case "oklab": return fromLinGamut(oklabToLin([num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4)]), alpha);
    case "lab": return labToColor(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125), alpha);
    case "lch": { const L = num(parts[0], 100), C = num(parts[1], 150), h = (hue(parts[2]) * Math.PI) / 180; return labToColor(L, C * Math.cos(h), C * Math.sin(h), alpha); }
    case "color": {
      const v = parts.slice(0, 3).map((p) => num(p));
      if (space === "srgb") return rgba(...v.map((x) => Math.min(1, Math.max(0, x))), alpha);
      const lin = space === "srgb-linear" ? v : v.map((x) => toLin(Math.max(0, x)));
      if (space === "display-p3") return fromLinGamut([
        1.2249401763 * lin[0] - 0.2249401763 * lin[1],
        -0.0420569547 * lin[0] + 1.0420569547 * lin[1],
        -0.0196375546 * lin[0] - 0.0786360456 * lin[1] + 1.0982736002 * lin[2],
      ], alpha);
      return space === "srgb-linear" ? fromLinGamut(lin, alpha) : null;
    }
    default: return null;
  }
}

// color-mix(in oklab, A 40%, B) — mixed in OKLab whatever space is named; alpha mixes linearly
function colorMix(args) {
  const parts = splitTop(args, ",").map((x) => x.trim());
  if (parts.length !== 3) return null;
  const side = (p) => {
    const m = p.match(/^(.*?)(?:\s+([\d.]+%))?$/s);
    return { c: parseColor(m[1]), p: m[2] ? parseFloat(m[2]) / 100 : null };
  };
  const a = side(parts[1]), b = side(parts[2]);
  if (!a.c || !b.c) return null;
  let pa = a.p, pb = b.p;
  if (pa === null && pb === null) pa = pb = 0.5;
  else if (pa === null) pa = 1 - pb;
  else if (pb === null) pb = 1 - pa;
  const sum = pa + pb || 1;
  const t = pb / sum;
  const alpha = a.c.a * (1 - t) + b.c.a * t;
  // mixing with transparent keeps the other colour's channels
  if (a.c.a === 0) return { ...b.c, a: alpha * Math.min(1, sum) };
  if (b.c.a === 0) return { ...a.c, a: alpha * Math.min(1, sum) };
  return { ...mixOk(a.c, b.c, t), a: alpha * Math.min(1, sum) };
}

/* ───────────────────────── small text helpers ───────────────────────── */

// split on a separator at paren/bracket depth 0, outside quotes
function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = null, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { cur += ch; if (ch === "\\") cur += s[++i] ?? ""; else if (ch === quote) quote = null; continue; }
    if (ch === "\\") { cur += ch + (s[++i] ?? ""); continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
// index of the ")" matching the "(" at `open`
function matchParen(s, open) {
  let depth = 0, quote = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return s.length - 1;
}
const unescapeCss = (s) => s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16) || 0xfffd)).replace(/\\([^\n])/g, "$1");
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (_, e) => {
  const k = e.toLowerCase();
  if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[k] ?? "'";
});

// Every colour literal in a declaration value: hex, named, rgb()/hsl()/oklch()/lab()/color-mix(), inside gradients too.
export function colorsIn(value) {
  const out = [];
  const s = value;
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (ch === "#") {
      const m = s.slice(i).match(/^#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/);
      if (m) { const c = parseColor(m[0]); if (c) out.push(c); i += m[0].length; continue; }
      i++; continue;
    }
    if (/[a-zA-Z_-]/.test(ch) && (i === 0 || !/[\w-]/.test(s[i - 1]))) {
      const m = s.slice(i).match(/^[a-zA-Z_-][\w-]*/);
      const word = m[0];
      const next = s[i + word.length];
      if (next === "(") {
        const end = matchParen(s, i + word.length);
        const fn = word.toLowerCase();
        if (fn === "url") { i = end + 1; continue; }
        if (/^(rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix)$/.test(fn)) {
          const c = parseColor(s.slice(i, end + 1));
          if (c) out.push(c);
          i = end + 1;
          continue;
        }
        out.push(...colorsIn(s.slice(i + word.length + 1, end)));
        i = end + 1;
        continue;
      }
      const lw = word.toLowerCase();
      if (NAMED[lw]) out.push(fromHex(NAMED[lw]));
      else if (lw === "transparent") out.push(rgba(0, 0, 0, 0));
      i += word.length;
      continue;
    }
    i++;
  }
  return out;
}

/* ───────────────────────── CSS: parse, flatten, evaluate media ───────────────────────── */

const VIEW = { width: 1440, height: 900 };

// Evaluate a media query for a 1440×900 screen in light mode with no special preferences.
export function mediaMatches(query, scheme = "light") {
  if (!query) return true;
  return splitTop(query, ",").some((q) => {
    let s = q.trim().toLowerCase();
    let negate = false;
    if (s.startsWith("not ")) { negate = true; s = s.slice(4); }
    s = s.replace(/^only\s+/, "");
    let ok = true;
    const type = s.match(/^(all|screen|print|speech)\b/);
    if (type && (type[1] === "print" || type[1] === "speech")) ok = false;
    for (const f of s.matchAll(/\(([^()]*)\)/g)) if (!featureMatches(f[1].trim(), scheme)) ok = false;
    return negate ? !ok : ok;
  });
}
const toPx = (v) => { const n = parseFloat(v); return /r?em$/.test(v) ? n * 16 : n; };
function featureMatches(f, scheme) {
  let m = f.match(/^(min-|max-)?(width|height)\s*:\s*([\d.]+[a-z]*)$/);
  if (m) {
    const actual = VIEW[m[2]], v = toPx(m[3]);
    return m[1] === "min-" ? actual >= v : m[1] === "max-" ? actual <= v : actual === v;
  }
  const cmp = (a, op, b) => ({ "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "=": a === b })[op];
  m = f.match(/^([\d.]+[a-z]*)\s*(<=?|>=?)\s*(width|height)\s*(?:(<=?|>=?)\s*([\d.]+[a-z]*))?$/);
  if (m) return cmp(toPx(m[1]), m[2], VIEW[m[3]]) && (!m[4] || cmp(VIEW[m[3]], m[4], toPx(m[5])));
  m = f.match(/^(width|height)\s*(<=?|>=?|=)\s*([\d.]+[a-z]*)$/);
  if (m) return cmp(VIEW[m[1]], m[2], toPx(m[3]));
  m = f.match(/^([a-z-]+)\s*:\s*([a-z-]+)$/);
  if (m) {
    const [, k, v] = m;
    if (k === "prefers-color-scheme") return v === scheme;
    if (k === "prefers-reduced-motion" || k === "prefers-reduced-transparency" || k === "prefers-reduced-data") return v === "no-preference";
    if (k === "prefers-contrast") return v === "no-preference";
    if (k === "forced-colors" || k === "inverted-colors") return v === "none";
    if (k === "hover" || k === "any-hover") return v === "hover";
    if (k === "pointer" || k === "any-pointer") return v === "fine";
    if (k === "orientation") return v === "landscape";
    if (k === "display-mode") return v === "browser";
  }
  return true;
}

// Parse stylesheets into flat style rules: [{ selectors, decls: [{ prop, value, important }], order }].
// Rules in media queries that don't match a light desktop are dropped; @supports/@layer/@container are flattened.
export function parseCss(text, { scheme = "light", startOrder = 0, info = {} } = {}) {
  const rules = [];
  info.imports = info.imports || [];
  info.fontFaces = info.fontFaces || [];
  info.darkVariant = info.darkVariant || false;
  let order = startOrder;
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");

  function readPrelude(s, i, stops) {
    let quote = null, depth = 0;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
      if (ch === "\\") { j++; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (depth <= 0 && stops.includes(ch)) return j;
    }
    return -1;
  }
  function matchBrace(s, open) {
    let depth = 0, quote = null;
    for (let j = open; j < s.length; j++) {
      const ch = s[j];
      if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
      if (ch === "\\") { j++; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return j;
    }
    return s.length;
  }
  const parseDecl = (d) => {
    const k = d.indexOf(":");
    if (k < 1) return null;
    const prop = d.slice(0, k).trim();
    let value = d.slice(k + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, "").trim();
    return { prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important };
  };

  function styleBlock(selectorText, body, active) {
    const selectors = splitTop(selectorText, ",").map((x) => x.trim()).filter(Boolean);
    const decls = [];
    for (let i = 0; i < body.length; ) {
      const stop = readPrelude(body, i, ";{}");
      if (stop === -1) { const d = parseDecl(body.slice(i)); if (d) decls.push(d); break; }
      if (body[stop] === "{") {
        // native nesting: `&` becomes :is(parent); no `&` means a descendant of the parent
        const inner = body.slice(i, stop).trim();
        const close = matchBrace(body, stop);
        const parent = `:is(${selectors.join(",")})`;
        if (inner.startsWith("@")) block(inner, body.slice(stop + 1, close), active, parent);
        else {
          const nested = splitTop(inner, ",").map((x) => (x.includes("&") ? x.replace(/&/g, parent) : `${parent} ${x.trim()}`)).join(",");
          styleBlock(nested, body.slice(stop + 1, close), active);
        }
        i = close + 1;
        continue;
      }
      const d = parseDecl(body.slice(i, stop));
      if (d) decls.push(d);
      i = stop + 1;
    }
    if (active && decls.length && selectors.length) rules.push({ selectors, decls, order: order++ });
  }

  function block(prelude, body, active, parentSel) {
    const at = prelude.match(/^@([\w-]+)\s*([\s\S]*)$/);
    const name = at[1].toLowerCase();
    const cond = at[2].trim();
    if (name === "media") {
      if (/prefers-color-scheme\s*:\s*dark/i.test(cond)) info.darkVariant = true;
      walk(body, active && mediaMatches(cond, scheme), parentSel);
    } else if (["supports", "layer", "container", "scope", "document", "starting-style"].includes(name)) {
      walk(body, active && name !== "starting-style", parentSel);
    } else if (name === "font-face") {
      const fam = body.match(/font-family\s*:\s*([^;]+)/i);
      if (fam) info.fontFaces.push(fam[1].trim().replace(/^["']|["']$/g, ""));
    } // @keyframes, @page, @property, @counter-style, @font-feature-values: nothing for us
  }

  function walk(s, active, parentSel) {
    for (let i = 0; i < s.length; ) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      const stop = readPrelude(s, i, ";{}");
      if (stop === -1) break;
      const prelude = s.slice(i, stop).trim();
      if (s[stop] === ";" || s[stop] === "}") {
        const imp = prelude.match(/^@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*(.*)$/i);
        if (imp) info.imports.push({ href: imp[1], media: imp[2] || "" });
        i = stop + 1;
        continue;
      }
      const close = matchBrace(s, stop);
      const body = s.slice(stop + 1, close);
      if (prelude.startsWith("@")) block(prelude, body, active, parentSel);
      else if (parentSel) styleBlock(splitTop(prelude, ",").map((x) => (x.includes("&") ? x.replace(/&/g, parentSel) : x)).join(","), body, active);
      else styleBlock(prelude, body, active);
      i = close + 1;
    }
  }
  walk(src, true, null);
  return { rules, order, info };
}

/* ───────────────────────── HTML: a tolerant start-tag scanner with a parent chain ───────────────────────── */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "param", "keygen"]);

function parseAttrs(s) {
  const attrs = {};
  for (const m of s.matchAll(/([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const v = m[2] === undefined ? "" : m[2].replace(/^["']|["']$/g, "");
    attrs[m[1].toLowerCase()] = decodeEntities(v);
  }
  return attrs;
}
function makeEl(tag, attrs, parent) {
  return { tag, attrs, parent, id: attrs.id || "", classes: new Set((attrs.class || "").split(/\s+/).filter(Boolean)) };
}

export function parseHtml(html) {
  const styles = [];
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_, attrs, body) => {
    const a = parseAttrs(attrs);
    if (!a.media || mediaMatches(a.media)) styles.push(body);
    return "";
  });
  s = s.replace(/<(script|template|textarea|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const elements = [];
  const stack = [];
  let html_ = null, body = null, title = "";
  const t = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) title = decodeEntities(t[1]).trim();
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const k = stack.map((e) => e.tag).lastIndexOf(tag);
      if (k >= 0) stack.length = k;
      continue;
    }
    if (tag === "html" && html_) continue;
    if (tag === "body" && body) continue;
    const parent = tag === "html" ? null : tag === "body" ? html_ : stack[stack.length - 1] || body || html_;
    const el = makeEl(tag, parseAttrs(m[3]), parent);
    if (tag === "html") { html_ = el; stack.length = 0; stack.push(el); continue; }
    if (tag === "body") { body = el; if (!html_) html_ = el.parent = makeEl("html", {}, null); stack.length = 0; stack.push(html_, el); continue; }
    elements.push(el);
    if (!VOID.has(tag) && !m[3].trim().endsWith("/")) stack.push(el);
  }
  if (!html_) html_ = makeEl("html", {}, null);
  if (!body) body = makeEl("body", {}, html_);
  for (const el of elements) if (!el.parent) el.parent = body;
  return { html: html_, body, elements, styles, title };
}

// <link rel=stylesheet> hrefs (absolute, document order). Skips print sheets and font CSS (read from the URL instead).
export function stylesheetLinks(html, baseUrl) {
  const doc = parseHtml(html);
  const base = doc.elements.find((e) => e.tag === "base" && e.attrs.href)?.attrs.href;
  const root = base ? new URL(base, baseUrl).href : baseUrl;
  const out = [];
  for (const el of doc.elements) {
    if (el.tag !== "link" || !el.attrs.href) continue;
    const rel = (el.attrs.rel || "").toLowerCase().split(/\s+/);
    const isSheet = (rel.includes("stylesheet") && !rel.includes("alternate")) || (rel.includes("preload") && el.attrs.as === "style");
    if (!isSheet || (el.attrs.media && !mediaMatches(el.attrs.media))) continue;
    let href;
    try { href = new URL(el.attrs.href, root).href; } catch { continue; }
    if (isFontCss(href) || out.includes(href)) continue;
    out.push(href);
  }
  return out;
}
const isFontCss = (href) => /^https?:\/\/(fonts\.googleapis\.com|fonts\.bunny\.net|use\.typekit\.net|fonts\.cdnfonts\.com)\//i.test(href);

// @import targets in a stylesheet (absolute), minus font CSS
export function cssImports(css, baseUrl) {
  const info = {};
  parseCss(css, { info });
  return info.imports.map((x) => { try { return new URL(x.href, baseUrl).href; } catch { return null; } }).filter((h) => h && !isFontCss(h));
}

/* ───────────────────────── selectors and the cascade ───────────────────────── */

const IDENT = /^(?:\\[0-9a-fA-F]{1,6}\s?|\\[^\n0-9a-fA-F]|[\w-]|[^\x00-\x7f])+/;
const STATE = new Set(["hover", "focus", "active", "visited", "focus-visible", "focus-within", "disabled", "checked", "target", "placeholder-shown", "invalid", "valid", "indeterminate", "autofill", "-webkit-autofill", "open", "popover-open", "modal", "fullscreen", "user-invalid", "has", "host", "host-context", "playing", "paused", "empty", "read-only", "required", "optional", "default", "defined", "in-range", "out-of-range"]);
const STRUCTURAL = new Set(["first-child", "last-child", "only-child", "first-of-type", "last-of-type", "only-of-type", "nth-child", "nth-last-child", "nth-of-type", "nth-last-of-type", "link", "any-link", "lang", "dir", "enabled", "read-write", "scope"]);

const compoundCache = new Map();
function parseCompound(str) {
  if (compoundCache.has(str)) return compoundCache.get(str);
  const c = { tag: null, ids: [], classes: [], attrs: [], pseudos: [], bad: false, spec: [0, 0, 0] };
  let s = str;
  while (s.length && !c.bad) {
    const ch = s[0];
    let m;
    if (ch === "*") { s = s.slice(1); continue; }
    if (ch === "." || ch === "#") {
      m = s.slice(1).match(IDENT);
      if (!m) { c.bad = true; break; }
      const v = unescapeCss(m[0]);
      if (ch === ".") { c.classes.push(v); c.spec[1]++; } else { c.ids.push(v); c.spec[0]++; }
      s = s.slice(1 + m[0].length);
      continue;
    }
    if (ch === "[") {
      let end = 1, quote = null;
      for (; end < s.length; end++) { const k = s[end]; if (quote) { if (k === quote) quote = null; } else if (k === '"' || k === "'") quote = k; else if (k === "]") break; }
      const inner = s.slice(1, end).trim();
      const am = inner.match(/^([\w:-]+)\s*(?:([~|^$*]?=)\s*("([^"]*)"|'([^']*)'|([^\s\]]+))\s*([is])?)?$/);
      if (!am) c.bad = true;
      else c.attrs.push({ name: am[1].toLowerCase(), op: am[2] || null, value: unescapeCss(am[4] ?? am[5] ?? am[6] ?? ""), ci: am[7] === "i" });
      c.spec[1]++;
      s = s.slice(end + 1);
      continue;
    }
    if (ch === ":") {
      if (s[1] === ":") { c.bad = true; break; } // pseudo-elements never style the element itself
      m = s.slice(1).match(/^[\w-]+/);
      if (!m) { c.bad = true; break; }
      const name = m[0].toLowerCase();
      let arg = null;
      let rest = s.slice(1 + m[0].length);
      if (rest[0] === "(") { const end = matchParen(rest, 0); arg = rest.slice(1, end); rest = rest.slice(end + 1); }
      if (["before", "after", "selection", "placeholder", "marker", "first-line", "first-letter", "backdrop"].includes(name) || STATE.has(name)) c.bad = true;
      else if (name === "root") { c.pseudos.push({ name }); c.spec[1]++; }
      else if (name === "is" || name === "where" || name === "matches" || name === "-webkit-any" || name === "not") {
        c.pseudos.push({ name, list: splitTop(arg || "", ",").map((x) => x.trim()).filter(Boolean) });
        if (name !== "where") c.spec[1]++;
      } else if (STRUCTURAL.has(name)) c.spec[1]++;
      else c.bad = true;
      s = rest;
      continue;
    }
    m = s.match(/^[a-zA-Z][\w-]*/);
    if (m) { c.tag = m[0].toLowerCase(); c.spec[2]++; s = s.slice(m[0].length); continue; }
    c.bad = true;
  }
  compoundCache.set(str, c);
  return c;
}

// split a complex selector into compounds with the combinator to their left
function splitComplex(sel) {
  const parts = [];
  let cur = "", depth = 0, comb = null, quote = null;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "\\") { cur += ch + (sel[i + 1] ?? ""); i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      let run = "";
      while (i < sel.length && /[\s>+~]/.test(sel[i])) run += sel[i++];
      i--;
      if (cur) { parts.push({ compound: cur, comb }); cur = ""; }
      comb = run.trim() || " ";
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push({ compound: cur, comb });
  return parts;
}

function attrMatches(a, el) {
  let v = el.attrs[a.name];
  if (a.name === "class") v = [...el.classes].join(" ");
  if (v === undefined) return false;
  if (!a.op) return true;
  let want = a.value;
  if (a.ci) { v = v.toLowerCase(); want = want.toLowerCase(); }
  switch (a.op) {
    case "=": return v === want;
    case "~=": return v.split(/\s+/).includes(want);
    case "|=": return v === want || v.startsWith(want + "-");
    case "^=": return want !== "" && v.startsWith(want);
    case "$=": return want !== "" && v.endsWith(want);
    case "*=": return want !== "" && v.includes(want);
  }
  return false;
}
function compoundMatches(c, el) {
  if (c.bad) return false;
  if (c.tag && c.tag !== el.tag) return false;
  for (const id of c.ids) if (el.id !== id) return false;
  for (const k of c.classes) if (!el.classes.has(k)) return false;
  for (const a of c.attrs) if (!attrMatches(a, el)) return false;
  for (const p of c.pseudos) {
    if (p.name === "root") { if (el.tag !== "html") return false; }
    else if (p.name === "not") { if (p.list.some((s) => complexMatches(s, el))) return false; }
    else if (!p.list.some((s) => complexMatches(s, el))) return false;
  }
  return true;
}
const complexCache = new Map();
function complexMatches(sel, el) {
  let parts = complexCache.get(sel);
  if (!parts) { parts = splitComplex(sel).map((p) => ({ c: parseCompound(p.compound), comb: p.comb })); complexCache.set(sel, parts); }
  if (!parts.length) return false;
  const rec = (k, node) => {
    if (!compoundMatches(parts[k].c, node)) return false;
    if (k === 0) return true;
    const comb = parts[k].comb;
    if (comb === ">") return !!node.parent && rec(k - 1, node.parent);
    if (comb === "+" || comb === "~") return true; // siblings aren't tracked; assume they exist
    for (let up = node.parent; up; up = up.parent) if (rec(k - 1, up)) return true;
    return false;
  };
  return rec(parts.length - 1, el);
}
function specificity(sel) {
  const s = [0, 0, 0];
  for (const p of splitComplex(sel)) { const c = parseCompound(p.compound); s[0] += c.spec[0]; s[1] += c.spec[1]; s[2] += c.spec[2]; }
  return s[0] * 10000 + s[1] * 100 + s[2];
}

// bucket rules by the key their last compound needs (id, a class, a tag or *), so each element only tests a few
function indexRules(rules) {
  const index = new Map();
  const put = (key, entry) => { if (!index.has(key)) index.set(key, []); index.get(key).push(entry); };
  for (const rule of rules) {
    for (const sel of rule.selectors) {
      const parts = splitComplex(sel);
      if (!parts.length) continue;
      const last = parseCompound(parts[parts.length - 1].compound);
      if (last.bad) continue;
      const entry = { rule, sel };
      if (last.ids.length) put("#" + last.ids[0], entry);
      else if (last.classes.length) put("." + last.classes[0], entry);
      else if (last.tag) put(last.tag, entry);
      else put("*", entry);
    }
  }
  return index;
}

const INHERITED = ["color", "font-family"];
function makeCascade(index) {
  const memo = new Map();
  return function computed(el) {
    if (memo.has(el)) return memo.get(el);
    const parent = el.parent ? computed(el.parent) : null;
    const keys = ["*", el.tag, ...[...el.classes].map((k) => "." + k)];
    if (el.id) keys.push("#" + el.id);
    const hits = new Map();
    for (const key of keys) for (const entry of index.get(key) || []) {
      if (!complexMatches(entry.sel, el)) continue;
      const spec = specificity(entry.sel);
      const prev = hits.get(entry.rule);
      if (!prev || spec > prev) hits.set(entry.rule, spec);
    }
    const decls = [];
    for (const [rule, spec] of hits) for (const d of rule.decls) decls.push({ ...d, spec, order: rule.order });
    if (el.attrs.style) {
      for (const d of splitTop(el.attrs.style, ";")) {
        const k = d.indexOf(":");
        if (k < 1) continue;
        let value = d.slice(k + 1).trim();
        const important = /!\s*important$/i.test(value);
        value = value.replace(/!\s*important$/i, "").trim();
        const prop = d.slice(0, k).trim();
        decls.push({ prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important, spec: 1e6, order: Infinity });
      }
    }
    decls.sort((a, b) => (a.important - b.important) || (a.spec - b.spec) || (a.order - b.order));
    const vars = new Map(parent ? parent.vars : []);
    const props = new Map();
    for (const d of decls) (d.prop.startsWith("--") ? vars : props).set(d.prop, d.value);
    const own = new Set(props.keys());
    if (parent) for (const p of INHERITED) if (!props.has(p) && parent.props.has(p)) props.set(p, parent.props.get(p));
    for (const [p, v] of props) if (v === "inherit" && parent?.props.has(p)) props.set(p, parent.props.get(p));
    const out = { props, vars, own, get: (p) => (props.has(p) ? resolveVars(props.get(p), vars) : null) };
    memo.set(el, out);
    return out;
  };
}

export function resolveVars(value, vars, depth = 0) {
  if (value == null || depth > 16 || !value.includes("var(")) return value;
  let out = "", i = 0;
  for (;;) {
    const j = value.indexOf("var(", i);
    if (j < 0) { out += value.slice(i); break; }
    if (j > 0 && /[\w-]/.test(value[j - 1])) { out += value.slice(i, j + 4); i = j + 4; continue; }
    out += value.slice(i, j);
    const end = matchParen(value, j + 3);
    const inner = value.slice(j + 4, end);
    const [name, ...fb] = splitTop(inner, ",");
    let v = vars.get(name.trim());
    if (v == null || v.trim() === "" || v === "initial") v = fb.length ? fb.join(",").trim() : "";
    out += resolveVars(v, vars, depth + 1);
    i = end + 1;
  }
  return out;
}

/* ───────────────────────── fonts ───────────────────────── */

// Google Fonts families we know, with a css2 axis spec Google accepts for each. s = sans, m = mono, r = serif, d = display.
// Sans and serif ask for 300 too: the "display" type knob sets headlines at 300. css2 serves the weights a family has
// and quietly skips the rest (checked 10 Nov 2026: Gabarito, PT Sans), so a family without 300 falls back to 400.
const GOOGLE = {};
const g = (kind, spec, names) => names.split("|").forEach((n) => { GOOGLE[n.toLowerCase()] = { name: n, kind, spec }; });
g("s", "wght@300;400;500;600", "Inter|Inter Tight|DM Sans|Manrope|Geist|Plus Jakarta Sans|Outfit|Sora|Space Grotesk|Work Sans|Rubik|Poppins|Montserrat|Raleway|Nunito|Nunito Sans|Open Sans|Roboto|Roboto Flex|IBM Plex Sans|Figtree|Onest|Urbanist|Lexend|Mulish|Karla|Barlow|Archivo|Public Sans|Source Sans 3|Noto Sans|Jost|Epilogue|Schibsted Grotesk|Bricolage Grotesque|Instrument Sans|Hanken Grotesk|Albert Sans|Red Hat Display|Red Hat Text|Fira Sans|Be Vietnam Pro|Kanit|Josefin Sans|Quicksand|Cabin|Heebo|Assistant|Mukta|Exo 2|Overpass|Libre Franklin|Chivo|Spline Sans|Commissioner|Gabarito|Wix Madefor Display|Wix Madefor Text|Radio Canada|Reddit Sans|Funnel Display|Funnel Sans|Host Grotesk|Afacad|Golos Text|Familjen Grotesk|Syne|Unbounded|Oswald|Hind|Inclusive Sans|Atkinson Hyperlegible Next|Bai Jamjuree|Readex Pro|Encode Sans|Sarabun|Prompt|Lexend Deca|Mona Sans|Hubot Sans");
g("s", "wght@300;400;700", "Lato|PT Sans|Ubuntu|Titillium Web|Atkinson Hyperlegible|Source Sans Pro|Arimo|Tinos|Varela Round|Questrial|Didact Gothic");
g("m", "wght@400;500", "JetBrains Mono|Geist Mono|IBM Plex Mono|Roboto Mono|Fira Code|Source Code Pro|DM Mono|Red Hat Mono|Chivo Mono|Martian Mono|Azeret Mono|Spline Sans Mono|Fira Mono|Ubuntu Sans Mono|Noto Sans Mono|Commit Mono");
g("m", "wght@400;700", "Space Mono|Ubuntu Mono|Inconsolata|PT Mono|Anonymous Pro|Courier Prime|Cousine|Overpass Mono");
g("r", "wght@300;400;500;600", "Playfair Display|Lora|Fraunces|EB Garamond|Cormorant Garamond|Newsreader|Source Serif 4|Crimson Pro|Literata|Noto Serif|Roboto Serif|IBM Plex Serif|Bitter|Spectral|Libre Caslon Text|Gelasio|Young Serif|Bodoni Moda|Petrona");
g("r", "wght@300;400;700", "Merriweather|Libre Baskerville|PT Serif|Crimson Text|Cardo|Domine|Old Standard TT|Zilla Slab|Arvo|Roboto Slab|Alegreya");
g("d", "", "Instrument Serif|DM Serif Display|DM Serif Text|Bebas Neue|Anton|Archivo Black|Abril Fatface|Righteous|Lobster|Pacifico|Caveat|Dela Gothic One|Rubik Mono One|Press Start 2P|Bungee|Alfa Slab One|Ultra|Shrikhand");

// licensed or system faces → the Google family that stands in for them
const STAND_INS = [
  [/s[öo]hne mono|gt america mono|berkeley mono|sf ?mono|operator mono|monolisa|dank mono|pragmata|ui-monospace|menlo|monaco|consolas|courier|lucida console|monospace/, "JetBrains Mono"],
  [/s[öo]hne|graphik|helvetica now|helvetica neue|helvetica|neue haas|haas grotesk|neue montreal|suisse|akkurat|basier|calibre|untitled sans|ss? pro\b|sf pro|-apple-system|blinkmacsystemfont|system-ui|ui-sans-serif|segoe ui|arial|roboto fallback|aktiv grotesk|whyte|abc diatype|diatype|favorit|graphik|matter|founders grotesk text|nb international|lausanne|moderat|t[wt] norms/, "Inter"],
  [/gt america|founders grotesk|cabinet grotesk|national 2|replica|px grotesk|sharp grotesk|gt standard|pp mori|mori/, "Inter Tight"],
  [/circular|euclid circular|gt walsheim|apercu|cera|brown|campton|tt commons|axiforma|metropolis/, "DM Sans"],
  [/gilroy|tt norms pro|mont\b|sofia pro/, "Urbanist"],
  [/aeonik|satoshi|general sans|sf pro rounded|clash grotesk|switzer|object sans/, "Manrope"],
  [/avenir|proxima nova|museo sans|nunito sans fallback/, "Nunito Sans"],
  [/futura|brandon|century gothic|neuzeit/, "Jost"],
  [/clash display|pp neue machina|druk|monument extended|tusker/, "Space Grotesk"],
  [/tiempos|gt sectra|canela|freight|lyon|publico|financier|domaine|times new roman|times|georgia|ui-serif|serif/, "Newsreader"],
];

const GENERIC = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "inherit", "initial", "unset", "revert"]);

// '__Inter_d65c78', 'Inter Variable', "InterVariable", 'Inter-Regular' → "Inter"
function cleanFamily(raw) {
  let f = raw.trim().replace(/^["']|["']$/g, "").trim();
  const next = f.match(/^__(.+?)_[0-9a-f]{5,8}$/i);
  if (next) f = next[1].replace(/_/g, " ");
  f = f.replace(/\s*(variable|var|vf|web|webfont)$/i, "").replace(/[-\s](regular|book|medium|light|bold|semibold|roman)$/i, "").replace(/([a-z])Variable$/, "$1");
  return f.trim();
}
function familiesOf(stack) {
  return splitTop(stack || "", ",").map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/fallback/i.test(x)).map(cleanFamily).filter(Boolean);
}

// families named in Google/Bunny Fonts URLs (css and css2 syntax)
export function googleFamilies(urls) {
  const out = [];
  for (const raw of urls) {
    let u;
    try { u = new URL(decodeEntities(raw)); } catch { continue; }
    if (!/fonts\.(googleapis\.com|bunny\.net)$/.test(u.hostname)) continue;
    const css2 = u.pathname.startsWith("/css2");
    for (const fam of u.searchParams.getAll("family")) {
      for (const one of css2 ? [fam] : fam.split("|")) {
        const [name, spec = ""] = one.split(":");
        const clean = name.replace(/\+/g, " ").trim();
        if (clean && !out.some((x) => x.name.toLowerCase() === clean.toLowerCase())) out.push({ name: clean, spec: css2 && /^[\w;@,.]+$/.test(spec) ? spec : "" });
      }
    }
  }
  return out;
}

/* ───────────────────────── role mapping ───────────────────────── */

const chroma = (c) => oklch(c).C;
const SATURATED = 0.06;
const isSaturated = (c) => c && c.a > 0.5 && chroma(c) >= SATURATED;
const COLOR_PROPS = /^(color|background|background-color|background-image|border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|box-shadow|column-rule-color)$/;
const BUTTONISH = /(^|[^\w])(button|\.btn|\.button|\.cta|\[type=["']?submit|wp-block-button__link|wp-element-button|\.primary)/i;
const BUTTON_CLASS = /(^|[-_])(btn|button|cta)([-_]|$)/i;

// first opaque-ish colour of a background value (the colour layer, else the first gradient stop)
function bgColorOf(cs) {
  const v = cs.get("background-color") || cs.get("background");
  if (!v) return null;
  const list = colorsIn(v);
  if (!list.length) return null;
  // the colour layer sits after the last image layer; with only a gradient, take its first stop
  const tail = colorsIn(v.slice(v.lastIndexOf(")") + 1));
  const c = parseColor(v.trim()) || (tail.length ? tail[tail.length - 1] : list[0]);
  return c.a < 0.01 ? null : c;
}

function varRole(name) {
  const n = name.toLowerCase().replace(/^--/, "");
  const noise = /(foreground|(^|-)fg($|-)|text|(^|-)on-|contrast|hover|active|focus|pressed|disabled|border|ring|shadow|outline|muted|subtle|soft|weak|light|lighter|lightest|dark|darker|darkest|alpha|transparent|overlay|tint|shade|(^|-)(50|100|200|300|800|900|950)$)/;
  const bgNoise = /(card|popover|muted|accent|primary|secondary|tertiary|hover|input|button|btn|alt|inverse|inverted|highlight|code|header|footer|nav|overlay|modal|selection|subtle|elevated|raised|surface|sidebar|menu|tooltip|badge|chip|tag|success|error|danger|warning|info|destructive|[2-9]$)/;
  const inkNoise = /(muted|secondary|tertiary|primary-|accent|(^|-)on-|inverse|inverted|light|subtle|placeholder|link|button|btn|disabled|card|popover|sidebar|success|error|danger|warning|info|destructive|[2-9]$)/;
  const roles = {};
  if (/(brand|primary|accent)/.test(n) && !noise.test(n) && !/secondary/.test(n)) roles.accent = /brand/.test(n) ? 3 : /primary/.test(n) ? 2.5 : 2;
  if (/(background|(^|-)bg($|-)|canvas|(^|-)page($|-))/.test(n) && !/foreground/.test(n) && !bgNoise.test(n)) roles.paper = /^(color-)?(background|bg)$/.test(n) ? 3 : 1;
  if (/(foreground|(^|-)fg($|-)|(^|-)text($|-)|(^|-)ink($|-)|body-color)/.test(n) && !inkNoise.test(n)) roles.ink = /^(color-)?(foreground|fg|text)$/.test(n) ? 3 : 1;
  return roles;
}

function clusterAdd(pool, color, score, source) {
  if (!color) return;
  const c = color.a < 1 ? over(color, WHITE) : color;
  let hit = pool.find((p) => deltaE(p.color, c) < 0.05);
  if (!hit) pool.push((hit = { color: c, score: 0, best: 0, sources: new Set() }));
  hit.score += score;
  if (score > hit.best) { hit.best = score; hit.color = c; }
  hit.sources.add(source);
}

function contrastFix(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const { C, h } = oklch(fg);
  const lighter = luminance(bg) < 0.2;
  let best = fg;
  for (let i = 1; i <= 50; i++) {
    const L = lighter ? Math.min(1, oklch(fg).L + i * 0.02) : Math.max(0, oklch(fg).L - i * 0.02);
    best = fromOklch(L, C * (1 - i * 0.01), h);
    if (contrast(best, bg) >= min) return best;
  }
  return best;
}

/* ───────────────────────── shared: evidence → tokens ───────────────────────── */

const EMOJI = /emoji|symbol/i;
const SYSTEM = /^(system-ui|-apple-system|blinkmacsystemfont|segoe ui|ui-sans-serif|ui-monospace|sf pro( text| display)?|sfmono|sf mono|menlo|monaco|consolas)$/i;
// "ibmPlexMono", "JetBrainsMono", "dm_sans" → the Google family, matched with spaces, dashes and underscores ignored
const squash = (n) => n.toLowerCase().replace(/[\s_-]+/g, "");
const GOOGLE_SQUASHED = Object.fromEntries(Object.values(GOOGLE).map((v) => [squash(v.name), v]));
const gfind = (name) => GOOGLE[name.toLowerCase()] || GOOGLE_SQUASHED[squash(name)];
const kindOf = (name) => gfind(name)?.kind || (/mono|code/i.test(name) ? "m" : "s");
export const isSystemFont = (f) => SYSTEM.test(f) || GENERIC.has(f.toLowerCase()) || EMOJI.test(f);
export { familiesOf, cleanFamily, varRole, deltaE, mixOk, over, chroma, isSaturated, SATURATED, contrastFix };

// A font stack (cleaned family names, first choice first) → { name, spec, kind, how, from } for a Google family:
// the site's own Google family when it names one, else a stand-in for the licensed or system face.
// kind: "s" sans, "m" mono, "d" display (a display pick accepts any non-mono family).
export function resolveFont(families, kind, linked = []) {
  const isMono = kind === "m";
  const fits = (name) => (kindOf(name) === "m") === isMono;
  const fromLink = (l, how) => ({ name: l.name, spec: GOOGLE[l.name.toLowerCase()]?.spec ?? l.spec, kind: kindOf(l.name), how });
  const named = families.filter((f) => !GENERIC.has(f.toLowerCase()) && !EMOJI.test(f));
  const first = named[0] || families.find((f) => SYSTEM.test(f)) || "";
  if (first && !SYSTEM.test(first)) {
    // 1. a family the page loads from Google Fonts and names in its CSS
    for (const f of named) {
      const l = linked.find((x) => x.name.toLowerCase() === f.toLowerCase());
      if (l && fits(l.name)) return { ...fromLink(l, "Google Fonts link"), from: f === first ? null : first };
    }
    // 2. a Google family named in the CSS (self-hosted, next/font, fontsource), possibly as the site's own fallback
    for (const f of named) {
      const gf = gfind(f);
      if (gf && fits(gf.name)) return { ...gf, how: "CSS font-family, a Google family", from: f === first ? null : first };
    }
  }
  // 3. the first named face → a stand-in (display faces check the display table first)
  if (kind === "d" && first) {
    for (const [re, sub] of DISPLAY_STAND_INS) if (re.test(first.toLowerCase())) return { ...GOOGLE[sub.toLowerCase()], how: "stand-in", from: first };
    // an unknown display face the site itself backs with a serif is a serif
    if (families.some((f) => /^(serif|ui-serif|georgia|times new roman|times)$/i.test(f))) return { ...GOOGLE["dm serif display"], how: "stand-in", from: first };
  }
  for (const [re, sub] of STAND_INS) {
    if (first && re.test(first.toLowerCase()) && (sub === "JetBrains Mono") === isMono) return { ...GOOGLE[sub.toLowerCase()], how: "stand-in", from: first };
  }
  // 4. a linked Google family of the right kind
  const lk = linked.find((l) => fits(l.name));
  if (lk && kind !== "d") return { ...fromLink(lk, "Google Fonts link"), from: first || null };
  const fallback = isMono ? "JetBrains Mono" : "Inter";
  return { ...GOOGLE[fallback.toLowerCase()], how: "stand-in", from: first || "(none set)" };
}

// condensed / poster / serif display faces → a Google display stand-in (only used for font.display)
const DISPLAY_STAND_INS = [
  [/humane|druk|tusker|knockout|compacta|league gothic|bebas/, "Bebas Neue"],
  [/bodoni|didot|tiempos headline|canela|ogg|editorial new|gt super|reckless/, "Bodoni Moda"],
  [/denton|recoleta|cooper|kepler|chronicle display|tiempos|lyon display|noe display|pp editorial|gt alpina|sangbleu|financier display/, "DM Serif Display"],
  [/monument|pp neue machina|clash|cabinet grotesk|neue power/, "Space Grotesk"],
];

// Shared tail of both extractors. Evidence: { url, title, paper, ink, accent, extras[], fonts: { sans, mono, display? },
// radiusPx, radiusFrom, notes } (colours as { r, g, b, a }; fonts from resolveFont). Appends its own notes.
export function deriveTokens(ev) {
  const notes = ev.notes || [];
  const note = (s) => { if (!notes.includes(s)) notes.push(s); };
  const { paper, ink, accent } = ev;
  const dark = luminance(paper) < 0.2;
  const monochrome = chroma(accent) < SATURATED;

  // ── derived neutrals (mixed in OKLab, same proportions as the bundled presets)
  const P = oklch(paper);
  const color = {
    paper: toHex(paper),
    surface: toHex(dark ? fromOklch(P.L + 0.035, P.C, P.h) : P.L > 0.965 ? WHITE : fromOklch(Math.min(1, P.L + 0.03), P.C * 0.5, P.h)),
    raised: toHex(dark ? fromOklch(P.L + 0.07, P.C, P.h) : fromOklch(P.L - 0.035, P.C + 0.003, P.h)),
    ink: toHex(ink),
    muted: toHex(mixOk(ink, paper, 0.4)),
    faint: toHex(mixOk(ink, paper, 0.66)),
    line: toHex(mixOk(ink, paper, 0.86)),
    accent: toHex(accent),
  };
  const A = oklch(accent);
  color.accentInk = toHex(monochrome ? ink : contrastFix(fromOklch(dark ? Math.max(A.L, 0.72) : Math.min(A.L, 0.5), A.C, A.h), paper, 7));
  const lightOn = fromOklch(0.985, Math.min(0.02, A.C), A.h), darkOn = fromOklch(0.2, Math.min(0.04, A.C), A.h);
  color.onAccent = toHex(contrast(accent, lightOn) >= contrast(accent, darkOn) ? lightOn : darkOn);
  color.positive = toHex(fromOklch(dark ? 0.76 : 0.6, 0.15, 148));
  color.warning = toHex(fromOklch(dark ? 0.8 : 0.72, 0.15, 70));

  // ── palette: accent tint, the site's other saturated colours (pulled to one lightness), then hue rotations
  const band = dark ? { L: 0.68, C: 0.08, Cmax: 0.11 } : { L: 0.87, C: 0.075, Cmax: 0.12 };
  const palette = [];
  const hues = [];
  const addP = (c, h) => { if (palette.every((p) => deltaE(p, c) > 0.045)) { palette.push(c); hues.push(h); } };
  const baseHue = monochrome ? 250 : A.h;
  const baseC = monochrome ? 0.03 : band.C;
  addP(fromOklch(band.L, monochrome ? baseC : Math.min(Math.max(A.C * 0.6, band.C), band.Cmax), baseHue), baseHue);
  const extracted = ev.extras || [];
  for (const p of extracted) {
    const o = oklch(p);
    addP(fromOklch(band.L + (o.L - band.L) * 0.3, Math.min(o.C, band.Cmax), o.h), o.h);
  }
  if (extracted.length) note(`palette includes ${extracted.length} other site colour${extracted.length > 1 ? "s" : ""}: ${extracted.map(toHex).join(", ")}`);
  for (const off of [150, 210, 60, 280, 330, 100, 30, 250]) {
    if (palette.length >= 6) break;
    const h = (baseHue + off) % 360;
    if (hues.some((x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 28)) continue;
    addP(fromOklch(band.L + (off % 60 === 0 ? -0.04 : 0.02), baseC, h), h);
  }
  for (let k = 0; palette.length < 6 && k < 12; k++) { const h = (baseHue + 15 + k * 37) % 360; addP(fromOklch(band.L + (k % 2 ? 0.03 : -0.05), baseC, h), h); }
  if (monochrome) note("monochrome site: palette is quiet hue rotations at low chroma");


  // ── fonts
  const { sans, mono } = ev.fonts;
  const display = ev.fonts.display && ev.fonts.display.name !== sans.name ? ev.fonts.display : null;
  for (const [role, f] of [["sans", sans], ["mono", mono], ["display", display]]) {
    if (!f) continue;
    if (f.how === "stand-in") note(f.from === "(none set)" ? `font.${role}: no ${role} face set; using ${f.name}` : `font.${role}: "${f.from}" isn't on Google Fonts; substituted ${f.name}`);
    else if (f.from) note(`font.${role}: "${f.from}" isn't on Google Fonts; using ${f.name} (${f.how})`);
    else note(`font.${role}: ${f.name} (${f.how})`);
  }
  const safeName = (n) => n.replace(/[^\w\s-]/g, "").trim();
  const stack = (f) => `'${safeName(f.name)}', ${f.kind === "m" ? "ui-monospace, Menlo, monospace" : f.kind === "r" || /serif|bodoni|garamond|playfair/i.test(f.name) && !/sans/i.test(f.name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
  const famParam = (f) => safeName(f.name).replace(/\s+/g, "+") + (f.spec ? ":" + f.spec : "");
  const families = [sans, mono, display].filter(Boolean).filter((f, i, all) => all.findIndex((x) => x.name === f.name) === i);
  const font = { sans: stack(sans), mono: stack(mono) };
  if (display) font.display = stack(display);
  font.import = `https://fonts.googleapis.com/css2?${families.map((f) => "family=" + famParam(f)).join("&")}&display=block`;

  // ── radius scale from the primary button's radius
  const r = ev.radiusPx ?? null, rFrom = ev.radiusFrom || "";
  let radius;
  if (r === null) { radius = { sm: 6, md: 12, lg: 20 }; note("radius: none found; using 6/12/20"); }
  else if (r >= 100) { radius = { sm: 8, md: 16, lg: 24 }; note(`radius: pill buttons (${rFrom}); using 8/16/24 for cards`); }
  else { const md = Math.round(Math.min(r, 28)); radius = { sm: Math.round(md * 0.5), md, lg: Math.round(Math.min(md * 1.6, 32)) }; note(`radius: ${md}px from ${rFrom}`); }

  let host = "";
  try { host = new URL(ev.url).hostname.replace(/^www\./, ""); } catch {}
  const tokens = {
    name: `${host || ev.title || "site"} (extracted)`,
    source: ev.url || "",
    color,
    palette: palette.map(toHex),
    font,
    radius,
  };
  if (dark) note("dark site → dark theme");
  return { tokens, notes };
}

/* ───────────────────────── extractTokens ───────────────────────── */

export function extractTokens({ html = "", css = [], url = "", colorScheme = "light" } = {}) {
  const notes = [];
  const note = (s) => { if (!notes.includes(s)) notes.push(s); };
  const doc = parseHtml(html);
  const info = {};
  const rules = [];
  let order = 0;
  for (const text of [...css, ...doc.styles]) {
    const r = parseCss(text, { scheme: colorScheme, startOrder: order, info });
    rules.push(...r.rules);
    order = r.order;
  }
  if (!rules.length) note("no CSS rules found; colours fall back to browser defaults");
  const index = indexRules(rules);
  const computed = makeCascade(index);
  const rootCs = computed(doc.html);
  const bodyCs = computed(doc.body);
  const vars = bodyCs.vars;

  const meta = (name) => doc.elements.find((e) => e.tag === "meta" && (e.attrs.name || "").toLowerCase() === name && (!e.attrs.media || mediaMatches(e.attrs.media, colorScheme)))?.attrs.content;
  const themeColor = parseColor(meta("theme-color") || "");
  const colorSchemeMeta = (meta("color-scheme") || "").toLowerCase();

  // ── variables by role
  const varHits = { accent: [], paper: [], ink: [] };
  for (const [name, raw] of vars) {
    const roles = varRole(name);
    if (!Object.keys(roles).length) continue;
    const c = parseColor(resolveVars(raw, vars), { bare: true });
    if (!c || c.a < 0.5) continue;
    for (const [role, rank] of Object.entries(roles)) varHits[role].push({ name, color: c, rank });
  }
  for (const k of Object.keys(varHits)) varHits[k].sort((a, b) => b.rank - a.rank);

  // ── paper
  let paper = null, paperFrom = "";
  const opaque = (c, under = WHITE) => (c ? (c.a < 1 ? over(c, under) : c) : null);
  const bodyBg = bgColorOf(bodyCs), htmlBg = bgColorOf(rootCs);
  if (bodyBg && bodyBg.a >= 0.5) { paper = opaque(bodyBg, htmlBg ? opaque(htmlBg) : WHITE); paperFrom = "body background"; }
  else if (htmlBg && htmlBg.a >= 0.5) { paper = opaque(htmlBg); paperFrom = "html background"; }
  if (!paper) {
    const wrapper = doc.elements.slice(0, 400).find((el) => {
      if (!(el.tag === "main" || /^(__next|root|app|__nuxt|___gatsby|page|wrapper|site)$/.test(el.id) || [...el.classes].some((k) => /^(min-h-screen|min-h-dvh|h-screen|site|page|wrapper|app)$/.test(k)))) return false;
      const c = bgColorOf(computed(el));
      return c && c.a >= 0.5;
    });
    if (wrapper) { paper = opaque(bgColorOf(computed(wrapper))); paperFrom = `background of <${wrapper.tag}${wrapper.id ? "#" + wrapper.id : ""}>`; }
  }
  if (!paper && varHits.paper.length) { paper = varHits.paper[0].color; paperFrom = varHits.paper[0].name; }
  if (!paper && /^\s*dark\b/.test(colorSchemeMeta)) { paper = fromHex("121212"); paperFrom = "color-scheme: dark (browser canvas)"; }
  if (!paper) { paper = WHITE; paperFrom = "browser default (no background set)"; }
  paper = { ...paper, a: 1 };
  note(`paper ${toHex(paper)} from ${paperFrom}`);
  if (info.darkVariant && colorScheme === "light") note("site also has a prefers-color-scheme: dark variant; used the light default");
  const dark = luminance(paper) < 0.2;

  // ── ink
  let ink = null, inkFrom = "";
  const bodyColor = parseColor(bodyCs.get("color") || "");
  if (bodyColor && bodyColor.a > 0.3) { ink = opaque(bodyColor, paper); inkFrom = "body color"; }
  else if (varHits.ink.length) { ink = varHits.ink[0].color; inkFrom = varHits.ink[0].name; }
  if (!ink) { ink = dark ? fromHex("ededed") : BLACK; inkFrom = "browser default"; }
  if (contrast(ink, paper) < 4.5) {
    const fixed = contrastFix(ink, paper, 7);
    note(`ink ${toHex(ink)} (${inkFrom}) is too faint on paper; adjusted to ${toHex(fixed)}`);
    ink = fixed;
  } else note(`ink ${toHex(ink)} from ${inkFrom}`);
  ink = { ...ink, a: 1 };

  // ── accent candidates
  const pool = [];
  const neutralButtons = [];
  for (const v of varHits.accent) if (isSaturated(v.color)) clusterAdd(pool, v.color, 40 * v.rank, v.name);
  const buttons = doc.elements.filter((el) => el.tag === "button" || el.attrs.role === "button" || (el.tag === "input" && /submit|button/.test(el.attrs.type || "")) || ((el.tag === "a" || el.tag === "div" || el.tag === "span") && [...el.classes].some((k) => BUTTON_CLASS.test(k)))).slice(0, 40);
  for (const el of buttons) {
    const c = bgColorOf(computed(el));
    if (!c || c.a < 0.5 || deltaE(opaque(c, paper), paper) < 0.04) continue;
    if (isSaturated(c)) clusterAdd(pool, c, 25, "button background");
    else neutralButtons.push(opaque(c, paper));
  }
  const links = doc.elements.filter((el) => el.tag === "a").slice(0, 60);
  for (const el of links) {
    const c = parseColor(computed(el).get("color") || "");
    if (isSaturated(c)) clusterAdd(pool, c, 4, "link colour");
  }
  if (isSaturated(themeColor)) clusterAdd(pool, themeColor, 20, "meta theme-color");

  // ── weighted literal frequency over every colour declaration; a rule counts more when the page uses its class a lot
  const classUses = new Map();
  for (const el of doc.elements) for (const k of el.classes) classUses.set(k, (classUses.get(k) || 0) + 1);
  const usesOf = (sel) => {
    const parts = splitComplex(sel);
    const last = parts.length ? parseCompound(parts[parts.length - 1].compound) : null;
    return last && !last.bad ? Math.max(0, ...last.classes.map((k) => classUses.get(k) || 0)) : 0;
  };
  for (const rule of rules) {
    const sel = rule.selectors.join(",");
    if (/\.has-[\w-]+-(color|background-color)/.test(sel)) continue; // WordPress preset helpers, present on every WP site
    let w = 1;
    if (/(^|[\s,>(])(html|body|:root)\b/.test(sel)) w = 3;
    else if (BUTTONISH.test(sel)) w = 3;
    else if (/(^|[\s,>(])(a|h1|h2|h3)\b(?![\w-])/.test(sel)) w = 2;
    for (const d of rule.decls) {
      if (!COLOR_PROPS.test(d.prop)) continue;
      const value = resolveVars(d.value, vars);
      for (const c of colorsIn(value)) {
        if (c.a < 0.5) continue;
        if (isSaturated(c)) {
          const uses = Math.min(40, Math.max(0, ...rule.selectors.map(usesOf)));
          clusterAdd(pool, c, (d.prop === "accent-color" ? 10 : w) * 0.5 + uses * 0.25, uses ? "class usage" : "css");
          if (BUTTONISH.test(sel) && /background/.test(d.prop)) clusterAdd(pool, c, 8, "button rule");
          if (/(^|[\s,>(])a\b(?![\w-])/.test(sel) && d.prop === "color") clusterAdd(pool, c, 3, "link rule");
        }
      }
    }
  }
  pool.forEach((p) => { if (deltaE(p.color, paper) < 0.08 || deltaE(p.color, ink) < 0.05) p.score = 0; });
  pool.sort((a, b) => b.score - a.score);

  let accent, accentFrom;
  const top = pool[0];
  if (top && top.score >= 4) {
    accent = top.color;
    accentFrom = [...top.sources].filter((s) => s !== "css" && s !== "class usage").join(", ") || (top.sources.has("class usage") ? "the saturated colour the page's classes use most" : "most frequent saturated colour in the CSS");
  } else if (neutralButtons.length) {
    accent = neutralButtons[0];
    accentFrom = "button background (monochrome site)";
  } else {
    accent = ink;
    accentFrom = "ink (no brand colour found; monochrome site)";
  }
  note(`accent ${toHex(accent)} from ${accentFrom}`);
  const extras = pool.filter((p) => p !== top && p.score >= 3 && deltaE(p.color, accent) > 0.08).slice(0, 3).map((p) => p.color);

  // ── fonts
  const fontUrls = [
    ...doc.elements.filter((e) => e.tag === "link" && e.attrs.href && /fonts\.(googleapis\.com|bunny\.net)/.test(e.attrs.href)).map((e) => e.attrs.href),
    ...(info.imports || []).map((x) => x.href).filter((h) => /fonts\.(googleapis\.com|bunny\.net)/.test(h)),
  ];
  const linked = googleFamilies(fontUrls);
  const bodyFamilies = familiesOf(bodyCs.get("font-family") || rootCs.get("font-family") || "");
  const varFont = (re) => { for (const [n, v] of vars) if (re.test(n)) { const f = familiesOf(resolveVars(v, vars)); if (f.length) return f; } return []; };
  const codeEl = makeEl("code", {}, doc.body);
  const codeCs = computed(codeEl);
  const monoFamilies = [...(codeCs.own.has("font-family") ? familiesOf(codeCs.get("font-family")) : []), ...varFont(/^--(font-)?(mono|code)|--font-family-mono|--mono-font/i)];
  let sansFamilies = bodyFamilies.length ? bodyFamilies : varFont(/^--(font-)?(sans|body|base|text)|--font-family(-base|-sans)?$/i);
  // body set only a system stack (Tailwind preflight): use the face the page's text elements actually get
  const firstNamed = (list) => list.find((f) => !GENERIC.has(f.toLowerCase()) && !EMOJI.test(f));
  if (!firstNamed(sansFamilies) || SYSTEM.test(firstNamed(sansFamilies))) {
    const tally = new Map();
    const W = { p: 1, li: 1, a: 0.6, span: 0.4, h1: 0.5, h2: 0.5, h3: 0.5, td: 0.5, label: 0.5, button: 0.5, div: 0.2, main: 0.5, section: 0.3, article: 0.5 };
    for (const el of doc.elements.slice(0, 1500)) {
      if (!(el.tag in W)) continue;
      const fams = familiesOf(computed(el).get("font-family") || "");
      const f = firstNamed(fams);
      if (!f || SYSTEM.test(f) || kindOf(f) === "m") continue;
      tally.set(f, { w: (tally.get(f)?.w || 0) + W[el.tag], fams });
    }
    const best = [...tally.entries()].sort((a, b) => b[1].w - a[1].w)[0];
    if (best) { sansFamilies = best[1].fams; note(`body only sets a system font stack; "${best[0]}" is the face most text uses`); }
  }

  const sans = resolveFont(sansFamilies, "s", linked);
  const mono = resolveFont(monoFamilies, "m", linked);

  // ── radius: the first button-like element with a radius, else --radius, else defaults
  const toRadius = (v) => {
    if (!v) return null;
    const first = v.trim().split(/\s+/)[0];
    if (/%$/.test(first)) return parseFloat(first) >= 30 ? 9999 : null;
    const n = parseFloat(first);
    if (Number.isNaN(n)) return null;
    return /r?em$/.test(first) ? n * 16 : /px$/.test(first) || n === 0 ? n : null;
  };
  let r = null, rFrom = "";
  for (const el of buttons) { const v = toRadius(computed(el).get("border-radius")); if (v !== null) { r = v; rFrom = "button border-radius"; break; } }
  if (r === null) for (const rule of rules) {
    if (!BUTTONISH.test(rule.selectors.join(","))) continue;
    const d = rule.decls.find((x) => x.prop === "border-radius");
    const v = d && toRadius(resolveVars(d.value, vars));
    if (v !== null && v !== undefined) { r = v; rFrom = "button rule border-radius"; break; }
  }
  if (r === null) { const v = toRadius(resolveVars(vars.get("--radius") || "", vars)); if (v !== null) { r = v; rFrom = "--radius"; } }
  return deriveTokens({ url, title: doc.title, paper, ink, accent, accentFrom, extras, fonts: { sans, mono }, radiusPx: r, radiusFrom: rFrom, notes });
}
