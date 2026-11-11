/* tree-rings: a year in review as the cross-section of a log (SVG, closed-form growth).
 * The slice starts as heartwood with bark round it. One ring grows per year, as thick as that year's volume,
 * and the bark rides outward on the newest ring. A callout travels out along a measuring line, ring by ring,
 * with the year and its figure; coloured notches mark the firsts and a key under the copy names them. The plaque
 * pinned to the heartwood adds up the rings as they grow, so it lands on the content's total exactly.
 * Ring wobble is seeded noise fixed per ring (shared low harmonics, so neighbours follow each other, plus a little
 * of each ring's own); nothing random moves. Before the seam the rings recede, outermost first, to the start state.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const N = 180; // samples round each ring
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, alpha, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("tr");
      const rand = rng(content.seed || 19);
      const years = content.years;
      const n = years.length;
      const totalValue = years.reduce((s, y) => s + y.value, 0);

      // ---- colour: wood from the warmest palette colour, darkened toward whichever of ink/paper is dark ----
      const rgb = (c) => { const m = c.replace("#", ""); const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255); };
      const lum = (c) => { const [r, g, b] = rgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const hsl = (c) => {
        const [r, g, b] = rgb(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
        if (d === 0) return [0, 0, l];
        const s = d / (1 - Math.abs(2 * l - 1));
        const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [(hh * 60 + 360) % 360, s, l];
      };
      const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
      const warmCands = pal.filter((c) => hsl(c)[1] > 0.18);
      const warm = (warmCands.length ? warmCands : [C.warning || C.accent]).slice().sort((a, b) => hueDist(hsl(a)[0], 34) - hueDist(hsl(b)[0], 34))[0];
      const light = lum(C.paper) > 0.5;
      const deep = light ? C.ink : C.paper, bright = light ? C.surface : C.ink;
      const tone = (p) => mix(warm, deep, p), lift = (p) => mix(warm, bright, p);
      const INK = ui.strokeColor(C.stroke || C.ink);
      const notchCols = [C.accent, ...pal.filter((c) => c !== warm && hsl(c)[1] > 0.12).sort((a, b) => hueDist(hsl(b)[0], hsl(warm)[0]) - hueDist(hsl(a)[0], hsl(warm)[0]))];

      // ---- geometry ----
      const CX = 1070, CY = 446, R0 = 96, RMAX = 316, BARK = 17;
      const minT = 11;
      const T = years.map((y) => minT + ((RMAX - R0 - n * minT) * y.value) / totalValue);
      const b = [R0];
      T.forEach((t, i) => b.push(b[i] + t));
      const ang = Array.from({ length: N }, (_, j) => (j / N) * Math.PI * 2);
      const cos = ang.map(Math.cos), sin = ang.map(Math.sin);
      // shared low harmonics (eccentric growth and a lobed outline) + each ring's own small wobble, all fixed
      const harm = (list) => ang.map((a) => list.reduce((s, [k, amp, ph]) => s + amp * Math.cos(k * a + ph), 0));
      const base = harm([[1, 0.028, rand() * 6.28], [2, 0.012 + rand() * 0.006, rand() * 6.28], [3, 0.007 + rand() * 0.005, rand() * 6.28], [5, 0.004, rand() * 6.28]]);
      const ownOf = () => harm([[2, 0.0025 + rand() * 0.002, rand() * 6.28], [4, 0.0015, rand() * 6.28], [7, 0.0012, rand() * 6.28]]);
      const ownH = ownOf();
      const own = years.map(() => ownOf());
      // bark: rough, furrowed, fixed
      const rough = harm([[13, 1.4, rand() * 6.28], [19, 1.1, rand() * 6.28], [29, 0.9, rand() * 6.28], [41, 0.7, rand() * 6.28]]);
      const furrows = Array.from({ length: 16 }, () => [rand() * Math.PI * 2, 3 + rand() * 4]);
      const barkT = ang.map((a, j) => {
        let f = 0;
        furrows.forEach(([fa, depth]) => { const d = Math.atan2(Math.sin(a - fa), Math.cos(a - fa)); f += depth * Math.exp(-(d * d) / 0.0018); });
        return BARK + rough[j] - f;
      });
      // radius of ring i's outer edge at sample j when it has grown g (0..1); ring -1 is the heartwood
      const ringR = (i, g, j) => {
        if (i < 0) return R0 * (1 + base[j] + ownH[j]);
        const prev = i === 0 ? ownH : own[i - 1];
        return (b[i] + (b[i + 1] - b[i]) * g) * (1 + base[j] + prev[j] + (own[i][j] - prev[j]) * g);
      };
      const closed = (rArr) => {
        const p = rArr.map((r, j) => [CX + r * cos[j], CY + r * sin[j]]);
        const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        let d = `M${mid(p[N - 1], p[0]).map((v) => v.toFixed(1)).join(" ")}`;
        for (let j = 0; j < N; j++) { const m = mid(p[j], p[(j + 1) % N]); d += `Q${p[j][0].toFixed(1)} ${p[j][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`; }
        return d + "Z";
      };
      // sample index nearest an angle (radians, SVG y-down)
      const jAt = (a) => ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;

      // ---- timing ----
      const s0 = 0.8, step = 0.95, GROW = 0.8;
      const starts = years.map((_, i) => s0 + i * step);
      const recedeAt = 10.45, RSTEP = 0.08, RDUR = 0.55;
      const recedes = years.map((_, i) => recedeAt + (n - 1 - i) * RSTEP);

      // ---- drawing ----
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "tr-svg" }, root);
      // sm-native-start: the log is material (bark, its cut side, a cast shadow), drawn as fills with an ink edge
      const shadow = svg("path", { fill: alpha(deep, light ? 0.12 : 0.35), transform: "translate(16 34)" }, s);
      const side = svg("path", { fill: tone(light ? 0.72 : 0.62), stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linejoin": "round", transform: "translate(0 22)" }, s);
      const bark = svg("path", { fill: tone(light ? 0.56 : 0.48), stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linejoin": "round" }, s);
      const phloem = svg("path", { fill: lift(0.05) }, s);
      const ringEls = years.map((_, i) => ({ i })).reverse().map(({ i }) => ({ i, path: svg("path", { fill: i % 2 ? lift(0.28) : lift(0.14), stroke: tone(0.4), "stroke-width": 3, "stroke-linejoin": "round" }, s) }));
      ringEls.sort((a, c) => a.i - c.i);
      const heart = svg("path", { fill: tone(light ? 0.16 : 0.22), stroke: tone(0.42), "stroke-width": 3, d: closed(ang.map((_, j) => ringR(-1, 0, j))) }, s);
      // the heartwood's own early growth, faint lines inside it
      [0.36, 0.62, 0.84].forEach((k) => svg("path", { fill: "none", stroke: tone(light ? 0.3 : 0.34), "stroke-width": 1.4, d: closed(ang.map((_, j) => ringR(-1, 0, j) * k)) }, s));
      // medullary rays (faint radial grain) and one drying check, both reaching the current outer ring
      const rays = svg("path", { fill: "none", stroke: tone(0.45), "stroke-width": 1, opacity: 0.35, "stroke-linecap": "round" }, s);
      const rayList = Array.from({ length: 34 }, () => [rand() * Math.PI * 2, 0.25 + rand() * 0.4, 0.78 + rand() * 0.2]);
      const check = svg("path", { fill: tone(light ? 0.66 : 0.6), stroke: tone(0.75), "stroke-width": 1, "stroke-linejoin": "round" }, s);
      // sm-native-end
      // the measuring line the callout rides along
      const RAIL = (-50 * Math.PI) / 180;
      const jr = jAt(RAIL + Math.PI * 2);
      const rail = svg("line", { stroke: INK, "stroke-width": ui.stroke("fine", 1.5), "stroke-dasharray": "2 5", "stroke-linecap": "round", opacity: 0.6 }, s);
      const ticks = svg("path", { fill: "none", stroke: INK, "stroke-width": ui.stroke("fine", 1.5), "stroke-linecap": "round" }, s);
      // notches: a coloured diamond on the ring where a first happened
      const firsts = [];
      const firstAngles = [155, 222, 104, 300, 40];
      years.forEach((y, i) => { if (y.first) firsts.push({ i, text: y.first, year: y.year, col: notchCols[firsts.length % notchCols.length], a: (firstAngles[firsts.length % firstAngles.length] * Math.PI) / 180 }); });
      firsts.forEach((f) => {
        const j = jAt(f.a);
        const r = (ringR(f.i - 1, 1, j) + ringR(f.i, 1, j)) / 2;
        f.x = CX + r * cos[j]; f.y = CY + r * sin[j];
        f.g = svg("g", { transform: `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})` }, s);
        f.inner = svg("g", {}, f.g);
        svg("path", { d: "M0 -10 L10 0 L0 10 L-10 0 Z", fill: f.col, ...ui.strokeAttrs("regular", 2, INK), "stroke-linejoin": "round" }, f.inner);
        svg("circle", { r: 2.2, cx: -2.5, cy: -2.5, fill: mix(f.col, C.surface, 0.6) }, f.inner);
      });
      const pointer = svg("g", {}, s);
      svg("line", { x1: 0, y1: 0, x2: 24, y2: 0, stroke: INK, "stroke-width": ui.stroke("regular", 1.5) }, pointer);
      svg("circle", { r: 6, fill: C.accent, ...ui.strokeAttrs("regular", 2, INK) }, pointer);

      // ---- labels ----
      const copy = el("div", "tr-copy", root);
      el("div", "tr-eyebrow", copy, content.eyebrow || "");
      el("div", "tr-h", copy, content.heading || "");
      el("div", "tr-sub", copy, content.sub || "");
      const plaque = el("div", "tr-plaque", root);
      Object.assign(plaque.style, { left: CX - 78 + "px", top: CY - 36 + "px" });
      const totalEl = el("div", "tr-plaque-n", plaque, "0");
      el("div", "tr-plaque-l", plaque, content.totalLabel || "total");
      const call = el("div", "tr-call", root);
      const callTop = el("div", "tr-call-top", call);
      const callYear = el("b", "tr-call-year", callTop, "");
      const callN = el("span", "tr-call-n", callTop, "");
      const callFirst = el("div", "tr-call-first", call);
      const callDot = el("i", "", callFirst);
      const callFirstT = el("span", "", callFirst, "");
      const key = el("div", "tr-key", root);
      const keyLabel = el("div", "tr-key-label", key, content.firstsLabel || "Firsts");
      const keyRows = firsts.map((f) => {
        const row = el("div", "tr-key-row", key);
        const dot = el("i", "", row); dot.style.background = f.col;
        el("b", "", row, String(f.year));
        el("span", "", row, f.text);
        return row;
      });
      const fmt = (v) => Math.round(v).toLocaleString("en-US");
      return { rays, rayList, check, years, n, starts, recedes, GROW, RDUR, ringEls, ringR, closed, side, bark, phloem, shadow, barkT, rail, ticks, jr, firsts, pointer, plaque, totalEl, call, callYear, callN, callFirst, callDot, callFirstT, keyRows, keyLabel, fmt, unit: content.unit || "", CX, CY };
    },

    render(t, S, h) {
      const { tw, set, text } = h;
      const g = S.years.map((_, i) => tw(t, S.starts[i], S.GROW, "signature") * (1 - tw(t, S.recedes[i], S.RDUR, "inOut")));
      // rings, and the bark riding the outermost one
      let outer = -1, outerG = 0;
      S.ringEls.forEach(({ i, path }) => {
        if (g[i] <= 0.0005) { set(path, { display: "none" }); return; }
        if (i > outer) { outer = i; outerG = g[i]; }
        const r = Array.from({ length: N }, (_, j) => S.ringR(i, g[i], j));
        set(path, { display: "inline", d: S.closed(r) });
      });
      const rOut = Array.from({ length: N }, (_, j) => S.ringR(outer, outer < 0 ? 0 : outerG, j));
      const barkD = S.closed(rOut.map((r, j) => r + S.barkT[j]));
      set(S.bark, { d: barkD }); set(S.side, { d: barkD }); set(S.shadow, { d: barkD });
      set(S.phloem, { d: S.closed(rOut.map((r) => r + 4.5)) });
      const polar = (a, r) => `${(S.CX + r * Math.cos(a)).toFixed(1)} ${(S.CY + r * Math.sin(a)).toFixed(1)}`;
      const rAt = (a) => rOut[((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N];
      const r0 = S.ringR(-1, 0, 0);
      let rd = "";
      S.rayList.forEach(([a, f0, f1]) => { const ro = rAt(a); const ra = Math.max(r0 + 6, ro * f0), rb = ro * f1 - 3; if (rb > ra + 8) rd += `M${polar(a, ra)}L${polar(a, rb)}`; });
      set(S.rays, { d: rd || "M0 0" });
      // a drying check splits in from the bark once the slice has some width to split
      const CA = (68 * Math.PI) / 180, ro = rAt(CA), depth = Math.max(0, ro - r0 - 40) * 0.42;
      if (depth > 4) {
        const rb = ro + S.barkT[Math.round((CA / (Math.PI * 2)) * N) % N] + 1, tip = rb - depth - 18, wdt = 0.03;
        set(S.check, { display: "inline", d: `M${polar(CA - wdt, rb)}L${polar(CA - wdt * 0.25, rb - (rb - tip) * 0.45)}L${polar(CA + wdt * 0.1, tip)}L${polar(CA + wdt * 0.55, rb - (rb - tip) * 0.5)}L${polar(CA + wdt, rb)}Z` });
      } else set(S.check, { display: "none" });

      // the measuring line and its ticks, one per grown ring boundary
      const j = S.jr;
      const dir = [Math.cos((-50 * Math.PI) / 180), Math.sin((-50 * Math.PI) / 180)];
      const at = (r) => [S.CX + r * dir[0], S.CY + r * dir[1]];
      const rBark = rOut[j] + S.barkT[j];
      const a0 = at(S.ringR(-1, 0, j) * 0.9), a1 = at(rBark + 10);
      set(S.rail, { x1: a0[0].toFixed(1), y1: a0[1].toFixed(1), x2: a1[0].toFixed(1), y2: a1[1].toFixed(1) });
      let tk = "";
      for (let i = -1; i < S.n; i++) {
        if (i >= 0 && g[i] < 0.999) continue;
        const r = S.ringR(i, 1, j), [px, py] = at(r);
        tk += `M${(px - dir[1] * 6).toFixed(1)} ${(py + dir[0] * 6).toFixed(1)}L${(px + dir[1] * 6).toFixed(1)} ${(py - dir[0] * 6).toFixed(1)}`;
      }
      set(S.ticks, { d: tk || "M0 0" });

      // the callout: on the newest started ring, at the middle of its band, travelling out as it grows
      let k = -1;
      S.starts.forEach((st, i) => { if (t >= st) k = i; });
      const callOut = tw(t, S.recedes[S.n - 1] - 0.3, 0.3, "inOut");
      const callIn = k < 0 ? 0 : tw(t, S.starts[0], 0.45, "snappy") * (1 - callOut);
      if (k >= 0) {
        const mid = (S.ringR(k - 1, 1, j) + S.ringR(k, Math.max(0.02, g[k]), j)) / 2;
        const [px, py] = at(mid);
        set(S.pointer, { transform: `translate(${px.toFixed(1)} ${py.toFixed(1)})`, opacity: callIn.toFixed(3) });
        S.call.style.transform = `translate(${(px + 30).toFixed(1)}px, ${py.toFixed(1)}px) translateY(-50%)`;
        const y = S.years[k];
        text(S.callYear, String(y.year));
        const grown = tw(t, S.starts[k], S.GROW, "signature");
        text(S.callN, `${S.fmt(y.value * grown)} ${S.unit}${y.note ? " " + y.note : ""}`);
        const swap = tw(t, S.starts[k], 0.4, "snappy");
        S.callYear.style.opacity = (0.3 + 0.7 * swap).toFixed(3);
        S.callYear.style.transform = `translateY(${((1 - swap) * 6).toFixed(2)}px)`;
        const f = S.firsts.find((q) => q.i === k);
        S.callFirst.style.display = f ? "flex" : "none";
        if (f) { text(S.callFirstT, f.text); S.callDot.style.background = f.col; S.callFirst.style.opacity = tw(t, S.starts[k] + 0.5, 0.4, "soft").toFixed(3); }
      } else set(S.pointer, { opacity: 0 });
      S.call.style.opacity = callIn.toFixed(3);

      // notches pop in as their ring finishes; key rows follow; both leave with the ring
      let keyVis = 0;
      S.firsts.forEach((f, q) => {
        const pop = tw(t, S.starts[f.i] + 0.5, 0.42, "snappy") * (g[f.i] > 0.98 ? 1 : g[f.i] > 0 ? g[f.i] : 0);
        const sc = 0.4 + 0.6 * pop;
        set(f.inner, { transform: `scale(${sc.toFixed(3)})`, opacity: Math.min(1, pop * 1.6).toFixed(3) });
        const row = S.keyRows[q];
        row.style.opacity = pop.toFixed(3);
        row.style.transform = `translateX(${((1 - pop) * -14).toFixed(2)}px)`;
        keyVis = Math.max(keyVis, pop);
      });
      S.keyLabel.style.opacity = keyVis.toFixed(3);

      // the plaque adds up the rings as they are now
      const total = S.years.reduce((sum, y, i) => sum + y.value * g[i], 0);
      text(S.totalEl, S.fmt(total));
    },
  });
})();
