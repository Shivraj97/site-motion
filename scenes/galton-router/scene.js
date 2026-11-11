/* galton-router: routing shown as probability you can see (procedural SVG).
 * Payments drop through a pegboard into processor bins. A switch under the funnel first tips traffic
 * toward the weaker processors; when the routing rule arrives the switch flips and the flow shifts to
 * the processors that approve the most, while the live share climbs.
 * Each ball's path is a seeded random walk (one left/right choice per peg row, biased by the switch),
 * animated as hops between pegs, so the story is reliable and every frame is a pure function of t.
 * (Physics was tried first: real bounces scattered the balls and hid the shift. drop-pile keeps Matter.)
 */
(function () {
  const D = 12, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.2,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      // the board's ink, its corners and every outline follow the style pack when it directs them
      const INK = ui.strokeColor(C.ink), WALL = ui.stroke("bold", 3), OUT = ui.strokeAttrs("regular", 1.5, C.ink), BALL = ui.strokeAttrs("fine", 1.2, C.ink);
      root.classList.add("gr");
      const rand = rng(content.seed || 21);
      const bins = content.bins;
      const cx = 1010, top = 210, rows = 8, gapX = 44, gapY = 38, pegR = 4.5, ballR = 7.5, binW = 118;
      const boardL = cx - (bins.length * binW) / 2;
      const binTop = top + rows * gapY + 30, binBottom = 800;
      const rule = content.rule, flapL = 150, flapA = 0.6, pivotY = top - 26;
      const exitDx = flapL * 0.86 * Math.cos(flapA) - 6, exitY = pivotY + flapL * 0.86 * Math.sin(flapA);

      // plan every ball: spawn, slide down the flap, hop row by row, fall onto its bin's stack
      const N = content.count ?? 120, until = content.spawnUntil ?? 8.6;
      const stack = bins.map(() => 0);
      const HOP = 0.11;
      const balls = Array.from({ length: N }, (_, i) => {
        const at = 0.3 + (i * (until - 0.3)) / N;
        const side = at + 0.35 >= rule.at ? 1 : -1; // which way the switch points when this ball reaches it
        const pRight = side > 0 ? 0.72 : 0.28;
        const pts = [[cx + (rand() - 0.5) * 6, top - 150, at]]; // [x, y, time]
        pts.push([cx, pivotY - ballR, at + 0.3]);
        let x = cx + side * exitDx, tt = at + 0.48;
        pts.push([x, exitY, tt]);
        for (let r = 0; r < rows; r++) {
          x += (rand() < pRight ? 1 : -1) * gapX * 0.5;
          x = Math.max(boardL + 20, Math.min(boardL + bins.length * binW - 20, x));
          tt += HOP;
          pts.push([x, top + 16 + r * gapY, tt]);
        }
        const bin = Math.max(0, Math.min(bins.length - 1, Math.floor((x - boardL) / binW)));
        const k = stack[bin]++;
        const per = 6, col = k % per, layer = Math.floor(k / per);
        const fx = boardL + bin * binW + 14 + col * ((binW - 28) / (per - 1)) + (layer % 2 ? 5 : 0);
        const fy = binBottom - ballR - 2 - layer * (ballR * 1.85);
        const fall = Math.sqrt(Math.max(1, fy - pts[pts.length - 1][1]) / 900);
        pts.push([fx, fy, tt + fall]);
        return { pts, bin, landAt: tt + fall, colour: pal[i % 3 === 0 ? 2 : i % 3 === 1 ? 0 : 4] };
      });

      // drawing
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "gr-svg" }, root);
      svg("rect", { x: boardL - 16, y: top - 60, width: bins.length * binW + 32, height: binBottom - top + 76, rx: ui.radius("lg", 22), fill: C.surface, ...ui.strokeAttrs("regular", 1.5, C.stroke || C.line) }, s);
      bins.forEach((bn, b) => svg("rect", { x: boardL + b * binW + 4, y: binTop, width: binW - 8, height: binBottom - binTop, rx: ui.radius("sm", 6), fill: bn.good ? mix(C.positive || C.accent, C.surface, 0.84) : "transparent" }, s));
      for (let r = 0; r < rows; r++) for (let k = -8; k <= 8; k++) {
        const x = cx + (k + (r % 2 ? 0.5 : 0)) * gapX;
        if (x > boardL + 6 && x < boardL + bins.length * binW - 6) svg("circle", { cx: x, cy: top + 16 + r * gapY + 12, r: pegR, fill: mix(C.ink, C.paper, 0.55) }, s);
      }
      svg("path", { d: `M${cx - 120} ${top - 170}L${cx - 22} ${pivotY - 40}M${cx + 120} ${top - 170}L${cx + 22} ${pivotY - 40}`, stroke: INK, "stroke-width": WALL, "stroke-linecap": "round", fill: "none" }, s);
      for (let b = 1; b < bins.length; b++) svg("line", { x1: boardL + b * binW, y1: binTop, x2: boardL + b * binW, y2: binBottom, stroke: INK, "stroke-width": WALL, "stroke-linecap": "round" }, s);
      svg("line", { x1: boardL, y1: binBottom, x2: boardL + bins.length * binW, y2: binBottom, stroke: INK, "stroke-width": WALL, "stroke-linecap": "round" }, s);
      const flap = svg("rect", { x: -6, y: -5, width: flapL, height: 10, rx: 5, fill: C.accent, ...OUT }, s); // sm-native: a pill (radius = half its height) stays a pill in every look
      svg("circle", { cx, cy: pivotY, r: 7, fill: C.surface, ...ui.strokeAttrs("bold", 2, C.ink) }, s);
      const dots = balls.map((bl) => svg("circle", { r: ballR, fill: bl.colour, ...BALL, opacity: 0 }, s));

      const binLabels = bins.map((bn, b) => {
        const box = el("div", "gr-bin", root);
        Object.assign(box.style, { left: boardL + b * binW + "px", width: binW + "px", top: binBottom + 18 + "px" });
        el("div", "gr-bin-name", box, bn.name);
        const pct = el("div", "gr-bin-pct", box, "0%");
        if (bn.note) el("div", "gr-bin-note", box, bn.note);
        return pct;
      });
      const copy = el("div", "gr-copy", root);
      el("div", "gr-eyebrow", copy, content.eyebrow || "");
      el("div", "gr-h", copy, content.heading || "");
      el("div", "gr-sub", copy, content.sub || "");
      const ruleChip = el("div", "gr-rule", root);
      el("span", "gr-rule-k", ruleChip, "RULE");
      el("span", "", ruleChip, rule.label);
      const rate = el("div", "gr-rate", root);
      const rateN = el("b", "", rate, "—");
      el("span", "", rate, content.rateLabel || "");
      return { balls, dots, bins, binLabels, ruleChip, rateN, flap, cx, pivotY, flapA, rule };
    },

    render(t, S, h) {
      const { tw, span, lerp, ease } = h;
      const out = 1 - tw(t, D - 0.9, 0.6, "inOut");
      const labelsIn = tw(t, 0, 0.5, "soft") * out; // labels fade in at the start and out before the seam
      S.balls.forEach((bl, i) => {
        const d = S.dots[i], p = bl.pts;
        if (t < p[0][2]) { d.setAttribute("opacity", 0); return; }
        let k = 0;
        while (k < p.length - 2 && t >= p[k + 1][2]) k++;
        const [x0, y0, t0] = p[k], [x1, y1, t1] = p[k + 1];
        const u = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-3, t1 - t0)));
        let x, y;
        if (k === 0 || k === p.length - 2) { x = lerp(x0, x1, u); y = lerp(y0, y1, u * u); } // falling: accelerates
        else if (k === 1) { x = lerp(x0, x1, ease.inOut(u)); y = lerp(y0, y1, ease.inOut(u)); } // sliding down the switch
        else { x = lerp(x0, x1, u); y = lerp(y0, y1, u) - Math.sin(u * Math.PI) * 9; } // a hop over a peg
        d.setAttribute("cx", x.toFixed(1)); d.setAttribute("cy", y.toFixed(1));
        d.setAttribute("opacity", out.toFixed(3));
      });
      // the switch swings from pointing down-left to down-right at the rule, and back before the seam
      const flip = tw(t, S.rule.at - 0.05, 0.3, "snappy") * (1 - tw(t, D - 1.0, 0.6, "inOut"));
      const ang = lerp(Math.PI - S.flapA, S.flapA, flip);
      S.flap.setAttribute("transform", `translate(${S.cx} ${S.pivotY}) rotate(${((ang * 180) / Math.PI).toFixed(2)})`);
      S.ruleChip.style.opacity = span(t, S.rule.at - 0.3, D - 0.9, 0.4, 0.5).toFixed(3);
      S.ruleChip.style.transform = `translateY(${((1 - tw(t, S.rule.at - 0.3, 0.5)) * 10).toFixed(1)}px)`;
      // shares from balls that have landed; the headline figure is the last 24 payments
      const landed = S.balls.filter((b) => t >= b.landAt).sort((a, b) => b.landAt - a.landAt);
      const counts = S.bins.map(() => 0);
      landed.forEach((b) => counts[b.bin]++);
      S.binLabels.forEach((node, b) => { node.textContent = landed.length ? Math.round((counts[b] / landed.length) * 100) + "%" : "0%"; node.parentNode.style.opacity = labelsIn.toFixed(3); });
      const recent = landed.slice(0, 24);
      S.rateN.textContent = recent.length ? Math.round((recent.filter((b) => S.bins[b.bin].good).length / recent.length) * 100) + "%" : "—";
      S.rateN.parentNode.style.opacity = labelsIn.toFixed(3);
    },
  });
})();
