/* pipeline-board--metrics: the pipeline board read as numbers (DOM + one SVG layer).
 * The same deal cards and stage columns, drawn as a stepped conversion chart. The whole cohort streams into the first
 * column and stacks into a bar. Then, one stage at a time, the cards that reached the next stage slide right at the
 * same height and leave a dashed outline behind, while the ones that stopped there dim. Because each column is stacked
 * furthest-first, the outlines left in a column are exactly the bar standing in the next one, and a dashed step line
 * joins them. The conversion between each pair of stages is counted from the cards that moved (movers / reached) and
 * set in the gap; the focal figure on the left is the share of the cohort that reached the latest stage, so it steps
 * down with every move and lands on the end-to-end rate. When the last cards land in the final column, the result
 * line (won of entered, their value) and the cycle time (median of the won cards' `days`) appear beside it.
 *
 * Content: the parent's shape. `stages`, `cards` (owner, value, `stage` = the furthest stage the card reached, optional
 * `days` from first stage to last), optional `moves` (applied like the parent: each listed card advances one stage),
 * `format`, and the templates `focal`, `result` and `cycle`. Fits 3–5 stages and up to ~24 cards.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const COPY = { left: 96, width: 404 };
  const CHART = { left: 600, right: 1504, gap: 60, base: 776, top: 150 };
  const STEP_FIRST = 2.1, STEP_SPAN = 3.45, TRAVEL = 0.55;
  const EXIT = 10.7;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 8.4,
    setup({ root, content, tokens, h }) {
      const { el, svg } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("pbm");

      // ---------- data ----------
      const stages = (content.stages || []).map((s) => (typeof s === "string" ? { name: s } : s));
      const N = Math.max(2, stages.length);
      const fmt = content.format || {};
      const money = (v) => `${fmt.prefix || ""}${Number.isInteger(v) ? v : v.toFixed(1)}${fmt.suffix || ""}`;
      const hasValue = (content.cards || []).some((c) => typeof c.value === "number");
      const owners = [...new Set((content.cards || []).map((c) => c.owner || ""))];
      const cards = (content.cards || []).map((c, i) => ({ ...c, i, key: c.id || c.title, last: Math.max(0, Math.min(N - 1, c.stage || 0)) }));
      const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
      (content.moves || []).forEach((m) => { const c = byKey[typeof m === "string" ? m : m.card]; if (c) c.last = Math.min(N - 1, c.last + 1); });
      // stack order: furthest first, so the cards that move on are always the bottom of a column
      const order = cards.slice().sort((a, b) => b.last - a.last || a.i - b.i);
      order.forEach((c, r) => { c.r = r; });
      const E = cards.length;
      const reached = stages.map((_, s) => cards.filter((c) => c.last >= s).length);

      // the steps: step k carries every card that reached stage k + 1 out of column k
      const steps = [];
      for (let k = 0; k < N - 1; k++) {
        const movers = order.filter((c) => c.last >= k + 1);
        const start = STEP_FIRST + (k * STEP_SPAN) / Math.max(1, N - 2);
        const each = Math.min(0.06, 0.42 / Math.max(1, movers.length - 1));
        movers.forEach((c, j) => { (c.dep = c.dep || [])[k] = start + h.motion.stagger(j, each); });
        const end = movers.length ? start + h.motion.stagger(movers.length - 1, each) + TRAVEL : start + 0.2;
        steps.push({ k, start, end, n: movers.length, from: reached[k] });
      }

      // ---------- geometry ----------
      const colW = (CHART.right - CHART.left - (N - 1) * CHART.gap) / N;
      const colX = (c) => CHART.left + c * (colW + CHART.gap);
      const pitch = Math.min(46, (CHART.base - CHART.top) / Math.max(1, E));
      const tileH = Math.round(pitch - Math.max(4, pitch * 0.14));
      const gapY = pitch - tileH;
      const tileY = (r) => CHART.base - r * pitch - tileH;
      const lineY = (n) => CHART.base - n * pitch + gapY / 2; // the gap above the nth tile: where moved-on meets stopped

      // ---------- copy, top left ----------
      const copy = el("div", "pbm-copy", root);
      Object.assign(copy.style, { left: COPY.left + "px", width: COPY.width + "px" });
      if (content.eyebrow) el("div", "pbm-eyebrow", copy, content.eyebrow);
      el("div", "pbm-h", copy, content.heading || "");
      if (content.sub) el("div", "pbm-sub", copy, content.sub);

      // ---------- the focal figure, bottom left, sitting on the chart's baseline ----------
      const focal = el("div", "pbm-focal", root);
      Object.assign(focal.style, { left: COPY.left + "px", width: COPY.width + "px" });
      const fLabel = el("div", "pbm-flabel", focal);
      el("span", "pbm-fdot", fLabel);
      const fLabelText = el("span", "", fLabel, "");
      const fNum = el("div", "pbm-fnum", focal, "");
      const won = cards.filter((c) => c.last === N - 1);
      const wonValue = won.reduce((a, c) => a + (typeof c.value === "number" ? c.value : 0), 0);
      const resultLine = String(content.result || "{won} of {entered} reached {stage}")
        .replace("{won}", String(won.length))
        .replace("{entered}", String(E))
        .replace("{stage}", stages[N - 1].name)
        .replace("{value}", hasValue && won.length ? money(Math.round(wonValue * 10) / 10) : "")
        .replace(/\s*·\s*$/, "");
      const fResult = el("div", "pbm-fresult", focal, resultLine);
      // cycle time: the median of the won cards' days, so it comes from the cards that made the whole trip
      const days = won.map((c) => c.days).filter((d) => typeof d === "number").sort((a, b) => a - b);
      const median = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
      const cyc = content.cycle || {};
      let cycle = null;
      if (median !== null) {
        cycle = el("div", "pbm-cycle", focal);
        const num = el("div", "pbm-cnum", cycle);
        el("span", "", num, String(Math.round(median * 10) / 10));
        el("span", "pbm-cunit", num, cyc.unit || "days");
        el("div", "pbm-clabel", cycle, cyc.label || "Median cycle");
      }
      const focalLabel = (s) => String(content.focal || "{from} to {to}").replace("{from}", stages[0].name).replace("{to}", stages[s].name);
      const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0) + "%";

      // ---------- chart: baseline, stage names, counts ----------
      const chart = el("div", "pbm-chart", root);
      const base = el("div", "pbm-base", chart);
      Object.assign(base.style, { left: CHART.left - 12 + "px", width: CHART.right - CHART.left + 24 + "px", top: CHART.base + 1 + "px" });
      const cols = stages.map((s, c) => {
        const name = el("div", "pbm-stage" + (c === N - 1 ? " pbm-stage-last" : ""), chart);
        Object.assign(name.style, { left: colX(c) + "px", width: colW + "px", top: CHART.base + 16 + "px" });
        if (c === N - 1) el("span", "pbm-fdot", name);
        el("span", "", name, s.name);
        const count = el("div", "pbm-count", chart, "");
        Object.assign(count.style, { left: colX(c) + "px", width: colW + "px" });
        return { name, count };
      });

      // step lines (SVG) and the rate chips in the gaps
      const lines = svg("svg", { class: "pbm-lines", width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
      const lineAttrs = h.ui.strokeAttrs("regular", 1.5, C.muted);
      const gaps = steps.map((st) => {
        const y = lineY(st.n);
        const line = svg("line", { x1: colX(st.k) - 6, y1: y, x2: colX(st.k) - 6, y2: y, "stroke-dasharray": "5 5", "stroke-linecap": "round", ...lineAttrs }, lines);
        const chip = el("div", "pbm-rate", root, pct(st.n, st.from));
        Object.assign(chip.style, { left: colX(st.k) + colW + CHART.gap / 2 + "px", top: y + "px" });
        return { line, chip, y, x0: colX(st.k) - 6, x1: colX(st.k + 1) };
      });

      // ---------- tiles: the deal cards, compact. Ghosts mark where a card stood before it moved on ----------
      const ghostLayer = el("div", "pbm-ghosts", root);
      const tileLayer = el("div", "pbm-tiles", root);
      const okBg = h.mix(C.positive || C.accent, C.surface, 0.82);
      const tiles = cards.map((c) => {
        const ghosts = [];
        for (let k = 0; k < c.last; k++) {
          const g = el("div", "pbm-ghost", ghostLayer);
          Object.assign(g.style, { left: colX(k) + "px", top: tileY(c.r) + "px", width: colW + "px", height: tileH + "px" });
          ghosts.push(g);
        }
        const tile = el("div", "pbm-tile" + (c.last === N - 1 ? " pbm-tile-won" : ""), tileLayer);
        Object.assign(tile.style, { top: tileY(c.r) + "px", width: colW + "px", height: tileH + "px" });
        const lift = el("div", "pbm-lift", tile);
        const ok = el("div", "pbm-ok", tile);
        ok.style.background = okBg;
        const av = el("span", "pbm-av", tile, (c.owner || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
        const size = Math.min(24, tileH - 8);
        Object.assign(av.style, { width: size + "px", height: size + "px", fontSize: Math.max(10, Math.round(size * 0.46)) + "px" });
        const bg = pal[(owners.indexOf(c.owner || "") * 2 + 1) % pal.length];
        av.style.background = bg;
        av.style.color = h.inkOn(bg);
        const val = el("span", "pbm-val", tile, typeof c.value === "number" ? money(c.value) : "");
        return { c, tile, lift, ok, av, val, ghosts };
      });

      return { N, E, cards, stages, steps, reached, colX, colW, pitch, tileH, cols, gaps, tiles, fLabelText, fNum, fResult, cycle, focal, focalLabel, pct };
    },

    render(t, S, h) {
      const { tw, lerp } = h;
      const { N, E, steps } = S;
      const gone = tw(t, EXIT + 0.25, 0.5, "inOut"); // labels and lines leave with the last tiles
      const enterEach = Math.min(0.05, 0.8 / Math.max(1, E));

      // ---------- tiles ----------
      const fill = new Array(N).fill(0); // how much of each column's stack has arrived (continuous, for the count's height)
      const count = new Array(N).fill(0); // how many cards have reached each column (discrete)
      S.tiles.forEach((T) => {
        const c = T.c;
        const enter = tw(t, 0.3 + h.motion.stagger(c.r, enterEach), 0.6, "signature");
        const out = tw(t, EXIT + h.motion.stagger(E - 1 - c.r, Math.min(0.03, 0.4 / Math.max(1, E))), 0.45, "inOut");
        let x = S.colX(0) - (1 - enter) * 70, lift = 0, moving = false;
        fill[0] += enter;
        if (enter >= 0.5) count[0]++;
        for (let k = 0; k < c.last; k++) {
          const dep = c.dep[k];
          const p = tw(t, dep, TRAVEL, "snappy");
          x = lerp(x, S.colX(k + 1), p);
          const l = tw(t, dep - 0.04, 0.14, "soft") * (1 - tw(t, dep + TRAVEL - 0.2, 0.22, "soft"));
          lift = Math.max(lift, l);
          if (l > 0.01) moving = true;
          fill[k + 1] += p;
          if (p >= 0.85) count[k + 1]++;
          // the outline it leaves behind
          T.ghosts[k].style.opacity = (tw(t, dep + 0.1, 0.35, "soft") * (1 - out)).toFixed(3);
        }
        // a card that stopped dims once the step it missed is done; a card that made it all the way turns to the success fill
        let dim = 0, ok = 0;
        if (c.last < N - 1) dim = tw(t, steps[c.last].end, 0.4, "soft");
        else ok = tw(t, c.dep[N - 2] + TRAVEL - 0.05, 0.35, "snappy");
        T.tile.style.transform = `translate(${x.toFixed(1)}px, ${(-lift * 4 + out * 8).toFixed(1)}px)`;
        T.tile.style.opacity = (enter * (1 - out) * (1 - dim * 0.42)).toFixed(3);
        T.tile.style.zIndex = moving ? 3 : 1;
        T.lift.style.opacity = lift.toFixed(3);
        T.ok.style.opacity = ok.toFixed(3);
      });

      // ---------- counts: on top of each column's stack, reading the cards that have arrived ----------
      S.cols.forEach((col, c) => {
        const y = CHART.base - fill[c] * S.pitch - 34;
        col.count.style.transform = `translateY(${y.toFixed(1)}px)`;
        col.count.style.opacity = (Math.min(1, fill[c]) * (1 - gone)).toFixed(3);
        h.text(col.count, String(count[c]));
      });

      // ---------- step lines and rates, once a step's last card has landed ----------
      S.gaps.forEach((g, k) => {
        const st = steps[k];
        const draw = tw(t, st.end - 0.15, 0.45, "snappy") * (1 - gone);
        h.set(g.line, { x2: (g.x0 + (g.x1 - g.x0) * draw).toFixed(1), opacity: draw > 0.001 ? 1 : 0 });
        const pop = tw(t, st.end, 0.35, "snappy");
        g.chip.style.opacity = (pop * (1 - gone)).toFixed(3);
        g.chip.style.transform = `translate(-50%, -50%) scale(${(0.86 + 0.14 * pop).toFixed(3)})`;
      });

      // ---------- the focal figure: the share of the cohort that reached the latest stage ----------
      let done = 0;
      steps.forEach((st, k) => { if (t >= st.end) done = k + 1; });
      const show = tw(t, steps[0].end, 0.45, "signature") * (1 - gone);
      S.focal.style.opacity = show.toFixed(3);
      if (done > 0) {
        h.text(S.fLabelText, S.focalLabel(done));
        h.text(S.fNum, S.pct(S.reached[done], E));
        const sw = tw(t, steps[done - 1].end, 0.38, "snappy");
        S.fNum.style.transform = `translateY(${((1 - sw) * 14).toFixed(1)}px)`;
        S.fNum.style.opacity = (done === 1 ? 1 : 0.25 + 0.75 * sw).toFixed(3);
      } else {
        h.text(S.fLabelText, S.focalLabel(1));
        h.text(S.fNum, S.pct(S.reached[1], E));
      }
      // the result and the cycle time arrive with the final step
      const fin = steps[N - 2].end;
      const r1 = tw(t, fin + 0.1, 0.45, "snappy"), r2 = tw(t, fin + 0.1 + h.motion.stagger(1, 0.09), 0.45, "snappy");
      S.fResult.style.opacity = r1.toFixed(3);
      S.fResult.style.transform = `translateY(${((1 - r1) * 8).toFixed(1)}px)`;
      if (S.cycle) {
        S.cycle.style.opacity = r2.toFixed(3);
        S.cycle.style.transform = `translateY(${((1 - r2) * 8).toFixed(1)}px)`;
      }
    },
  });
})();
