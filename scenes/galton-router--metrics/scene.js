/* galton-router--metrics: the routing pegboard read as its result (procedural SVG + DOM labels).
 * The parent's pegboard shrinks to a compact quincunx in the top right corner. Payments drop through it one at a
 * time, each peg lights as a payment bounces off it, and each payment leaves through one of the exits onto its own
 * track. The tracks run side by side like a route map, across the page to wide bins that fill the full width, where
 * the payments stack as dots into a histogram. Under each bin the share is counted from the payments that have
 * landed, a dashed line marks the target share, and the headline figure is the share sent to the "good" bins.
 * Every payment's bin is planned in setup so the counts are exact (share × count / 100): the walk through the pegs is
 * a seeded shuffle of the left/right choices that reach that exit, so at `still` the shares are the content's values.
 *
 * Content: the parent's shape. `bins` (name, note, good, `share` in whole percent, summing to 100), `rule.label`,
 * `rateLabel` ({n} = payments landed), `target` ({ share, label }), `count`, `spawnUntil`. Fits 3–6 bins.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const L = 96, R = 1504; // full-width margins
  const OUT_AT = 10.8; // the dots and figures clear from here, before the seam

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 10.1,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const INK = ui.strokeColor(C.ink), WALL = ui.stroke("bold", 3), BALL = ui.strokeAttrs("fine", 1.2, C.ink);
      root.classList.add("grm");
      const rand = rng(content.seed || 31);
      const bins = content.bins || [];
      const K = Math.max(2, bins.length);

      // ---------- the planned outcome: exact counts per bin ----------
      const N = content.count ?? 200, until = content.spawnUntil ?? 7.4;
      const raw = bins.map((b) => ((b.share || 0) * N) / 100);
      const counts = raw.map(Math.floor);
      raw.map((v, b) => [v - Math.floor(v), b]).sort((a, b) => b[0] - a[0])
        .slice(0, Math.max(0, N - counts.reduce((a, b) => a + b, 0))).forEach(([, b]) => counts[b]++);
      const dest = [];
      counts.forEach((c, b) => { for (let i = 0; i < c; i++) dest.push(b); });
      for (let i = dest.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [dest[i], dest[j]] = [dest[j], dest[i]]; }

      // ---------- geometry ----------
      const binW = (R - L) / K, binCx = (b) => L + (b + 0.5) * binW;
      const gapX = 46, gapY = 40, rows = K - 1, pegR = 4.5, ballR = 7;
      const bx = binCx(K - 1) - ((K - 1) / 2) * gapX; // the last exit sits straight above the last bin
      const pegTop = 150, pegX = (r, i) => bx + (i - r / 2) * gapX, pegY = (r) => pegTop + r * gapY;
      const exitY = pegY(rows) + 2, laneY = (b) => exitY + 22 + b * 22, mouthY = laneY(K - 1) + 30;
      const base = 762, pitch = 2 * ballR + 4;
      const maxRows = Math.floor((base - mouthY - 24) / pitch);
      const perRow = Math.max(3, Math.ceil(Math.max(...counts, 1) / maxRows));

      // ---------- plan each payment: feed, hop the pegs, ride its track, fall onto its stack ----------
      const HOP = 0.11, SPEED = 1500;
      const hits = []; // [row, index, time] for the peg glow
      const balls = dest.map((bin, i) => {
        const at = 0.25 + (i * (until - 0.25)) / Math.max(1, N);
        const turns = Array.from({ length: rows }, (_, r) => (r < bin ? 1 : 0));
        for (let r = turns.length - 1; r > 0; r--) { const j = Math.floor(rand() * (r + 1)); [turns[r], turns[j]] = [turns[j], turns[r]]; }
        const pts = [[bx + (rand() - 0.5) * 8, 40, at]]; // [x, y, time]
        let idx = 0, tt = at + 0.26;
        pts.push([pegX(0, 0), pegY(0) - pegR - ballR, tt]);
        hits.push([0, 0, tt]);
        for (let r = 0; r < rows; r++) {
          idx += turns[r];
          tt += HOP;
          const last = r === rows - 1;
          pts.push([pegX(r + 1, idx), last ? exitY : pegY(r + 1) - pegR - ballR, tt]);
          if (!last) hits.push([r + 1, idx, tt]);
        }
        const kind = pts.length; // from here on the payment rides its track at constant speed
        const track = [[pegX(rows, bin), laneY(bin)], [binCx(bin), laneY(bin)], [binCx(bin), mouthY]];
        let [px, py] = pts[pts.length - 1];
        track.forEach(([x, y]) => { const d = Math.hypot(x - px, y - py); if (d < 0.5) return; tt += d / SPEED; pts.push([x, y, tt]); px = x; py = y; });
        return { pts, kind, bin, arrive: tt, colour: pal[i % 3 === 0 ? 2 : i % 3 === 1 ? 0 : 4] };
      });
      // stack slots in arrival order, then the fall
      const fill = bins.map(() => 0);
      balls.slice().sort((a, b) => a.arrive - b.arrive).forEach((bl) => {
        const k = fill[bl.bin]++;
        const col = k % perRow, row = Math.floor(k / perRow);
        const fx = binCx(bl.bin) + (col - (perRow - 1) / 2) * pitch, fy = base - ballR - 2 - row * pitch;
        const fall = Math.sqrt(Math.max(1, fy - mouthY) / 1400);
        bl.pts.push([fx, fy, bl.arrive + fall]);
        bl.landAt = bl.arrive + fall;
      });
      const firstLand = Math.min(...balls.map((b) => b.landAt));
      const tracks = Array.from({ length: K }, (_, b) => `M${pegX(rows, b)} ${exitY - 6}V${laneY(b)}H${binCx(b)}V${mouthY}`);

      // ---------- drawing ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "grm-svg" }, root);
      // the bins: wide columns over the full width, the good ones tinted
      bins.forEach((bn, b) => svg("rect", { x: L + b * binW + 6, y: mouthY, width: binW - 12, height: base - mouthY, rx: ui.radius("md", 12), fill: bn.good ? mix(C.positive || C.accent, C.paper, 0.86) : C.surface, ...ui.strokeAttrs("hair", 1, C.stroke || C.line) }, s));
      // the tracks: a channel under a thin centre line, one per exit, side by side like a route map
      // sm-native: the channel is the track a payment rides in, sized to the payment, not an outline
      tracks.forEach((d) => svg("path", { d, fill: "none", stroke: mix(C.line, C.paper, 0.35), "stroke-width": 2 * ballR + 4, "stroke-linejoin": "round", "stroke-linecap": "round" }, s));
      tracks.forEach((d, b) => svg("path", { d, fill: "none", stroke: bins[b].good ? (C.positive || C.accent) : mix(C.ink, C.paper, 0.6), "stroke-width": ui.stroke("fine", 1.5), "stroke-linejoin": "round", "stroke-dasharray": bins[b].good ? null : "1 5", "stroke-linecap": "round" }, s));
      // the compact board
      const bw = (rows + 1) * gapX + 56;
      svg("rect", { x: bx - bw / 2, y: pegTop - 46, width: bw, height: exitY - pegTop + 52, rx: ui.radius("lg", 20), fill: C.surface, ...ui.strokeAttrs("regular", 1.5, C.stroke || C.line) }, s);
      svg("path", { d: `M${bx - 70} 26L${bx - 16} ${pegTop - 52}M${bx + 70} 26L${bx + 16} ${pegTop - 52}`, stroke: INK, "stroke-width": WALL, "stroke-linecap": "round", fill: "none" }, s);
      const glows = [];
      for (let r = 0; r < rows; r++) for (let i = 0; i <= r; i++) {
        svg("circle", { cx: pegX(r, i), cy: pegY(r), r: pegR, fill: mix(C.ink, C.paper, 0.55) }, s);
        glows.push({ r, i, node: svg("circle", { cx: pegX(r, i), cy: pegY(r), r: pegR + 3, fill: C.accent, opacity: 0 }, s), times: hits.filter((x) => x[0] === r && x[1] === i).map((x) => x[2]).sort((a, b) => a - b) });
      }
      // the target line, across every bin
      const tgt = content.target;
      let targetY = null;
      if (tgt && tgt.share != null) {
        targetY = base - ((tgt.share * N) / 100 / perRow) * pitch;
        svg("line", { x1: L, y1: targetY, x2: R, y2: targetY, stroke: INK, "stroke-width": ui.stroke("fine", 1.5), "stroke-dasharray": "6 6" }, s);
      }
      const dotLayer = svg("g", {}, s);
      const dots = balls.map((bl) => svg("circle", { r: ballR, fill: bl.colour, ...BALL, opacity: 0 }, dotLayer));

      // ---------- labels ----------
      const copy = el("div", "grm-copy", root);
      if (content.eyebrow) el("div", "grm-eyebrow", copy, content.eyebrow);
      el("div", "grm-h", copy, content.heading || "");
      if (content.sub) el("div", "grm-sub", copy, content.sub);

      const focal = el("div", "grm-focal", root);
      const focalN = el("div", "grm-fnum", focal, "0%");
      const focalL = el("div", "grm-flabel", focal, "");
      let chip = null;
      if (content.rule && content.rule.label) {
        chip = el("div", "grm-rule", focal);
        el("span", "grm-rule-k", chip, "RULE");
        el("span", "", chip, content.rule.label);
      }
      if (targetY != null) {
        const tl = el("div", "grm-target", root);
        Object.assign(tl.style, { left: L + 22 + "px", top: targetY - 30 + "px" });
        el("b", "", tl, `${tgt.share}%`);
        el("span", "", tl, tgt.label || "");
      }
      const binLabels = bins.map((bn, b) => {
        const box = el("div", "grm-bin", root);
        Object.assign(box.style, { left: L + b * binW + "px", width: binW + "px", top: base + 14 + "px" });
        el("div", "grm-bin-name", box, bn.name);
        const pct = el("div", "grm-bin-pct", box, "0%");
        if (bn.note) el("div", "grm-bin-note", box, bn.note);
        return pct;
      });
      return { balls, dots, bins, binLabels, glows, focal, focalN, focalL, rateLabel: content.rateLabel || "", firstLand, N, pegR };
    },

    render(t, S, h) {
      const { tw, lerp, text } = h;
      const out = 1 - tw(t, OUT_AT, 0.6, "inOut");
      const drop = (1 - out) * 14;
      S.balls.forEach((bl, i) => {
        const d = S.dots[i], p = bl.pts;
        if (t < p[0][2] || out <= 0) { d.setAttribute("opacity", 0); return; }
        let k = 0;
        while (k < p.length - 2 && t >= p[k + 1][2]) k++;
        const [x0, y0, t0] = p[k], [x1, y1, t1] = p[k + 1];
        const u = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-3, t1 - t0)));
        let x, y;
        if (k === 0 || k === p.length - 2) { x = lerp(x0, x1, u); y = lerp(y0, y1, u * u); } // falling: accelerates
        else if (k < bl.kind - 1) { x = lerp(x0, x1, u); y = lerp(y0, y1, u) - Math.sin(u * Math.PI) * 9; } // a hop over a peg
        else { x = lerp(x0, x1, u); y = lerp(y0, y1, u); } // riding the track
        d.setAttribute("cx", x.toFixed(1)); d.setAttribute("cy", (y + drop).toFixed(1));
        d.setAttribute("opacity", out.toFixed(3));
      });
      // a peg flashes each time a payment bounces off it, and keeps a heat: the share of payments that hit it
      S.glows.forEach((g) => {
        let last = -1, n = 0;
        for (const ht of g.times) { if (ht > t) break; last = ht; n++; }
        const flash = last < 0 ? 0 : Math.max(0, 1 - (t - last) / 0.22);
        const heat = (n / S.N) * out;
        g.node.setAttribute("opacity", Math.max(flash * 0.85, heat * 0.7).toFixed(3));
        g.node.setAttribute("r", (S.pegR + 1 + heat * 4 + flash * 2).toFixed(2));
      });
      // shares from the payments that have landed
      const counts = S.bins.map(() => 0);
      let landed = 0;
      S.balls.forEach((b) => { if (t >= b.landAt) { counts[b.bin]++; landed++; } });
      const shown = tw(t, S.firstLand - 0.15, 0.5, "soft") * out;
      S.binLabels.forEach((node, b) => {
        text(node, landed ? Math.round((counts[b] / landed) * 100) + "%" : "0%");
        node.style.opacity = shown.toFixed(3);
      });
      const good = S.bins.reduce((a, bn, b) => a + (bn.good ? counts[b] : 0), 0);
      text(S.focalN, landed ? Math.round((good / landed) * 100) + "%" : "0%");
      text(S.focalL, S.rateLabel.replace("{n}", String(landed)));
      S.focalN.style.opacity = shown.toFixed(3);
      S.focalL.style.opacity = shown.toFixed(3);
    },
  });
})();
