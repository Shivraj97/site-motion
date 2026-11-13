// @vendor ui-kit
/* dashboard-push: a real dashboard that proves its own numbers.
 * Intro: the revenue line draws Monday → Sunday and the Revenue figure is built from it, day by day, as the line
 * passes each point (the number is the chart's byproduct, never a free-running counter).
 * Loop: the cursor scrubs the line (a guide, a dot on the curve and a tooltip with the nearest day's value), the
 * camera pushes in on the best day while an annotation names it, pulls back, then 30D morphs every series, figure
 * and channel bar to the month and 7D morphs them back. The loop ends exactly where it began.
 */
(function () {
  const D = 14, LOOP = 2.6;
  const PW = 660, PH = 300; // plot size in stage pixels
  const N = 175; // samples: 6 × 29 + 1, so every day of the week (every 29th) and of the month (every 6th) is a sample

  // Catmull-Rom through the values, at fractional index u
  const cr = (v, u) => {
    const n = v.length, i = Math.max(0, Math.min(n - 2, Math.floor(u))), f = u - i;
    const p0 = v[Math.max(i - 1, 0)], p1 = v[i], p2 = v[i + 1], p3 = v[Math.min(i + 2, n - 1)];
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
  const resample = (v) => Array.from({ length: N }, (_, i) => cr(v, (i / (N - 1)) * (v.length - 1)));
  const sum = (v) => v.reduce((a, b) => a + b, 0);
  const money = (cur, n) => cur + Math.round(n).toLocaleString("en-US");

  SiteMotion.scene({
    width: 1600,
    height: 900,
    duration: D,
    loop: LOOP,
    still: 4.9,
    setup({ root, content, tokens, h }) {
      const { el, svg } = h;
      root.classList.add("dp");
      el("div", "dp-glow", root);
      const kit = SMUI.kit({ root, h, tokens, width: 1600, height: 900 });
      const app = kit.frame("browser", { url: content.url, x: 200, y: 120, w: 1200, h: 810 });
      const W = content.week, M = content.month, [lo, hi] = content.axis;
      const yOf = (v) => PH - ((v - lo) / (hi - lo)) * PH;

      // ---------- top bar ----------
      const top = el("div", "dp-top", app.body);
      const brand = el("div", "dp-brand", top);
      el("span", "dp-mark", brand, content.brand.text);
      el("span", "", brand, content.brand.name);
      const tabs = el("div", "dp-tabs", top);
      content.tabs.forEach((x, i) => el("span", i === 0 ? "is-on" : "", tabs, x));
      const seg = el("div", "dp-seg", top);
      const knob = el("span", "dp-knob", seg);
      const ranges = content.ranges.map((r, i) => { const o = el("span", "dp-opt", seg, r); o.dataset.ui = "range-" + i; return o; });

      // ---------- KPI cards ----------
      const kpis = W.kpis.map((k, i) => {
        const card = el("div", "dp-kpi", app.body);
        card.style.left = 32 + i * 384 + "px";
        el("div", "dp-label", card, k.label);
        const value = el("div", "dp-value", card);
        const delta = el("span", "dp-delta", card);
        return { card, value, delta };
      });

      // ---------- chart ----------
      const chart = el("div", "dp-card dp-chart", app.body);
      el("div", "dp-card-title", chart, content.chartTitle);
      const plot = el("div", "dp-plot", chart);
      const s = svg("svg", { viewBox: `0 0 ${PW} ${PH}`, width: PW, height: PH, class: "dp-svg" }, plot);
      for (let g = 0; g <= 4; g++) {
        const y = (g / 4) * PH;
        svg("line", { x1: 0, x2: PW, y1: y, y2: y, class: g === 4 ? "dp-base" : "dp-grid" }, s);
        el("span", "dp-ylab", plot, content.currency + Math.round((hi - ((hi - lo) * g) / 4) / 1000 * 10) / 10 + "k").style.top = y - 8 + "px";
      }
      const defs = svg("defs", {}, s);
      const grad = svg("linearGradient", { id: "dp-fade", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svg("stop", { offset: 0, "stop-color": "var(--c-accent)", "stop-opacity": 0.32 }, grad);
      svg("stop", { offset: 1, "stop-color": "var(--c-accent)", "stop-opacity": 0 }, grad);
      const clip = svg("clipPath", { id: "dp-reveal" }, defs);
      const reveal = svg("rect", { x: -4, y: -20, width: 0, height: PH + 40 }, clip);
      const drawn = svg("g", { "clip-path": "url(#dp-reveal)" }, s);
      const area = svg("path", { fill: "url(#dp-fade)" }, drawn);
      const line = svg("path", { class: "dp-line" }, drawn);
      const head = svg("circle", { r: 5, class: "dp-head" }, s);
      // x labels: one row per range, crossfaded by the morph
      const xRow = (labels) => {
        const row = el("div", "dp-xrow", plot);
        labels.forEach((l, i) => { el("span", "", row, l).style.left = ((i / (labels.length - 1)) * PW).toFixed(1) + "px"; });
        return row;
      };
      const xWeek = xRow(W.labels), xMonth = xRow(M.labels);
      // the week's points are targets the cursor and camera aim at
      W.values.forEach((v, i) => {
        const p = el("i", "dp-pt", plot);
        p.dataset.ui = "pt-" + i;
        p.style.left = ((i / 6) * PW).toFixed(1) + "px";
        p.style.top = yOf(v).toFixed(1) + "px";
      });
      const guide = el("div", "dp-guide", plot);
      const dot = el("div", "dp-dot", plot);
      const tip = el("div", "dp-tip", plot);
      const tipDay = el("span", "dp-tip-day", tip);
      const tipVal = el("b", "", tip);
      const note = el("div", "dp-note", plot);
      el("span", "dp-note-k", note, content.best);
      el("b", "", note, content.bestDelta);
      note.style.left = PW - 278 + "px";
      note.style.top = yOf(W.values[6]) - 96 + "px";

      // ---------- channels ----------
      const ch = el("div", "dp-card dp-channels", app.body);
      el("div", "dp-card-title", ch, content.channelsTitle);
      const bars = content.channels.map((c) => {
        const row = el("div", "dp-ch", ch);
        const label = el("div", "dp-ch-row", row);
        el("span", "", label, c.name);
        const pct = el("b", "", label);
        const fill = el("i", "dp-ch-fill", el("div", "dp-ch-track", row));
        return { c, pct, fill };
      });

      kit.cursor(content.cursor, { start: [1260, 862] });
      kit.camera(content.camera);
      const plotAt = () => kit.rect("pt-0"); // the plot's origin in world pixels comes from its first point
      return { kit, content, yOf, A: resample(W.values), B: resample(M.values), monthTotal: sum(M.values), kpis, ranges, knob, reveal, area, line, head, xWeek, xMonth, guide, dot, tip, tipDay, tipVal, note, bars, plotAt };
    },

    render(t, S, h) {
      const { tw, span, clamp, lerp } = h;
      const c = S.content, W = c.week, M = c.month, T = c.times;
      S.kit.render(t);

      // morph: 0 = the week, 1 = the month, eased between the two range clicks
      const c30 = S.kit.clickedAt("range-1") ?? 8.6, c7 = S.kit.clickedAt("range-0") ?? 11.1;
      const m = tw(t, c30 + 0.05, 0.95, "inOut") * (1 - tw(t, c7 + 0.05, 0.95, "inOut"));
      const sel = tw(t, c30, 0.35, "snappy") * (1 - tw(t, c7, 0.35, "snappy"));
      const r0 = S.ranges[0], r1 = S.ranges[1];
      S.knob.style.width = lerp(r0.offsetWidth, r1.offsetWidth, sel).toFixed(1) + "px";
      S.knob.style.transform = `translateX(${lerp(r0.offsetLeft, r1.offsetLeft, sel).toFixed(1)}px)`;
      S.ranges.forEach((o, i) => o.classList.toggle("is-on", i === (sel > 0.5 ? 1 : 0)));

      // the line: drawn left to right in the intro (a clip that grows), then morphing between the ranges
      const d = tw(t, T.draw, 1.8, "inOut");
      const ys = S.A.map((a, i) => S.yOf(lerp(a, S.B[i], m)));
      const step = PW / (ys.length - 1);
      const pts = ys.map((y, i) => `${(i * step).toFixed(1)} ${y.toFixed(1)}`);
      S.line.setAttribute("d", "M" + pts.join(" L"));
      S.area.setAttribute("d", `M0 ${300} L` + pts.join(" L") + ` L${PW} 300 Z`);
      S.reveal.setAttribute("width", (d * (PW + 8)).toFixed(1));
      const hx = d * PW, hu = d * (ys.length - 1);
      S.head.setAttribute("cx", hx.toFixed(1));
      S.head.setAttribute("cy", lerp(ys[Math.floor(hu)], ys[Math.min(ys.length - 1, Math.ceil(hu))], hu % 1).toFixed(1));
      S.head.setAttribute("opacity", (d > 0 && d < 1 ? 1 : 0) + "");

      // KPIs: Revenue is built from the drawn line (each day counts as the line reaches it); the others arrive
      // with their card and only change with the range, so no number on screen runs on its own
      const revealed = d * 6;
      const weekRev = W.values.reduce((s, v, k) => s + v * clamp((revealed - k) * 4 + 1), 0);
      const swap = Math.min(1, Math.abs(m - 0.5) * 3);
      W.kpis.forEach((k, i) => {
        const card = S.kpis[i];
        const value = i === 0 ? lerp(weekRev, S.monthTotal, m) : lerp(k.value, M.kpis[i].value, m);
        h.text(card.value, (i === 0 ? c.currency : k.prefix || "") + Math.round(value).toLocaleString("en-US"));
        h.text(card.delta, m < 0.5 ? k.delta : M.kpis[i].delta);
        card.delta.style.opacity = (swap * tw(t, 1.9, 0.5, "soft")).toFixed(3);
        const enter = tw(t, 0.1 + i * 0.1, 0.7, "signature");
        card.card.style.opacity = enter.toFixed(3);
        card.card.style.transform = `translateY(${((1 - enter) * 14).toFixed(2)}px)`;
      });
      // labels hand over rather than overlap: the week's leave in the first half of the morph, the month's arrive in the second
      S.xWeek.style.opacity = clamp(1 - m * 2.2).toFixed(3);
      S.xMonth.style.opacity = clamp(m * 2.2 - 1.2).toFixed(3);

      // hover: a guide and a dot follow the pointer along the curve; the tooltip reads the nearest day. While the
      // annotation names the best day, it speaks for the tooltip.
      const note = span(t, T.annotate[0], T.annotate[1], 0.5, 0.35);
      const o = S.plotAt(), ptr = S.kit.pointerAt(t);
      const px = ptr[0] - o.x, py = ptr[1] - (o.y - S.yOf(W.values[0]));
      const outside = Math.max(0, -px, px - PW, -py - 20, py - PH - 20);
      const on = span(t, T.hover[0], T.hover[1], 0.25, 0.3) * clamp(1 - outside / 30) * (1 - m);
      const u = clamp(px / PW) * 6, day = Math.round(u), gx = (u / 6) * PW;
      const cy = S.yOf(cr(W.values, u));
      S.guide.style.transform = `translateX(${gx.toFixed(1)}px)`;
      S.dot.style.transform = `translate(${gx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      S.guide.style.opacity = S.dot.style.opacity = on.toFixed(3);
      S.tip.style.opacity = (on * (1 - note)).toFixed(3);
      h.text(S.tipDay, W.labels[day]);
      h.text(S.tipVal, money(c.currency, W.values[day]));
      S.tip.style.transform = `translate(${clamp(gx - 70, -10, PW - 150).toFixed(1)}px, ${(cy - 84).toFixed(1)}px)`;
      S.note.style.opacity = note.toFixed(3);
      S.note.style.transform = `translateY(${((1 - note) * 10).toFixed(2)}px)`;

      // channels: bars grow in the intro, then move with the morph
      S.bars.forEach((b, i) => {
        const g = tw(t, 0.6 + i * 0.1, 1.0, "signature");
        const v = lerp(b.c.week, b.c.month, m);
        h.text(b.pct, Math.round(v) + "%");
        b.fill.style.transform = `scaleX(${((v / 50) * g).toFixed(4)})`;
      });
    },
  });
})();
