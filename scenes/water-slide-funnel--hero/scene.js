/* water-slide-funnel--hero: the conversion funnel's water slide at hero scale (SVG, closed-form paths).
 * One long flume sweeps across the frame from a start platform (the first stage) to one wide Paid pool: a top
 * run, a plunge, a loop-the-loop, a hairpin and a return run to a ski-jump lip. One rider per loop rides it.
 * Its speed along the flume comes from a 1-D slide simulated once at load (gravity along the slope, a little
 * drag), rescaled to a fixed ride time, so it creeps off the platform, races down the plunge and slows over
 * the top of the loop. Off the lip it flies a ballistic arc into the pool. The splash throws a jet and spray,
 * and a wave runs across the water; the share of visitors who pay rises out of the pool on that wave (first
 * ride, the intro) and from then on floats there, lifted again by every splash.
 * Intro: the first ride (0 → 8). Loop: 8 → 16, one ride; the rider sinks away before the seam.
 */
(function () {
  const W = 1600, H = 900, P = 8; // one ride per loop
  const SURF = 770, POOL = { l: 96, r: 784, rim: 732, bot: 852 }, GROUND = 852;
  const R = 14; // the rider
  const SX = 714; // where it hits the water
  const WAVE = 900; // px/s, the splash's wave across the pool

  // ---- the course: a dense polyline, built once ----
  const pts = [];
  const add = (x, y) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(x - l[0], y - l[1]) > 0.4) pts.push([x, y]); };
  const cubic = (a, b, c, d, n) => {
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
      add(A * a[0] + B * b[0] + C * c[0] + D * d[0], A * a[1] + B * b[1] + C * c[1] + D * d[1]);
    }
  };
  const REST = [950, 187];
  cubic(REST, [966, 188], [980, 192], [996, 195], 8);
  const flumeFrom = pts.length - 1;
  cubic([996, 195], [1052, 203], [1090, 230], [1150, 242], 50);
  cubic([1150, 242], [1215, 255], [1120, 520], [1210, 520], 110);
  const LOOP = { x: 1210, cy: 420, a: 26, bx: 100, by: 100 };
  let overFrom = 0;
  for (let i = 1; i <= 180; i++) {
    const th = (i / 180) * Math.PI * 2;
    add(LOOP.x + LOOP.a * th + LOOP.bx * Math.sin(th), LOOP.cy + LOOP.by * Math.cos(th));
    if (i === 112) overFrom = pts.length - 1; // past the left of the loop: from here the way down runs over the way in
  }
  const overTo = pts.length - 1 + 14;
  const lx = LOOP.x + LOOP.a * Math.PI * 2;
  cubic([lx, 520], [lx + 42, 520], [1420, 560], [1460, 560], 40);
  for (let i = 1; i <= 64; i++) { const a = -Math.PI / 2 + (i / 64) * Math.PI; add(1460 + 70 * Math.cos(a), 630 + 70 * Math.sin(a)); }
  cubic([1460, 700], [1200, 700], [1010, 726], [922, 724], 100);
  const LIP = [858, 707];
  for (let i = 1; i <= 16; i++) { const u = i / 16, v = 1 - u; add(v * v * 922 + 2 * v * u * 884 + u * u * LIP[0], v * v * 724 + 2 * v * u * 725 + u * u * LIP[1]); }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const LEN = cum[cum.length - 1];
  const seg = (s) => { let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } return lo; };
  const at = (s) => {
    const i = seg(Math.max(0, Math.min(LEN, s))), j = Math.min(i + 1, pts.length - 1);
    const f = cum[j] > cum[i] ? (s - cum[i]) / (cum[j] - cum[i]) : 0;
    return [pts[i][0] + (pts[j][0] - pts[i][0]) * f, pts[i][1] + (pts[j][1] - pts[i][1]) * f];
  };

  // ---- the ride: gravity along the slope, linear drag; then rescaled to RIDE seconds ----
  const G = 1900, DRAG = 0.5, dt = 1 / 600;
  const simT = [0], simS = [0];
  { let s = 0, v = 60, t = 0;
    while (s < LEN) {
      const i = seg(s), j = Math.min(i + 1, pts.length - 1);
      const slope = cum[j] > cum[i] ? (pts[j][1] - pts[i][1]) / (cum[j] - cum[i]) : 0; // screen y grows downhill
      v = Math.max(45, v + (G * slope - DRAG * v) * dt);
      s += v * dt; t += dt;
      simT.push(t); simS.push(Math.min(LEN, s));
    }
  }
  const PUSH = 1.0, RIDE = 3.4;
  const K = RIDE / simT[simT.length - 1];
  const sAt = (tau) => {
    const x = tau / K; let lo = 0, hi = simT.length - 1;
    if (x >= simT[hi]) return LEN;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (simT[m] <= x) lo = m; else hi = m; }
    return simS[lo] + (simS[hi] - simS[lo]) * ((x - simT[lo]) / (simT[hi] - simT[lo]));
  };
  // the jump: leaves the lip along its tangent, lands at SX on the surface after FLIGHT seconds
  const FLIGHT = 0.36, OFF = PUSH + RIDE, SPLASH = OFF + FLIGHT;
  const tan = [pts[pts.length - 1][0] - pts[pts.length - 3][0], pts[pts.length - 1][1] - pts[pts.length - 3][1]];
  const VX = (SX - LIP[0]) / FLIGHT, VY = (VX * tan[1]) / tan[0];
  const GF = (2 * (SURF - LIP[1] - VY * FLIGHT)) / (FLIGHT * FLIGHT);
  const UP = SPLASH + 0.12; // the rider surfaces

  SiteMotion.scene({
    width: W,
    height: H,
    duration: 2 * P,
    loop: P,
    still: P + SPLASH + 0.42,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("wh");
      const rand = rng(content.seed || 11);
      const stages = content.stages || [];
      const first = stages[0] || { name: "Visit", value: 1000 }, last = stages[stages.length - 1] || { name: "Paid", value: 60 };
      const fmt = (n) => Math.round(n).toLocaleString("en-US");
      const pct = (last.value / Math.max(1, first.value)) * 100;
      const share = (pct < 10 && Math.round(pct * 10) % 10 ? pct.toFixed(1) : String(Math.round(pct))) + "%";

      const INK = ui.strokeColor(C.stroke || C.ink);
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "wh-svg" }, root);
      const defs = svg("defs", {}, s);
      const strutC = mix(C.line, C.paper, 0.1);
      const fine = ui.stroke("fine", 2);

      // ---- scaffold: struts under the flume, the platform tower, the ground ----
      const yAt = (from, to, x) => { let best = null; for (let i = from; i <= to; i++) if (!best || Math.abs(pts[i][0] - x) < Math.abs(best[0] - x)) best = pts[i]; return best[1]; };
      const loopFrom = pts.findIndex((p, i) => i > flumeFrom && p[1] >= 519.5);
      const posts = [
        [1062, yAt(flumeFrom, loopFrom, 1062)], [1128, yAt(flumeFrom, loopFrom, 1128)],
        [1252, 532], [1346, 532], [1502, 690], [884, 726],
      ];
      posts.forEach(([x, y]) => svg("line", { x1: x, y1: y + 16, x2: x, y2: GROUND, stroke: strutC, "stroke-width": fine }, s));
      [[1062, 1128], [1252, 1346], [1346, 1502]].forEach(([a, b]) => svg("line", { x1: a, y1: GROUND - 70, x2: b, y2: GROUND - 70, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s));
      // tower: two legs with cross braces, a ladder, the deck and a rail
      const legL = 906, legR = 986, deck = 203;
      [legL, legR].forEach((x) => svg("line", { x1: x, y1: deck, x2: x, y2: GROUND, stroke: strutC, "stroke-width": ui.stroke("regular", 2.5) }, s));
      for (let y = deck + 30; y + 150 <= GROUND; y += 150) {
        svg("path", { d: `M${legL} ${y} L${legR} ${y + 150} M${legR} ${y} L${legL} ${y + 150}`, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5), fill: "none" }, s);
      }
      svg("path", { d: `M878 ${deck} V${GROUND} M896 ${deck} V${GROUND}`, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5), fill: "none" }, s);
      for (let y = deck + 22; y < GROUND; y += 24) svg("line", { x1: 878, y1: y, x2: 896, y2: y, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s);
      svg("line", { x1: 40, y1: GROUND, x2: W - 40, y2: GROUND, ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      svg("path", { d: `M908 ${deck - 34} H934 M908 ${deck - 34} V${deck}`, stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round", fill: "none" }, s);
      svg("line", { x1: 872, y1: deck, x2: 998, y2: deck, stroke: INK, "stroke-width": ui.stroke("bold", 4), "stroke-linecap": "round" }, s);

      // ---- the pool: the swimming rider sits under the water so it floats half in; water; basin ----
      const goalTint = mix(C.accent, C.surface, 0.45), waterTint = mix(pal[2 % pal.length], C.surface, 0.35);
      const BALL = ui.strokeAttrs("fine", 1.4, C.stroke || C.ink);
      const riderFill = C.warning || pal[4 % pal.length]; // one rider, in the warmest token, so it reads on any water
      const swim = svg("circle", { r: R, fill: riderFill, ...BALL, opacity: 0 }, s);
      const clip = svg("clipPath", { id: "wh-pool" }, defs);
      svg("rect", { x: POOL.l, y: POOL.rim - 80, width: POOL.r - POOL.l, height: POOL.bot - POOL.rim + 80, rx: ui.radius("md", 14) }, clip);
      // sm-native-start: water, flume and splash are the scene's material, not outlines a look should restyle
      const water = svg("path", { d: "", fill: goalTint, "clip-path": "url(#wh-pool)" }, s);
      const crest = svg("path", { d: "", fill: "none", stroke: C.accent, "stroke-width": 2.5, "stroke-linecap": "round", "clip-path": "url(#wh-pool)" }, s);
      // sm-native-end
      svg("path", { d: `M${POOL.l} ${POOL.rim} V${POOL.bot - 14} q0 14 14 14 H${POOL.r - 14} q14 0 14 -14 V${POOL.rim}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 2.5), "stroke-linecap": "round" }, s);

      // ---- the splash: a jet, two rings, spray ----
      // sm-native-start: splash shapes are water, drawn by the scene
      const sprayC = mix(C.accent, C.accentInk || C.ink, 0.2);
      const crown = svg("path", { d: "", fill: goalTint, stroke: C.accent, "stroke-width": 2, "stroke-linejoin": "round", opacity: 0 }, s);
      const jet = svg("path", { d: "", fill: goalTint, stroke: C.accent, "stroke-width": 2, opacity: 0 }, s);
      const rings = [0, 1].map(() => svg("ellipse", { cx: SX, cy: SURF, rx: 0, ry: 0, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0, "clip-path": "url(#wh-pool)" }, s));
      const surfRing = svg("ellipse", { cx: 0, cy: SURF, rx: 0, ry: 0, fill: "none", stroke: C.accent, "stroke-width": 1.5, opacity: 0 }, s);
      const drops = Array.from({ length: 26 }, (_, i) => {
        const ang = -Math.PI / 2 + (rand() - 0.5) * 0.95, sp = 320 + rand() * 520;
        return { vx: Math.cos(ang) * sp - 20, vy: Math.sin(ang) * sp, at: rand() * 0.08, r: 2.5 + rand() * 4, node: svg("circle", { r: 0, fill: i % 3 ? sprayC : goalTint, stroke: i % 3 ? "none" : C.accent, "stroke-width": 1.5, opacity: 0 }, s) };
      });

      // ---- the flume: the whole course, then the loop's way down again on top, so it crosses over its way in ----
      // (the overlay has butt ends, flush with the course under it; its dashes are offset to line up)
      const dOf = (a, b) => "M" + pts.slice(a, b + 1).map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
      const flows = [[flumeFrom, pts.length - 1, "round"], [overFrom, overTo, "butt"]].map(([a, b, cap]) => {
        const d = dOf(a, b), base = { d, "stroke-linecap": cap, "stroke-linejoin": "round", fill: "none" };
        svg("path", { ...base, stroke: INK, "stroke-width": 34 }, s);
        svg("path", { ...base, stroke: C.surface, "stroke-width": 26 }, s);
        svg("path", { ...base, stroke: waterTint, "stroke-width": 12 }, s);
        const f = svg("path", { d, stroke: C.surface, "stroke-width": 3, "stroke-dasharray": "6 18", "stroke-linecap": "round", fill: "none", opacity: 0.9 }, s);
        f.dataset.from = (cum[a] - cum[flumeFrom]).toFixed(2);
        return f;
      });
      // sm-native-end
      const rider = svg("circle", { r: R, fill: riderFill, ...BALL, opacity: 0 }, s);

      // ---- copy ----
      const copy = el("div", "wh-copy", root);
      const lines = [el("div", "wh-eyebrow", copy, content.eyebrow || ""), el("h1", "wh-h", copy, content.heading || ""), el("div", "wh-sub", copy, content.sub || "")];
      const start = el("div", "wh-start", root);
      el("div", "wh-start-name", start, first.name);
      el("div", "wh-start-n", start, fmt(first.value));
      el("div", "wh-start-note", start, content.note || "");
      const paid = el("div", "wh-paid", root, last.name);
      const row = el("div", "wh-figrow", root);
      row.style.bottom = H - SURF + "px";
      const clipBox = el("div", "wh-clip", row);
      const num = el("div", "wh-num", clipBox);
      const glyphs = [...share].map((ch) => el("span", "wh-g", num, ch));
      const cap = el("div", "wh-cap", row);
      el("div", "wh-cap-t", cap, content.caption || "");
      // the detail on two short lines (the count, then the period), so it stays clear of the splash at 16 px
      const detail = el("div", "wh-cap-d", cap);
      el("div", "", detail, `${fmt(last.value)} ${content.of || "of"} ${fmt(first.value)}`);
      if (content.note) el("div", "", detail, content.note);
      // glyph centres, estimated from the type size (the number floats on the wave under each one)
      const gx = glyphs.map((_, i) => POOL.l + 8 + (i + 0.5) * 128);

      return { rider, swim, water, crest, crown, jet, rings, surfRing, drops, flows, lines, start, paid, glyphs, gx, cap, detail };
    },

    render(t, S, h) {
      const { tw, ease, clamp, lerp, motion } = h;
      const k = Math.floor(t / P), rs = k * P, u = t - rs;
      const a = u - SPLASH; // time since this ride's splash

      // the water surface: an idle swell (one cycle per 4 s), the splash crater, a wave running out both ways
      const surfY = (x) => {
        let y = SURF + 1.6 * Math.sin(Math.PI * 2 * (x / 220 - t / 4));
        if (a > 0 && a < 1.6) {
          const A = 15 * Math.pow(1 - a / 1.6, 1.6) * Math.min(1, a / 0.1);
          y -= A * Math.exp(-(((x - (SX - WAVE * a)) / 54) ** 2));
          y -= 0.5 * A * Math.exp(-(((x - (SX + 380 * a)) / 40) ** 2));
          if (a < 0.4) y += 12 * Math.sin((Math.PI * a) / 0.4) * Math.exp(-(((x - SX) / 34) ** 2));
        }
        return y;
      };
      const top = [];
      for (let x = POOL.l; x <= POOL.r + 0.1; x += 8) top.push([x, surfY(x)]);
      const line = top.map((p) => p[0] + " " + p[1].toFixed(1)).join(" L");
      S.water.setAttribute("d", `M${line} L${POOL.r} ${POOL.bot + 2} L${POOL.l} ${POOL.bot + 2} Z`);
      S.crest.setAttribute("d", "M" + line);

      // the flume's water runs: 48 px/s over a 24 px dash, 16 whole periods per ride
      const flow = -((t * 48) % 24);
      S.flows.forEach((f) => f.setAttribute("stroke-dashoffset", (flow + Number(f.dataset.from)).toFixed(2)));

      // ---- the rider ----
      const appear = tw(t, rs + 0.05, 0.55, "signature");
      let x, y, show = 1;
      if (u < PUSH) {
        x = REST[0] - 5 * Math.sin(Math.PI * clamp((u - 0.55) / 0.42)); // a small rock back before it goes
        y = REST[1] - (1 - appear) * 34;
      } else if (u < OFF) {
        [x, y] = at(sAt(u - PUSH));
      } else if (u < SPLASH) {
        const f = u - OFF;
        x = LIP[0] + VX * f; y = LIP[1] + VY * f + 0.5 * GF * f * f;
      } else { show = 0; x = SX; y = SURF; }
      S.rider.setAttribute("cx", x.toFixed(1)); S.rider.setAttribute("cy", y.toFixed(1));
      S.rider.setAttribute("r", (R * (u < PUSH ? appear : 1)).toFixed(2));
      S.rider.setAttribute("opacity", show ? 1 : 0);

      // after the splash it surfaces, drifts, and sinks away before the next ride
      const up = tw(t, rs + UP, 0.45, "soft"), sink = tw(t, rs + P - 0.95, 0.6, "inOut");
      if (u >= UP) {
        const sx = SX - 100 - 40 * ease.soft(clamp((u - UP) / (P - UP)));
        const sy = lerp(SURF + R * 2.2, surfY(sx) - R * 0.4, up) + sink * R * 2.4;
        S.swim.setAttribute("cx", sx.toFixed(1)); S.swim.setAttribute("cy", sy.toFixed(1));
        S.swim.setAttribute("opacity", (1 - sink).toFixed(3));
        const ra = (u - UP - 0.25) / 0.7;
        if (ra > 0 && ra < 1) {
          const e = ease.signature(ra);
          S.surfRing.setAttribute("cx", sx.toFixed(1));
          S.surfRing.setAttribute("rx", (R + e * 26).toFixed(1)); S.surfRing.setAttribute("ry", (3 + e * 5).toFixed(1));
          S.surfRing.setAttribute("opacity", ((1 - ra) * 0.8).toFixed(3));
        } else S.surfRing.setAttribute("opacity", 0);
      } else { S.swim.setAttribute("opacity", 0); S.surfRing.setAttribute("opacity", 0); }

      // ---- the splash ----
      if (a > 0 && a < 0.8) {
        const f = a / 0.8, hj = 128 * Math.pow(Math.sin(Math.PI * f), 0.8), w = 12 + 12 * f;
        S.jet.setAttribute("d", `M${SX - w} ${SURF + 4} Q${SX - w * 0.35} ${SURF - hj * 0.55} ${SX} ${SURF - hj} Q${SX + w * 0.35} ${SURF - hj * 0.55} ${SX + w} ${SURF + 4} Z`);
        S.jet.setAttribute("opacity", Math.min(1, (1 - f) * 3).toFixed(3));
      } else S.jet.setAttribute("opacity", 0);
      // the crown: a ring of spikes thrown up round the hole, out and down again
      if (a > 0 && a < 0.62) {
        const f = a / 0.62, hc = 46 * Math.sin(Math.PI * Math.pow(f, 0.7)), spread = 22 + 46 * ease.signature(f);
        const tips = [-1, -0.62, -0.25, 0.25, 0.62, 1];
        let d = `M${(SX - spread - 10).toFixed(1)} ${SURF + 3}`;
        tips.forEach((q, i) => {
          const tx = SX + q * spread * 1.05, ty = SURF - hc * (1 - Math.abs(q) * 0.35) * (i % 2 ? 0.8 : 1);
          d += ` L${(tx - 6).toFixed(1)} ${(SURF - hc * 0.25).toFixed(1)} L${(tx + q * 8).toFixed(1)} ${ty.toFixed(1)} L${(tx + 6).toFixed(1)} ${(SURF - hc * 0.25).toFixed(1)}`;
        });
        d += ` L${(SX + spread + 10).toFixed(1)} ${SURF + 3} Z`;
        S.crown.setAttribute("d", d);
        S.crown.setAttribute("opacity", Math.min(1, (1 - f) * 2.5).toFixed(3));
      } else S.crown.setAttribute("opacity", 0);
      S.rings.forEach((ring, j) => {
        const r = (a - j * 0.14) / 0.8;
        if (r <= 0 || r >= 1) { ring.setAttribute("opacity", 0); return; }
        const e = ease.signature(r);
        ring.setAttribute("rx", (10 + e * 70).toFixed(1)); ring.setAttribute("ry", (3 + e * 12).toFixed(1));
        ring.setAttribute("opacity", ((1 - r) * 0.9).toFixed(3));
      });
      S.drops.forEach((d) => {
        const f = a - d.at;
        const dx = SX + d.vx * f, dy = SURF - 6 + d.vy * f + 0.5 * 1900 * f * f;
        if (f <= 0 || dy > SURF + 4) { d.node.setAttribute("opacity", 0); return; }
        d.node.setAttribute("cx", dx.toFixed(1)); d.node.setAttribute("cy", dy.toFixed(1));
        d.node.setAttribute("r", d.r.toFixed(1)); d.node.setAttribute("opacity", 1);
      });

      // ---- copy: the headline settles in once; the figure rises out of the water on the first splash ----
      S.lines.forEach((n, i) => {
        const p = tw(t, 0.1 + motion.stagger(i, 0.09), 0.8, "signature");
        n.style.opacity = p.toFixed(3); n.style.transform = `translateY(${((1 - p) * 26).toFixed(1)}px)`;
      });
      const sp = tw(t, 0.45, 0.7, "signature");
      S.start.style.opacity = sp.toFixed(3); S.start.style.transform = `translateY(${((1 - sp) * 20).toFixed(1)}px)`;
      S.paid.style.opacity = tw(t, 0.6, 0.7, "soft").toFixed(3);
      S.glyphs.forEach((g, i) => {
        const rise = tw(t, SPLASH + Math.max(0, (SX - S.gx[i]) / WAVE) - 0.06, 0.8, "signature");
        const float = surfY(S.gx[i]) - SURF; // it floats: the swell and every passing wave lift it
        g.style.transform = `translateY(calc(${((1 - rise) * 112).toFixed(2)}% + ${float.toFixed(2)}px))`;
      });
      const cp = tw(t, SPLASH + 0.75, 0.6, "signature"), dp = tw(t, SPLASH + 0.75 + motion.stagger(1, 0.09), 0.6, "signature");
      S.cap.firstChild.style.opacity = cp.toFixed(3);
      S.cap.firstChild.style.transform = `translateY(${((1 - cp) * 18).toFixed(1)}px)`;
      S.detail.style.opacity = dp.toFixed(3);
      S.detail.style.transform = `translateY(${((1 - dp) * 18).toFixed(1)}px)`;
    },
  });
})();
