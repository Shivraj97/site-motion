/* split-wipe--proof: the split-wipe slider as evidence for a results / proof section (DOM).
 * A tall results card holds a stack of metric rows (2–4). Below a horizontal divider each row reads its before
 * value on the dotted desk; above it, the after value on the product surface, with the change computed from the
 * two numbers and a bar that grows or shrinks from a dashed outline of the old length. The divider steps down the
 * card one row at a time, re-reading each metric as it passes, docks at the card's foot, and an attributed customer
 * quote lands in the left column as the closing evidence. Then the quote leaves and the divider returns to the top.
 * Every label, value and the quote come from content; the change, the bars and the timings are computed.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const CX = 680, CY = 96, CW = 720, CH = 708, HEAD = 72; // the card, in stage px, and its header band
  const TAIL = 124; // how far the divider runs past the card's right side, where the Before / After labels ride
  const T0 = 0.7, STEP = 1.3, MOVE = 0.9; // header passes at T0; then a row every STEP s, each move taking MOVE s
  const TB = 10.4, RB = 1.2; // the divider returns to the top
  const MINUS = "−";

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.6,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("swp");
      const metrics = (content.metrics || []).slice(0, 4);
      const n = Math.max(1, metrics.length);
      const cn = content.counter || {};
      const RH = (CH - HEAD) / n;

      // ---- copy: eyebrow, heading and sub in the left column ----
      const copy = el("div", "swp-copy", root);
      el("div", "swp-eyebrow", copy, content.eyebrow || "");
      el("div", "swp-h", copy, content.heading || "");
      if (content.sub) el("div", "swp-sub", copy, content.sub);

      // ---- values: numbers split into a big figure and small units ----
      const parts = (m, v) => {
        if (m.format === "duration") {
          const hh = Math.floor(v / 60), mm = Math.round(v % 60);
          const out = [];
          if (hh) out.push([String(hh)], [` ${cn.h || "h"}${mm ? " " : ""}`, true]);
          if (mm || !hh) out.push([String(mm)], [` ${cn.min || "min"}`, true]);
          return out;
        }
        if (m.of != null) return [[String(v)], [` ${content.ofLabel || "of"} ${m.of}`, true]];
        return m.unit ? [[String(v)], [m.unit, true]] : [[String(v)]];
      };
      const plain = (m, v) => parts(m, v).map((p) => p[0]).join("");
      const putVal = (parent, m, v) => {
        const node = el("div", "swp-val", parent);
        parts(m, v).forEach(([s, small]) => el(small ? "small" : "span", "", node, s));
        return node;
      };
      const change = (m) => {
        const b = Number(m.before) || 0, a = Number(m.after) || 0;
        const d = m.change === "diff" || !b ? a - b : Math.round(((a - b) / b) * 100);
        const sign = d < 0 ? MINUS : d > 0 ? "+" : "";
        const unit = m.change === "diff" || !b ? (m.changeUnit ? ` ${m.changeUnit}` : "") : "%";
        const good = m.better === "up" ? d > 0 : m.better === "down" ? d < 0 : true;
        return { text: `${sign}${Math.abs(d)}${unit}`, up: d > 0, good };
      };

      // ---- the card: after state on top, the before desk under it; the edge clips them at the same y ----
      const card = el("div", "swp-card", root);
      Object.assign(card.style, { left: CX + "px", top: CY + "px", width: CW + "px", height: CH + "px" });
      const afterL = el("div", "swp-after", card);
      const beforeL = el("div", "swp-before", card);
      const header = (layer, period) => {
        const head = el("div", "swp-head", layer);
        head.style.height = HEAD + "px";
        const mark = el("span", "swp-mark", head, (content.product && content.product.mark) || "");
        mark.style.background = C.accent;
        mark.style.color = h.inkOn(C.accent);
        el("span", "swp-pname", head, (content.product && content.product.name) || "");
        el("span", "swp-period", head, period);
      };
      const per = content.period || {};
      header(beforeL, [content.beforeLabel || "Before", per.before].filter(Boolean).join(" · "));
      header(afterL, [content.afterLabel || "After", per.after].filter(Boolean).join(" · "));

      const fillBefore = mix(C.muted, C.raised, 0.35);
      const rows = metrics.map((m, i) => {
        const top = HEAD + i * RH;
        const max = Math.max(Number(m.before) || 0, Number(m.after) || 0, Number(m.of) || 0, 1);
        const bf = (Number(m.before) || 0) / max, af = (Number(m.after) || 0) / max;
        const trackTop = RH - 46;
        // before: the label, the old value and its bar on the desk
        const rb = el("div", "swp-row", beforeL);
        Object.assign(rb.style, { top: top + "px", height: RH + "px" });
        el("div", "swp-label", rb, m.label || "");
        putVal(rb, m, m.before);
        const tb = el("div", "swp-track", rb);
        tb.style.top = trackTop + "px";
        const fb = el("div", "swp-fill", tb);
        Object.assign(fb.style, { width: (bf * 100).toFixed(2) + "%", background: fillBefore });
        // after: the new value, the change, what it was, and the bar against a dashed outline of the old length
        const ra = el("div", "swp-row", afterL);
        Object.assign(ra.style, { top: top + "px", height: RH + "px" });
        el("div", "swp-label", ra, m.label || "");
        const val = putVal(ra, m, m.after);
        const side = el("div", "swp-side", ra);
        const ch = change(m);
        const chip = el("span", "swp-chip", side);
        const tone = ch.good ? C.positive || C.accent : C.warning || C.accent;
        const chipBg = mix(tone, C.surface, 0.8);
        chip.style.background = chipBg;
        chip.style.color = h.inkOn(chipBg);
        const ar = svg("svg", { viewBox: "0 0 14 14", width: 14, height: 14 }, chip);
        svg("path", { d: ch.up ? "M7 12V2M2.5 6.5L7 2l4.5 4.5" : "M7 2v10M2.5 7.5L7 12l4.5-4.5", fill: "none", stroke: tone, "stroke-width": ui.stroke("bold", 2), "stroke-linecap": "round", "stroke-linejoin": "round" }, ar);
        el("span", "", chip, ch.text);
        const was = el("div", "swp-was", side, `${content.was || "was"} `);
        el("s", "", was, plain(m, m.before));
        const ta = el("div", "swp-track", ra);
        ta.style.top = trackTop + "px";
        const fa = el("div", "swp-fill", ta);
        fa.style.background = C.accent;
        const gh = el("div", "swp-ghost", ta);
        gh.style.width = (bf * 100).toFixed(2) + "%";
        return { val, chip, fa, bf, af, mid: top + 48 + 44 };
      });

      // ---- the quote: the closing evidence, in the left column ----
      const q = content.quote || {};
      const quote = el("div", "swp-quote", root);
      const qm = svg("svg", { class: "swp-qmark", viewBox: "0 0 48 36", width: 48, height: 36 }, quote);
      // two quotation marks: a round head with a tail, drawn so the mark scales with no font
      ["M4 34c0-12 4-22 14-30l3 4c-5 5-7 10-7 13a8 8 0 1 1-10 13z", "M28 34c0-12 4-22 14-30l3 4c-5 5-7 10-7 13a8 8 0 1 1-10 13z"].forEach((d) => svg("path", { d, fill: C.accent }, qm));
      const qtext = el("div", "swp-qtext", quote, q.text || "");
      const who = el("div", "swp-who", quote);
      const av = el("span", "swp-av", who, q.mark || (q.name || "?")[0]);
      av.style.background = pal[2 % pal.length];
      av.style.color = h.inkOn(pal[2 % pal.length]);
      const wt = el("div", "", who);
      el("div", "swp-name", wt, q.name || "");
      el("div", "swp-role", wt, q.role || "");
      const qparts = [qm, qtext, who];

      // ---- the edge: a rail with a grip on the card's right side; labels ride above and below it past the card ----
      const edge = el("div", "swp-edge", root);
      Object.assign(edge.style, { left: CX + "px", top: CY + "px", width: CW + TAIL + "px" });
      const line = el("div", "swp-line", edge);
      line.style.height = ui.stroke("bold", 2) + "px";
      const grip = el("div", "swp-grip", edge);
      grip.style.left = CW + "px";
      const gs = svg("svg", { viewBox: "0 0 52 52", width: 52, height: 52 }, grip);
      const chev = svg("path", { d: "M19 21l7-7 7 7M19 31l7 7 7-7", fill: "none", stroke: C.ink, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round", "stroke-linejoin": "round" }, gs);
      const tagA = el("div", "swp-tag swp-tag--a", edge, content.afterLabel || "After");
      const tagB = el("div", "swp-tag swp-tag--b", edge, content.beforeLabel || "Before");

      // ---- the path: past the header, then one row per step; back to the top in one move ----
      const starts = [T0].concat(metrics.map((_, i) => T0 + 0.9 + i * STEP));
      const stops = [0, HEAD].concat(metrics.map((_, i) => HEAD + (i + 1) * RH));
      const landed = starts[starts.length - 1] + MOVE; // the divider docks at the card's foot
      const edgeY = (t) => {
        let y = 0;
        for (let k = 0; k < starts.length; k++) y += (stops[k + 1] - stops[k]) * h.tw(t, starts[k], k ? MOVE : 0.6, "inOut");
        return y - CH * h.tw(t, TB, RB, "inOut");
      };
      // when the edge passes each row's value, on the way down and on the way back up
      const cross = (e, a, b, down) => {
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if ((edgeY(m) < e) === down) a = m; else b = m; }
        return (a + b) / 2;
      };
      rows.forEach((r) => { r.go = cross(r.mid, 0, TB, true); r.back = cross(r.mid, TB, D, false); });
      return { rows, edgeY, edge, grip, chev, tagA, tagB, afterL, beforeL, qparts, landed, C };
    },

    render(t, S, h) {
      const { tw, lerp, clamp, mix } = h;
      const C = S.C;
      const y = S.edgeY(t);
      S.afterL.style.clipPath = `inset(0 0 ${(CH - y).toFixed(1)}px 0)`;
      S.beforeL.style.clipPath = `inset(${y.toFixed(1)}px 0 0 0)`;
      S.edge.style.transform = `translateY(${y.toFixed(1)}px)`;
      // a label only shows when there is something on its side of the edge
      S.tagA.style.opacity = clamp(y / 60).toFixed(3);
      S.tagB.style.opacity = clamp((CH - y) / 60).toFixed(3);
      // docked at the card's foot, the grip turns to the accent: every row has re-read
      const dock = tw(t, S.landed - 0.15, 0.4, "snappy") * (1 - tw(t, TB, 0.3, "snappy"));
      S.grip.style.background = mix(C.surface, C.accent, dock);
      S.chev.setAttribute("stroke", mix(C.ink, C.onAccent || C.ink, dock));

      S.rows.forEach((r) => {
        // the new value settles as the edge passes it; the change pops; the bar moves from the old length to the new
        const settle = tw(t, r.go - 0.25, 0.7, "signature") * (1 - tw(t, r.back, 0.3, "snappy"));
        r.val.style.transform = `translateY(${((1 - settle) * 18).toFixed(1)}px)`;
        const pop = tw(t, r.go + 0.1, 0.4, "snappy") * (1 - tw(t, r.back, 0.2, "snappy"));
        r.chip.style.opacity = pop.toFixed(3);
        r.chip.style.transform = `scale(${lerp(0.86, 1, pop).toFixed(3)})`;
        const grow = tw(t, r.go + 0.15, 0.7, "signature") * (1 - tw(t, r.back, 0.2, "snappy"));
        r.fa.style.width = (lerp(r.bf, r.af, grow) * 100).toFixed(2) + "%";
      });

      // the quote closes it: in once the last row has re-read, out before the divider returns
      S.qparts.forEach((node, i) => {
        const p = h.span(t, S.landed + 0.35 + h.motion.stagger(i, 0.09), TB - 0.45, 0.8, 0.4);
        node.style.opacity = p.toFixed(3);
        node.style.transform = `translateY(${((1 - p) * 16).toFixed(1)}px)`;
      });
    },
  });
})();
