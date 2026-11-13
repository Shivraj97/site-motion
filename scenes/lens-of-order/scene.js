/* lens-of-order: order where you see noise (Canvas 2D, per-cell field + Bayer dither).
 * A field of drifting metaball blobs (documents, records, anything uncertain) is drawn as 1-bit stipple in
 * ink: dither means "not understood yet". A magnifying lens wanders over it; inside the lens the same field is
 * classified: each blob is filled flat in its class colour, outlined in ink, and labelled with a confidence.
 * Where the lens has just been, a trail of coloured stipple lingers and thins back into ink.
 *
 * Pure in t: blob centres and the lens follow Lissajous paths with whole-number frequencies over D, the speckle
 * steps at 8 fps with frame index mod 8·D, and the trail samples the lens path at fixed lags. loop: 0.
 * Drawn on a 5 px cell grid into one ImageData, scaled up with smoothing off: chunky pixels are the look.
 */
(function () {
  const W = 1600, H = 900, D = 12, CS = 5;
  const GW = W / CS, GH = H / CS;
  const TAU = Math.PI * 2;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const MAG = 1.3; // the lens magnifies what it classifies
  const LAGS = [0.1, 0.2, 0.32, 0.46, 0.62, 0.8]; // trail samples, seconds behind the lens

  const rgb = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const lum = (c) => { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const pack = (c, a = 255) => { const [r, g, b] = rgb(c); return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; };
  const hash = (a, b) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2d); return ((x ^ (x >>> 15)) >>> 0) / 4294967296; };

  SiteMotion.scene({
    width: W, height: H, duration: D, loop: 0, still: 7,

    setup({ root, content, tokens, h }) {
      const { el, mix, rng } = h;
      const C = tokens.color;
      root.classList.add("lo");
      const canvas = el("canvas", "lo-canvas", root);
      const copy = el("div", "lo-copy", root);
      el("div", "lo-eyebrow", copy, content.eyebrow || "");
      el("div", "lo-h", copy, content.heading || "");
      el("div", "lo-sub", copy, content.sub || "");
      const key = el("div", "lo-key", copy);
      const k1 = el("span", "lo-key-item", key); el("i", "lo-key-dither", k1); el("span", "", k1, content.keyNoise || "unread");
      const k2 = el("span", "lo-key-item", key); el("i", "lo-key-flat", k2); el("span", "", k2, content.keyOrder || "classified");

      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      const off = document.createElement("canvas");
      off.width = GW; off.height = GH;
      const octx = off.getContext("2d");
      const img = octx.createImageData(GW, GH);
      const px = new Uint32Array(img.data.buffer);

      // class colours: the accent first, then the palette colours most unlike what is already chosen
      const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
      const pool = [C.accent, ...tokens.palette].filter((c) => dist(c, C.surface) > 40);
      const classes = content.classes.map((c) => ({ ...c }));
      const chosen = [];
      for (let i = 0; i < classes.length; i++) {
        let best = pool[i % pool.length], bestD = -1;
        for (const c of pool) { if (chosen.includes(c)) continue; const d = chosen.length ? Math.min(...chosen.map((x) => dist(x, c))) : 1e9; if (d > bestD) { bestD = d; best = c; } }
        chosen.push(best);
      }
      classes.forEach((c, i) => (c.colour = chosen[i]));
      // a fill this pale needs the trail stipple a shade deeper, or it vanishes on the paper
      classes.forEach((c) => { let s = c.colour; for (let k = 0; k < 5 && Math.abs(lum(s) - lum(C.paper)) < 0.3; k++) s = mix(s, C.ink, 0.2); c.stipple = s; });

      // blobs: seeded positions in the stage (right of the copy), Lissajous drift with whole-number frequencies
      const r = rng(content.seed ?? 11);
      const n = content.count ?? 20;
      const blobs = [];
      for (let i = 0; i < n; i++) {
        const col = i % 5, row = Math.floor(i / 5);
        blobs.push({
          cls: (i * 3 + row) % classes.length,
          bx: 735 + col * 165 + (r() - 0.5) * 70,
          by: 150 + row * 185 + (r() - 0.5) * 60,
          ax: 30 + r() * 60, ay: 25 + r() * 50,
          m: 1 + Math.floor(r() * 2), nn: 1 + Math.floor(r() * 2),
          p: r() * TAU, q: r() * TAU,
          rad: 26 + r() * 20,
          conf: 0.86 + r() * 0.13,
        });
      }
      blobs.forEach((b) => {
        const chip = el("div", "lo-chip", root);
        chip.style.setProperty("--c", classes[b.cls].colour);
        b.chip = chip;
        h.text(chip, `${classes[b.cls].name} · ${b.conf.toFixed(2)}`);
      });

      const lens = el("div", "lo-lens-tag", root);
      h.text(lens, content.lensTag || "classifying");
      const readout = el("div", "lo-readout", root);

      const colors = {
        paper: pack(C.paper), ink: pack(C.ink), surface: pack(C.surface),
        grid: pack(mix(C.surface, C.ink, 0.12)),
        cls: classes.map((c) => pack(c.colour)), rule: classes.map((c) => pack(mix(c.colour, C.ink, 0.16))), stip: classes.map((c) => pack(c.stipple)),
      };
      const f = new Float32Array(GW * GH), cl = new Int8Array(GW * GH);
      return { ctx, octx, off, img, px, f, cl, blobs, classes, colors, lens, readout, content, C };
    },

    render(t, S, h) {
      const { ctx, octx, off, img, px, f, cl, blobs, colors } = S;
      const { clamp } = h;
      const LR = S.content.lensRadius ?? 185;
      const lensAt = (tt) => [1100 + 300 * Math.sin((tt / D) * TAU + 0.4), 455 + 175 * Math.sin((tt / D) * TAU * 2 + 0.9)];
      const [lx, ly] = lensAt(t);
      const trail = LAGS.map((lag, k) => { const p = lensAt(t - lag); return [p[0], p[1], LR * (1 - (k + 1) * 0.1)]; });

      // blob centres at t
      // compact support: each blob is (1 - d²/R²)³ out to R = 2.3·rad and zero beyond, so blobs stay separate
      // until they drift close (a 1/d² field never reaches zero and the whole stage fuses into one mass)
      const B = blobs.map((b) => [b.bx + b.ax * Math.sin((t / D) * TAU * b.m + b.p), b.by + b.ay * Math.sin((t / D) * TAU * b.nn + b.q), 1 / (2.3 * b.rad) ** 2, b.cls]);
      const field = (x, y, out) => {
        let s = 0, best = 0, bc = -1;
        for (let i = 0; i < B.length; i++) {
          const dx = x - B[i][0], dy = y - B[i][1];
          const q = 1 - (dx * dx + dy * dy) * B[i][2];
          if (q <= 0) continue;
          const v = q * q * q;
          s += v; if (v > best) { best = v; bc = B[i][3]; }
        }
        out.c = bc < 0 ? 0 : bc; return s;
      };
      const ISO = 0.1; // inside the lens the class edge sits where the stipple halo fades outside, so a blob keeps its size
      const tmp = { c: 0 };
      const frame = Math.floor(t * 8) % (8 * D); // speckle steps at 8 fps and wraps with the loop

      // pass 1: field and class per cell, magnified inside the lens
      for (let gy = 0; gy < GH; gy++) {
        const y = gy * CS + CS / 2;
        for (let gx = 0; gx < GW; gx++) {
          const x = gx * CS + CS / 2, i = gy * GW + gx;
          const dx = x - lx, dy = y - ly;
          const inLens = dx * dx + dy * dy < LR * LR;
          const v = inLens ? field(lx + dx / MAG, ly + dy / MAG, tmp) : field(x, y, tmp);
          f[i] = inLens ? -v - 1 : v; // negative marks lens cells (value -1 - v)
          cl[i] = tmp.c;
        }
      }
      // pass 2: colour each cell
      for (let gy = 0; gy < GH; gy++) {
        const y = gy * CS + CS / 2;
        for (let gx = 0; gx < GW; gx++) {
          const x = gx * CS + CS / 2, i = gy * GW + gx;
          const th = BAYER[(gx & 3) + ((gy & 3) << 2)];
          const raw = f[i];
          if (raw < 0) {
            // inside the lens: flat classes, ink outlines where the class or the iso line changes
            const v = -raw - 1;
            const inside = v > ISO;
            let edge = false;
            if (inside) {
              const nb = [i - 1, i + 1, i - GW, i + GW];
              for (const j of nb) { if (j < 0 || j >= f.length) continue; const w = f[j] < 0 ? -f[j] - 1 : 0; if (w <= ISO || cl[j] !== cl[i]) { edge = true; break; } }
            }
            px[i] = edge ? colors.ink : inside ? (gy % 3 === 0 && gx % 9 !== 0 ? colors.rule[cl[i]] : colors.cls[cl[i]]) : (gx % 4 === 0 && gy % 4 === 0 ? colors.grid : colors.surface);
            continue;
          }
          // outside: 1-bit stipple; the trail tints it with the class colour and thins it out
          const v = clamp((raw - 0.03) / 0.42);
          let lag = -1;
          for (let k = 0; k < trail.length; k++) { const [tx, ty, tr] = trail[k]; const ex = x - tx, ey = y - ty; if (ex * ex + ey * ey < tr * tr) { lag = k; break; } }
          const quiet = clamp((x - 600) / 220); // keep the copy column calm
          const speck = hash(i, frame) < 0.03 * quiet * (1 - v);
          if (lag >= 0) {
            const keep = 1 - lag / trail.length;
            px[i] = Math.min(1, v * 1.4) * (0.45 + 0.55 * keep) > th ? colors.stip[cl[i]] : colors.paper;
          } else {
            px[i] = v * quiet > th || speck ? colors.ink : colors.paper;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, W, H);

      // the lens body: a crisp rim, a tick ring that turns with the loop, a soft rim shadow
      const ink = S.C.ink;
      ctx.save();
      ctx.strokeStyle = h.alpha(ink, 0.12); ctx.lineWidth = 10; // sm-native: a soft rim shadow, not a line
      ctx.beginPath(); ctx.arc(lx, ly + 3, LR + 3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = h.ui.strokeColor(ink); ctx.lineWidth = h.ui.stroke("bold", 2.5);
      ctx.beginPath(); ctx.arc(lx, ly, LR, 0, TAU); ctx.stroke();
      ctx.lineWidth = h.ui.stroke("regular", 1.6);
      const spin = (t / D) * TAU;
      ctx.beginPath();
      for (let k = 0; k < 72; k++) {
        const a = spin + (k / 72) * TAU, long = k % 6 === 0;
        const r0 = LR + 8, r1 = LR + (long ? 19 : 13);
        ctx.moveTo(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0);
        ctx.lineTo(lx + Math.cos(a) * r1, ly + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.restore();
      S.lens.style.transform = `translate(${lx}px, ${ly - LR - 52}px) translateX(-50%)`;

      // chips: a blob is labelled when its (magnified) centre sits well inside the lens
      let seen = 0, confSum = 0;
      const placed = []; // visible chips so far; a chip that would overlap one moves below it (fixed order, so pure)
      blobs.forEach((b, i) => {
        const mx = lx + (B[i][0] - lx) * MAG;
        let my = ly + (B[i][1] - ly) * MAG;
        const d = Math.hypot(mx - lx, my - ly);
        const o = clamp((LR - 34 - d) / 36);
        if (o > 0.5) { seen++; confSum += b.conf; }
        if (o > 0.02) {
          for (let k = 0; k < placed.length; k++) { const [px2, py2] = placed[k]; if (Math.abs(mx - px2) < 200 && Math.abs(my - py2) < 38) { my = py2 + 40; k = -1; } }
          placed.push([mx, my]);
        }
        b.chip.style.opacity = o.toFixed(3);
        b.chip.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) translate(-50%, -50%)`;
      });
      const c = S.content;
      h.text(S.readout, seen ? `${c.readoutSeen || "in view"} ${seen} · ${c.readoutConf || "mean confidence"} ${(confSum / seen).toFixed(2)}` : `${c.readoutSeen || "in view"} 0 · ${c.readoutIdle || "scanning"}`);
    },
  });
})();
