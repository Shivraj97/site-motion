// @vendor ui-kit
/* shot-demo: a product demo made from a raw screenshot.
 * The screenshot sits in a browser, window or phone frame (or a bare card). Everything that happens is
 * written in content.json against named HOTSPOTS drawn in the screenshot's own pixels:
 *   cursor     ui-kit beats; `to` names a hotspot, `click: true` clicks it
 *   camera     ui-kit keys; `focus` names a hotspot, `fit` picks the zoom that frames it
 *   edits      the screen changing: a field typed into ("type") or a value replaced ("swap"). A patch in the
 *              colour sampled under the text hides the old pixels; the new text is set in the brand's face
 *   spotlight  everything but one hotspot dims
 *   callouts   a short label pinned beside a hotspot
 *   states     a second screenshot revealed (a fade, or a circle growing from a hotspot)
 *   scroll     the view travels down a tall capture
 * Clicked hotspots press (their pixels scale in place) and darken while the pointer is over them.
 * Everything lets go at times.reset, so the last frame matches the first and the loop has no seam.
 * `debug: true` outlines every hotspot with its name: switch it off before shipping.
 */
(function () {
  const C0 = (() => { try { return JSON.parse(document.getElementById("sm-data").textContent).content || {}; } catch (e) { return {}; } })();
  const D = C0.duration || 10;
  const W = 1600, H = 900;

  const boxOf = (spec) => (Array.isArray(spec) ? spec : spec.box);

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: 0,
    still: C0.still ?? D * 0.55,
    async setup({ root, content: c, tokens, h }) {
      const { el } = h;
      root.classList.add("sd");
      el("div", "sd-glow", root);
      const kit = SMUI.kit({ root, h, tokens, width: W, height: H });
      const [IW, IH] = c.imageSize;
      const [vx, vy, vw, vh] = c.view || [0, 0, IW, IH];
      const kind = c.frame || "browser";

      // ---------- geometry: the view fills the frame body at scale s (world px per image px) ----------
      const BAR = kind === "browser" || kind === "window" ? 46 : 0;
      const INSET = kind === "phone" ? 11 : 0;
      const margin = c.margin ?? (kind === "phone" ? 34 : 56);
      const maxW = c.maxWidth ?? (kind === "phone" ? 640 : 1360);
      // a desktop window is staged, not boxed: it runs off the bottom of the stage. A phone stays whole; `bleed: false` keeps a window whole too
      const bleed = (c.bleed ?? true) && kind !== "phone" && kind !== "none";
      const s = bleed ? Math.max(maxW / vw, (H - margin + 40 - BAR) / vh) : Math.min(maxW / vw, (H - 2 * margin - BAR - 2 * INSET) / vh);
      const bw = vw * s, bh = vh * s;
      const fw = bw + 2 * INSET, fh = bh + BAR + 2 * INSET;
      const fx = (W - fw) / 2, fy = bleed ? margin : (H - fh) / 2;
      let body;
      if (kind === "none") {
        body = el("div", "sd-card", kit.world);
        Object.assign(body.style, { left: fx + "px", top: fy + "px", width: bw + "px", height: bh + "px" });
      } else {
        const f = kit.frame(kind, { x: fx, y: fy, w: fw, h: fh, url: c.url, title: c.windowTitle, float: !bleed });
        f.node.classList.add("sd-frame", "sd-" + kind);
        body = f.body;
      }
      const bx = fx + INSET, by = fy + BAR + INSET; // the body's top-left in world px

      const plate = el("div", "sd-plate", body);
      const layer = el("div", "sd-layer", plate);
      Object.assign(layer.style, { width: IW * s + "px", height: IH * s + "px" });
      const src = h.asset(c.image);
      const img = el("img", "sd-img", layer);
      img.src = src;
      img.alt = "";
      await img.decode();

      // ---------- pixels: sample the screenshot to colour patches and text ----------
      const k = img.naturalWidth / IW; // the embed copy may be smaller than the capture the hotspots were drawn on
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = (x, y, w, hh) => {
        const X = Math.max(0, Math.round(x * k)), Y = Math.max(0, Math.round(y * k));
        return g.getImageData(X, Y, Math.max(1, Math.min(cv.width - X, Math.round(w * k))), Math.max(1, Math.min(cv.height - Y, Math.round(hh * k)))).data;
      };
      const hex = (r, gg, b) => "#" + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      // the most common colour in a box: the field or panel behind the text
      function modeOf(data) {
        const m = new Map();
        let best = null;
        for (let i = 0; i < data.length; i += 4) {
          const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
          const e = m.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
          m.set(key, e);
          if (!best || e.n > best.n) best = e;
        }
        return [best.r / best.n, best.g / best.n, best.b / best.n];
      }
      // the text colour: the pixels nearly as far from the background as the furthest one (the cores of the
      // glyphs, not their anti-aliased edges, which a fixed share of a mostly-empty box would average in)
      function inkOf(data, bg) {
        const list = [];
        for (let i = 0; i < data.length; i += 4) list.push([Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]), i]);
        list.sort((a, b) => b[0] - a[0]);
        const cut = list[0][0] * 0.85;
        const top = list.filter(([d]) => d >= cut).slice(0, Math.max(1, Math.floor(list.length * 0.2)));
        const sum = top.reduce((a, [, i]) => [a[0] + data[i], a[1] + data[i + 1], a[2] + data[i + 2]], [0, 0, 0]);
        return sum.map((v) => v / top.length);
      }

      // ---------- hotspots ----------
      const hot = {};
      for (const [name, spec] of Object.entries(c.hotspots || {})) hot[name] = { name, box: boxOf(spec), r: spec.r ?? 0, press: spec.press };
      const need = (name) => { if (!hot[name]) throw new Error(`shot-demo: no hotspot named "${name}"`); return hot[name]; };
      const place = (node, [x, y, w, hh], pad = 0) => Object.assign(node.style, { left: (x - pad) * s + "px", top: (y - pad) * s + "px", width: (w + 2 * pad) * s + "px", height: (hh + 2 * pad) * s + "px" });
      for (const hs of Object.values(hot)) {
        const n = el("div", "sd-hot", layer);
        n.dataset.ui = hs.name;
        place(n, hs.box);
        if (c.debug) { n.classList.add("is-debug"); el("span", "", n, hs.name); }
      }

      // ---------- scroll (image px, the top of the view) ----------
      const scrolls = [...(c.scroll || [])].sort((a, b) => a.at - b.at);
      const scrollAt = (t) => {
        let y = 0;
        for (const sc of scrolls) { if (t < sc.at) break; y = h.lerp(y, sc.to, h.ease[sc.ease || "inOut"](h.clamp((t - sc.at) / (sc.dur || 1)))); }
        return y;
      };
      // image px → world px at time t (the camera and cursor live in world px)
      const toWorld = (x, y, t) => [bx + (x - vx) * s, by + (y - vy - scrollAt(t)) * s];
      const anchorOf = (name, anchor, t) => { const [x, y, w, hh] = need(name).box; const a = anchor || [0.5, 0.5]; return toWorld(x + w * a[0], y + hh * a[1], t); };

      // ---------- edits: patches over the old pixels, new text in the brand's face ----------
      const edits = (c.edits || []).map((e) => {
        const box = need(e.in).box;
        const data = px(...box);
        const bg = e.fill ? null : modeOf(data);
        const fill = e.fill || hex(...bg);
        const color = e.color || hex(...inkOf(data, bg || [255, 255, 255]));
        const patch = el("div", "sd-patch", layer);
        place(patch, box, e.pad ?? 2);
        patch.style.background = fill;
        patch.style.borderRadius = (e.r ?? 0) * s + "px";
        const wrap = el("div", "sd-edit", layer);
        place(wrap, [box[0] + (e.dx || 0), box[1] + (e.dy || 0), box[2], box[3]]); // dx/dy: nudge the new text onto the old baseline
        wrap.style.justifyContent = e.align === "right" ? "flex-end" : e.align === "center" ? "center" : "flex-start";
        Object.assign(wrap.style, { color, fontSize: (e.size || box[3] * 0.62) * s + "px", fontWeight: e.weight || 400, letterSpacing: e.tracking || "0", fontFamily: e.font || "var(--font-sans)" });
        const f = kit.field(wrap, "sd-field");
        return { ...e, mode: e.mode || "type", patch, wrap, f, room: box[2] * s };
      });
      // never wider than the box: a value set in a stand-in face can run wider than the original
      if (document.fonts) await document.fonts.ready;
      for (const e of edits) {
        h.text(e.f.text, e.text);
        e.f.caret.style.display = "none";
        const wide = e.f.node.scrollWidth;
        if (wide > e.room) e.wrap.style.fontSize = parseFloat(e.wrap.style.fontSize) * (e.room / wide) * 0.98 + "px";
        e.f.caret.style.display = "";
        h.text(e.f.text, "");
      }
      const focusRings = edits.filter((e) => e.focus).map((e) => {
        const ring = el("div", "sd-ring", layer);
        const hs = need(e.focus);
        place(ring, hs.box, 0);
        ring.style.borderRadius = (hs.r || 8) * s + "px";
        return { e, ring };
      });

      // ---------- presses: clicked hotspots (not the fields being typed into) ----------
      const typedInto = new Set(edits.filter((e) => e.focus).map((e) => e.focus));
      const clicked = new Set((c.cursor || []).filter((b) => b.click && typeof b.to === "string").map((b) => b.to));
      const chips = [...clicked].filter((n) => !typedInto.has(n) && need(n).press !== false).map((name) => {
        const [x, y, w, hh] = need(name).box;
        const under = el("div", "sd-patch", layer);
        place(under, [x, y, w, hh]);
        under.style.background = hex(...modeOf(px(x - 6, y - 6, w + 12, 4))); // the colour just above the button
        const chip = el("div", "sd-chip", layer);
        place(chip, [x, y, w, hh]);
        Object.assign(chip.style, { backgroundImage: `url(${src})`, backgroundSize: `${IW * s}px ${IH * s}px`, backgroundPosition: `${-x * s}px ${-y * s}px` });
        return { name, under, chip, box: [x, y, w, hh] };
      });

      // ---------- states: another screenshot of the same screen, revealed ----------
      const states = await Promise.all((c.states || []).map(async (st) => {
        const node = el("img", "sd-img sd-state", layer);
        node.src = h.asset(st.image);
        node.alt = "";
        await node.decode();
        return { ...st, node };
      }));

      // ---------- spotlight + callouts ----------
      // the spotlight lives in the world, not the screenshot, so its dimming reaches past the frame to the
      // stage edges (dimming only the screen leaves a bright margin beside it once the camera is in)
      const spots = (c.spotlight || []).map((sp) => {
        const node = el("div", "sd-spot", kit.world);
        const hs = need(sp.on), pad = sp.pad ?? 10;
        Object.assign(node.style, { width: (hs.box[2] + 2 * pad) * s + "px", height: (hs.box[3] + 2 * pad) * s + "px", borderRadius: ((sp.r ?? hs.r ?? 10) + pad) * s + "px" });
        return { ...sp, node, pad };
      });
      const callouts = (c.callouts || []).map((co) => {
        const node = el("div", "sd-callout is-" + (co.side || "right"), kit.world);
        el("i", "", node);
        el("span", "", node, co.text);
        return { ...co, node };
      });

      // ---------- cursor + camera: hotspot names → world points, at the moment each beat lands ----------
      const beats = (c.cursor || []).map((b) => {
        if (typeof b.to !== "string") return b;
        const out = { ...b, to: anchorOf(b.to, b.anchor, b.at) };
        if (b.click === true) out.click = b.to; // keep the name, so presses key off it
        delete out.anchor;
        return out;
      });
      const pointer = kit.cursor(beats, { start: c.cursorStart || [W * 0.62, H * 0.96], hidden: !!c.cursorHidden });
      const keys = (c.camera || []).map((key) => {
        const out = { ...key };
        const landed = key.at + (key.dur || 1);
        const name = key.fit || (typeof key.focus === "string" ? key.focus : null);
        if (name) {
          const [, , w, hh] = need(name).box;
          out.focus = anchorOf(name, key.anchor, landed);
          if (key.fit && key.zoom == null) out.zoom = h.clamp(Math.min((W * (key.fill || 0.55)) / (w * s), (H * (key.fill || 0.55)) / (hh * s)), 1, 2.4);
        }
        delete out.fit; delete out.anchor; delete out.fill;
        // once zoomed in, keep the frame's edge out of shot: the view slides inside the screen, never past it
        const z = out.zoom ?? 1;
        if (z > 1 && Array.isArray(out.focus) && c.keepInside !== false) {
          const hw = W / (2 * z), hh2 = H / (2 * z), top = kind === "phone" || kind === "none" ? by : fy;
          let [x, y] = [out.focus[0] + (out.offset?.[0] || 0), out.focus[1] + (out.offset?.[1] || 0)];
          if (bw > 2 * hw) x = h.clamp(x, bx + hw, bx + bw - hw);
          if (by + bh - top > 2 * hh2) y = h.clamp(y, top + hh2, by + bh - hh2);
          out.focus = [x, y];
          delete out.offset;
        }
        return out;
      });
      kit.camera(keys);

      return { kit, c, s, layer, edits, pointerNode: pointer.node, focusRings, chips, states, spots, callouts, scrollAt, toWorld, need, R: (c.times && c.times.reset) || D - 1.4 };
    },

    render(t, S, h) {
      const { tw, clamp } = h;
      const { kit, c, s, R } = S;
      kit.render(t);
      const out = (t0) => 1 - tw(t, t0, 0.4, "soft"); // everything lets go at the reset
      S.layer.style.transform = `translateY(${(-(S.scrollAt(t)) * s).toFixed(2)}px)`;
      const vx = (c.view || [0, 0])[0], vy = (c.view || [0, 0])[1];
      S.layer.style.left = (-vx * s).toFixed(2) + "px";
      S.layer.style.top = (-vy * s).toFixed(2) + "px";

      // edits: a typed field clears, takes the new text with a caret, and keeps it until the reset;
      // a swapped value is replaced with a short rise and a tint behind it that fades
      for (const e of S.edits) {
        const release = out(e.until ?? R);
        if (e.mode === "type") {
          const clear = e.clear ?? e.at - 0.25;
          S.kit.type(e.f, t >= clear ? t : 0, e.text, e.at, { cps: e.cps || 14, blurAt: e.blur ?? e.at + e.text.length / (e.cps || 14) + 0.9 });
          if (t < clear) h.text(e.f.text, "");
          const on = tw(t, clear, 0.12, "soft") * release;
          e.patch.style.opacity = on.toFixed(3);
          e.wrap.style.opacity = on.toFixed(3);
        } else {
          h.text(e.f.text, e.text);
          e.f.caret.style.opacity = "0";
          const p = tw(t, e.at, 0.38, "snappy") * release;
          e.patch.style.opacity = clamp(p * 3).toFixed(3);
          e.wrap.style.opacity = p.toFixed(3);
          e.wrap.style.transform = `translateY(${((1 - tw(t, e.at, 0.38, "snappy")) * 10 * s).toFixed(2)}px)`;
          const flash = h.span(t, e.at, e.at + 0.5, 0.15, 0.9) * release;
          e.patch.style.boxShadow = `inset 0 0 0 9999px color-mix(in srgb, var(--c-accent) ${(flash * 18).toFixed(1)}%, transparent)`;
        }
      }
      for (const { e, ring } of S.focusRings) {
        const clear = e.clear ?? e.at - 0.25;
        const on = tw(t, clear, 0.18, "snappy") * (1 - tw(t, e.blur ?? e.at + e.text.length / (e.cps || 14) + 0.9, 0.3, "soft"));
        ring.style.opacity = on.toFixed(3);
      }

      // presses: the button's own pixels scale in place; it darkens a little under the pointer
      // a hidden pointer hovers nothing (it is often parked on the last button it clicked)
      const p = S.kit.pointerAt(t), seen = parseFloat(S.pointerNode.style.opacity || "1");
      for (const ch of S.chips) {
        const press = S.kit.pressed(t, ch.name);
        const [x, y, w, hh] = ch.box;
        const [wx, wy] = S.toWorld(x, y, t);
        const over = p && p[0] >= wx && p[0] <= wx + w * s && p[1] >= wy && p[1] <= wy + hh * s ? seen : 0;
        const show = press > 0.001 || over > 0.001 ? 1 : 0;
        ch.under.style.opacity = String(show);
        ch.chip.style.opacity = String(show);
        ch.chip.style.transform = `scale(${(1 - press * 0.035).toFixed(4)})`;
        ch.chip.style.filter = `brightness(${(1 - over * 0.06 - press * 0.06).toFixed(3)})`;
      }

      // states: revealed at `at`, gone by the reset
      for (const st of S.states) {
        const release = out(st.until ?? R);
        if (st.reveal === "circle") {
          const [x, y, w, hh] = S.need(st.from).box;
          const r = tw(t, st.at, st.dur || 0.7, "inOut") * Math.hypot(c.imageSize[0], c.imageSize[1]) * s;
          st.node.style.clipPath = `circle(${r.toFixed(1)}px at ${((x + w / 2) * s).toFixed(1)}px ${((y + hh / 2) * s).toFixed(1)}px)`;
          st.node.style.opacity = release.toFixed(3);
        } else st.node.style.opacity = (tw(t, st.at, st.dur || 0.5, "soft") * release).toFixed(3);
      }

      for (const sp of S.spots) {
        const [x, y] = S.need(sp.on).box;
        const [wx, wy] = S.toWorld(x - sp.pad, y - sp.pad, t);
        sp.node.style.transform = `translate(${wx.toFixed(2)}px, ${wy.toFixed(2)}px)`;
        sp.node.style.opacity = h.span(t, sp.at, sp.until ?? R, 0.5, 0.45).toFixed(3);
      }

      // callouts: pinned beside their hotspot in world px, so they ride the camera with the screen
      for (const co of S.callouts) {
        const on = h.span(t, co.at, co.until ?? R, 0.45, 0.35);
        const [x, y, w, hh] = S.need(co.to).box;
        const side = co.side || "right", gap = co.gap ?? 16;
        let [wx, wy] = S.toWorld(x, y, t);
        const bw = w * s, bh = hh * s, nw = co.node.offsetWidth, nh = co.node.offsetHeight;
        let lx, ly;
        if (side === "right") { lx = wx + bw + gap; ly = wy + bh / 2 - nh / 2; }
        else if (side === "left") { lx = wx - gap - nw; ly = wy + bh / 2 - nh / 2; }
        else if (side === "top") { lx = wx + bw / 2 - nw / 2; ly = wy - gap - nh; }
        else { lx = wx + bw / 2 - nw / 2; ly = wy + bh + gap; }
        if (co.offset) { lx += co.offset[0]; ly += co.offset[1]; }
        const rise = (1 - on) * 8;
        const dx = side === "right" ? rise : side === "left" ? -rise : 0, dy = side === "bottom" ? rise : side === "top" ? -rise : 0;
        co.node.style.transform = `translate(${(lx + dx).toFixed(1)}px, ${(ly + dy).toFixed(1)}px) scale(${(0.94 + on * 0.06).toFixed(3)})`;
        co.node.style.opacity = on.toFixed(3);
      }
    },
  });
})();
