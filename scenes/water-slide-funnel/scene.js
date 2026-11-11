/* water-slide-funnel: a conversion funnel as a water-park cascade (SVG, closed-form paths).
 * Riders (each one a fixed batch of visitors) drop onto the top flume and slide down four ramps, one per
 * funnel stage. At every lip some riders fly off into the pool under it (the drop-off at that stage) and the
 * rest hop onto the next ramp; the last ramp empties into the paid pool. Each stage's number is counted from
 * the riders that entered it, so it lands on the content's figure exactly; each pool's water rises with the
 * riders it caught. Paths are computed in setup (slides, hops and ballistic falls), not simulated: a funnel
 * has to add up, and real physics would scatter riders across the wrong pools (galton-router's lesson).
 * Intro-free loop: everything drains before the seam, so t = 12 matches t = 0.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const G = 1900; // px/s², the fall acceleration
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("wf");
      const rand = rng(content.seed || 7);
      const stages = content.stages;
      const S = stages.length; // 4 by default; the layout fits 3–5
      const R = content.riders ?? 100;
      const reach = stages.map((st) => Math.max(1, Math.round((R * st.value) / stages[0].value)));
      reach[0] = R;

      // ---- geometry: a staircase of ramps, left to right, each one lower ----
      const x0 = 650, col = (1500 - x0) / S, rampW = col * 0.78, rampDrop = 52;
      const yTop = 262, yStep = (606 - yTop) / Math.max(1, S - 1);
      const ramps = stages.map((_, i) => {
        const ax = x0 + i * col, ay = yTop + i * yStep;
        return { ax, ay, bx: ax + rampW, by: ay + rampDrop };
      });
      const surface = 728, poolDepth = 70, ground = 812;
      // a pool under each lip catches that stage's drop-offs; the last ramp empties into the goal pool
      const pools = ramps.map((r, i) => {
        const last = i === S - 1;
        const w = last ? Math.min(186, W - 18 - (r.bx - 70)) : col * 0.74;
        const cx = last ? Math.min(W - 18 - w / 2, r.bx + 28) : r.bx + 26;
        return { cx, w, left: cx - w / 2, goal: last };
      });

      // ---- plan every rider ----
      // which stage each rider leaves at: the first reach[i+1] riders (in a seeded shuffle) go on past stage i
      const order = Array.from({ length: R }, (_, k) => k);
      for (let k = R - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      const leaveAt = new Array(R).fill(S - 1);
      for (let i = 0; i < S - 1; i++) order.forEach((rider, rank) => { if (rank >= reach[i + 1] && leaveAt[rider] === S - 1) leaveAt[rider] = Math.min(leaveAt[rider], i); });
      const spawnUntil = content.spawnUntil ?? 5.6, RIDE = 0.62, HOP = 0.26;
      const slots = pools.map(() => 0);
      const riders = Array.from({ length: R }, (_, k) => {
        const at = 0.35 + (k * (spawnUntil - 0.35)) / Math.max(1, R - 1);
        const pts = []; // [x, y, time, kind]  kind: 0 straight, 1 slide (accelerating), 2 hop arc, 3 fall
        const enterX = ramps[0].ax + 8, enterY = ramps[0].ay - 9;
        pts.push([enterX, 120, at, 3]);
        let t = at + Math.sqrt((2 * (enterY - 120)) / G);
        pts.push([enterX, enterY, t, 1]);
        const out = leaveAt[k];
        const enters = [];
        for (let i = 0; i <= out; i++) {
          const r = ramps[i];
          if (i > 0) { t += HOP; pts.push([r.ax + 8, r.ay - 9, t, 1]); }
          enters.push(t - (i > 0 ? HOP : 0));
          t += RIDE * (0.92 + rand() * 0.16);
          pts.push([r.bx, r.by - 9, t, i < out ? 2 : 3]);
        }
        // off the lip, into this stage's pool: a ballistic fall, then settle into the next free slot
        const p = pools[out], n = slots[out]++;
        const per = Math.max(4, Math.floor((p.w - 22) / 13));
        const row = Math.floor(n / per), c = n % per;
        const sx = p.left + 13 + c * ((p.w - 26) / Math.max(1, per - 1)) + (row % 2 ? 3 : -3);
        const sy = surface + poolDepth - 10 - row * 11.5;
        const fall = Math.sqrt((2 * (surface - (ramps[out].by - 9))) / G);
        const landX = Math.max(p.left + 10, Math.min(p.left + p.w - 10, ramps[out].bx + 18 + (rand() - 0.3) * 40));
        t += fall;
        pts.push([landX, surface, t, 0]); // splash point
        const splashAt = t;
        t += 0.55;
        pts.push([sx, sy, t, 0]); // sinks and drifts into its slot
        return { pts, out, enters, splashAt, landX, colour: pal[k % pal.length], drift: rand() * Math.PI * 2 };
      });
      const lastLand = Math.max(...riders.map((r) => r.pts[r.pts.length - 1][2]));
      if (lastLand > D - 1.3) console.warn(`water-slide-funnel: last rider settles at ${lastLand.toFixed(2)} s; lower riders or spawnUntil`);

      // ---- drawing ----
      const INK = ui.strokeColor(C.stroke || C.ink);
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "wf-svg" }, root);
      const defs = svg("defs", {}, s);
      // scaffold first, so the ramps and pools sit in front of it
      const strutC = mix(C.line, C.paper, 0.1);
      ramps.forEach((r) => {
        [r.ax + 18, r.bx - 14].forEach((x) => svg("line", { x1: x, y1: r.ay + (x - r.ax) * (rampDrop / rampW) + 14, x2: x, y2: ground, stroke: strutC, "stroke-width": ui.stroke("fine", 2) }, s));
        svg("line", { x1: r.ax + 18, y1: ground - 70, x2: r.bx - 14, y2: ground - 70, stroke: strutC, "stroke-width": ui.stroke("fine", 1.5) }, s);
      });
      svg("line", { x1: x0 - 40, y1: ground, x2: W - 10, y2: ground, ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      // the entry chute
      svg("path", { d: `M${ramps[0].ax - 22} 96 L${ramps[0].ax - 6} 136 L${ramps[0].ax - 6} ${ramps[0].ay - 22} M${ramps[0].ax + 38} 96 L${ramps[0].ax + 22} 136 L${ramps[0].ax + 22} ${ramps[0].ay - 26}`, stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round", fill: "none" }, s);

      // pools: a basin, its water (rises with the riders it holds), ripple rings, the riders inside
      const waterTint = mix(pal[2 % pal.length], C.surface, 0.35), goalTint = mix(C.accent, C.surface, 0.45);
      const poolG = pools.map((p, i) => {
        const g = svg("g", {}, s);
        const clip = svg("clipPath", { id: `wf-clip-${i}` }, defs);
        svg("rect", { x: p.left, y: surface - 46, width: p.w, height: poolDepth + 46, rx: ui.radius("md", 14) }, clip);
        const water = svg("rect", { x: p.left, y: surface, width: p.w, height: poolDepth, fill: p.goal ? goalTint : waterTint, "clip-path": `url(#wf-clip-${i})` }, g);
        // sm-native-start: water, flumes and splashes are the scene's material, not outlines a look should restyle
        const crest = svg("line", { x1: p.left + 4, x2: p.left + p.w - 4, y1: surface, y2: surface, stroke: p.goal ? C.accent : mix(pal[2 % pal.length], C.ink, 0.25), "stroke-width": 2, "stroke-linecap": "round" }, g);
        const dots = svg("g", { "clip-path": `url(#wf-clip-${i})` }, g);
        svg("path", { d: `M${p.left} ${surface - 30} V${surface + poolDepth - 12} q0 12 12 12 H${p.left + p.w - 12} q12 0 12 -12 V${surface - 30}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 2.5), "stroke-linecap": "round" }, g);
        return { g, water, crest, dots };
      });
      // sm-native-end
      // ramps: a flume with flowing water dashes (whole cycles per loop: 24 px period × 25 cycles in 12 s)
      // sm-native-start: the flume is drawn as stacked strokes (wall, channel, water, flow), its shape
      const flows = ramps.map((r, i) => {
        const d = `M${r.ax} ${r.ay} L${r.bx} ${r.by}`;
        svg("path", { d, stroke: INK, "stroke-width": 22, "stroke-linecap": "round", fill: "none" }, s);
        svg("path", { d, stroke: C.surface, "stroke-width": 16, "stroke-linecap": "round", fill: "none" }, s);
        svg("path", { d, stroke: i === S - 1 ? goalTint : waterTint, "stroke-width": 8, "stroke-linecap": "round", fill: "none" }, s);
        return svg("path", { d, stroke: C.surface, "stroke-width": 2.5, "stroke-dasharray": "6 18", "stroke-linecap": "round", fill: "none", opacity: 0.9 }, s);
      });
      const ripples = pools.map(() => svg("g", {}, s));
      const ringPool = riders.map((rd) => {
        const g = ripples[rd.out];
        return [0, 1].map(() => svg("ellipse", { cx: rd.landX, cy: surface, rx: 0, ry: 0, fill: "none", stroke: pools[rd.out].goal ? C.accent : mix(pal[2 % pal.length], C.ink, 0.2), "stroke-width": 2, opacity: 0 }, g));
      });
      // sm-native-end
      const BALL = ui.strokeAttrs("fine", 1.2, C.stroke || C.ink);
      const dots = riders.map((rd) => svg("circle", { r: 6, fill: rd.colour, ...BALL, opacity: 0 }, s));

      // ---- labels ----
      const copy = el("div", "wf-copy", root);
      el("div", "wf-eyebrow", copy, content.eyebrow || "");
      el("div", "wf-h", copy, content.heading || "");
      el("div", "wf-sub", copy, content.sub || "");
      const legend = el("div", "wf-legend", root);
      el("i", "", legend);
      el("span", "", legend, content.legend || `= ${Math.round(stages[0].value / R)} ${content.unit || "visitors"}`);
      const fmt = (n) => Math.round(n).toLocaleString("en-US");
      const stageLabels = ramps.map((r, i) => {
        const box = el("div", "wf-stage", root);
        Object.assign(box.style, { left: r.ax + (i === 0 ? 46 : 4) + "px", top: r.ay - 100 + "px", width: rampW + "px" });
        el("div", "wf-stage-name", box, stages[i].name);
        const num = el("div", "wf-stage-n", box, "0");
        const pct = el("div", "wf-stage-pct", box, i === 0 ? content.firstNote || "" : `${Math.round((stages[i].value / stages[i - 1].value) * 100)}% ${content.ofPrev || "of"} ${stages[i - 1].name.toLowerCase()}`);
        return { box, num, pct };
      });
      const poolLabels = pools.map((p, i) => {
        const box = el("div", p.goal ? "wf-pool wf-goal" : "wf-pool", root);
        Object.assign(box.style, { left: p.left - 20 + "px", width: p.w + 40 + "px", top: surface + poolDepth + 14 + "px" });
        const n = el("div", "wf-pool-n", box, "0");
        el("div", "wf-pool-name", box, p.goal ? stages[i].name : stages[i].leftLabel || `${content.leftAt || "left at"} ${stages[i].name.toLowerCase()}`);
        return n;
      });
      return { riders, dots, ringPool, pools, poolG, flows, stageLabels, poolLabels, reach, stages, S, surface, poolDepth, fmt, legend };
    },

    render(t, S, h) {
      const { tw, lerp, ease } = h;
      const drain = tw(t, D - 1.15, 0.85, "inOut"); // pools drain and riders fade before the seam
      const labelsIn = tw(t, 0, 0.5, "soft") * (1 - drain);
      const flow = -((t * 50) % 24); // 50 px/s × 12 s = 600 px = 25 whole dash periods
      S.flows.forEach((f) => f.setAttribute("stroke-dashoffset", flow.toFixed(2)));

      const held = S.pools.map(() => 0);
      S.riders.forEach((rd, k) => {
        const d = S.dots[k], p = rd.pts;
        if (t < p[0][2]) { d.setAttribute("opacity", 0); }
        else {
          let i = 0;
          while (i < p.length - 2 && t >= p[i + 1][2]) i++;
          const [xa, ya, ta, kind] = p[i], [xb, yb, tb] = p[i + 1];
          const u = Math.min(1, Math.max(0, (t - ta) / Math.max(1e-3, tb - ta)));
          let x, y;
          if (kind === 3) { x = lerp(xa, xb, u); y = lerp(ya, yb, u * u); } // falling: accelerates
          else if (kind === 1) { const v = u * u * 0.45 + u * 0.55; x = lerp(xa, xb, v); y = lerp(ya, yb, v); } // sliding: picks up speed
          else if (kind === 2) { x = lerp(xa, xb, u); y = lerp(ya, yb, u) - Math.sin(u * Math.PI) * 16; } // hop to the next ramp
          else { const v = ease.soft(u); x = lerp(xa, xb, v); y = lerp(ya, yb, v); } // sink into the pool
          if (t >= p[p.length - 1][2]) { // settled: a slow bob, one whole cycle every 3 s (4 per loop)
            x = p[p.length - 1][0]; y = p[p.length - 1][1] + Math.sin((t / 3) * Math.PI * 2 + rd.drift) * 1.4;
          }
          if (t >= rd.splashAt) held[rd.out]++;
          y += drain * 26; // they sink as the pool drains
          d.setAttribute("cx", x.toFixed(1)); d.setAttribute("cy", y.toFixed(1));
          d.setAttribute("opacity", (1 - drain).toFixed(3));
        }
        // the splash: two rings out from where it hit the water
        S.ringPool[k].forEach((ring, j) => {
          const a = (t - rd.splashAt - j * 0.12) / 0.75;
          if (a <= 0 || a >= 1) { ring.setAttribute("opacity", 0); return; }
          const e = ease.signature(a);
          ring.setAttribute("rx", (6 + e * 34).toFixed(1)); ring.setAttribute("ry", (2 + e * 7).toFixed(1));
          ring.setAttribute("opacity", ((1 - a) * 0.9).toFixed(3));
        });
      });

      // water level: rises with what each pool holds, drains at the end
      S.pools.forEach((p, i) => {
        const total = i === S.S - 1 ? S.reach[i] : S.reach[i] - S.reach[i + 1];
        const level = (Math.min(1, held[i] / Math.max(1, total)) * 26) * (1 - drain);
        const top = S.surface - level;
        S.poolG[i].water.setAttribute("y", top.toFixed(1)); S.poolG[i].water.setAttribute("height", (S.poolDepth + level).toFixed(1));
        S.poolG[i].crest.setAttribute("y1", top.toFixed(1)); S.poolG[i].crest.setAttribute("y2", top.toFixed(1));
        const value = i === S.S - 1 ? S.stages[i].value : S.stages[i].value - S.stages[i + 1].value;
        S.poolLabels[i].textContent = (i === S.S - 1 ? "" : "−") + S.fmt((value * held[i]) / Math.max(1, total));
        S.poolLabels[i].parentNode.style.opacity = labelsIn.toFixed(3);
      });

      // each stage counts the riders that entered its ramp, scaled to the stage's real number
      S.stageLabels.forEach((lab, i) => {
        let entered = 0;
        S.riders.forEach((rd) => { if (rd.enters.length > i && t >= rd.enters[i]) entered++; });
        lab.num.textContent = S.fmt((S.stages[i].value * entered) / S.reach[i]);
        lab.num.style.opacity = labelsIn.toFixed(3);
        lab.pct.style.opacity = (labelsIn * tw(t, S.riders.find((r) => r.enters.length > i)?.enters[i] ?? 0, 0.5, "soft")).toFixed(3);
      });
      S.legend.style.opacity = labelsIn.toFixed(3);
    },
  });
})();
