/* site-motion stage runtime.
 * A scene is a pure function of time: render(t) must draw the same frame for the same t, whatever came before.
 * That one rule is what lets the same file play live on a website and render frame-exact to MP4, WebM, GIF and WebP.
 */
(function () {
  "use strict";

  // ---------- easing: one cubic-bezier solver, the motion-language curves ----------
  function bezier(x1, y1, x2, y2) {
    const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
    const at = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
    const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (at(t, x1, x2) - x) / s;
      }
      let lo = 0, hi = 1;
      for (let i = 0; i < 20 && Math.abs(at(t, x1, x2) - x) > 1e-5; i++) {
        if (at(t, x1, x2) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return at(t, y1, y2);
    };
  }
  const ease = {
    signature: bezier(0.16, 1, 0.3, 1), // entrances that should feel expensive
    snappy: bezier(0.22, 1, 0.36, 1), // UI state changes
    soft: bezier(0.33, 1, 0.68, 1), // small moves, opacity, colour
    inOut: bezier(0.65, 0, 0.35, 1), // both ends on screen, exits
    linear: (x) => Math.min(1, Math.max(0, x)),
  };

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  // A style pack may set a tempo (only ever with style.cjs on the page); see SMStyle.capTempo for the rule
  // that keeps loop seams exact. Start times, linear motion and the loop itself are never touched.
  let tempoK = 1, tempoEnd = Infinity, introEnd = 0;
  const scaled = (start, dur, curve) => (tempoK === 1 ? dur : SMStyle.capTempo(start, dur, curve, tempoK, tempoEnd, introEnd));
  // progress of a tween that starts at `start` and lasts `dur`, eased.
  // A tween begun in the intro is complete once the loop starts: the loop's first frame has to match its last.
  const tw = (t, start, dur, curve = "signature") => {
    if (introEnd > 0 && start < introEnd && t >= introEnd) return 1;
    const d = scaled(start, dur, curve);
    return d <= 0 ? (t >= start ? 1 : 0) : (ease[curve] || curve)(clamp((t - start) / d));
  };
  // an "in, hold, out" envelope: 0 → 1 → 0
  const span = (t, inAt, outAt, inDur = 0.6, outDur = 0.45) => tw(t, inAt, inDur) * (1 - tw(t, outAt, outDur, "inOut"));
  const typed = (text, t, start, cps = 32) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)));
  const count = (t, start, dur, from, to, curve = "signature") => lerp(from, to, tw(t, start, dur, curve));
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- colour, from the design system only ----------
  const hex = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const toHex = (rgb) => "#" + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, p) => toHex(hex(a).map((v, i) => lerp(v, hex(b)[i], p)));
  const alpha = (c, a) => `rgba(${hex(c).join(",")},${a})`;

  // ---------- DOM and SVG ----------
  const NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function el(tag, cls, parent, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  const set = (node, attrs) => { for (const k in attrs) { const v = String(attrs[k]); if (node.getAttribute(k) !== v) node.setAttribute(k, v); } };
  const style = (node, props) => { for (const k in props) node.style[k] = props[k]; };
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

  // ---------- isometric projection (one projection for every iso scene) ----------
  function isoCamera(origin, scale = 1, angle = 30) {
    const c = Math.cos((angle * Math.PI) / 180) * scale, s = Math.sin((angle * Math.PI) / 180) * scale;
    const p = (x, y, z = 0) => [origin[0] + (x - y) * c, origin[1] + (x + y) * s - z * scale];
    const pts = (list) => list.map((q) => p(...q).map((v) => v.toFixed(1)).join(",")).join(" ");
    return {
      p, pts, c, s, scale,
      depth: (x, y, z = 0) => x + y + z * 0.001,
      // text lying on a face: local +x reads along `along`, local +y runs along `down`
      matrix(at, along, down) {
        const o = p(...at), a = p(at[0] + along[0], at[1] + along[1], at[2] + along[2]), d = p(at[0] + down[0], at[1] + down[1], at[2] + down[2]);
        return `matrix(${(a[0] - o[0]).toFixed(4)} ${(a[1] - o[1]).toFixed(4)} ${(d[0] - o[0]).toFixed(4)} ${(d[1] - o[1]).toFixed(4)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`;
      },
    };
  }

  // ---------- the stage ----------
  let scene = null;
  const params = new URLSearchParams(location.search);
  const exporting = params.has("export");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  // A page can be re-themed without rebuilding it: ?tokens=<base64url JSON> replaces the built-in tokens,
  // the CSS variables and the font link before the scene sets up. A bad theme is ignored, never half-applied.
  function themeFromQuery() {
    const raw = params.get("tokens");
    if (!raw || !window.SMTokens) return null;
    try {
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (ch) => ch.charCodeAt(0));
      const tokens = SMTokens.normalize(JSON.parse(new TextDecoder().decode(bytes)), "?tokens");
      const css = document.createElement("style");
      css.textContent = SMTokens.css(tokens);
      document.head.appendChild(css); // after the built-in :root block, so it wins
      if (tokens.font.import) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = tokens.font.import;
        document.head.appendChild(link);
      }
      return tokens;
    } catch (error) {
      console.warn("site-motion: ignoring ?tokens", error);
      return null;
    }
  }

  // ?style=<sm1.code | native | base64url JSON> swaps the look the same way ?tokens swaps the brand.
  function styleFromQuery() {
    const raw = params.get("style");
    if (!raw || !window.SMStyle) return undefined;
    try {
      if (raw === "native") return "native";
      if (SMStyle.isCode(raw)) return SMStyle.decode(raw);
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (ch) => ch.charCodeAt(0));
      return SMStyle.normalize(JSON.parse(new TextDecoder().decode(bytes)), "?style");
    } catch (error) {
      console.warn("site-motion: ignoring ?style", error);
      return undefined;
    }
  }

  // Without style.cjs on the page (an older build), every helper hands back the scene's own value.
  const nativeLook = {
    ui: {
      stroke: (role, n) => n, strokeColor: (n) => n,
      strokeAttrs: (role, n, color) => (n > 0 ? { "stroke-width": n, stroke: color } : { "stroke-width": 0, stroke: "none" }),
      shadow: (level, n) => n, radius: (size, n) => n, glow: (n) => n, texture: () => null, motif: () => null,
    },
    motion: { stagger: (i, step) => i * step },
    dir: { pack: "native", code: "native", has: () => false, report: () => [] },
  };

  function applyStyle(data, tokens) {
    const pick = styleFromQuery();
    const embedded = data.style || {};
    if (!window.SMStyle) return { tokens, look: nativeLook };
    try {
      const S = SMStyle.forPage(pick === undefined ? embedded.pack || "native" : pick, embedded.directable || [], tokens, { el });
      const add = (text) => { if (!text) return; const node = document.createElement("style"); node.textContent = text; document.head.appendChild(node); };
      add(S.css);
      if (S.tokens !== tokens && window.SMTokens) add(SMTokens.css(S.tokens)); // a colour mode reorders the palette
      if (S.ease) for (const [role, b] of Object.entries(S.ease)) ease[role] = bezier(...b);
      tempoK = S.tempo;
      tempoEnd = scene.duration;
      return { tokens: S.tokens, look: S };
    } catch (error) {
      console.warn("site-motion: ignoring style", error);
      return { tokens, look: nativeLook };
    }
  }

  function mount() {
    const data = JSON.parse(document.getElementById("sm-data").textContent);
    const content = data.content;
    introEnd = scene.loop || 0;
    // a build can show a product demo through a smaller view (card, compact, strip); the kit keeps the design size
    if (data.view) { scene.width = data.view[0]; scene.height = data.view[1]; }
    const themed = themeFromQuery() || (window.SMTokens ? SMTokens.normalize(data.tokens) : data.tokens);
    const { tokens, look } = applyStyle(data, themed);
    const host = document.querySelector(".sm-host");
    const root = el("div", "sm-stage", host);
    root.style.width = scene.width + "px";
    root.style.height = scene.height + "px";
    if (exporting) {
      document.documentElement.classList.add("sm-exporting");
      host.style.width = scene.width + "px";
      host.style.height = scene.height + "px";
    }
    // embedded assets (GLB models, images) live in window.SM_ASSETS as data: URLs, keyed by path
    const asset = (ref) => {
      const path = String(ref).replace(/^asset:/, "");
      const url = (window.SM_ASSETS || {})[path];
      if (!url) throw new Error(`site-motion: asset "${path}" was not embedded (reference it as "asset:${path}" in content)`);
      return url;
    };
    // textOn(bg, prefer): a text colour that reads at WCAG AA on a fill the scene mixed itself (tokens.cjs)
    // inkOn(bg): the theme's ink or paper, whichever reads on that fill (a palette chip, an avatar)
    const textOn = window.SMTokens ? SMTokens.textOn : (bg, prefer) => prefer;
    const inkOn = window.SMTokens ? (bg) => SMTokens.inkOn(bg, tokens.color) : () => tokens.color.ink;
    const helpers = { ease, tw, span, typed, count, clamp, lerp, rng, mix, alpha, svg, el, set, style, text, isoCamera, asset, textOn, inkOn, ui: look.ui, motion: look.motion, dir: look.dir };
    const loopAt = scene.loop || 0;
    let resolveReady;
    // __sm exists at once so the exporter can wait on it; seeking does nothing until setup has finished
    window.__sm = {
      width: scene.width,
      height: scene.height,
      duration: scene.duration,
      loop: loopAt,
      fps: scene.fps || 30,
      still: scene.still ?? scene.duration * 0.7,
      style: { pack: look.dir.pack, code: look.dir.code, report: look.dir.report },
      seek: () => {},
      ready: new Promise((r) => (resolveReady = r)),
    };

    // setup may be async (loading models, decoding images); nothing draws until it resolves
    // new Promise(...) also catches a setup that throws synchronously; Promise.resolve(setup()) would not
    new Promise((resolve) => resolve(scene.setup({ root, content, tokens, h: helpers, width: scene.width, height: scene.height, duration: scene.duration })))
      .then((result) => {
        const state = result || {};
        // A scene may play an intro once, then loop [loop, duration] forever: t wraps back to `loop`, never to 0.
        const wrap = (t) => (t < scene.duration ? Math.max(0, t) : loopAt + ((t - loopAt) % (scene.duration - loopAt)));
        const draw = (t) => scene.render(wrap(t), state, helpers);
        // overlays from the style pack (texture above, motif below); both static, so every frame still matches
        look.ui.motif(root);
        look.ui.texture(root);
        // Export: also freeze every CSS / Web Animations API animation on the page at the same time t.
        // Collect them once and keep the list: getAnimations() drops ones seeked past their end with fill: none.
        let frozen = null;
        window.__sm.seek = (t) => {
          draw(t);
          if (!exporting || !document.getAnimations) return;
          frozen = frozen || document.getAnimations();
          for (const a of document.getAnimations()) if (!frozen.includes(a)) frozen.push(a);
          for (const a of frozen) { try { a.pause(); a.currentTime = wrap(t) * 1000; } catch {} }
        };

        // fit the fixed-size stage to its container
        const fit = () => {
          if (exporting) return;
          const k = host.clientWidth / scene.width;
          root.style.transform = `scale(${k})`;
          host.style.height = scene.height * k + "px";
        };
        new ResizeObserver(fit).observe(host);
        fit();

        // playback: "loop" (default), "once" (plays when first in view and stops on the poster frame), "hover" (rests on the poster, plays while hovered)
        const play = params.get("play") || data.play || "loop";
        const poster = scene.still ?? scene.duration * 0.7;
        let clock = 0, last = 0, frame = 0, visible = true, paused = params.has("paused") || play === "hover", told = -1;
        // an embedding page can drive playback (sm:play, sm:pause, sm:seek {t}, sm:restart) and hears sm:time back
        const embedded = window.parent !== window;
        const tell = (force) => {
          if (!embedded || (!force && Math.abs(clock - told) < 0.1)) return;
          told = clock;
          window.parent.postMessage({ type: "sm:time", t: wrap(clock), duration: scene.duration, loop: loopAt, paused }, "*");
        };
        const tick = (now) => {
          const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
          last = now;
          clock += dt;
          if (play === "once" && clock >= poster) { clock = poster; paused = true; }
          draw(clock);
          tell(false);
          frame = visible && !paused ? requestAnimationFrame(tick) : 0;
        };
        const start = () => {
          if (frame || exporting || paused) return;
          if (still.matches) { draw(scene.still ?? scene.duration * 0.7); return; }
          last = 0;
          frame = requestAnimationFrame(tick);
        };
        if (embedded && !exporting) {
          window.addEventListener("message", (event) => {
            const msg = event.source === window.parent && event.data;
            if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("sm:")) return;
            if (msg.type === "sm:pause") { paused = true; cancelAnimationFrame(frame); frame = 0; }
            else if (msg.type === "sm:play") { paused = false; start(); }
            else if (msg.type === "sm:seek") { clock = Math.max(0, Number(msg.t) || 0); draw(clock); }
            else if (msg.type === "sm:restart") { clock = 0; draw(0); }
            else return;
            tell(true);
          });
        }
        if (!exporting && play === "hover") {
          host.addEventListener("pointerenter", () => { paused = false; clock = 0; start(); });
          host.addEventListener("pointerleave", () => { paused = true; cancelAnimationFrame(frame); frame = 0; clock = poster; draw(poster); });
        }
        if (!exporting) {
          new IntersectionObserver((entries) => {
            visible = entries[entries.length - 1].isIntersecting;
            if (visible) start();
          }).observe(host);
          still.addEventListener?.("change", () => { if (still.matches) { cancelAnimationFrame(frame); frame = 0; draw(scene.still ?? scene.duration * 0.7); } else start(); });
        }
        draw(exporting ? 0 : play === "once" ? 0 : scene.still ?? 0);
        const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
        fontsReady.then(() => requestAnimationFrame(() => resolveReady(true)));
      })
      .catch((error) => {
        console.error("site-motion: setup failed", error);
        resolveReady(false);
      });
  }

  window.SiteMotion = {
    scene(def) {
      scene = def;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
      else mount();
    },
    ease, bezier,
  };
})();
