/* tree-rings--story: a company's years as the cut end of a log rising from the bottom edge (SVG, closed-form growth).
 * The same wood as tree-rings (heartwood, alternating early and late wood, bark riding the newest ring, faint rays),
 * cut as a half circle whose centre sits on the bottom edge. One ring grows per year from the founding year and its
 * year is written on it up the middle of the slice. When a ring with a moment finishes, a notch pops on it and a
 * leader draws straight out to the side, left and right in turn, so the story stacks upward in time on both sides.
 * The outermost ring is today: it flushes with the accent colour and a leader climbs from it to the card with the
 * headcount from content. Ring wobble is seeded noise fixed per ring; nothing random moves. Before the seam the
 * labels fade and the rings recede, outermost first, back to the bare heartwood.
 */
(function () {
  const D = 14, W = 1600, H = 900;
  const N = 180; // samples round each ring
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 10.8,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, alpha, ui, inkOn } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("ts");
      const rand = rng(content.seed || 23);
      const years = content.years;
      const n = years.length;

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

      // ---- geometry: the slice's centre sits just under the bottom edge ----
      const CX = 800, CY = 906, R0 = 62, RMAX = 496;
      const BARK = 15;
      // ring widths: from each year's value when every year has one (as tree-rings does), else near-even, seeded
      const valued = years.every((y) => typeof y.value === "number" && y.value > 0);
      const wts = years.map((y) => (valued ? y.value : 0.86 + rand() * 0.28));
      const wSum = wts.reduce((s, v) => s + v, 0);
      const minT = valued ? 14 : 0;
      const T = wts.map((v) => minT + ((RMAX - R0 - n * minT) * v) / wSum);
      const b = [R0];
      T.forEach((t, i) => b.push(b[i] + t));
      const ang = Array.from({ length: N }, (_, j) => (j / N) * Math.PI * 2);
      const cos = ang.map(Math.cos), sin = ang.map(Math.sin);
      const harm = (list) => ang.map((a) => list.reduce((s, [k, amp, ph]) => s + amp * Math.cos(k * a + ph), 0));
      const base = harm([[1, 0.016, rand() * 6.28], [2, 0.009 + rand() * 0.004, rand() * 6.28], [3, 0.006 + rand() * 0.003, rand() * 6.28], [5, 0.003, rand() * 6.28]]);
      const ownOf = () => harm([[2, 0.002 + rand() * 0.0015, rand() * 6.28], [4, 0.0012, rand() * 6.28], [7, 0.001, rand() * 6.28]]);
      const ownH = ownOf();
      const own = years.map(() => ownOf());
      const rough = harm([[13, 1.3, rand() * 6.28], [19, 1.0, rand() * 6.28], [29, 0.8, rand() * 6.28], [41, 0.6, rand() * 6.28]]);
      const furrows = Array.from({ length: 12 }, () => [Math.PI + rand() * Math.PI, 3 + rand() * 4]);
      const barkT = ang.map((a, j) => {
        let f = 0;
        furrows.forEach(([fa, depth]) => { const d = Math.atan2(Math.sin(a - fa), Math.cos(a - fa)); f += depth * Math.exp(-(d * d) / 0.0016); });
        return BARK + rough[j] - f;
      });
      // radius of ring i's outer edge at sample j when it has grown g (0..1); ring -1 is the heartwood
      const ringR = (i, g, j) => {
        if (i < 0) return R0 * (1 + base[j] + ownH[j]);
        const prev = i === 0 ? ownH : own[i - 1];
        return (b[i] + (b[i + 1] - b[i]) * g) * (1 + base[j] + prev[j] + (own[i][j] - prev[j]) * g);
      };
      const midR = (i, j) => (ringR(i - 1, 1, j) + ringR(i, 1, j)) / 2;
      const closed = (rArr) => {
        const p = rArr.map((r, j) => [CX + r * cos[j], CY + r * sin[j]]);
        const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        let d = `M${mid(p[N - 1], p[0]).map((v) => v.toFixed(1)).join(" ")}`;
        for (let j = 0; j < N; j++) { const m = mid(p[j], p[(j + 1) % N]); d += `Q${p[j][0].toFixed(1)} ${p[j][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`; }
        return d + "Z";
      };
      const jAt = (a) => ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;
      const JTOP = jAt(-Math.PI / 2);
      // the point of ring i's band at height dy above the centre, on side s (-1 left, +1 right)
      const bandAt = (i, dy, s) => {
        let r = (b[i] + b[i + 1]) / 2, a = 0;
        for (let k = 0; k < 4; k++) {
          const x = Math.asin(Math.min(0.98, dy / r));
          a = s < 0 ? Math.PI + x : -x;
          r = midR(i, jAt(a));
        }
        return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
      };

      // ---- timing ----
      const s0 = 0.6, step = 0.82, GROW = 0.75;
      const starts = years.map((_, i) => s0 + i * step);
      const OUT = 12.4;
      const recedeAt = 12.7, RSTEP = 0.07, RDUR = 0.5;
      const recedes = years.map((_, i) => recedeAt + (n - 1 - i) * RSTEP);
      const todayAt = starts[n - 1] + GROW;

      // ---- drawing ----
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ts-svg" }, root);
      // sm-native-start: the log is material (bark and a cast shadow), drawn as fills with an ink edge
      const shadow = svg("path", { fill: alpha(deep, light ? 0.1 : 0.32), transform: "translate(14 -2)" }, s);
      const bark = svg("path", { fill: tone(light ? 0.56 : 0.48), stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linejoin": "round" }, s);
      const phloem = svg("path", { fill: lift(0.05) }, s);
      const todayFill = mix(lift(0.2), C.accent, 0.62);
      const ringEls = years.map((_, i) => ({ i, base: i % 2 ? lift(0.28) : lift(0.14) })).reverse().map((r) => ({ ...r, path: svg("path", { fill: r.base, stroke: tone(0.4), "stroke-width": 3, "stroke-linejoin": "round" }, s) }));
      ringEls.sort((a, c) => a.i - c.i);
      svg("path", { fill: tone(light ? 0.16 : 0.22), stroke: tone(0.42), "stroke-width": 3, d: closed(ang.map((_, j) => ringR(-1, 0, j))) }, s);
      [0.4, 0.7].forEach((k) => svg("path", { fill: "none", stroke: tone(light ? 0.3 : 0.34), "stroke-width": 1.4, d: closed(ang.map((_, j) => ringR(-1, 0, j) * k)) }, s));
      const rays = svg("path", { fill: "none", stroke: tone(0.45), "stroke-width": 1, opacity: 0.32, "stroke-linecap": "round" }, s);
      // rays across the upper half, kept off the column of years up the middle
      const rayList = [];
      while (rayList.length < 26) {
        const a = Math.PI + rand() * Math.PI;
        if (Math.abs(a - 1.5 * Math.PI) > 0.16) rayList.push([a, 0.22 + rand() * 0.4, 0.8 + rand() * 0.17]);
      }
      // sm-native-end

      // years written on their rings, up the middle of the slice
      const yearEls = years.map((y, i) => svg("text", { class: "ts-yr", x: CX, y: (CY - midR(i, JTOP)).toFixed(1), "text-anchor": "middle", "dominant-baseline": "central", fill: tone(0.9), opacity: 0 }, s));
      yearEls.forEach((e, i) => (e.textContent = String(years[i].year)));

      // moments: a notch on the ring and a leader straight out to its side; left and right in turn
      const LEFT_EDGE = 286, RIGHT_EDGE = W - 286;
      const moments = [];
      years.forEach((y, i) => { if (y.first && i < n - 1) moments.push({ i, year: y.year, title: y.first, note: y.note || "", col: notchCols[moments.length % notchCols.length], side: moments.length % 2 ? 1 : -1 }); });
      // stack each side from its newest moment down: each sits as high as its ring reaches, 100px apart
      const GAP = 100;
      [-1, 1].forEach((side) => {
        let prev = side < 0 ? 380 - GAP : 560 - GAP;
        moments.filter((m) => m.side === side).sort((a, c) => c.i - a.i).forEach((m) => {
          const reach = CY - 0.86 * (b[m.i] + b[m.i + 1]) / 2;
          m.y = Math.max(prev + GAP, reach);
          prev = m.y;
        });
      });
      moments.forEach((m) => {
        const [px, py] = bandAt(m.i, CY - m.y, m.side);
        m.px = px; m.py = py;
        m.x2 = m.side < 0 ? LEFT_EDGE : RIGHT_EDGE;
        m.line = svg("line", { x1: px.toFixed(1), y1: py.toFixed(1), x2: px.toFixed(1), y2: py.toFixed(1), stroke: INK, "stroke-width": ui.stroke("fine", 1.5), "stroke-linecap": "round" }, s);
        m.end = svg("circle", { cx: m.x2, cy: py.toFixed(1), r: 3, fill: INK, opacity: 0 }, s);
        m.g = svg("g", { transform: `translate(${px.toFixed(1)} ${py.toFixed(1)})` }, s);
        m.inner = svg("g", {}, m.g);
        svg("path", { d: "M0 -9 L9 0 L0 9 L-9 0 Z", fill: m.col, ...ui.strokeAttrs("regular", 2, INK), "stroke-linejoin": "round" }, m.inner);
        svg("circle", { r: 2, cx: -2.2, cy: -2.2, fill: mix(m.col, C.surface, 0.6) }, m.inner);
      });

      // today: a pin on the outer ring, and a leader that climbs to the card
      const last = years[n - 1];
      const fmt = (v) => Math.round(v).toLocaleString("en-US");
      const today = content.today || { label: String(last.year), value: valued ? fmt(wSum) : "", unit: content.totalLabel || content.unit || "" };
      const CARD_X = 1290, CARD_Y = 96, CARD_W = 270;
      const TA = -(58 * Math.PI) / 180;
      const tj = jAt(TA + Math.PI * 2);
      const tr = midR(n - 1, tj);
      const tp = [CX + tr * Math.cos(TA), CY + tr * Math.sin(TA)];
      const TLY = CARD_Y + 86;
      const tLen = (tp[1] - TLY) + (CARD_X - tp[0]);
      const tLine = svg("path", { d: `M${tp[0].toFixed(1)} ${tp[1].toFixed(1)}V${TLY}H${CARD_X}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("fine", 1.5), "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": `${tLen.toFixed(1)} ${tLen.toFixed(1)}`, "stroke-dashoffset": tLen.toFixed(1) }, s);
      const tPin = svg("g", { transform: `translate(${tp[0].toFixed(1)} ${tp[1].toFixed(1)})` }, s);
      const tPinIn = svg("g", {}, tPin);
      svg("circle", { r: 8, fill: C.accent, ...ui.strokeAttrs("regular", 2, INK) }, tPinIn);
      svg("circle", { r: 2.4, fill: inkOn(C.accent) }, tPinIn);

      // ---- labels ----
      const copy = el("div", "ts-copy", root);
      el("div", "ts-eyebrow", copy, content.eyebrow || "");
      el("div", "ts-h", copy, content.heading || "");
      el("div", "ts-sub", copy, content.sub || "");
      moments.forEach((m) => {
        m.el = el("div", "ts-m " + (m.side < 0 ? "is-l" : "is-r"), root);
        m.el.style.top = (m.py - 29).toFixed(1) + "px";
        if (m.side < 0) m.el.style.right = W - (LEFT_EDGE - 12) + "px";
        else m.el.style.left = RIGHT_EDGE + 12 + "px";
        const yr = el("div", "ts-m-y", m.el);
        const dot = el("i", "", yr); dot.style.background = m.col;
        el("span", "", yr, String(m.year));
        el("div", "ts-m-t", m.el, m.title);
        if (m.note) el("div", "ts-m-n", m.el, m.note);
      });
      const card = el("div", "ts-card", root);
      Object.assign(card.style, { left: CARD_X + "px", top: CARD_Y + "px", width: CARD_W + "px" });
      el("div", "ts-card-e", card, `${today.label || "Today"} · ${last.year}`);
      const fig = el("div", "ts-fig", card);
      const figClip = el("span", "ts-fig-clip", fig);
      const figV = el("span", "ts-fig-v", figClip, String(today.value ?? ""));
      el("span", "ts-fig-u", fig, today.unit || "");
      if (today.note) el("div", "ts-card-n", card, today.note);

      return { years, n, starts, recedes, GROW, OUT, todayAt, ringEls, ringR, closed, bark, phloem, shadow, barkT, rays, rayList, yearEls, moments, tLine, tLen, tPinIn, card, figV, todayFill, inkOn, tone, CX, CY };
    },

    render(t, S, h) {
      const { tw, set, mix } = h;
      const out = tw(t, S.OUT, 0.4, "inOut");
      const g = S.years.map((_, i) => tw(t, S.starts[i], S.GROW, "signature") * (1 - tw(t, S.recedes[i], 0.5, "inOut")));
      const flush = tw(t, S.todayAt - 0.1, 0.6, "soft") * (1 - out);
      // rings, and the bark riding the outermost one
      let outer = -1, outerG = 0;
      S.ringEls.forEach(({ i, path, base }) => {
        if (g[i] <= 0.0005) { set(path, { display: "none" }); return; }
        if (i > outer) { outer = i; outerG = g[i]; }
        const r = Array.from({ length: N }, (_, j) => S.ringR(i, g[i], j));
        set(path, { display: "inline", d: S.closed(r), fill: i === S.n - 1 && flush > 0.002 ? mix(base, S.todayFill, flush) : base });
      });
      const rOut = Array.from({ length: N }, (_, j) => S.ringR(outer, outer < 0 ? 0 : outerG, j));
      const barkD = S.closed(rOut.map((r, j) => r + S.barkT[j]));
      set(S.bark, { d: barkD }); set(S.shadow, { d: barkD });
      set(S.phloem, { d: S.closed(rOut.map((r) => r + 4.5)) });
      const polar = (a, r) => `${(S.CX + r * Math.cos(a)).toFixed(1)} ${(S.CY + r * Math.sin(a)).toFixed(1)}`;
      const rAt = (a) => rOut[((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N];
      const r0 = S.ringR(-1, 0, 0);
      let rd = "";
      S.rayList.forEach(([a, f0, f1]) => { const ro = rAt(a); const ra = Math.max(r0 + 6, ro * f0), rb = ro * f1 - 3; if (rb > ra + 8) rd += `M${polar(a, ra)}L${polar(a, rb)}`; });
      set(S.rays, { d: rd || "M0 0" });

      // each year appears on its ring as the ring settles; today's takes the accent's ink
      S.yearEls.forEach((e, i) => {
        const v = tw(t, S.starts[i] + 0.35, 0.4, "soft") * (g[i] > 0.97 ? 1 : 0) * (1 - out);
        const isToday = i === S.n - 1;
        set(e, { opacity: v.toFixed(3), fill: isToday && flush > 0.5 ? S.inkOn(S.todayFill) : S.tone(0.9), "font-weight": isToday ? 700 : 400 });
      });

      // moments: the notch pops as its ring finishes, the leader draws out, the label slides in after it
      S.moments.forEach((m) => {
        const st = S.starts[m.i];
        const pop = tw(t, st + 0.55, 0.4, "snappy") * (1 - out);
        set(m.inner, { transform: `scale(${(0.4 + 0.6 * pop).toFixed(3)})`, opacity: Math.min(1, pop * 1.6).toFixed(3) });
        const ln = tw(t, st + 0.62, 0.45, "snappy");
        set(m.line, { x2: (m.px + (m.x2 - m.px) * ln).toFixed(1), opacity: (1 - out).toFixed(3) });
        set(m.end, { opacity: ((ln > 0.98 ? 1 : 0) * (1 - out)).toFixed(3) });
        const lab = tw(t, st + 0.8, 0.6, "signature") * (1 - out);
        m.el.style.opacity = lab.toFixed(3);
        m.el.style.transform = `translateX(${((1 - lab) * 14 * m.side).toFixed(2)}px)`;
      });

      // today: pin, the climbing leader, then the card and its figure
      const pin = tw(t, S.todayAt + 0.15, 0.4, "snappy") * (1 - out);
      set(S.tPinIn, { transform: `scale(${(0.4 + 0.6 * pin).toFixed(3)})`, opacity: Math.min(1, pin * 1.6).toFixed(3) });
      const climb = tw(t, S.todayAt + 0.3, 0.6, "snappy");
      set(S.tLine, { "stroke-dashoffset": (S.tLen * (1 - climb)).toFixed(1), opacity: (1 - out).toFixed(3) });
      const cardIn = tw(t, S.todayAt + 0.75, 0.7, "signature") * (1 - out);
      S.card.style.opacity = cardIn.toFixed(3);
      S.card.style.transform = `translateY(${((1 - cardIn) * 18).toFixed(2)}px)`;
      const figIn = tw(t, S.todayAt + 0.95, 0.5, "snappy");
      S.figV.style.transform = `translateY(${((1 - figIn) * 100).toFixed(1)}%)`;
    },
  });
})();
