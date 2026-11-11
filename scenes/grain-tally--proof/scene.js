/* grain-tally--proof: social proof by volume (Canvas 2D + DOM).
 * The same grains as grain-tally, each a fixed batch of customers, poured from above into one glass jar per
 * region. Each jar's level is exactly the grains that landed in it; its count and the total beside the quote
 * are read from the landings (total = grains × perGrain). Then the jar floors slide open, the grains fall
 * through, and the pour begins again.
 *
 * Pure in t: every grain has a seeded cell in its jar and a landing time; its launch is the landing time
 * minus its closed-form fall under gravity, so the level rises steadily. Draining is the same fall from the
 * cell, clipped at the floor. Streaks come from the analytic position 22 ms earlier. loop: 0; the jars are
 * empty at both ends.
 */
(function () {
  const W = 1600, H = 900, D = 12;

  // timeline (seconds)
  const T_POUR = 0.75; // first grains land (the first launch is after t = 0, so the seam is empty)
  const T_DRAIN = 10.15; // floors open
  const GRAV = 2400, V0 = 260, Y0 = -14; // fall: px/s², launch speed, launch height

  const hexRgb = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  };
  const lum = (c) => { const [r, g, b] = hexRgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  SiteMotion.scene({
    width: W, height: H, duration: D, loop: 0, still: 8.2,

    setup({ root, content, tokens, h }) {
      const { el, mix, rng } = h;
      const C = tokens.color, pal = tokens.palette;
      const dark = lum(C.paper) < 0.4;
      root.classList.add("gtp");
      const canvas = el("canvas", "gtp-canvas", root);
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // ---- the data: grains per region must add up exactly ----
      const per = content.perGrain || 4;
      const jars = content.sources.map((s) => ({ ...s, n: Math.round(s.count / per) }));
      const nMax = Math.max(...jars.map((j) => j.n));
      const readable = (c) => { let x = c; for (let k = 0; k < 6 && Math.abs(lum(x) - lum(C.paper)) < 0.28; k++) x = mix(x, dark ? "#ffffff" : C.ink, 0.22); return x; };
      jars.forEach((j, i) => (j.colour = readable(i === 0 ? C.accent : pal[(i - 1) % pal.length])));

      // ---- jar geometry: same jar, same scale, so levels compare ----
      const JW = 164, GAP = 56, WALL = 7;
      const mouth = 250, base = 690;
      const x0 = content.jarsX ?? 166;
      const IW = JW - WALL * 2;
      const fill = content.fill ?? 0.8; // the fullest jar fills this share of the glass
      const Lmax = (base - mouth - 12) * fill;
      const pitch = Math.sqrt((IW * Lmax) / nMax);
      const cols = Math.max(4, Math.floor(IW / pitch));
      const dx = IW / cols;
      const rowH = pitch * (pitch / dx); // keep the area per grain, so the level stays true to the count
      const yOf = (value) => base - 3 - (value / per / cols) * rowH; // the level a count reaches
      jars.forEach((j, i) => { j.x = x0 + i * (JW + GAP); j.xi = j.x + WALL; j.cx = j.x + JW / 2; });

      const r = rng(content.seed ?? 11);
      const G = [];
      jars.forEach((j, ji) => {
        // a jittered hex grid, taken in the order a poured pile fills: low cells first, the middle a little
        // ahead of the walls, so the surface stays a soft dome while it rises
        const rows = Math.ceil(j.n / cols) + 4, cells = [];
        for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
          const x = j.xi + (c + 0.5 + (row % 2 ? 0.22 : -0.22) + (r() - 0.5) * 0.36) * dx;
          const y = base - 3 - (row + 0.5 + (r() - 0.5) * 0.4) * rowH;
          const off = (x - j.cx) / (IW / 2);
          cells.push({ x: Math.min(j.xi + IW - 1.5, Math.max(j.xi + 1.5, x)), y, key: base - y + 11 * off * off });
        }
        cells.sort((a, b) => a.key - b.key);
        const t0 = T_POUR + h.motion.stagger(ji, 0.14);
        const dur = 1.7 + 3.5 * (j.n / nMax);
        j.done = t0 + dur;
        for (let k = 0; k < j.n; k++) {
          const cell = cells[k];
          const land = t0 + dur * (k / j.n) + r() * 0.03;
          const d = cell.y - Y0;
          const tau = (-V0 + Math.sqrt(V0 * V0 + 2 * GRAV * d)) / GRAV;
          G.push({
            ji, land, tau, launch: land - tau,
            sx: j.cx + (r() - 0.5) * 9, x: cell.x, y: cell.y,
            size: r() < 0.7 ? 0 : 1,
            // the floor opens from the middle: low grains go first, a column falls together
            drain: T_DRAIN + 0.12 + h.motion.stagger(ji, 0.08) + ((base - cell.y) / Lmax) * 0.32 + r() * 0.05,
          });
        }
      });
      const tLast = Math.max(...jars.map((j) => j.done)) + 0.03;

      // ---- DOM: the scale, the jar labels, the legend ----
      const tickStep = content.tick || 2000;
      const ticks = [];
      for (let v = tickStep; yOf(v) > mouth + 18; v += tickStep) ticks.push(v);
      ticks.forEach((v) => {
        const lab = el("div", "gtp-tick", root, v.toLocaleString("en-US"));
        lab.style.left = x0 - 66 + "px"; lab.style.top = yOf(v) + "px";
      });
      const labels = jars.map((j) => {
        const b = el("div", "gtp-jar", root);
        b.style.left = j.cx + "px"; b.style.top = base + 18 + "px";
        b.style.setProperty("--c", j.colour);
        const name = el("div", "gtp-jar-name", b);
        el("span", "gtp-jar-dot", name);
        el("span", "", name, j.name);
        const n = el("div", "gtp-jar-n", b);
        return { n };
      });
      const legend = el("div", "gtp-legend", root, (content.legend || "1 grain = {per}").replace("{per}", per));
      legend.style.left = x0 + "px"; legend.style.top = base + 108 + "px";

      // ---- the proof column ----
      const col = el("div", "gtp-col", root);
      el("div", "gtp-eyebrow", col, content.eyebrow || "");
      el("div", "gtp-h", col, content.heading || "");
      const total = el("div", "gtp-total", col);
      const rule = el("div", "gtp-rule", col);
      el("div", "gtp-unit", col, content.unit || "");
      el("p", "gtp-quote", col, content.quote || "");
      const p = content.person || {};
      const att = el("div", "gtp-att", col);
      const av = el("div", "gtp-av", att, p.initials || "");
      av.style.background = C.accent; av.style.color = h.inkOn(C.accent);
      const who = el("div", "gtp-who", att);
      el("div", "gtp-who-n", who, p.name || "");
      el("div", "gtp-who-r", who, [p.role, p.company].filter(Boolean).join(", "));

      const glass = mix(C.paper, C.ink, dark ? 0.42 : 0.3);
      const glassFill = mix(C.paper, C.ink, dark ? 0.05 : 0.03);
      const glint = mix(C.paper, dark ? "#ffffff" : C.ink, dark ? 0.12 : 0.07);
      return { ctx, G, jars, per, JW, IW, WALL, mouth, base, ticks, yOf, labels, total, rule, tLast, glass, glassFill, glint };
    },

    render(t, S, h) {
      const { ctx, G, jars, JW, IW, WALL, mouth, base } = S;
      const { clamp, tw } = h;
      ctx.clearRect(0, 0, W, H);

      // where is grain g at time tt? null before it leaves the spout
      const pos = (g, tt) => {
        if (tt < g.launch) return null;
        if (tt >= g.drain) { const w = tt - g.drain; return [g.x, g.y + 0.5 * GRAV * w * w]; }
        const u = tt - g.launch;
        if (u >= g.tau) return [g.x, g.y];
        const y = Y0 + V0 * u + 0.5 * GRAV * u * u;
        const f = clamp((y - mouth) / (g.y - mouth)); // a cone: the stream opens below the mouth
        const q = f * f;
        return [g.sx + (g.x - g.sx) * q, y];
      };

      // ---- the jars: glass behind, grains, glass in front ----
      const open = tw(t, T_DRAIN, 0.3, "snappy") * (1 - tw(t, T_DRAIN + 1.55, 0.4, "inOut"));
      const rad = h.ui.radius("lg", 22);
      const line = h.ui.stroke("regular", 1.6);
      const landed = jars.map(() => 0);
      const sizes = [Math.max(1.8, h.ui.stroke("fine", 1.8)), Math.max(2.8, h.ui.stroke("bold", 2.8))];
      ctx.lineCap = "round";
      jars.forEach((j, ji) => {
        // glass body
        ctx.fillStyle = S.glassFill;
        ctx.fillRect(j.x + WALL * 0.5, mouth, JW - WALL, base - mouth);
        // the scale: a short tick on the inner wall at every step
        ctx.strokeStyle = S.glass; ctx.lineWidth = h.ui.stroke("fine", 1);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        S.ticks.forEach((v) => { const y = Math.round(S.yOf(v)) + 0.5; ctx.moveTo(j.x + WALL * 0.5, y); ctx.lineTo(j.x + WALL * 0.5 + 10, y); });
        ctx.stroke();
        ctx.globalAlpha = 1;

        // grains, clipped to the jar's column above its floor
        ctx.save();
        ctx.beginPath(); ctx.rect(j.xi, -40, IW, base - 1.5 + 40); ctx.clip();
        for (let sz = 0; sz < 2; sz++) {
          ctx.strokeStyle = j.colour;
          ctx.lineWidth = sizes[sz];
          ctx.globalAlpha = sz ? 0.95 : 0.72;
          ctx.beginPath();
          for (let i = 0; i < G.length; i++) {
            const g = G[i];
            if (g.ji !== ji || g.size !== sz) continue;
            if (t >= g.land) landed[ji]++;
            const p = pos(g, t);
            if (!p || p[1] > base + 4) continue;
            const q = pos(g, t - 0.022) || p;
            ctx.moveTo(q[0], q[1]);
            ctx.lineTo(p[0] + 0.01, p[1]);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // glass outline: walls with rounded heels, a lip at the mouth, and a floor that slides open
        const xl = j.x + WALL * 0.5, xr = j.x + JW - WALL * 0.5;
        ctx.strokeStyle = S.glass; ctx.lineWidth = line;
        ctx.beginPath();
        ctx.moveTo(xl - 8, mouth); ctx.lineTo(xl, mouth);
        ctx.lineTo(xl, base - rad);
        ctx.arcTo(xl, base, xl + rad, base, rad);
        const half = (xr - xl) / 2 - rad;
        ctx.lineTo(xl + rad + half * (1 - open), base);
        ctx.moveTo(xr - rad - half * (1 - open), base);
        ctx.lineTo(xr - rad, base);
        ctx.arcTo(xr, base, xr, base - rad, rad);
        ctx.lineTo(xr, mouth); ctx.lineTo(xr + 8, mouth);
        ctx.stroke();
        // a glint down the glass
        ctx.strokeStyle = S.glint; ctx.lineWidth = h.ui.stroke("bold", 3);
        ctx.beginPath(); ctx.moveTo(xr - 14, mouth + 26); ctx.lineTo(xr - 14, mouth + 120); ctx.stroke();
      });

      // ---- numbers read from the landings ----
      const shown = 1 - tw(t, T_DRAIN - 0.1, 0.35, "soft"); // fades with the drain; the jars restart at zero
      const show = clamp((t - (T_POUR - 0.3)) / 0.3) * shown;
      let sum = 0;
      S.labels.forEach((L, i) => {
        const v = landed[i] * S.per;
        sum += v;
        h.text(L.n, v.toLocaleString("en-US"));
        L.n.style.opacity = show.toFixed(3);
      });
      h.text(S.total, sum.toLocaleString("en-US"));
      S.total.style.opacity = show.toFixed(3);
      const read = tw(t, S.tLast, 0.45, "snappy") * shown;
      S.rule.style.transform = `scaleX(${read.toFixed(4)})`;
    },
  });
})();
