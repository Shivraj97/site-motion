/* grain-tally: the number is made of the work (Canvas 2D).
 * Every grain is a fixed batch of events. The grains breathe as a dust ring, condense into the digits of the
 * total, melt into one bar per source (the shuffle *is* the sorting), then drift back into the ring. The figure
 * on screen is the byproduct of the grains: total = grains × perGrain, and each bar holds exactly its share.
 *
 * Pure in t: every grain's position is a blend between closed-form targets (ring at time t, digit pixel, bar
 * cell) with a seeded delay and a curl offset. Motion streaks are drawn from the analytic position a moment
 * earlier, so there is no accumulated state. loop: 0, the ring turns exactly once and breathes twice per loop.
 */
(function () {
  const W = 1600, H = 900, D = 14;
  const TAU = Math.PI * 2;

  // timeline (seconds)
  const T_DIGITS = 2.2, T_BARS = 7.0, T_RING = 11.4; // each phase starts here
  const MOVE = 1.35, SPREAD = 0.9; // a grain travels MOVE seconds, starting within SPREAD of the phase start

  const hexRgb = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  };
  const lum = (c) => { const [r, g, b] = hexRgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  SiteMotion.scene({
    width: W, height: H, duration: D, loop: 0, still: 9.6,

    async setup({ root, content, tokens, h }) {
      const { el, mix, rng } = h;
      const C = tokens.color, pal = tokens.palette;
      const dark = lum(C.paper) < 0.4;
      root.classList.add("gt");
      const canvas = el("canvas", "gt-canvas", root);
      const copy = el("div", "gt-copy", root);
      el("div", "gt-eyebrow", copy, content.eyebrow || "");
      el("div", "gt-h", copy, content.heading || "");
      el("div", "gt-sub", copy, content.sub || "");

      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // ---- the data: grains per source must add up exactly ----
      const per = content.perGrain || 4;
      const sources = content.sources.map((s, i) => ({ ...s, grains: Math.round(s.count / per) }));
      const N = sources.reduce((a, s) => a + s.grains, 0);
      const dense = Math.min(2.4, Math.max(1, Math.sqrt(2400 / Math.max(1, N))));
      const total = N * per; // what the digits say, derived from the grains
      // source colours: the biggest source wears the accent; the rest come from the palette, pushed away from
      // the paper until they read as grains (pale palettes vanish on light paper otherwise)
      const readable = (c) => { let x = c; for (let k = 0; k < 6 && Math.abs(lum(x) - lum(C.paper)) < 0.28; k++) x = mix(x, dark ? "#ffffff" : C.ink, 0.22); return x; };
      sources.forEach((s, i) => (s.colour = readable(i === 0 ? C.accent : pal[(i - 1) % pal.length])));
      const neutral = mix(C.paper, C.ink, dark ? 0.78 : 0.82);

      // ---- stage geometry ----
      const cx = content.centerX ?? 1075, cy = 440;
      const R0 = 255;

      // digit targets: draw the total offscreen, keep the lit pixels on a fine grid, pick N of them
      const family = (tokens.font && (tokens.font.display || tokens.font.sans)) || "sans-serif";
      const label = total.toLocaleString("en-US");
      const fontPx = Math.min(230, Math.floor(820 / (label.length * 0.62)));
      const font = `600 ${fontPx}px ${family}`;
      try { await document.fonts.load(font, label); } catch (e) { /* fall back to whatever is loaded */ }
      const off = document.createElement("canvas");
      off.width = W; off.height = 400;
      const o = off.getContext("2d");
      o.font = font; o.textAlign = "center"; o.textBaseline = "middle"; o.fillStyle = "#000";
      o.fillText(label, cx, 200);
      const px = o.getImageData(0, 0, W, 400).data;
      let cand = [];
      for (let step = 3; step >= 1 && cand.length < N * 1.15; step--) {
        cand = [];
        for (let y = 0; y < 400; y += step) for (let x = 0; x < W; x += step) if (px[(y * W + x) * 4 + 3] > 128) cand.push([x, y - 200 + cy - 30]);
      }
      const r = rng(content.seed ?? 7);
      for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
      const digitPts = cand.slice(0, N);

      // bar targets: one column of grains per source, filled bottom-up on a pitch grid
      const pitch = content.pitch ?? 6, cols = content.barCols ?? 15;
      const base = 708, barGap = 34;
      const barW = cols * pitch;
      const span = sources.length * barW + (sources.length - 1) * barGap;
      sources.forEach((s, i) => (s.x0 = cx - span / 2 + i * (barW + barGap)));
      const maxRows = Math.max(...sources.map((s) => Math.ceil(s.grains / cols)));
      sources.forEach((s) => (s.top = base - Math.ceil(s.grains / cols) * pitch));

      // ---- grains ----
      const G = [];
      sources.forEach((s, si) => {
        for (let k = 0; k < s.grains; k++) {
          const col = k % cols, row = Math.floor(k / cols);
          G.push({
            si,
            theta: r() * TAU,
            d: (r() + r() + r() - 1.5) * 34, // a soft gaussian-ish band around the ring
            size: r() < 0.72 ? 0 : 1, // two size classes keep the draw batched
            phase: r() * TAU,
            curl: (r() - 0.5) * 2,
            bar: [s.x0 + col * pitch + pitch / 2 + (r() - 0.5) * 0.8, base - row * pitch - pitch / 2],
            jit: r(),
          });
        }
      });
      // digits: grains on the left of the ring fill the left of the number, so the condense reads as a pour
      const byX = G.map((g, i) => i).sort((a, b) => Math.cos(G[a].theta) - Math.cos(G[b].theta));
      const ptsByX = digitPts.map((p, i) => i).sort((a, b) => digitPts[a][0] - digitPts[b][0]);
      byX.forEach((gi, k) => (G[gi].digit = digitPts[ptsByX[k]]));
      // delays: digits pour left to right; bars sort by source; the ring release goes from the top of each bar
      G.forEach((g) => {
        g.dDigit = ((g.digit[0] - (cx - 420)) / 840) * SPREAD * 0.85 + g.jit * 0.15;
        g.dBar = (g.si / sources.length) * SPREAD * 0.7 + g.jit * 0.3;
        g.dRing = (1 - (base - g.bar[1]) / (maxRows * pitch)) * SPREAD * 0.6 + g.jit * 0.3;
      });

      // ---- DOM labels ----
      const legend = el("div", "gt-legend", root);
      legend.style.left = cx + "px"; legend.style.top = cy + "px";
      const unit = el("div", "gt-unit", root);
      unit.style.left = cx + "px"; unit.style.top = cy + 118 + "px";
      const barLabels = sources.map((s) => {
        const b = el("div", "gt-bar", root);
        b.style.left = s.x0 + barW / 2 + "px"; b.style.top = base + 14 + "px";
        const name = el("div", "gt-bar-name", b);
        const n = el("div", "gt-bar-n", b);
        b.style.setProperty("--c", s.colour);
        return { b, name, n, s };
      });

      return { ctx, G, sources, N, total, per, label, cx, cy, R0, neutral, legend, unit, barLabels, content, C, mix, dark, dense };
    },

    render(t, S, h) {
      const { ctx, G, sources, cx, cy, R0 } = S;
      const { clamp, ease, mix } = h;
      ctx.clearRect(0, 0, W, H);

      // the ring at time t: one turn per loop, two breaths per loop, a slow three-lobed wobble
      const ring = (g, tt) => {
        const th = g.theta + (tt / D) * TAU;
        const br = 1 + 0.035 * Math.sin((tt / D) * TAU * 2);
        const rr = R0 * br + g.d + 9 * Math.sin(3 * th + (tt / D) * TAU * 2 + g.phase * 0.3);
        return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.92];
      };
      const shimmer = (g, tt) => 0.7 * Math.sin(tt * 2.1 + g.phase);
      const sig = ease.signature, inOut = ease.inOut;

      // where is grain g at time tt? a blend between the previous target and the next, along a curled path
      const pos = (g, tt) => {
        const a = clamp((tt - T_DIGITS - g.dDigit) / MOVE);
        const b = clamp((tt - T_BARS - g.dBar) / MOVE);
        const c = clamp((tt - T_RING - g.dRing) / (MOVE * 1.15));
        let from, to, p;
        if (c > 0) { from = g.bar; to = ring(g, tt); p = inOut(c); }
        else if (b > 0) { from = g.digit; to = g.bar; p = inOut(b); }
        else if (a > 0) { from = ring(g, tt); to = g.digit; p = sig(a); }
        else return ring(g, tt);
        const x = from[0] + (to[0] - from[0]) * p, y = from[1] + (to[1] - from[1]) * p;
        // curl: push sideways, perpendicular to the travel, strongest mid-flight
        const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
        const k = Math.sin(Math.PI * p) * g.curl * Math.min(90, len * 0.35);
        const settle = p >= 1 ? shimmer(g, tt) : 0;
        return [x - (dy / len) * k + settle, y + (dx / len) * k];
      };

      // colour: grains show their source while they are bars (staggered per source), neutral otherwise
      const colourOn = (si) => {
        const on = clamp((t - (T_BARS + 0.2 + si * 0.12)) / 0.6);
        const off = clamp((t - (T_RING + 0.1)) / 0.9);
        return on * (1 - off);
      };

      // draw in batches (source × size), each grain a short streak from where it was 40 ms ago
      ctx.lineCap = "round";
      // the grains are the subject, not outlines: a heavier pack thickens them, a hairline pack never thins them
      // fewer grains draw bigger, so the digits still read when each grain stands for more (456 grains at $40
      // each make a sparse 18,240 where 3,000 make a dense one); a set as dense as the example draws as before
      const dense = S.dense;
      const sizes = [Math.max(1.7, h.ui.stroke("fine", 1.7)) * dense, Math.max(2.7, h.ui.stroke("bold", 2.7)) * dense];
      for (let si = 0; si < sources.length; si++) {
        const col = mix(S.neutral, sources[si].colour, colourOn(si));
        for (let sz = 0; sz < 2; sz++) {
          ctx.strokeStyle = col;
          ctx.lineWidth = sizes[sz];
          ctx.globalAlpha = sz ? 0.95 : 0.7;
          ctx.beginPath();
          for (let i = 0; i < G.length; i++) {
            const g = G[i];
            if (g.si !== si || g.size !== sz) continue;
            const p = pos(g, t), q = pos(g, t - 0.022);
            ctx.moveTo(q[0], q[1]);
            ctx.lineTo(p[0] + 0.01, p[1]);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // ---- labels, decoded like an instrument readout ----
      const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%+=";
      const decode = (text, t0, t1) => {
        if (t < t0 || t > t1 + 0.5) return { s: "", o: 0 };
        let out = "";
        for (let i = 0; i < text.length; i++) {
          if (t < t0 + i * 0.018) break;
          const settled = t >= t0 + 0.16 + i * 0.03;
          const ch = text[i];
          out += settled || ch === " " || ch === "," ? ch : glyphs[(i * 7 + Math.floor(t * 30) * 13) % glyphs.length];
        }
        return { s: out, o: 1 - clamp((t - t1) / 0.5) };
      };
      const put = (node, d) => { h.text(node, d.s); node.style.opacity = d.o.toFixed(3); };

      // legend inside the ring: visible while the ring rests (both ends of the loop, so the seam is clean)
      const c = S.content;
      const legendTxt = (c.legend || "1 grain = {per} events").replace("{per}", S.per);
      const ringRest = Math.max(1 - clamp((t - (T_DIGITS - 0.4)) / 0.4), clamp((t - (T_RING + 1.6)) / 0.6));
      h.text(S.legend, legendTxt);
      S.legend.style.opacity = ringRest.toFixed(3);
      put(S.unit, decode(c.unit || "events this week", T_DIGITS + 1.5, T_BARS - 0.2));
      S.barLabels.forEach((L, i) => {
        const t0 = T_BARS + 1.2 + i * 0.1;
        L.b.style.opacity = (clamp((t - t0) / 0.3) * (1 - clamp((t - (T_RING - 0.3)) / 0.5))).toFixed(3);
        put(L.name, decode(L.s.name, t0, T_RING - 0.3));
        put(L.n, decode((L.s.grains * S.per).toLocaleString("en-US"), t0 + 0.15, T_RING - 0.3));
      });
    },
  });
})();
