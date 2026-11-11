/* site-motion UI kit: the parts every product-UI demo needs, built once so each scene only writes its story.
 * A scene asks for it with `// @vendor ui-kit`, then in setup:
 *
 *   const kit = SMUI.kit({ root, h, tokens, width, height }); // kit.world is the layer the camera moves
 *   const app = kit.frame("browser", { url: "acme.com", x: 200, y: 90, w: 1200, h: 720 });
 *   el("button", "...", app.body, "Send").dataset.ui = "send";  // name what the cursor and camera aim at
 *   kit.cursor(content.cursor);                                // [{ at, to: "send", click: true }, …]
 *   kit.camera(content.camera);                                // [{ at, dur, zoom, focus: "send" }, …]
 *
 * and in render(t): kit.render(t), plus kit.pressed(t, "send") / kit.clickedAt("send") for the button's own
 * response. Everything is a pure function of t, so a demo plays live and exports frame-exact like every scene.
 *
 * Beyond that the kit carries parts (button, toggle, tabs, menu, toast, code, chart, thread, keyboard…), small moves
 * (roll, stream, collapse, connector, fly), extra pointers and drags, annotations, grounds and a fidelity setting.
 * SKILL.md lists them all.
 *
 * Targets are measured from layout (offsetLeft/offsetTop up to the world), never from the screen, so a target
 * that is mid-animation or under the camera's zoom is still found where it sits in the design. They are
 * measured again once web fonts have loaded, because text reflows when the real face arrives.
 */
(function () {
  "use strict";

  // Every value that a style pack can change goes through its variable, with the native value as fallback.
  const CSS = `
.ui-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.ui-frame { position: absolute; background: var(--c-surface); overflow: hidden;
  border-radius: var(--sm-radius-lg, var(--r-lg));
  box-shadow: 0 0 0 var(--sm-stroke-hair, 1px) var(--sm-stroke-color, color-mix(in srgb, var(--c-ink) 14%, transparent)),
    var(--sm-shadow-3, 0 40px 80px -40px color-mix(in srgb, var(--c-ink) 45%, transparent)); }
.ui-bar { position: relative; height: 46px; display: flex; align-items: center; gap: 16px; padding: 0 18px;
  background: var(--c-raised); box-shadow: inset 0 calc(-1 * var(--sm-stroke-hair, 1px)) 0 var(--c-line); }
.ui-dots { display: flex; gap: 7px; }
.ui-dots i { width: 11px; height: 11px; border-radius: 50%; background: color-mix(in srgb, var(--c-ink) 16%, var(--c-raised)); }
.ui-url { position: absolute; left: 50%; top: 9px; transform: translateX(-50%); min-width: 300px; height: 28px; padding: 0 16px;
  display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: var(--sm-radius-sm, var(--r-sm));
  background: var(--c-surface); color: var(--c-muted); font: 13px/1 var(--font-mono); white-space: nowrap; }
.ui-url b { width: 9px; height: 11px; border-radius: 2px; background: var(--c-muted); position: relative; top: 1px; }
.ui-url b::before { content: ""; position: absolute; left: 1.5px; top: -5px; width: 6px; height: 6px; border-radius: 4px 4px 0 0;
  box-shadow: inset 0 0 0 1.5px var(--c-muted); }
.ui-title { position: absolute; left: 0; right: 0; text-align: center; color: var(--c-muted); font: 500 13px/1 var(--font-sans); }
.ui-body { position: absolute; left: 0; right: 0; bottom: 0; top: 46px; }
.ui-frame.is-phone { border-radius: 58px; background: var(--ui-bezel, var(--c-ink));
  box-shadow: 0 0 0 var(--sm-stroke-hair, 1px) color-mix(in srgb, var(--c-ink) 60%, var(--c-paper)),
    var(--sm-shadow-3, 0 50px 90px -40px color-mix(in srgb, var(--c-ink) 55%, transparent)); }
.ui-screen { position: absolute; inset: 11px; border-radius: 47px; overflow: hidden; background: var(--c-paper); }
.ui-status { position: absolute; left: 0; right: 0; top: 0; height: 54px; display: flex; align-items: center; justify-content: space-between;
  padding: 6px 30px 0 40px; font: 600 16px/1 var(--font-sans); color: var(--c-ink); z-index: 5; }
.ui-status span:last-child { display: flex; gap: 6px; align-items: center; }
.ui-signal { display: flex; gap: 2px; align-items: flex-end; height: 12px; }
.ui-signal i { width: 3px; border-radius: 1px; background: currentColor; }
.ui-battery { width: 25px; height: 12px; border-radius: 4px; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, currentColor 45%, transparent); padding: 2px; }
.ui-battery i { display: block; width: 75%; height: 100%; border-radius: 2px; background: currentColor; }
.ui-island { position: absolute; left: 50%; top: 11px; width: 122px; height: 35px; margin-left: -61px; border-radius: 999px; background: var(--ui-bezel, var(--c-ink)); z-index: 6; }
.ui-home { position: absolute; left: 50%; bottom: 9px; width: 136px; height: 5px; margin-left: -68px; border-radius: 999px; background: var(--c-ink); opacity: .85; z-index: 6; }
.ui-cursor { position: absolute; left: 0; top: 0; z-index: 40; pointer-events: none; }
.ui-cursor svg { display: block; position: relative; filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--c-ink) 30%, transparent)); }
.ui-ripple { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
  box-shadow: 0 0 0 2px var(--c-accent); opacity: 0; }
.ui-touch { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px; border-radius: 50%;
  background: color-mix(in srgb, var(--c-ink) 22%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-surface) 80%, transparent); }
.ui-caret { display: inline-block; width: 2px; height: 1.15em; margin-left: 1px; vertical-align: -0.2em; background: var(--c-accent-fill, var(--c-accent)); }
.ui-cursor-tag { position: absolute; left: 20px; top: 24px; padding: 4px 9px; border-radius: 7px; font: 600 13px/1.2 var(--font-sans); white-space: nowrap; }
.ui-frame.is-glass { background: color-mix(in srgb, var(--c-surface) 72%, transparent); backdrop-filter: blur(22px) saturate(1.3); }
.ui-frame.is-glass .ui-bar { background: color-mix(in srgb, var(--c-raised) 60%, transparent); }
.ui-frame.is-terminal { background: var(--ui-bezel, var(--c-ink)); color: var(--ui-term-ink, var(--c-paper)); --ui-code-k: var(--ui-accent-on-bezel, var(--c-accent)); --ui-code-dim: var(--ui-term-dim, var(--c-faint)); }
.ui-frame.is-terminal .ui-bar { background: color-mix(in srgb, var(--ui-term-ink, var(--c-paper)) 8%, var(--ui-bezel, var(--c-ink))); box-shadow: none; }
.ui-frame.is-terminal .ui-title { color: var(--ui-term-dim, var(--c-faint)); font-family: var(--font-mono); }
.ui-frame.is-terminal .ui-dots i { background: color-mix(in srgb, var(--ui-term-ink, var(--c-paper)) 26%, transparent); }
.ui-frame.is-terminal .ui-body { font: 16px/1.6 var(--font-mono); padding: 20px 24px; }
.ui-nav { display: flex; gap: 12px; color: var(--c-muted); }
.ui-nav svg { display: block; }
.ui-ground { position: absolute; inset: 0; }
.ui-ground.is-dots { background-image: radial-gradient(color-mix(in srgb, var(--c-ink) 16%, transparent) 1.4px, transparent 1.6px); background-size: 26px 26px; }
.ui-ground.is-grid { background-image: linear-gradient(var(--c-line) 1px, transparent 1px), linear-gradient(90deg, var(--c-line) 1px, transparent 1px); background-size: 56px 56px; }
.ui-ground.is-ruled { background-image: linear-gradient(var(--c-line) 1px, transparent 1px); background-size: 100% 44px; }
.ui-ground.is-blueprint { background-color: var(--ui-bezel, var(--c-ink)); background-image: linear-gradient(color-mix(in srgb, var(--c-accent) 26%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--c-accent) 26%, transparent) 1px, transparent 1px); background-size: 44px 44px; }
.ui-ground.is-glow { background: radial-gradient(70% 90% at 50% 110%, color-mix(in srgb, var(--c-accent) 34%, transparent), transparent 70%); }
.ui-ground.is-wash { background: linear-gradient(160deg, color-mix(in srgb, var(--c-accent) 18%, var(--c-paper)), var(--c-paper) 62%); }
.ui-ground.is-tint { background: color-mix(in srgb, var(--c-accent) 14%, var(--c-paper)); }
.ui-ground.is-stripes { background-image: repeating-linear-gradient(135deg, var(--c-line) 0 1px, transparent 1px 16px); }
.ui-filler { display: block; border-radius: 999px; background: color-mix(in srgb, var(--c-ink) 11%, transparent); }
.ui-filler.is-strong { background: color-mix(in srgb, var(--c-ink) 20%, transparent); }
.ui-frame.is-terminal .ui-filler { background: color-mix(in srgb, var(--ui-term-ink, var(--c-paper)) 16%, transparent); }
.ui-lines { display: flex; flex-direction: column; gap: 10px; }
.ui-card { background: var(--c-surface); border-radius: var(--sm-radius-md, var(--r-md, 12px)); box-shadow: inset 0 0 0 var(--sm-stroke-hair, 1px) var(--c-line); padding: 20px; }
.ui-row { display: flex; align-items: center; gap: 12px; min-height: 48px; font: 15px/1.3 var(--font-sans); color: var(--c-ink); box-shadow: inset 0 -1px 0 var(--c-line); }
.ui-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ui-row-sub { color: var(--c-muted); font-size: 13px; }
.ui-btn { display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 18px; border-radius: var(--sm-radius-sm, var(--r-sm)); font: 600 15px/1 var(--font-sans); background: var(--c-surface); color: var(--c-ink); box-shadow: inset 0 0 0 var(--sm-stroke-hair, 1px) var(--c-line); white-space: nowrap; }
.ui-btn.is-primary { background: var(--c-accent); color: var(--c-on-accent, var(--c-ink)); box-shadow: none; }
.ui-toggle { position: relative; display: inline-block; width: 44px; height: 26px; border-radius: 999px; background: color-mix(in srgb, var(--c-ink) 18%, var(--c-surface)); overflow: hidden; }
.ui-toggle b { position: absolute; inset: 0; background: var(--c-accent); opacity: 0; }
.ui-toggle i { position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--c-surface); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-ink) 35%, transparent); }
.ui-seg { position: relative; display: inline-flex; align-self: flex-start; padding: 3px; border-radius: var(--sm-radius-sm, var(--r-sm)); background: var(--c-raised); font: 500 14px/1 var(--font-sans); }
.ui-seg i { position: absolute; left: 0; top: 3px; bottom: 3px; border-radius: calc(var(--sm-radius-sm, var(--r-sm)) - 2px); background: var(--c-surface); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-ink) 18%, transparent); }
.ui-seg span { position: relative; padding: 8px 14px; color: var(--c-muted); white-space: nowrap; }
.ui-seg span.is-on { color: var(--c-ink); }
.ui-tabs { position: relative; display: flex; gap: 24px; font: 500 15px/1 var(--font-sans); box-shadow: inset 0 -1px 0 var(--c-line); }
.ui-tabs i { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--c-accent-fill, var(--c-accent)); }
.ui-tabs span { padding: 12px 0; color: var(--c-muted); white-space: nowrap; }
.ui-tabs span.is-on { color: var(--c-ink); }
.ui-badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; font: 600 12.5px/1 var(--font-sans); white-space: nowrap; background: var(--c-raised); color: var(--c-muted); }
.ui-badge.is-accent { background: var(--ui-tint, var(--c-raised)); color: var(--ui-tint-ink, var(--c-ink)); }
.ui-badge.is-good { background: var(--ui-good, var(--c-raised)); color: var(--ui-good-ink, var(--c-ink)); }
.ui-badge.is-warn { background: var(--ui-warn, var(--c-raised)); color: var(--ui-warn-ink, var(--c-ink)); }
.ui-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: var(--sm-radius-sm, var(--r-sm)); font: 500 13px/1 var(--font-sans); color: var(--c-ink); background: var(--c-surface); box-shadow: inset 0 0 0 var(--sm-stroke-hair, 1px) var(--c-line); white-space: nowrap; }
.ui-kbd { display: inline-flex; gap: 4px; }
.ui-kbd span { min-width: 24px; height: 24px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font: 500 12.5px/1 var(--font-sans); color: var(--c-muted); background: var(--c-raised); box-shadow: inset 0 -1px 0 var(--c-line), inset 0 0 0 1px var(--c-line); }
.ui-av { display: inline-flex; align-items: center; justify-content: center; flex: none; border-radius: 50%; font: 600 14px/1 var(--font-sans); }
.ui-menu { position: relative; padding: 6px; border-radius: var(--sm-radius-md, var(--r-md, 12px)); background: var(--c-surface); box-shadow: 0 0 0 1px var(--c-line), 0 18px 40px -18px color-mix(in srgb, var(--c-ink) 40%, transparent); font: 14px/1 var(--font-sans); }
.ui-menu > i { position: absolute; left: 6px; right: 6px; top: 0; border-radius: var(--sm-radius-sm, var(--r-sm)); background: var(--c-raised); }
.ui-menu > div { position: relative; display: flex; justify-content: space-between; gap: 18px; align-items: center; padding: 10px 12px; color: var(--c-ink); white-space: nowrap; }
.ui-pop { position: absolute; transform-origin: 50% 0; }
.ui-toast { position: absolute; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--sm-radius-md, var(--r-md, 12px)); background: var(--ui-bezel, var(--c-ink)); color: var(--ui-term-ink, var(--c-paper)); font: 500 14px/1 var(--font-sans); white-space: nowrap; }
.ui-toast b { color: var(--ui-accent-on-bezel, var(--c-accent)); font-weight: 600; }
.ui-code { font: 15px/1.7 var(--font-mono); color: inherit; }
.ui-code > div { position: relative; padding: 0 12px; white-space: pre; border-radius: 4px; }
.ui-code > div > u { position: absolute; inset: 0; border-radius: 4px; background: var(--ui-tint, var(--c-raised)); opacity: 0; text-decoration: none; }
.ui-code > div > span { position: relative; }
.ui-code .k { color: var(--ui-code-k, var(--c-accent-ink, var(--c-ink))); font-weight: 500; }
.ui-code .c { color: var(--ui-code-dim, var(--c-muted)); }
.ui-chart { display: block; overflow: visible; }
.ui-thread { display: flex; flex-direction: column; justify-content: flex-end; gap: 0; height: 100%; }
.ui-msg { overflow: hidden; display: flex; flex-direction: column; }
.ui-msg.is-me { align-items: flex-end; }
.ui-bubble { max-width: 76%; margin-bottom: 8px; padding: 10px 14px; border-radius: 18px; font: 15px/1.35 var(--font-sans); background: var(--c-raised); color: var(--c-ink); }
.ui-msg.is-me .ui-bubble { background: var(--c-accent); color: var(--c-on-accent, var(--c-ink)); }
.ui-keys { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 5px 30px; background: var(--c-raised); }
.ui-keys > div { display: flex; justify-content: center; gap: 5px; margin-bottom: 9px; }
.ui-keys span { position: relative; flex: 1; max-width: 33px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--c-surface); color: var(--c-ink); font: 400 19px/1 var(--font-sans); box-shadow: 0 1px 0 color-mix(in srgb, var(--c-ink) 28%, transparent); }
.ui-keys span.is-wide { max-width: 190px; font-size: 14px; }
.ui-island-in { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; color: var(--ui-term-ink, var(--c-paper)); font: 500 13px/1.2 var(--font-sans); opacity: 0; white-space: nowrap; }
.ui-note { position: relative; display: flex; gap: 10px; padding: 12px; border-radius: 20px; background: color-mix(in srgb, var(--c-surface) 88%, transparent); backdrop-filter: blur(18px); font: 14px/1.3 var(--font-sans); color: var(--c-ink); }
.ui-note b { display: block; font-weight: 600; }
.ui-roll { display: inline-flex; font-variant-numeric: tabular-nums; }
.ui-roll-c { position: relative; display: inline-block; overflow: hidden; height: 1.2em; line-height: 1.2em; vertical-align: bottom; }
.ui-roll-c span { position: absolute; left: 0; right: 0; top: 0; text-align: center; }
.ui-roll-c span.is-size { left: auto; right: auto; visibility: hidden; display: inline-block; white-space: pre; }
.ui-overlay { position: absolute; left: 0; top: 0; z-index: 25; overflow: visible; pointer-events: none; }
.ui-spot { position: absolute; left: 0; top: 0; z-index: 30; pointer-events: none; opacity: 0;
  box-shadow: 0 0 0 4000px color-mix(in srgb, var(--c-ink) 26%, transparent), 0 0 0 2px var(--c-accent-fill, var(--c-accent)); }
.ui-callout { position: absolute; left: 0; top: 0; z-index: 35; display: inline-flex; align-items: center; gap: 10px; padding: 10px 15px; border-radius: 12px; opacity: 0; white-space: nowrap;
  background: var(--ui-bezel, var(--c-ink)); color: var(--ui-term-ink, var(--c-paper)); font: 500 16px/1.2 var(--font-sans); box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--c-ink) 60%, transparent); }
.ui-callout i { width: 8px; height: 8px; border-radius: 50%; background: var(--ui-accent-on-bezel, var(--c-accent)); }
.ui-pin { position: absolute; left: 0; top: 0; z-index: 35; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0;
  background: var(--c-accent); color: var(--c-on-accent, var(--c-ink)); font: 600 13px/1 var(--font-sans); box-shadow: 0 0 0 3px var(--c-surface); }
`;

  function inject() {
    if (document.getElementById("sm-ui-kit")) return;
    const node = document.createElement("style");
    node.id = "sm-ui-kit";
    node.textContent = CSS;
    document.head.prepend(node); // before the scene's own CSS, so a scene can override any of it
  }

  // a 0 → 1 → 0 bump of length `len` starting at `at` (quick in, softer out): a press, a tap
  const bump = (t, at, len, h) => {
    const p = (t - at) / len;
    if (p <= 0 || p >= 1) return 0;
    return p < 0.35 ? h.ease.snappy(p / 0.35) : 1 - h.ease.soft((p - 0.35) / 0.65);
  };

  function kit({ root, h, width, height, tokens, fidelity = "standard" }) {
    inject();
    const { el, svg, ease, clamp, lerp } = h;
    // colours every demo needs that no token names, mixed once and checked for AA in this brand (light or dark):
    //   --ui-tint / --ui-tint-ink        a status pill ("Invited", "+24%"): the accent at 20% on the surface, and text that reads on it
    //   --ui-accent-on-ink               accent text on an ink surface (a toast's "Undo", a tooltip's highlight)
    if (tokens && tokens.color) {
      const C = tokens.color, tint = h.mix(C.surface, C.accent, 0.2);
      root.style.setProperty("--ui-tint", tint);
      root.style.setProperty("--ui-tint-ink", h.textOn(tint, C.accentInk));
      root.style.setProperty("--ui-accent-on-ink", h.textOn(C.ink, C.accent));
      // hardware stays dark in every theme: a phone's bezel is the darker of ink and paper, never a light ink
      const lum = window.SMTokens ? SMTokens.lum : () => 0;
      root.style.setProperty("--ui-bezel", lum(C.ink) <= lum(C.paper) ? C.ink : h.mix(C.paper, "#000000", 0.35));
      // text on that dark hardware (terminals, toasts, callouts), and status tints that read in this brand
      const bezel = lum(C.ink) <= lum(C.paper) ? C.ink : h.mix(C.paper, "#000000", 0.35);
      const termInk = h.textOn(bezel, lum(C.paper) >= lum(C.ink) ? C.paper : C.ink);
      root.style.setProperty("--ui-term-ink", termInk);
      root.style.setProperty("--ui-term-dim", h.textOn(bezel, h.mix(termInk, bezel, 0.32)));
      root.style.setProperty("--ui-accent-on-bezel", h.textOn(bezel, C.accent));
      const goodTint = h.mix(C.surface, C.positive || C.accent, 0.2), warnTint = h.mix(C.surface, C.warning || C.accent, 0.22);
      root.style.setProperty("--ui-good", goodTint);
      root.style.setProperty("--ui-good-ink", h.textOn(goodTint, C.ink));
      root.style.setProperty("--ui-warn", warnTint);
      root.style.setProperty("--ui-warn-ink", h.textOn(warnTint, C.ink));
    }
    const W = width || 1600, H = height || 900;
    // the view: normally the whole design; a card, compact or strip build shows part of it (see render)
    const VW = parseFloat(root.style.width) || W, VH = parseFloat(root.style.height) || H;
    const cropped = VW !== W || VH !== H, base = cropped ? Math.max(VW / W, VH / H) : 1;
    root.classList.add("ui-fidelity-" + fidelity);
    const world = el("div", "ui-world", root);
    world.style.width = W + "px";
    world.style.height = H + "px";

    // ---------- targets: named elements, measured from layout ----------
    let cache = new Map(), measuredWith = null;
    const fontsState = () => (document.fonts ? document.fonts.status : "loaded");
    function rect(name) {
      if (fontsState() !== measuredWith) { cache = new Map(); measuredWith = fontsState(); }
      if (cache.has(name)) return cache.get(name);
      const node = world.querySelector(`[data-ui="${name}"]`);
      if (!node) throw new Error(`site-motion ui-kit: no element with data-ui="${name}"`);
      let x = 0, y = 0, n = node;
      while (n && n !== world) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      const r = { x, y, w: node.offsetWidth, h: node.offsetHeight };
      cache.set(name, r);
      return r;
    }
    // a point: [x, y] in world pixels, or a target's anchor (default its centre)
    function point(to, anchor) {
      if (Array.isArray(to)) return to;
      const r = rect(to), a = anchor || [0.5, 0.5];
      return [r.x + r.w * a[0], r.y + r.h * a[1]];
    }

    // ---------- frames ----------
    let mainFrame = null;
    const w0 = (o, kind) => o.w ?? (kind === "phone" ? 400 : 1200), h0 = (o, kind) => o.h ?? (kind === "phone" ? 820 : 720);
    function frame(kind, o = {}) {
      const node = el("div", "ui-frame" + (kind === "phone" ? " is-phone" : kind === "terminal" ? " is-terminal" : "") + (o.glass ? " is-glass" : ""), o.parent || world);
      if (!o.parent && (!mainFrame || w0(o, kind) * h0(o, kind) > mainFrame.w * mainFrame.h)) mainFrame = { x: o.x ?? (W - w0(o, kind)) / 2, w: w0(o, kind), h: h0(o, kind) };
      if (o.float) node.dataset.framing = "float"; // a deliberate floating layout (a pair of devices, a tilted stack): exempt from the framing check
      const w = o.w ?? (kind === "phone" ? 400 : 1200), hh = o.h ?? (kind === "phone" ? 820 : 720);
      Object.assign(node.style, { left: (o.x ?? (W - w) / 2) + "px", top: (o.y ?? (H - hh) / 2) + "px", width: w + "px", height: hh + "px" });
      if (o.name) node.dataset.ui = o.name;
      if (kind === "phone") {
        const screen = el("div", "ui-screen", node);
        const status = el("div", "ui-status", screen);
        el("span", "", status, o.time || "9:41");
        const right = el("span", "", status);
        const sig = el("span", "ui-signal", right);
        [5, 7, 9, 12].forEach((px) => { el("i", "", sig).style.height = px + "px"; });
        el("i", "", el("span", "ui-battery", right));
        const islandNode = el("div", "ui-island", screen);
        el("div", "ui-home", screen);
        return { node, body: screen, screen, status, island: islandNode };
      }
      const bar = el("div", "ui-bar", node);
      const dots = el("div", "ui-dots", bar);
      for (let i = 0; i < 3; i++) el("i", "", dots);
      if (fidelity === "realistic" && kind === "browser") {
        const nav = el("div", "ui-nav", bar);
        ["M9 2 L4 7 L9 12", "M5 2 L10 7 L5 12"].forEach((d) => svg("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("svg", { viewBox: "0 0 14 14", width: 14, height: 14 }, nav)));
      }
      if (kind === "browser") {
        const url = el("div", "ui-url", bar);
        el("b", "", url);
        el("span", "", url, o.url || "");
      } else el("div", "ui-title", bar, o.title || "");
      const body = el("div", "ui-body", node);
      return { node, bar, body };
    }

    // ---------- cursor ----------
    // beats: [{ at, to, click?, move?, anchor?, drag?, shape?, hide?, show? }] — `at` is when the pointer ARRIVES; it
    // leaves `move` seconds earlier (default from the distance), along a slight arc, the way a hand moves a mouse.
    // shape: arrow | text | hand | grab | resize. A target with data-cursor="text" sets it on arrival.
    // drag: "<name>" carries that element on this move; kit.dragged(t, name) gives its offset.
    // Several pointers can share a stage: cursor(beats, { label: "Agent", color: "#…" }); the first one leads.
    const pointers = [];
    // sm-native: pointers are drawn the way operating systems draw them, ink with a light keyline. x, y place the hot spot.
    const SHAPES = {
      arrow: { x: -3, y: -2, d: "M4 2.5 L4 22 L9.2 17.3 L12.6 25 L16.2 23.4 L12.9 15.8 L20 15.6 Z" },
      text: { x: -15, y: -15, line: "M10 4.5 h3 q1 0 1 1 q0-1 1-1 h3 M14 5.5 V22.5 M10 23.5 h3 q1 0 1-1 q0 1 1 1 h3" },
      hand: { x: -14, y: -3, d: "M11 13V5.5a2 2 0 0 1 4 0V12l6 1.2c1.6.3 2.6 1.6 2.6 3.2L23 21c-.4 2.4-2.2 4-4.6 4h-3.2c-1.6 0-3-.7-4-2L6 17.2c-.9-1.1-.5-2.6.7-3.2 1-.5 2.1-.3 2.9.5L11 16Z" },
      grab: { x: -15, y: -14, d: "M8 12.5c0-1.6 2.4-2 3-.6.2-2 3.2-2 3.4-.1.4-1.7 3.4-1.4 3.4.5.6-1.2 3-.8 3 .9v5.6c0 3.5-2.5 6.2-6 6.2h-1.3c-2 0-3.7-1-4.7-2.7l-2.9-4.7c-.8-1.3 1-2.8 2.2-1.5L8 17.5Z" },
      resize: { x: -15, y: -15, d: "M4 14l5-5v3h10V9l5 5-5 5v-3H9v3z" },
    };
    function cursor(beats = [], o = {}) {
      const touch = o.kind === "touch";
      const node = el("div", "ui-cursor", world);
      const shapes = {};
      let ripple;
      if (touch) { el("span", "ui-touch", node); ripple = el("span", "ui-ripple", node); }
      else {
        ripple = el("span", "ui-ripple", node);
        const ink = o.color || "var(--c-ink)";
        for (const [k, s] of Object.entries(SHAPES)) {
          const g = svg("svg", { viewBox: "0 0 28 28", width: 30, height: 30, style: `left:${s.x}px;top:${s.y}px` + (k === "arrow" ? "" : ";position:absolute;opacity:0") }, node);
          if (s.d) svg("path", { d: s.d, fill: ink, stroke: "var(--c-surface)", "stroke-width": 1.6, "stroke-linejoin": "round" }, g);
          else { svg("path", { d: s.line, fill: "none", stroke: "var(--c-surface)", "stroke-width": 4.4, "stroke-linecap": "round" }, g); svg("path", { d: s.line, fill: "none", stroke: ink, "stroke-width": 2, "stroke-linecap": "round" }, g); }
          shapes[k] = g;
        }
      }
      if (o.label) {
        const tag = el("span", "ui-cursor-tag", node, o.label);
        const bg = o.color || (tokens && tokens.color.ink);
        if (bg) { tag.style.background = bg; if (tokens) tag.style.color = h.textOn(bg, tokens.color.paper); }
      }
      const list = [...beats].sort((a, b) => a.at - b.at);
      const start = o.start || [W * 0.5, H * 0.92];
      const clicks = [];
      let prevAt = -Infinity;
      for (const b of list) {
        if (b.click) clicks.push({ t: b.at + 0.06, name: typeof b.to === "string" ? b.to : b.click === true ? null : b.click });
        b._prevAt = prevAt;
        if (b.to != null) prevAt = b.at;
      }
      const P = { node, ripple, shapes, list, start, clicks, touch, hidden: !!o.hidden, seed: o.seed || 1 };
      pointers.push(P);
      return P;
    }

    // each move as { b, from, target, dist, depart }, worked out once (and again when fonts load, since targets reflow)
    function pathOf(P) {
      const key = fontsState();
      if (P.path && P.pathKey === key) return P.path;
      const path = [];
      let from = P.start;
      for (const b of P.list) {
        if (b.to == null) continue;
        const target = point(b.to, b.anchor);
        const dist = Math.hypot(target[0] - from[0], target[1] - from[1]);
        const move = b.move ?? clamp(0.42 + dist / 1900, 0.42, 1.05);
        path.push({ b, from, target, dist, depart: Math.max(b.at - move, b._prevAt + 0.05) });
        from = target;
      }
      P.path = path;
      P.pathKey = key;
      return path;
    }

    function cursorAt(P, t) {
      // visibility: each hide/show beat fades toward its state over a quarter second
      let visible = P.hidden ? 0 : 1;
      for (const b of P.list) if ((b.hide || b.show) && t >= b.at) visible = lerp(visible, b.hide ? 0 : 1, ease.soft(clamp((t - b.at) / 0.25)));
      let pos = P.start;
      for (const { b, from, target, dist, depart } of pathOf(P)) {
        if (t < depart) break;
        if (t >= b.at) { pos = target; continue; }
        const p = ease.inOut(clamp((t - depart) / (b.at - depart)));
        // an arc bowing to one side by up to 6% of the distance, so the path reads as a hand, not a ruler
        const nx = -(target[1] - from[1]) / (dist || 1), ny = (target[0] - from[0]) / (dist || 1);
        const bow = b.drag ? 0 : Math.sin(Math.PI * p) * dist * 0.06;
        pos = [lerp(from[0], target[0], p) + nx * bow, lerp(from[1], target[1], p) + ny * bow];
        break;
      }
      return { pos, visible };
    }

    // 0..1: is the pointer doing something (on its way to a click or drag, or just after one)? An idle pointer doesn't steer a crop
    function workingAt(P, t) {
      const moves = pathOf(P).filter((m) => m.b.click || m.b.drag);
      let v = 0;
      moves.forEach((m, i) => { const next = moves[i + 1]; const end = next && next.depart - m.b.at < 3.5 ? next.depart : m.b.at + 1.4; v = Math.max(v, h.span(t, m.depart - 0.2, end, 0.35, 0.5)); });
      return v;
    }

    // the shape showing at t, with how far it has faded in (shapes change just before the pointer arrives)
    function shapeAt(P, t) {
      let now = "arrow", prev = "arrow", at = -Infinity;
      const change = (shape, when) => { if (shape !== now && t >= when) { prev = now; now = shape; at = when; } };
      const moves = pathOf(P);
      for (const b of P.list) {
        if (b.shape && b.to == null) { change(b.shape, b.at); continue; }
        if (b.to == null) continue;
        const named = typeof b.to === "string" ? world.querySelector(`[data-ui="${b.to}"]`) : null;
        if (b.drag) { const m = moves.find((x) => x.b === b); change("grab", m.depart - 0.14); change(b.shape || "hand", b.at + 0.1); continue; }
        change(b.shape || (named && named.dataset.cursor) || "arrow", b.at - 0.14);
      }
      return { now, prev, p: clamp((t - at) / 0.1) };
    }

    // press depth (0..1) of a click on `name` at time t: the target's own response, keyed to the cursor's click
    function pressed(t, name) {
      let v = 0;
      for (const P of pointers) for (const c of P.clicks) if (c.name === name) v = Math.max(v, bump(t, c.t - 0.02, 0.26, h));
      return v;
    }
    // when the cursor clicks `name` (the n-th time, from 0), or null
    const clickedAt = (name, n = 0) => (pointers.flatMap((P) => P.clicks).filter((c) => c.name === name).sort((a, b) => a.t - b.t)[n] || {}).t ?? null;

    // how far a drag has carried `name` at t: { x, y, lift } in world px; lift is 0..1 while it is held
    function dragged(t, name) {
      let x = 0, y = 0, lift = 0;
      for (const P of pointers) for (const { b, from, target, depart } of pathOf(P)) {
        if (b.drag !== name || t < depart - 0.14) continue;
        const p = ease.inOut(clamp((t - depart) / (b.at - depart)));
        x += (target[0] - from[0]) * p;
        y += (target[1] - from[1]) * p;
        lift = Math.max(lift, h.span(t, depart - 0.14, b.at + 0.05, 0.14, 0.2));
      }
      return { x, y, lift };
    }

    // ---------- camera ----------
    // keys: [{ at, dur, zoom, focus: name | [x, y], anchor?, offset?: [dx, dy], ease? }]; it starts framed on the whole stage.
    let cam = null;
    function camera(keys = [], o = {}) { cam = { keys: [...keys].sort((a, b) => a.at - b.at), clampEdges: o.clamp !== false }; return cam; }
    function cameraAt(t) {
      let z = 1, f = [W / 2, H / 2];
      if (!cam) return { z, f };
      for (const k of cam.keys) {
        if (t < k.at) break;
        const tz = k.zoom ?? 1, at = k.focus != null ? point(k.focus, k.anchor) : [W / 2, H / 2];
        const tf = k.offset ? [at[0] + k.offset[0], at[1] + k.offset[1]] : at; // offset: frame the target off-centre
        const p = (ease[k.ease || "inOut"] || ease.inOut)(clamp((t - k.at) / (k.dur || 1)));
        // zoom in log space, so a push from 1 to 2 feels as even as 2 to 4
        z = Math.exp(lerp(Math.log(z), Math.log(tz), p));
        f = [lerp(f[0], tf[0], p), lerp(f[1], tf[1], p)];
      }
      return { z, f };
    }

    function render(t) {
      let { z, f } = cameraAt(t);
      if (cropped) {
        // a smaller view (card, compact, strip) shows part of the design: the zoom is tempered, and the crop
        // follows the hand, averaged over the last half second so it glides (a key with `fixed: true` opts out)
        z = base * clamp(z, 1, 1.3);
        const lead = pointers[0];
        if (lead && !(cam && cam.keys.some((k) => k.fixed))) {
          let ax = 0, ay = 0;
          for (let i = 0; i < 8; i++) { const q = cursorAt(lead, Math.max(0, t - i * 0.07)).pos; ax += q[0] / 8; ay += q[1] / 8; }
          const v = cursorAt(lead, t).visible * workingAt(lead, t);
          f = [lerp(f[0], ax, v), lerp(f[1], ay, v)];
        }
      }
      let tx = VW / 2 - f[0] * z, ty = VH / 2 - f[1] * z;
      if (cropped || (cam && cam.clampEdges && z >= 1)) { tx = clamp(tx, VW - W * z, 0); ty = clamp(ty, VH - H * z, 0); }
      // a crop stays on the product: it never slides past the sides of the main window into empty stage
      if (cropped && mainFrame && mainFrame.w * z >= VW) tx = clamp(tx, VW - (mainFrame.x + mainFrame.w) * z, -mainFrame.x * z);
      world.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${z.toFixed(4)})`;
      for (const b of buttons) b.node.style.transform = `scale(${(1 - pressed(t, b.name) * 0.05).toFixed(3)})`;
      renderNotes(t);
      for (const P of pointers) {
        const { pos, visible } = cursorAt(P, t);
        const click = P.clicks.reduce((v, c) => Math.max(v, bump(t, c.t - 0.04, 0.24, h)), 0);
        P.node.style.transform = `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px) scale(${(1 - click * (P.touch ? 0.18 : 0.12)).toFixed(3)})`;
        P.node.style.opacity = visible.toFixed(3);
        if (!P.touch) {
          const s = shapeAt(P, t);
          for (const [k, g] of Object.entries(P.shapes)) g.style.opacity = k === s.now ? s.p.toFixed(3) : k === s.prev ? (1 - s.p).toFixed(3) : "0";
        }
        // ripple: the most recent click, expanding and fading over half a second
        const last = P.clicks.filter((c) => t >= c.t && t < c.t + 0.5).pop();
        const rp = last ? (t - last.t) / 0.5 : 1;
        P.ripple.style.opacity = last ? (0.9 * (1 - ease.soft(rp))).toFixed(3) : "0";
        P.ripple.style.transform = `scale(${(0.35 + ease.snappy(rp) * 1.1).toFixed(3)})`;
      }
    }

    // ---------- typing ----------
    // a field's text typed at `cps` from `start`, with a caret that shows while focused and blinks on whole
    // half-seconds of t (so the blink is a function of t, not of a timer)
    function field(parent, cls) {
      const node = el("div", cls || "", parent);
      const text = el("span", "", node);
      const caret = el("span", "ui-caret", node);
      return { node, text, caret };
    }
    function type(f, t, value, start, o = {}) {
      const cps = o.cps || 22, shown = h.typed(value, t, start, cps);
      h.text(f.text, t < start ? o.placeholder ?? "" : shown);
      f.node.classList.toggle("is-placeholder", t < start && !!o.placeholder);
      const done = start + value.length / cps;
      const focused = t >= start - 0.3 && t < (o.blurAt ?? Infinity);
      const blink = t < done + 0.1 ? 1 : Math.floor((t - done) * 2) % 2 === 0 ? 1 : 0;
      f.caret.style.opacity = focused ? String(blink) : "0";
      return clamp((t - start) / Math.max(0.001, done - start));
    }

    // ---------- annotations: spotlight, callouts, pins, in the world so they ride the camera ----------
    // annotate({ spotlight: [{ on, at, until, pad?, r? }], callouts: [{ to, text, at, until, side?, gap?, offset? }], pins: [{ to, n, at, until, anchor? }] })
    let notes = { spots: [], calls: [], pins: [] };
    function annotate(a = {}) {
      notes = {
        spots: (a.spotlight || []).map((s) => ({ ...s, node: el("div", "ui-spot", world) })),
        calls: (a.callouts || []).map((c) => { const node = el("div", "ui-callout", world); el("i", "", node); el("span", "", node, c.text); return { ...c, node }; }),
        pins: (a.pins || []).map((p) => ({ ...p, node: el("div", "ui-pin", world, String(p.n)) })),
      };
      return notes;
    }
    function renderNotes(t) {
      for (const s of notes.spots) {
        const r = rect(s.on), pad = s.pad ?? 8;
        Object.assign(s.node.style, { width: r.w + 2 * pad + "px", height: r.h + 2 * pad + "px", borderRadius: (s.r ?? 12) + "px", transform: `translate(${r.x - pad}px, ${r.y - pad}px)` });
        s.node.style.opacity = h.span(t, s.at, s.until, 0.5, 0.45).toFixed(3);
      }
      for (const c of notes.calls) {
        const on = h.span(t, c.at, c.until, 0.45, 0.35), r = rect(c.to), side = c.side || "right", gap = c.gap ?? 16;
        const nw = c.node.offsetWidth, nh = c.node.offsetHeight;
        let x = r.x + r.w / 2 - nw / 2, y = r.y + r.h + gap;
        if (side === "right") { x = r.x + r.w + gap; y = r.y + r.h / 2 - nh / 2; }
        else if (side === "left") { x = r.x - gap - nw; y = r.y + r.h / 2 - nh / 2; }
        else if (side === "top") y = r.y - gap - nh;
        if (c.offset) { x += c.offset[0]; y += c.offset[1]; }
        const rise = (1 - on) * 8;
        c.node.style.transform = `translate(${(x + (side === "right" ? rise : side === "left" ? -rise : 0)).toFixed(1)}px, ${(y + (side === "bottom" ? rise : side === "top" ? -rise : 0)).toFixed(1)}px) scale(${(0.94 + on * 0.06).toFixed(3)})`;
        c.node.style.opacity = on.toFixed(3);
      }
      for (const p of notes.pins) {
        const on = h.span(t, p.at, p.until, 0.3, 0.3), [x, y] = point(p.to, p.anchor || [1, 0]);
        p.node.style.transform = `translate(${x - 13}px, ${y - 13}px) scale(${(0.6 + ease.signature(on) * 0.4).toFixed(3)})`;
        p.node.style.opacity = on.toFixed(3);
      }
    }

    // ---------- grounds: what the stage shows behind the frame ----------
    // dots, grid, ruled, blueprint, glow, wash, tint, stripes
    function ground(kind) { const n = el("div", "ui-ground is-" + kind); root.insertBefore(n, world); return n; }

    // ---------- parts: each takes its parent first; opts.name makes it a target, opts.cursor sets the pointer over it ----------
    const tag = (n, o) => { if (o && o.name) n.dataset.ui = o.name; if (o && o.cursor) n.dataset.cursor = o.cursor; return n; };
    const size = (v) => (typeof v === "number" ? v + "px" : v);
    function filler(parent, o = {}) {
      const n = el("i", "ui-filler" + (o.strong ? " is-strong" : ""), parent);
      n.style.width = size(o.w ?? "60%");
      n.style.height = size(o.h ?? 10);
      return n;
    }
    const lines = (parent, widths = ["100%", "86%", "62%"], o = {}) => { const n = el("div", "ui-lines", parent); widths.forEach((w) => filler(n, { ...o, w })); return n; };
    // words only where the story is: at fidelity "minimal", anything not marked { story: true } becomes a filler bar of the same length
    function label(parent, text, o = {}) {
      if (fidelity === "minimal" && !o.story) { const fs = o.size || 14; return filler(parent, { w: Math.round(String(text).length * fs * 0.52), h: Math.round(fs * 0.62) }); }
      return tag(el(o.tag || "span", o.cls || "", parent, text), o);
    }
    const card = (parent, o = {}) => tag(el("div", "ui-card" + (o.cls ? " " + o.cls : ""), parent), o);
    function row(parent, o = {}) {
      const n = tag(el("div", "ui-row", parent), o);
      const lead = o.lead ? el("span", "", n) : null;
      if (o.lead) o.lead(lead);
      const main = el("div", "ui-row-main", n);
      label(main, o.text, { story: o.story });
      if (o.sub) label(main, o.sub, { cls: "ui-row-sub", size: 13, story: o.story });
      if (o.trail) { const tr = el("span", "", n); if (typeof o.trail === "function") o.trail(tr); else tr.textContent = o.trail; }
      return n;
    }
    const buttons = [];
    // a button answers its own click: kit.render presses it; don't set its transform in the scene
    function button(parent, text, o = {}) {
      const n = tag(el("div", "ui-btn" + (o.primary ? " is-primary" : ""), parent, text), { cursor: "hand", ...o });
      if (o.name) buttons.push({ node: n, name: o.name });
      return n;
    }
    function toggle(parent, o = {}) {
      const node = tag(el("span", "ui-toggle", parent), { cursor: "hand", ...o });
      const fill = el("b", "", node), knob = el("i", "", node);
      return { node, render(p) { fill.style.opacity = p.toFixed(3); knob.style.transform = `translateX(${(p * 18).toFixed(2)}px)`; } };
    }
    // segmented and tabs share one indicator that slides between options: render(from, to, p)
    function slider(cls, parent, items, o) {
      const node = tag(el("div", cls, parent), o);
      const mark = el("i", "", node);
      const opts = items.map((text, i) => { const s = el("span", "", node, text); if (o.name) s.dataset.ui = o.name + "-" + i; s.dataset.cursor = "hand"; return s; });
      return { node, opts, render(from, to, p) {
        const a = opts[from], b = opts[to];
        mark.style.width = lerp(a.offsetWidth, b.offsetWidth, p).toFixed(1) + "px";
        mark.style.transform = `translateX(${lerp(a.offsetLeft, b.offsetLeft, p).toFixed(1)}px)`;
        opts.forEach((s, i) => s.classList.toggle("is-on", i === (p > 0.5 ? to : from)));
      } };
    }
    const segmented = (parent, items, o = {}) => slider("ui-seg", parent, items, o);
    const tabs = (parent, items, o = {}) => slider("ui-tabs", parent, items, o);
    const badge = (parent, text, o = {}) => tag(el("span", "ui-badge is-" + (o.tone || "neutral"), parent, text), o);
    const chip = (parent, text, o = {}) => tag(el("span", "ui-chip", parent, text), o);
    function kbd(parent, keys, o = {}) { const n = tag(el("span", "ui-kbd", parent), o); keys.forEach((k) => el("span", "", n, k)); return n; }
    function avatar(parent, name, o = {}) {
      const s = o.size || 32;
      const n = tag(el("span", "ui-av", parent, String(name).charAt(0).toUpperCase()), o);
      Object.assign(n.style, { width: s + "px", height: s + "px", fontSize: Math.round(s * 0.44) + "px" });
      if (tokens) { const bg = h.mix(tokens.color.surface, tokens.color.accent, 0.18 + ((o.i || 0) % 4) * 0.16); n.style.background = bg; n.style.color = h.textOn(bg, tokens.color.ink); }
      return n;
    }
    // render(from, to, p) slides the highlight between rows; -1 means none
    function menu(parent, items, o = {}) {
      const node = tag(el("div", "ui-menu", parent), o);
      const mark = el("i", "", node);
      const rows = items.map((it, i) => {
        const r = el("div", "", node);
        const text = typeof it === "string" ? it : it.text;
        el("span", "", r, text);
        if (it.hint) el("span", "ui-row-sub", r, it.hint);
        if (o.name) r.dataset.ui = o.name + "-" + i;
        r.dataset.cursor = "hand";
        return r;
      });
      return { node, rows, render(from, to, p) {
        const a = rows[Math.max(0, from)], b = rows[Math.max(0, to)];
        mark.style.height = a.offsetHeight + "px";
        mark.style.transform = `translateY(${lerp(a.offsetTop, b.offsetTop, p).toFixed(1)}px)`;
        mark.style.opacity = (from < 0 ? p : to < 0 ? 1 - p : 1).toFixed(3);
      } };
    }
    // anything that opens: fades and scales from its own origin; render(p)
    function popover(parent, o = {}) {
      const node = tag(el("div", "ui-pop", parent), o);
      Object.assign(node.style, { left: size(o.x ?? 0), top: size(o.y ?? 0), width: o.w != null ? size(o.w) : "" });
      return { node, render(p) { const q = ease.snappy(clamp(p)); node.style.opacity = q.toFixed(3); node.style.transform = `translateY(${((1 - q) * -6).toFixed(2)}px) scale(${(0.97 + q * 0.03).toFixed(4)})`; } };
    }
    function toast(parent, text, o = {}) {
      const node = tag(el("div", "ui-toast", parent), o);
      el("span", "", node, text);
      if (o.action) el("b", "", node, o.action);
      Object.assign(node.style, { left: size(o.x ?? "auto"), right: o.right != null ? size(o.right) : "", top: size(o.y ?? "auto"), bottom: o.bottom != null ? size(o.bottom) : "" });
      return { node, render(p) { node.style.opacity = p.toFixed(3); node.style.transform = `translateY(${((1 - p) * 14).toFixed(2)}px)`; } };
    }
    // code lines, a string each, lightly coloured: keywords and comments. mark(i, p) tints line i
    const KEYWORDS = /\b(const|let|var|function|return|if|else|for|await|async|import|from|export|class|new|def|select|where|true|false|null)\b/g;
    function code(parent, src, o = {}) {
      const node = tag(el("div", "ui-code", parent), o);
      const rows = src.map((line, i) => {
        const r = el("div", "", node);
        if (o.name) r.dataset.ui = o.name + "-" + i;
        const under = el("u", "", r);
        const body = el("span", "", r);
        const comment = line.match(/^(.*?)((?:\/\/|#).*)$/);
        const head = comment ? comment[1] : line;
        let last = 0;
        for (const m of head.matchAll(KEYWORDS)) { if (m.index > last) body.append(head.slice(last, m.index)); el("span", "k", body, m[0]); last = m.index + m[0].length; }
        body.append(head.slice(last) || (line ? "" : " "));
        if (comment) el("span", "c", body, comment[2]);
        return { node: r, under };
      });
      return { node, rows, mark(i, p) { rows[i].under.style.opacity = p.toFixed(3); } };
    }
    // a line chart from values; render(p) draws it, at(f) is the point f (0..1) along it in the chart's own px
    function chart(parent, values, o = {}) {
      const w = o.w ?? 400, hh = o.h ?? 140, lo = Math.min(...values), hi = Math.max(...values), pad = 6;
      const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (1 - (v - lo) / (hi - lo || 1)) * (hh - 2 * pad)]);
      const node = svg("svg", { class: "ui-chart", viewBox: `0 0 ${w} ${hh}`, width: w, height: hh }, parent);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const area = svg("path", { d: `${d} L${w} ${hh} L0 ${hh} Z`, fill: "var(--ui-tint, var(--c-raised))", opacity: 0 }, node);
      const line = svg("path", { d, fill: "none", stroke: "var(--c-accent-fill, var(--c-accent))", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, node);
      return { node, render(p) { line.setAttribute("stroke-dashoffset", (1 - p).toFixed(4)); area.setAttribute("opacity", (p * p).toFixed(3)); },
        at(f) { const x = clamp(f) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)); return [lerp(pts[i][0], pts[i + 1][0], x - i), lerp(pts[i][1], pts[i + 1][1], x - i)]; } };
    }
    // messages arrive at the bottom and push the rest up: render(t, times), one arrival time per message
    function thread(parent, msgs, o = {}) {
      const node = tag(el("div", "ui-thread", parent), o);
      const items = msgs.map((m) => { const w = el("div", "ui-msg" + (m.me ? " is-me" : ""), node); el("div", "ui-bubble", w, m.text); return collapse(w); });
      return { node, items, render(t, times, out = 1) { items.forEach((c, i) => c.render(h.tw(t, times[i], 0.42, "signature") * out)); } };
    }
    const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    // a phone keyboard; render(t, value, start, cps) dips the key being typed
    function keyboard(parent, o = {}) {
      const node = tag(el("div", "ui-keys", parent), o);
      const keys = new Map();
      KEY_ROWS.forEach((r) => { const line = el("div", "", node); [...r].forEach((c) => keys.set(c, el("span", "", line, c))); });
      keys.set(" ", el("span", "is-wide", el("div", "", node), o.space || "space"));
      return { node, render(t, value = "", start = 0, cps = 12) {
        const i = Math.floor((t - start) * cps), on = t >= start && i < value.length ? value[i].toLowerCase() : null;
        const f = on ? 1 - clamp(((t - start) * cps) % 1) : 0;
        for (const [c, k] of keys) { k.style.transform = c === on ? `translateY(${(f * 1.5).toFixed(2)}px)` : ""; k.style.filter = c === on ? `brightness(${(1 - f * 0.16).toFixed(3)})` : ""; }
      } };
    }
    // the phone's island grows to hold a live status: render(p); fill .content
    function island(phone, o = {}) {
      const node = phone.island, w = o.w ?? 300, hh = o.h ?? 64;
      const content = el("div", "ui-island-in", node);
      return { node, content, render(p) {
        const q = ease.signature(clamp(p));
        Object.assign(node.style, { width: lerp(122, w, q).toFixed(1) + "px", height: lerp(35, hh, q).toFixed(1) + "px", marginLeft: (-lerp(122, w, q) / 2).toFixed(1) + "px", borderRadius: lerp(18, 30, q).toFixed(1) + "px" });
        content.style.opacity = clamp((q - 0.55) / 0.45).toFixed(3);
      } };
    }
    function notification(parent, n, o = {}) {
      const node = tag(el("div", "ui-note", parent), o);
      avatar(node, n.app || n.title, { size: 38, i: 1 });
      const main = el("div", "", node);
      el("b", "", main, n.title);
      el("span", "", main, n.body);
      return { node, render(p) { const q = ease.signature(clamp(p)); node.style.opacity = q.toFixed(3); node.style.transform = `translateY(${((1 - q) * -24).toFixed(2)}px) scale(${(0.96 + q * 0.04).toFixed(4)})`; } };
    }

    // ---------- motion: small moves every demo reaches for; each is a pure function of its argument ----------
    // a value changing digit by digit, only the characters that differ: render(from, to, p)
    function roll(parent, o = {}) {
      const node = tag(el("span", "ui-roll", parent), o);
      let key = null, cells = [];
      const blank = " ";
      function build(from, to) {
        node.textContent = "";
        const keep = (v) => v.replace(/ /g, blank); // a plain space would collapse inside its cell
        const n = Math.max(from.length, to.length), A = keep(from).padStart(n, blank), B = keep(to).padStart(n, blank);
        cells = [...Array(n)].map((_, i) => {
          const c = el("span", "ui-roll-c", node);
          const sizeA = el("span", "is-size", c, A[i]), sizeB = el("span", "is-size", c, B[i]);
          const a = el("span", "", c, A[i]), b = el("span", "", c, B[i]);
          return { c, sizeA, sizeB, a, b, same: A[i] === B[i], padA: i < n - from.length, padB: i < n - to.length };
        });
      }
      return { node, render(from, to, p) {
        from = String(from); to = String(to);
        if (key !== from + "|" + to) { build(from, to); key = from + "|" + to; }
        const n = cells.length;
        cells.forEach((c, i) => {
          const q = c.same ? 0 : ease.snappy(clamp(p * (1 + (n - 1) * 0.08) - (n - 1 - i) * 0.08));
          c.a.style.transform = `translateY(${(-q * 110).toFixed(1)}%)`;
          c.b.style.transform = `translateY(${((1 - q) * 110).toFixed(1)}%)`;
          c.b.style.opacity = c.same ? "0" : "1";
          // each cell eases between its two characters' widths; a cell that only exists on one side opens or closes
          c.c.style.width = lerp(c.padA ? 0 : c.sizeA.offsetWidth, c.padB ? 0 : c.sizeB.offsetWidth, q).toFixed(1) + "px";
        });
      } };
    }
    // text arriving word by word, laid out from the start so nothing reflows: render(t, start, wps), done(start, wps)
    function stream(parent, text, o = {}) {
      const node = tag(el(o.tag || "span", o.cls || "", parent), o);
      const words = String(text).split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? (node.append(w), null) : el("span", "", node, w))).filter(Boolean);
      return { node, words, done: (start, wps = 16) => start + words.length / wps,
        render(t, start, wps = 16, out = 1) { const n = (t - start) * wps; words.forEach((w, i) => { w.style.opacity = (clamp(n - i) * out).toFixed(3); }); return clamp(n / words.length); } };
    }
    // a height that opens from nothing and pushes what follows: render(p)
    function collapse(node) {
      node.style.overflow = "hidden";
      let natural = null, measured = null, padTop = 0, padBottom = 0;
      return { node, render(p) {
        if (natural == null || measured !== fontsState()) {
          Object.assign(node.style, { height: "", paddingTop: "", paddingBottom: "" }); // back to what the stylesheet says
          const cs = getComputedStyle(node);
          natural = node.offsetHeight; padTop = parseFloat(cs.paddingTop) || 0; padBottom = parseFloat(cs.paddingBottom) || 0; measured = fontsState();
        }
        node.style.height = (natural * p).toFixed(2) + "px";
        if (padTop || padBottom) { node.style.paddingTop = (padTop * p).toFixed(2) + "px"; node.style.paddingBottom = (padBottom * p).toFixed(2) + "px"; }
        node.style.opacity = clamp(p * 1.4).toFixed(3);
      } };
    }
    // one element leaves as the other arrives: swap(a, b, p)
    function swap(a, b, p, travel = 8) {
      a.style.opacity = (1 - p).toFixed(3); a.style.transform = `translateY(${(-p * travel).toFixed(2)}px)`;
      b.style.opacity = p.toFixed(3); b.style.transform = `translateY(${((1 - p) * travel).toFixed(2)}px)`;
    }
    let overlay = null;
    const overlayNode = () => overlay || (overlay = svg("svg", { class: "ui-overlay", width: W, height: H, viewBox: `0 0 ${W} ${H}` }, world));
    // a line drawn from one target to another: render(p); a dot rides it with { dot: true }; { route: (a, b) => "M…" } draws your own path
    function connector(from, to, o = {}) {
      const path = svg("path", { fill: "none", stroke: o.color || "var(--c-accent-fill, var(--c-accent))", "stroke-width": o.width ?? 2, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, overlayNode());
      const dot = o.dot ? svg("circle", { r: 5, fill: o.color || "var(--c-accent-fill, var(--c-accent))", opacity: 0 }, overlayNode()) : null;
      let key = null;
      return { path, dot, render(p) {
        if (key !== fontsState()) {
          const [ax, ay] = point(from, o.fromAnchor || [1, 0.5]), [bx, by] = point(to, o.toAnchor || [0, 0.5]);
          const bend = o.bend ?? Math.max(40, Math.abs(bx - ax) * 0.5);
          path.setAttribute("d", o.route ? o.route([ax, ay], [bx, by]) : `M${ax} ${ay} C${ax + bend} ${ay} ${bx - bend} ${by} ${bx} ${by}`);
          key = fontsState();
        }
        path.setAttribute("stroke-dashoffset", (1 - clamp(p)).toFixed(4));
        path.style.opacity = p > 0 ? "1" : "0";
        if (dot) { const at = path.getPointAtLength(path.getTotalLength() * clamp(p)); dot.setAttribute("cx", at.x.toFixed(1)); dot.setAttribute("cy", at.y.toFixed(1)); dot.setAttribute("opacity", p > 0 && p < 1 ? "1" : "0"); }
      } };
    }
    // an element travelling between two targets on an arc: render(p). Put it in kit.world.
    function fly(node, from, to, o = {}) {
      node.style.position = "absolute"; node.style.left = "0"; node.style.top = "0"; node.style.zIndex = 28;
      return { node, render(p) {
        const a = point(from), b = point(to), q = ease.inOut(clamp(p)), arc = Math.sin(Math.PI * q) * (o.arc ?? -60);
        const s = lerp(o.fromScale ?? 1, o.toScale ?? 1, q);
        node.style.transform = `translate(${(lerp(a[0], b[0], q) - node.offsetWidth / 2).toFixed(1)}px, ${(lerp(a[1], b[1], q) + arc - node.offsetHeight / 2).toFixed(1)}px) scale(${s.toFixed(3)})`;
      } };
    }

    // where the pointer is at t (world pixels), for a scene that reacts to hover (a chart tooltip)
    const pointerAt = (t) => (pointers[0] ? cursorAt(pointers[0], t).pos : null);

    return {
      world, frame, cursor, camera, render, pressed, clickedAt, dragged, pointerAt, rect, point, field, type, annotate, ground, fidelity, view: [VW, VH],
      filler, lines, label, card, row, button, toggle, segmented, tabs, badge, chip, kbd, avatar, menu, popover, toast, code, chart, thread, keyboard, island, notification,
      roll, stream, collapse, swap, connector, fly,
      bump: (t, at, len) => bump(t, at, len, h),
    };
  }

  window.SMUI = { kit };
})();
