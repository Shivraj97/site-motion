/* water-slide-funnel--cta: the water slide as the call to action (SVG, closed-form paths).
 * A centred CTA: heading and sub, and under them one short flume whose landing pool is the button. One rider
 * waits on the tower and bobs; a valve opens and the water lights the flume segment by segment (each segment
 * has a lamp); the rider slides, flies off the lip and splashes into the button-pool, which presses in once and
 * sends a single pulse ring. The water drains in the same order and the next rider climbs the ladder to wait.
 * Intro-free loop (loop: 0): the rider is back on the deck, bobbing in phase, and the flume is dry at t = 8.
 */
(function () {
  const D = 8, W = 1600, H = 900;
  const G = 1900; // px/s², the fall acceleration
  const BOB = 0.8; // s per bob; 10 whole cycles per loop
  // the beat sheet (s)
  const VALVE_ON = 0.55, SEG_STEP = 0.09, SEG_DUR = 0.2;
  const GO = 2.0, SLIDE = 1.15, FLY = 0.38;
  const SPLASH = GO + SLIDE + FLY; // 3.53
  const VALVE_OFF = 4.6;
  const CLIMB_IN = 5.7, CLIMB = 5.8, CLIMB_DUR = 1.1, HOP = 6.95, HOP_DUR = 0.3;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 3.68,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("wc");
      const rand = rng(content.seed || 11);
      const N = Math.max(4, Math.min(12, content.segments || 8));

      // ---- geometry ----
      const pool = { cx: 800, w: 440, top: 684, hgt: 88 };
      pool.left = pool.cx - pool.w / 2; pool.right = pool.cx + pool.w / 2; pool.bot = pool.top + pool.hgt;
      const waterTop = pool.top + 9, ground = pool.bot;
      // the flume: one cubic from the deck to a kicked-up lip over the pool's left end
      const P = [[398, 432], [490, 432], [560, 660], [690, 652]];
      const bez = (u) => {
        const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
      };
      const M = 240, samp = [], acc = [0];
      for (let i = 0; i <= M; i++) samp.push(bez(i / M));
      for (let i = 1; i <= M; i++) acc.push(acc[i - 1] + Math.hypot(samp[i][0] - samp[i - 1][0], samp[i][1] - samp[i - 1][1]));
      const L = acc[M];
      // a point at arc length s, with its unit tangent
      const at = (s) => {
        s = Math.max(0, Math.min(L, s));
        let i = 1;
        while (i < M && acc[i] < s) i++;
        const f = (s - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
        const [xa, ya] = samp[i - 1], [xb, yb] = samp[i];
        const len = Math.hypot(xb - xa, yb - ya) || 1;
        return { x: xa + (xb - xa) * f, y: ya + (yb - ya) * f, tx: (xb - xa) / len, ty: (yb - ya) / len };
      };
      const up = (p, d) => [p.x + p.ty * d, p.y - p.tx * d]; // offset to the riding side
      const polyline = (s0, s1, step = 4) => {
        const pts = [];
        for (let s = s0; s < s1; s += step) { const p = at(s); pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`); }
        const p = at(s1); pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        return "M" + pts.join(" L");
      };
      const RIDER_R = 14, RIDE_OFF = 16;
      const wait = up(at(0), RIDE_OFF);
      const lip = up(at(L), RIDE_OFF);
      // the flight off the lip: ballistic, landing on the water left of centre
      const landX = 792;
      const vx = (landX - lip[0]) / FLY, vy = (waterTop - lip[1] - 0.5 * G * FLY * FLY) / FLY;

      // ---- drawing ----
      const INK = ui.strokeColor(C.stroke || C.ink);
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "wc-svg" }, root);
      const defs = svg("defs", {}, s);
      const waterC = mix(C.accent, C.surface, 0.35); // flume water, on its way to the button
      const strutC = mix(C.line, C.paper, 0.1);

      // tower: two legs, braces, a ladder on the back, a deck, a rail post carrying the water pipe
      const legL = 330, legR = 388, deckY = 446, ladderX = 308;
      [legL, legR].forEach((x) => svg("line", { x1: x, y1: deckY, x2: x, y2: ground, stroke: strutC, "stroke-width": ui.stroke("regular", 2.5) }, s));
      [[deckY + 30, deckY + 150], [deckY + 150, deckY + 270]].forEach(([a, b]) => {
        svg("line", { x1: legL, y1: a, x2: legR, y2: b, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s);
        svg("line", { x1: legR, y1: a, x2: legL, y2: b, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s);
      });
      svg("line", { x1: ladderX, y1: deckY - 6, x2: ladderX, y2: ground, stroke: strutC, "stroke-width": ui.stroke("regular", 2) }, s);
      for (let y = deckY + 24; y < ground - 8; y += 26) svg("line", { x1: ladderX, y1: y, x2: legL, y2: y, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s);
      // flume struts down to the ground (behind the pool)
      [0.45, 0.76].forEach((f) => { const p = at(L * f); svg("line", { x1: p.x, y1: p.y + 12, x2: p.x, y2: ground, stroke: strutC, "stroke-width": ui.stroke("fine", 2) }, s); });
      svg("line", { x1: 270, y1: ground, x2: 1110, y2: ground, ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      svg("line", { x1: ladderX - 4, y1: deckY, x2: legR + 14, y2: deckY, stroke: INK, "stroke-width": ui.stroke("bold", 3), "stroke-linecap": "round" }, s);
      // the water pipe: up the back post, over the deck, down to a spout above the flume; a valve wheel on it
      const spoutX = P[0][0] + 40, post = legL - 8;
      svg("path", { d: `M${post} ${deckY} V378 H${spoutX} V392`, fill: "none", stroke: INK, "stroke-width": ui.stroke("regular", 2.5), "stroke-linecap": "round", "stroke-linejoin": "round" }, s);
      const valve = svg("g", {}, s);
      svg("circle", { cx: 0, cy: 0, r: 8, fill: C.surface, stroke: INK, "stroke-width": ui.stroke("fine", 2) }, valve);
      svg("path", { d: "M-8 0 H8 M0 -8 V8", stroke: INK, "stroke-width": ui.stroke("fine", 2) }, valve);
      const valveAt = [(post + spoutX) / 2, 378];
      let sx = 0; while (sx < L && at(sx).x < spoutX) sx += 1;
      const spoutLen = Math.max(8, at(sx).y - 6 - 396);
      // sm-native-start: water, flume and pool are the scene's material, drawn as stacked strokes
      const spout = svg("line", { x1: spoutX, y1: 396, x2: spoutX, y2: 396 + spoutLen, stroke: waterC, "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": `0 ${spoutLen + 10}` }, s);

      // the flume: wall, channel, then the water in N segments, with collars at the joins
      const whole = polyline(0, L);
      svg("path", { d: whole, stroke: INK, "stroke-width": 24, "stroke-linecap": "round", fill: "none" }, s);
      svg("path", { d: whole, stroke: C.surface, "stroke-width": 18, "stroke-linecap": "round", fill: "none" }, s);
      const segLen = L / N;
      const segs = Array.from({ length: N }, (_, i) => {
        const len = segLen + (i < N - 1 ? 1 : 0); // a hair of overlap so joins never show a gap
        const node = svg("path", { d: polyline(i * segLen, i * segLen + len, 3), stroke: waterC, "stroke-width": 10, "stroke-linecap": "butt", fill: "none", "stroke-dasharray": `0 ${len + 10}` }, s);
        return { node, len, on: VALVE_ON + 0.15 + h.motion.stagger(i, SEG_STEP), off: VALVE_OFF + 0.15 + h.motion.stagger(i, SEG_STEP) };
      });
      for (let i = 1; i < N; i++) {
        const p = at(i * segLen), nx = p.ty, ny = -p.tx;
        svg("line", { x1: p.x - nx * 12, y1: p.y - ny * 12, x2: p.x + nx * 12, y2: p.y + ny * 12, stroke: INK, "stroke-width": 1.5 }, s);
      }
      // the spill from the lip into the pool, the last thing the water lights
      const spillPts = [];
      const l0 = at(L);
      for (let k = 0; k <= 10; k++) { const u = k / 10, tt = u * 0.16; spillPts.push(`${(l0.x + 4 + 260 * tt).toFixed(1)} ${(l0.y + 2 + 40 * tt + 0.5 * G * tt * tt).toFixed(1)}`); }
      const spillLen = 70;
      const spill = svg("path", { d: "M" + spillPts.join(" L"), stroke: waterC, "stroke-width": 6, "stroke-linecap": "round", fill: "none", "stroke-dasharray": `0 ${spillLen + 10}` }, s);
      const spillOn = VALVE_ON + 0.15 + h.motion.stagger(N, SEG_STEP), spillOff = VALVE_OFF + 0.15 + h.motion.stagger(N, SEG_STEP);
      // lamps under each segment: they light as the water reaches them
      const lamps = segs.map((sg, i) => {
        const p = at((i + 0.5) * segLen), o = [p.x - p.ty * 22, p.y + p.tx * 22];
        const flash = svg("circle", { cx: o[0], cy: o[1], r: 4.5, fill: "none", stroke: C.accent, "stroke-width": 1.5, opacity: 0 }, s);
        const dot = svg("circle", { cx: o[0], cy: o[1], r: 4.5, fill: C.line }, s);
        return { dot, flash };
      });

      // the button-pool: a pill basin full of accent water, its label on the water
      const btnG = svg("g", {}, s);
      const pillR = pool.hgt / 2;
      const clip = svg("clipPath", { id: "wc-pill" }, defs);
      svg("rect", { x: pool.left, y: pool.top, width: pool.w, height: pool.hgt, rx: pillR }, clip); // sm-native: a pill stays a pill
      svg("rect", { x: pool.left, y: pool.top, width: pool.w, height: pool.hgt, rx: pillR, fill: C.surface }, btnG); // sm-native: a pill stays a pill
      const water = svg("path", { d: "", fill: C.accent, "clip-path": "url(#wc-pill)" }, btnG);
      const crest = svg("path", { d: "", fill: "none", stroke: mix(C.accent, C.surface, 0.55), "stroke-width": 2.5, "clip-path": "url(#wc-pill)" }, btnG);
      const rippleG = svg("g", { "clip-path": "url(#wc-pill)" }, btnG);
      const ripples = [0, 1].map(() => svg("ellipse", { cx: landX, cy: waterTop, rx: 0, ry: 0, fill: "none", stroke: mix(C.accent, C.surface, 0.7), "stroke-width": 2, opacity: 0 }, rippleG));
      svg("rect", { x: pool.left, y: pool.top, width: pool.w, height: pool.hgt, rx: pillR, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 2.5) }, btnG); // sm-native: a pill stays a pill
      const pulse = svg("rect", { x: pool.left, y: pool.top, width: pool.w, height: pool.hgt, rx: pillR, fill: "none", stroke: C.accent, "stroke-width": 2.5, opacity: 0 }, s); // sm-native: the pulse is the button's own outline
      // sm-native-end

      // the rider, and the splash: hidden under the water line inside the pool
      const rclip = svg("clipPath", { id: "wc-above" }, defs);
      svg("rect", { x: 0, y: 0, width: W, height: waterTop + 1 }, rclip);
      svg("rect", { x: 0, y: 0, width: pool.left, height: H }, rclip);
      svg("rect", { x: pool.right, y: 0, width: W - pool.right, height: H }, rclip);
      const above = svg("g", { "clip-path": "url(#wc-above)" }, s);
      const drops = Array.from({ length: 9 }, () => {
        const node = svg("circle", { r: 2.6 + rand() * 3, fill: C.accent, opacity: 0 }, above);
        return { node, ox: (rand() - 0.5) * 30, vx: (rand() - 0.45) * 560, vy: -(330 + rand() * 330), delay: rand() * 0.05 };
      });
      const rider = svg("ellipse", { cx: wait[0], cy: wait[1], rx: RIDER_R, ry: RIDER_R, fill: pal[2 % pal.length], ...ui.strokeAttrs("fine", 1.5, C.stroke || C.ink) }, above);

      // ---- copy ----
      const copy = el("div", "wc-copy", root);
      el("div", "wc-eyebrow", copy, content.eyebrow || "");
      el("div", "wc-h", copy, content.heading || "");
      el("div", "wc-sub", copy, content.sub || "");
      const btn = el("div", "wc-btn", root);
      Object.assign(btn.style, { left: pool.left + "px", top: waterTop + "px", width: pool.w + "px", height: pool.bot - waterTop + "px" });
      el("span", "wc-btn-label", btn, content.button || "Start your free trial");
      const arrow = el("span", "wc-btn-arrow", btn, "→");
      const fine = el("div", "wc-fine", root, content.fine || "");
      fine.style.top = ground + 26 + "px";

      return { at, L, wait, lip, vx, vy, landX, waterTop, pool, segs, spout, spoutLen, spill, spillLen, spillOn, spillOff, lamps, water, crest, ripples, pulse, btnG, btn, arrow, drops, rider, valve, valveAt, lampOffC: C.line, lampOnC: C.accent, ladderX, deckY, RIDER_R, RIDE_OFF, up };
    },

    render(t, S, h) {
      const { tw, lerp, ease, clamp } = h;
      const R = S.RIDER_R;

      // ---- water: the valve, each segment front-to-back on, then drained in the same order ----
      const reveal = (node, len, on, off) => {
        const a = tw(t, on, SEG_DUR, "snappy"), b = tw(t, off, SEG_DUR, "inOut");
        const vis = Math.max(0, (a - b) * len);
        node.setAttribute("stroke-dasharray", `${vis.toFixed(2)} ${(len + 10).toFixed(2)}`);
        node.setAttribute("stroke-dashoffset", (-b * len).toFixed(2));
      };
      reveal(S.spout, S.spoutLen, VALVE_ON, VALVE_OFF);
      // the valve wheel turns a quarter to open, a quarter back to close
      const turn = 90 * (tw(t, VALVE_ON - 0.3, 0.3, "snappy") - tw(t, VALVE_OFF - 0.3, 0.3, "snappy"));
      S.valve.setAttribute("transform", `translate(${S.valveAt[0]} ${S.valveAt[1]}) rotate(${(45 + turn).toFixed(2)})`);
      S.segs.forEach((sg, i) => {
        reveal(sg.node, sg.len, sg.on, sg.off);
        const lit = tw(t, sg.on, 0.15, "snappy") * (1 - tw(t, sg.off, SEG_DUR, "soft"));
        h.set(S.lamps[i].dot, { fill: h.mix(S.lampOffC, S.lampOnC, lit) });
        const fa = (t - sg.on) / 0.45;
        if (fa > 0 && fa < 1) {
          S.lamps[i].flash.setAttribute("r", (4.5 + ease.signature(fa) * 9).toFixed(2));
          S.lamps[i].flash.setAttribute("opacity", ((1 - fa) * 0.8).toFixed(3));
        } else S.lamps[i].flash.setAttribute("opacity", 0);
      });
      reveal(S.spill, S.spillLen, S.spillOn, S.spillOff);

      // ---- the rider ----
      let x = S.wait[0], y = S.wait[1], rx = R, ry = R, op = 1;
      const bobAmp = t < GO ? 1 - tw(t, 1.6, 0.15, "soft") : tw(t, HOP + HOP_DUR, 0.4, "soft");
      if (t < GO) {
        y -= 3.5 * bobAmp * (0.5 - 0.5 * Math.cos((t / BOB) * Math.PI * 2));
        // anticipation: a crouch before it goes
        const sq = tw(t, 1.72, 0.2, "snappy") * (1 - tw(t, GO - 0.02, 0.12, "snappy"));
        rx = R * (1 + 0.14 * sq); ry = R * (1 - 0.16 * sq); y += R * 0.16 * sq;
      } else if (t < GO + SLIDE) {
        const u = (t - GO) / SLIDE;
        const p = S.at(S.L * (0.3 * u + 0.7 * u * u)); // picks up speed down the chute
        [x, y] = S.up(p, S.RIDE_OFF);
        const st = clamp(u * 1.6) * 0.1; // a little stretch with speed
        rx = R * (1 + st); ry = R * (1 - st * 0.6);
      } else if (t < SPLASH) {
        const f = t - GO - SLIDE;
        x = S.lip[0] + S.vx * f; y = S.lip[1] + S.vy * f + 0.5 * G * f * f;
        rx = R * 1.06; ry = R * 0.96;
      } else if (t < SPLASH + 0.45) {
        const f = (t - SPLASH) / 0.45; // under the surface; the clip hides it
        x = S.landX + 10 * f; y = S.waterTop - 2 + f * f * (R * 2 + 16); // eases in, so the moment of contact holds
      } else if (t < CLIMB_IN) {
        op = 0;
      } else if (t < HOP) {
        // the next rider climbs the ladder, rung by rung
        op = tw(t, CLIMB_IN, 0.3, "soft");
        const u = clamp((t - CLIMB) / CLIMB_DUR), K = 6, k = Math.min(K - 1, Math.floor(u * K));
        const v = u >= 1 ? 1 : (k + ease.snappy(u * K - k)) / K;
        x = S.ladderX + 11; y = lerp(S.pool.bot - R - 2, S.deckY - R - 2, v);
      } else {
        const u = tw(t, HOP, HOP_DUR, "inOut");
        x = lerp(S.ladderX + 11, S.wait[0], u); y = lerp(S.deckY - R - 2, S.wait[1], u) - Math.sin(u * Math.PI) * 22;
        if (t >= HOP + HOP_DUR) y = S.wait[1] - 3.5 * bobAmp * (0.5 - 0.5 * Math.cos((t / BOB) * Math.PI * 2));
      }
      h.set(S.rider, { cx: x.toFixed(2), cy: y.toFixed(2), rx: rx.toFixed(2), ry: ry.toFixed(2), opacity: op.toFixed(3) });

      // ---- the splash: droplets, ripples, the surface wobble ----
      const ds = t - SPLASH;
      S.drops.forEach((d) => {
        const f = ds - d.delay;
        if (f <= 0 || f > 0.7) { d.node.setAttribute("opacity", 0); return; }
        d.node.setAttribute("cx", (S.landX + d.ox + d.vx * f).toFixed(2));
        d.node.setAttribute("cy", (S.waterTop + d.vy * f + 0.5 * G * f * f).toFixed(2));
        d.node.setAttribute("opacity", (1 - clamp((f - 0.45) / 0.25)).toFixed(3));
      });
      S.ripples.forEach((r, j) => {
        const a = (ds - j * 0.14) / 0.9;
        if (a <= 0 || a >= 1) { r.setAttribute("opacity", 0); return; }
        const e = ease.signature(a);
        r.setAttribute("rx", (8 + e * 70).toFixed(1)); r.setAttribute("ry", (2 + e * 9).toFixed(1));
        r.setAttribute("opacity", ((1 - a) * 0.9).toFixed(3));
      });
      const A = ds > 0 ? 5 * (1 - tw(t, SPLASH, 1.6, "soft")) : 0;
      const pts = [];
      for (let px = S.pool.left; px <= S.pool.right; px += 8) {
        const dx = px - S.landX;
        const yy = S.waterTop - A * Math.sin(dx / 20 - ds * 10) * Math.exp(-((dx / 150) ** 2));
        pts.push(`${px} ${yy.toFixed(2)}`);
      }
      const surface = "M" + pts.join(" L");
      S.crest.setAttribute("d", surface);
      S.water.setAttribute("d", `${surface} L${S.pool.right} ${S.pool.bot + 2} L${S.pool.left} ${S.pool.bot + 2} Z`);

      // ---- the button: one confident press, one pulse ----
      const press = tw(t, SPLASH, 0.09, "snappy") * (1 - tw(t, SPLASH + 0.12, 0.5, "signature"));
      S.btnG.setAttribute("transform", `translate(0 ${(press * 6).toFixed(2)})`);
      S.btn.style.transform = `translateY(${(press * 6).toFixed(2)}px)`;
      const nudge = tw(t, SPLASH + 0.04, 0.3, "snappy") * (1 - tw(t, SPLASH + 0.6, 0.5, "inOut"));
      S.arrow.style.transform = `translateX(${(nudge * 7).toFixed(2)}px)`;
      const pa = (ds - 0.04) / 1.0;
      if (pa > 0 && pa < 1) {
        const g = ease.signature(pa) * 26, P = S.pool;
        h.set(S.pulse, { x: (P.left - g).toFixed(2), y: (P.top - g).toFixed(2), width: (P.w + 2 * g).toFixed(2), height: (P.hgt + 2 * g).toFixed(2), rx: ((P.hgt + 2 * g) / 2).toFixed(2), opacity: ((1 - pa) * 0.85).toFixed(3) });
      } else S.pulse.setAttribute("opacity", 0);
    },
  });
})();
