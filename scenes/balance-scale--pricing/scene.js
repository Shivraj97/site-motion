/* balance-scale--pricing: what you pay against what you get, on one big balance (SVG + DOM).
 * The price is one weight on the left pan; value items (tools replaced, days and hours saved) drop onto the right
 * pan one at a time. Every amount is qty × rate from content, every weight's area is proportional to its amount,
 * and the beam's rest angle is computed from the two sums: θ = maxTilt · tanh((value − price) / price), a beam
 * on a soft stop, level at break-even. The return multiple is value / price and steps as each weight lands.
 *
 * Motion is closed-form: each landing (or lift) is a step in the beam's rest angle, and the beam is the sum of
 * damped-spring step responses at t, so any frame can be seeked.
 * Intro 0 → 3.5 s: copy fades in, the price weight lands and the beam settles toward price. Loop 3.5 → 15 s:
 * value weights land, the beam swings over to value (signature), hold, value weights lift, beam back to price.
 */
(function () {
  const W = 1600, H = 900, D = 15, LOOP = 3.5;
  const PX = 1045, PY = 270, L = 310; // pivot and half beam
  const HOOK = 62, CORD = 150, PW = 320; // hanger, cords, tray width
  const FLOOR = 725;
  const PRICE_AT = 1.0; // price weight starts its drop (intro)
  const DROP0 = 4.4, DROP_GAP = 1.2; // value weights, one beat each
  const UNLOAD = 12.4;
  const MONO = 7.25; // px per character, 12px monospace

  const spring = (tau, w, z) => {
    if (tau <= 0) return 0;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
  };
  const settle = (tau, w) => (tau <= 0 ? 0 : 1 - (1 + w * tau) * Math.exp(-w * tau));
  const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: LOOP,
    still: 11,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui, motion, textOn } = h;
      const C = tokens.color;
      const INK = ui.strokeColor(C.ink);
      const OUT = (n = 1.5) => ui.strokeAttrs("regular", n, C.ink);
      root.classList.add("bp");
      const ours = textOn(C.paper, C.accentInk || C.ink); // accent ink, lifted until it reads on this paper
      root.style.setProperty("--bp-ours", ours);
      const cur = content.currency || "$";
      const money = (n) => cur + group(n);
      const MAXT = content.maxTilt || 15;
      const vFill = C.accent, pFill = mix(C.warning, C.surface, 0.18);
      const vText = textOn(vFill, C.onAccent || C.ink), pText = textOn(pFill, C.ink);

      const priceItem = content.price;
      const P = priceItem.qty * priceItem.rate;
      const items = (content.value || []).slice(0, 4).map((it) => ({ ...it, amount: it.qty * it.rate }));
      const restAt = (v, withPrice) => (withPrice ? MAXT * Math.tanh((v - P) / P) : 0);

      // ---------- copy (left column) ----------
      const copy = el("div", "bp-copy", root);
      el("div", "bp-eyebrow", copy, content.eyebrow || "");
      el("div", "bp-h", copy, content.heading || "");
      el("div", "bp-sub", copy, content.sub || "");
      const mult = el("div", "bp-mult", root);
      const multNum = el("div", "bp-mult-num", mult, "0.0×");
      el("div", "bp-mult-label", mult, content.ratioLabel || "");
      const multEq = el("div", "bp-mult-eq", mult, "");

      // ---------- balance ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "bp-svg" }, root);
      // sm-native: the floor is a hairline rule under the base, not an outline
      svg("line", { x1: 580, x2: W - 96, y1: FLOOR, y2: FLOOR, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, s);
      const baseW = 170, baseH = 26;
      svg("path", { d: `M${PX - baseW / 2} ${FLOOR}L${PX - baseW / 2 + 26} ${FLOOR - baseH}H${PX + baseW / 2 - 26}L${PX + baseW / 2} ${FLOOR}Z`, fill: C.surface, ...OUT(), "stroke-linejoin": "round" }, s);
      svg("rect", { x: PX - 9, y: PY, width: 18, height: FLOOR - baseH - PY, fill: C.surface, ...OUT() }, s);

      // gauge above the pivot: arc, ticks every 5°, the pointer rides the beam
      const GR = 104, A = ((MAXT + 5) * Math.PI) / 180;
      const gaugeInk = mix(C.ink, C.paper, 0.45);
      // sm-native: the gauge is a printed scale; its arc and ticks keep their hairline weight
      svg("path", { d: `M${PX - GR * Math.sin(A)} ${PY - GR * Math.cos(A)}A${GR} ${GR} 0 0 1 ${PX + GR * Math.sin(A)} ${PY - GR * Math.cos(A)}`, fill: "none", stroke: gaugeInk, "stroke-width": 1.2 }, s);
      let ticks = "";
      for (let d = -MAXT; d <= MAXT + 0.01; d += 5) {
        const a = (d * Math.PI) / 180, r1 = GR, r2 = GR + (Math.abs(d) < 0.01 ? 14 : 8);
        ticks += `M${(PX + r1 * Math.sin(a)).toFixed(1)} ${(PY - r1 * Math.cos(a)).toFixed(1)}L${(PX + r2 * Math.sin(a)).toFixed(1)} ${(PY - r2 * Math.cos(a)).toFixed(1)}`;
      }
      svg("path", { d: ticks, fill: "none", stroke: gaugeInk, "stroke-width": 1.2, "stroke-linecap": "round" }, s); // sm-native: printed ticks
      const pointer = svg("g", {}, s);
      svg("line", { x1: 0, y1: 0, x2: 0, y2: -(GR - 8), stroke: ours, "stroke-width": ui.stroke("bold", 2.5), "stroke-linecap": "round" }, pointer);
      const verdict = el("div", "bp-verdict", root, "");

      const beam = svg("g", {}, s);
      svg("rect", { x: -L - 16, y: -8, width: 2 * L + 32, height: 16, rx: 8, fill: C.surface, ...OUT() }, beam); // sm-native: the beam is a bar with round ends in every look
      [-L, L].forEach((x) => svg("circle", { cx: x, cy: 0, r: 4.5, fill: INK }, beam));

      // weight: an iron weight (tapered body, pill knob) standing on y = 0, area ∝ amount
      const MAXW = 140;
      const sumRoot = items.reduce((a, it) => a + Math.sqrt(it.amount), 0);
      const k = Math.min((PW - 36 - 10 * (items.length - 1)) / sumRoot, MAXW / Math.sqrt(Math.max(P, ...items.map((i) => i.amount))));
      const weight = (parent, x, amount, fill, txt) => {
        const g = svg("g", {}, parent);
        const w = k * Math.sqrt(amount), bh = 0.72 * w, tw2 = 0.38 * w, kw = 0.34 * w, kh = Math.max(10, 0.15 * w);
        const r = Math.min(ui.radius("sm", 4), bh / 4);
        svg("rect", { x: x - kw / 2, y: -bh - kh + 3, width: kw, height: kh, rx: kh / 2, fill: C.surface, ...OUT(1.3) }, g); // sm-native: the knob is a pill
        svg("path", { d: `M${x - w / 2} 0L${x - tw2} ${-bh}H${x + tw2}L${x + w / 2} 0Z`, fill, ...OUT(1.3), "stroke-linejoin": r > 2 ? "round" : "miter" }, g);
        const label = money(amount);
        const inside = 0.88 * w >= label.length * MONO + 6;
        const t = svg("text", { x, y: inside ? -bh / 2 + 4.2 : -bh - kh - 6, "text-anchor": "middle", class: "bp-amt", fill: inside ? txt : C.ink }, g);
        t.textContent = label;
        return { node: g, w };
      };

      const mkPan = (side) => {
        const pan = svg("g", {}, s);
        const sw = PW - 40;
        svg("line", { x1: 0, y1: 0, x2: 0, y2: HOOK, stroke: INK, "stroke-width": ui.stroke("bold", 2.5), "stroke-linecap": "round" }, pan);
        // sm-native: the cords are thin lines in every look
        svg("path", { d: `M${-sw / 2} ${HOOK}L${-PW / 2 + 6} ${HOOK + CORD}M${sw / 2} ${HOOK}L${PW / 2 - 6} ${HOOK + CORD}`, fill: "none", stroke: INK, "stroke-width": 1.2 }, pan);
        svg("rect", { x: -sw / 2 - 4, y: HOOK - 4, width: sw + 8, height: 8, rx: 4, fill: C.surface, ...OUT(1.3) }, pan); // sm-native: the spreader is a round-ended bar
        const tray = svg("g", { transform: `translate(0 ${HOOK + CORD})` }, pan);
        const load = svg("g", {}, tray);
        svg("path", { d: `M${-PW / 2} 0H${PW / 2}L${PW / 2 - 26} 16H${-PW / 2 + 26}Z`, fill: C.surface, ...OUT(), "stroke-linejoin": "round" }, tray);
        return { side, node: pan, load };
      };
      const payPan = mkPan(-1), getPan = mkPan(1);

      // the price weight (intro) and the value weights (loop), each a landing on the beam
      const pw = weight(payPan.load, 0, P, pFill, pText);
      const priceW = { ...pw, start: PRICE_AT, land: PRICE_AT + 0.22, out: Infinity, dy: 70 };
      let x = -(items.reduce((a, it) => a + k * Math.sqrt(it.amount), 0) + 10 * (items.length - 1)) / 2;
      const valueW = items.map((it, i) => {
        const wd = k * Math.sqrt(it.amount);
        const wg = weight(getPan.load, x + wd / 2, it.amount, vFill, vText);
        x += wd + 10;
        const start = DROP0 + i * DROP_GAP;
        const out = UNLOAD + motion.stagger(items.length - 1 - i, 0.1);
        return { ...wg, amount: it.amount, start, land: start + 0.22, out, lift: out + 0.15, dy: 60 };
      });

      // rest-angle steps: price lands (spring), each value lands (spring), each value lifts (no bounce)
      const steps = [];
      let v = 0, prev = 0;
      const t0 = restAt(0, true);
      steps.push({ t: priceW.land, d: t0, kind: "price" });
      prev = t0;
      valueW.forEach((b) => { v += b.amount; const r = restAt(v, true); steps.push({ t: b.land, d: r - prev, kind: "land", v }); prev = r; });
      const thetaEnd = prev;
      [...valueW].sort((a, b) => a.lift - b.lift).forEach((b) => { v -= b.amount; const r = restAt(v, true); steps.push({ t: b.lift, d: r - prev, kind: "lift", v: Math.max(0, v) }); prev = r; });
      const valueSteps = steps.filter((st) => st.kind !== "price").sort((a, b) => a.t - b.t);

      // ---------- ledger strip under the floor ----------
      const strip = el("div", "bp-strip", root);
      const payCol = el("div", "bp-col bp-col-pay", strip);
      const payHead = el("div", "bp-head", payCol);
      el("span", "", payHead, content.payWord || "");
      el("span", "bp-head-sum", payHead, money(P));
      const cell = (parent, it, amount) => {
        const c = el("div", "bp-cell", parent);
        el("div", "bp-cell-label", c, it.label || "");
        el("div", "bp-cell-f", c, `${it.qty} ${it.unit || ""} × ${money(it.rate)}`);
        el("div", "bp-cell-amt", c, money(amount));
        return c;
      };
      cell(el("div", "bp-cells", payCol), priceItem, P);
      const getCol = el("div", "bp-col bp-col-get", strip);
      const getHead = el("div", "bp-head", getCol);
      el("span", "", getHead, content.getWord || "");
      const getSum = el("span", "bp-head-sum", getHead, money(0));
      const cellsWrap = el("div", "bp-cells", getCol);
      const cells = items.map((it) => cell(cellsWrap, it, it.amount));

      return { copy, mult, multNum, multEq, s, beam, pointer, payPan, getPan, priceW, valueW, steps, valueSteps, t0, thetaEnd, verdict, strip, cells, getSum, money, P, vTxt: content.verdict || {} };
    },

    render(t, S, h) {
      const { tw, clamp, lerp } = h;
      const intro = tw(t, 0, 0.8, "soft");
      S.copy.style.opacity = intro.toFixed(3);
      S.copy.style.transform = `translateY(${((1 - tw(t, 0, 0.8)) * 16).toFixed(1)}px)`;
      S.s.style.opacity = tw(t, 0.1, 0.8, "soft").toFixed(3);
      S.strip.style.opacity = tw(t, 0.2, 0.8, "soft").toFixed(3);
      S.mult.style.opacity = tw(t, 0.25, 0.8, "soft").toFixed(3);

      // beam: spring responses to every landing, critically damped returns for every lift
      let th = 0;
      for (const st of S.steps) {
        if (st.kind === "price") th += st.d * lerp(spring(t - st.t, 2 * Math.PI * 0.55, 0.38), 1, tw(t, 2.6, 0.8, "inOut")); // settled by the loop
        else if (st.kind === "land") th += st.d * spring(t - st.t, 2 * Math.PI * 0.55, 0.38);
        else th += st.d * settle(t - st.t, 4);
      }
      th = lerp(th, S.t0, tw(t, D - 0.7, 0.5, "inOut")); // retire the last hundredth of a degree before the seam
      const rad = (th * Math.PI) / 180;
      h.set(S.beam, { transform: `translate(${PX} ${PY}) rotate(${th.toFixed(3)})` });
      h.set(S.pointer, { transform: `translate(${PX} ${PY}) rotate(${th.toFixed(3)})` });
      [S.payPan, S.getPan].forEach((pan) => {
        const x = PX + pan.side * L * Math.cos(rad), y = PY + pan.side * L * Math.sin(rad);
        h.set(pan.node, { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})` });
      });
      [S.priceW, ...S.valueW].forEach((b) => {
        const pin = tw(t, b.start, 0.55), off = tw(t, b.out, 0.5, "inOut");
        const op = clamp(pin * 2.2) * (1 - off);
        h.set(b.node, { transform: `translate(0 ${(-(1 - pin) * b.dy - off * b.dy).toFixed(2)})`, opacity: op.toFixed(3) });
      });

      // readouts follow what is on the pans: value total, multiple, verdict
      let v = 0, changed = -Infinity;
      for (const st of S.valueSteps) if (t >= st.t) { v = st.v; changed = st.t; }
      const m = v / S.P;
      h.text(S.multNum, m.toFixed(1) + "×");
      h.text(S.multEq, `${S.money(v)} ÷ ${S.money(S.P)}`);
      h.text(S.getSum, S.money(v));
      S.multNum.style.color = m >= 1 ? "var(--bp-ours, var(--c-ink))" : "var(--c-muted)";
      const pop = 1 - tw(t, changed, 0.4, "snappy");
      S.multNum.style.transform = `scale(${(1 + 0.05 * pop).toFixed(4)})`;
      const lean = v > S.P ? 1 : -1; // the side the sums put it on, not the swing
      h.text(S.verdict, lean > 0 ? S.vTxt.value || "" : S.vTxt.price || "");
      S.verdict.classList.toggle("bp-verdict-on", lean > 0);
      S.verdict.style.opacity = tw(t, S.priceW.land + 0.3, 0.4, "soft").toFixed(3);
      S.valueW.forEach((b, i) => {
        const on = tw(t, b.land, 0.35, "snappy") * (1 - tw(t, b.lift, 0.35, "snappy"));
        S.cells[i].style.opacity = (0.45 + 0.55 * on).toFixed(3);
      });
    },
  });
})();
