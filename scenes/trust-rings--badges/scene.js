/* trust-rings--badges: the control rings, unrolled into a row of seals (SVG + DOM).
 * The parent's concentric rings start stacked, then roll apart along one line (dashes turning as they roll) and each
 * comes to rest as an empty seal. A press travels the row and stamps each one in turn: the inked impression is
 * lettered with the framework and its scope, set slightly askew and speckled like rubber on paper; a dated audit
 * stamp lands under it with the number of controls it covers. The status line is the sum of what has been stamped,
 * and its bar fills one segment per seal. The moment is the full row stamped. Then the ink lifts and the rings roll
 * back together for the loop.
 *
 * Content: seals [{ name, mark, scope, audited, controls }] (3–6, left → right), stamp { audited, controls },
 * status { of, label, note }, plus eyebrow, heading, sub. Every word and number on screen comes from there.
 */
(function () {
  const D = 14, W = 1600, H = 900;
  const ROW_Y = 466; // the seals' centre line
  const X0 = 156, X1 = 1444; // the row's outer edges, shared by the copy and the status line
  const T0 = 2.35, GAP = 1.15; // first stamp, and the beat between stamps
  const DESC = 0.24, HOLD = 0.08, RISE = 0.3; // the press: drop, dwell on the paper, lift
  const OUT = 11.3; // the ink lifts from here; the rings are back together well before the seam

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.2,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, ui, rng } = h;
      const C = tokens.color;
      root.classList.add("trb");
      const seals = (content.seals || []).slice(0, 6), n = seals.length;
      const ST = content.stamp || {}, STAT = content.status || {};
      const total = seals.reduce((a, s) => a + (+s.controls || 0), 0);

      // ---- geometry: the row spans the same width whatever the count; seals shrink a little past five
      const SP = n > 1 ? Math.min(270, (X1 - X0 - 208) / (n - 1)) : 0;
      const k = 1.12 * Math.min(1, (SP || 270) / 270);
      const RS = 104 * k; // the serrated rim (k scales every part of the seal together)
      const xs = seals.map((_, i) => W / 2 + (i - (n - 1) / 2) * SP);
      // stacked, the ring nearest the middle is innermost, the outer slots outermost
      const rank = seals.map((_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
      const rc = []; rank.forEach((i, q) => (rc[i] = { r: 92 * k + q * 36, q }));
      const ink = C.accentText || C.accent;

      // ---- copy across the top
      const top = el("div", "trb-top", root);
      Object.assign(top.style, { left: X0 + "px", width: X1 - X0 + "px" });
      const left = el("div", "trb-lead", top);
      el("div", "trb-eyebrow", left, content.eyebrow || "");
      el("div", "trb-h", left, content.heading || "");
      if (content.sub) el("div", "trb-sub", top, content.sub);

      // ---- the picture
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "trb-svg" }, root);
      const defs = svg("defs", {}, s);
      const ringLayer = svg("g", {}, s);
      const sealLayer = svg("g", {}, s);
      const pressLayer = svg("g", {}, s);
      const R = rng(11);

      const S = seals.map((seal, i) => {
        const x = xs[i];
        // the rolling ring: one dashed circle that ends up as the seal's empty outline
        const roll = svg("g", {}, ringLayer);
        const ring = svg("circle", { cx: 0, cy: 0, r: 92 * k, fill: "none", stroke: mix(C.ink, C.paper, 0.62), "stroke-width": ui.stroke("fine", 1.4), "stroke-dasharray": "3 7", "stroke-linecap": "round" }, roll);
        const well = svg("circle", { cx: x, cy: ROW_Y, r: 92 * k, fill: alpha(C.ink, 0.025), stroke: "none", opacity: 0 }, ringLayer);

        // the speckle: rubber leaves paper showing through, seeded per seal
        const m = svg("mask", { id: `trb-ink-${i}`, maskUnits: "userSpaceOnUse", x: -130, y: -130, width: 260, height: 260 }, defs);
        svg("rect", { x: -130, y: -130, width: 260, height: 260, fill: "white" }, m);
        for (let d = 0; d < 46; d++) {
          const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 108 * k;
          svg("circle", { cx: (Math.cos(a) * rr).toFixed(1), cy: (Math.sin(a) * rr).toFixed(1), r: (0.7 + R() * 1.9).toFixed(1), fill: "black", opacity: (0.45 + R() * 0.5).toFixed(2) }, m);
        }
        for (let d = 0; d < 3; d++) {
          const a = R() * Math.PI * 2, rr = 40 + R() * 50;
          svg("rect", { x: (Math.cos(a) * rr - 14).toFixed(1), y: (Math.sin(a) * rr).toFixed(1), width: (14 + R() * 26).toFixed(1), height: (0.8 + R()).toFixed(1), fill: "black", opacity: 0.5 }, m);
        }

        // the impression, built at the origin and placed by render
        const imp = svg("g", { opacity: 0 }, sealLayer);
        const disc = svg("g", {}, imp);
        const teeth = 44;
        let d = "";
        for (let j = 0; j < teeth * 2; j++) {
          const a = (j / (teeth * 2)) * Math.PI * 2, rr = j % 2 ? RS - 5 * k : RS;
          d += `${j ? "L" : "M"}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
        }
        svg("path", { d: d + "Z", fill: mix(C.accent, C.surface, 0.88), stroke: "none" }, disc);
        const inked = svg("g", { mask: `url(#trb-ink-${i})` }, imp);
        // sm-native-start: the seal is a rubber stamp; its rims keep their own weights in every look
        svg("path", { d: d + "Z", fill: "none", stroke: ink, "stroke-width": 2.2 }, inked);
        svg("circle", { r: 91 * k, fill: "none", stroke: ink, "stroke-width": 3 }, inked);
        svg("circle", { r: 61 * k, fill: "none", stroke: ink, "stroke-width": 1.4 }, inked);
        svg("circle", { r: 56 * k, fill: "none", stroke: ink, "stroke-width": 0.9, "stroke-dasharray": "1.5 3" }, inked);
        // sm-native-end
        const ar = 76 * k;
        svg("path", { id: `trb-top-${i}`, d: `M${-ar} 0 A${ar} ${ar} 0 0 1 ${ar} 0`, fill: "none" }, defs);
        svg("path", { id: `trb-bot-${i}`, d: `M${-ar} 0 A${ar} ${ar} 0 0 0 ${ar} 0`, fill: "none" }, defs);
        const arcText = (id, value) => {
          const tx = svg("text", { class: "trb-arc", fill: ink, "dominant-baseline": "central", "font-size": 16 }, inked);
          const tp = svg("textPath", { href: `#${id}`, startOffset: "50%", "text-anchor": "middle" }, tx);
          tp.textContent = value;
          return tx;
        };
        const topText = arcText(`trb-top-${i}`, seal.name || "");
        const botText = arcText(`trb-bot-${i}`, seal.scope || "");
        for (const sx of [-1, 1]) svg("circle", { cx: sx * ar, cy: 0, r: 2.6 * k, fill: ink }, inked);
        const mark = svg("text", { class: "trb-mark", x: 0, y: 1, fill: ink, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 30 * k }, inked);
        mark.textContent = seal.mark || seal.name || "";
        // a short rule above and below the mark, like a struck seal
        svg("line", { x1: -16 * k, x2: 16 * k, y1: -27 * k, y2: -27 * k, stroke: ink, "stroke-width": 1.4 }, inked); // sm-native: part of the stamp
        svg("line", { x1: -16 * k, x2: 16 * k, y1: 29 * k, y2: 29 * k, stroke: ink, "stroke-width": 1.4 }, inked); // sm-native: part of the stamp
        const ripple = svg("circle", { cx: x, cy: ROW_Y, r: RS, fill: "none", stroke: C.accent, "stroke-width": ui.stroke("regular", 2), opacity: 0 }, sealLayer);

        // under the seal: its name, then the dated stamp, then what it covers
        const lab = el("div", "trb-under", root);
        Object.assign(lab.style, { left: x + "px", top: ROW_Y + RS + 18 + "px", width: Math.max(150, SP - 16) + "px" });
        const name = el("div", "trb-name", lab, seal.name || "");
        const date = el("div", "trb-date", lab, [ST.audited, seal.audited].filter(Boolean).join(" "));
        date.style.color = ink;
        date.style.boxShadow = `inset 0 0 0 2px ${ink}`; // sm-native: a dater stamp's frame is ink, not outline style
        const ctl = el("div", "trb-ctl", lab);
        const dot = el("span", "trb-dot", ctl);
        dot.style.background = C.positive;
        el("span", "", ctl, `${seal.controls} ${ST.controls || ""}`.trim());

        return {
          i, x, r0: rc[i].r, q: rc[i].q, roll, ring, well, imp, inked, topText, botText, mark, ripple, name, date, ctl,
          angle: (R() - 0.5) * 9, dateAngle: (R() - 0.5) * 4, T: T0 + i * GAP, controls: +seal.controls || 0,
        };
      });

      // ---- the press: a round rubber head seen from above, larger when it is higher (nearer)
      const shadow = svg("circle", { r: RS + 4, fill: alpha(C.ink, 0.1), opacity: 0 }, pressLayer);
      const head = svg("g", { opacity: 0 }, pressLayer);
      // sm-native-start: the press is the scene's machine and keeps its own weights in every look
      svg("circle", { r: RS + 4, fill: C.surface, stroke: mix(C.ink, C.surface, 0.25), "stroke-width": 1.6 }, head);
      svg("circle", { r: RS - 1, fill: "none", stroke: ink, "stroke-width": 5, opacity: 0.85 }, head); // the inked rubber, showing at the rim
      svg("circle", { r: RS * 0.66, fill: C.raised || C.paper, stroke: mix(C.ink, C.surface, 0.55), "stroke-width": 1.2 }, head);
      svg("circle", { r: 20, fill: mix(C.ink, C.surface, 0.18), stroke: "none" }, head);
      svg("circle", { cx: -5, cy: -6, r: 6, fill: alpha(C.surface, 0.35), stroke: "none" }, head);
      // sm-native-end

      // ---- the status line: what has been stamped, summed, and a bar in one segment per seal
      const rule = el("div", "trb-rule", root);
      Object.assign(rule.style, { left: X0 + "px", width: X1 - X0 + "px" });
      const stat = el("div", "trb-stat", root);
      stat.style.left = X0 + "px";
      const line = el("div", "trb-statline", stat);
      const num = el("span", "trb-num", line, "0");
      num.style.minWidth = String(total).length * 0.62 + "em";
      el("span", "trb-of", line, [STAT.of, total, STAT.label].filter((v) => v !== undefined && v !== "").join(" "));
      if (STAT.note) el("div", "trb-note", stat, STAT.note);

      const BX = 760, BW = X1 - BX, GAPX = 6;
      const bar = el("div", "trb-bar", root);
      Object.assign(bar.style, { left: BX + "px", width: BW + "px" });
      const tags = el("div", "trb-tags", root); // each segment's name, in a box as wide as its segment
      Object.assign(tags.style, { left: BX + "px", width: BW + "px" });
      let acc = 0;
      const usable = BW - GAPX * Math.max(0, n - 1);
      const segs = S.map((st, i) => {
        const w = total ? (usable * st.controls) / total : usable / Math.max(1, n);
        const seg = el("div", "trb-seg", bar);
        Object.assign(seg.style, { left: acc + "px", width: w + "px" });
        const fill = el("div", "trb-fill", seg);
        fill.style.background = C.positive;
        const tag = el("div", "trb-segtag", tags, seals[i].mark || seals[i].name || "");
        Object.assign(tag.style, { left: acc + "px", width: w + "px" });
        acc += w + GAPX;
        return { seg, fill, tag };
      });

      return { S, segs, num, head, shadow, RS, xs, total, C };
    },

    render(t, S, h) {
      const { tw, clamp, mix } = h;
      const deg = 180 / Math.PI;
      const cx = W / 2;
      let sum = 0;

      S.S.forEach((st) => {
        // ---- the ring rolls apart from the stack, and back together at the end of the loop
        const go = tw(t, 0.35 + st.q * 0.09, 1.25, "signature");
        const back = tw(t, OUT + 0.8 + (S.S.length - 1 - st.q) * 0.07, 1.3, "inOut");
        const u = go * (1 - back);
        const x = cx + (st.x - cx) * u;
        const r = st.r0 + (92 * (S.RS / 104) - st.r0) * u;
        st.roll.setAttribute("transform", `translate(${x.toFixed(2)} ${ROW_Y}) rotate(${(((x - cx) / r) * deg).toFixed(2)})`);
        st.ring.setAttribute("r", r.toFixed(2));
        const landed = tw(t, 0.35 + st.q * 0.09 + 0.75, 0.5, "soft") * (1 - tw(t, OUT + 0.55, 0.35, "soft"));
        st.well.setAttribute("opacity", landed.toFixed(3));

        // ---- the stamp lands at T; the head hides it until it lifts
        const T = st.T;
        const lift = tw(t, OUT + st.i * 0.07, 0.6, "soft");
        const stamped = t >= T ? 1 - lift : 0;
        const squash = 1.05 - 0.05 * tw(t, T, 0.4, "snappy");
        st.imp.setAttribute("opacity", stamped.toFixed(3));
        st.imp.setAttribute("transform", `translate(${st.x} ${ROW_Y}) rotate(${st.angle.toFixed(2)}) scale(${squash.toFixed(3)})`);
        st.ring.setAttribute("opacity", (1 - (t >= T ? 1 - lift : 0)).toFixed(3));
        const rip = tw(t, T + 0.08, 0.8, "soft");
        st.ripple.setAttribute("r", (S.RS + 30 * rip).toFixed(1));
        st.ripple.setAttribute("opacity", (rip > 0 && rip < 1 ? 0.7 * (1 - rip) : 0).toFixed(3));

        // the type on the arcs fits half the rim, whatever the content's longest name
        const half = Math.PI * 76 * (S.RS / 104) - 34;
        for (const tx of [st.topText, st.botText]) {
          const fs = +tx.getAttribute("font-size");
          const L = tx.getComputedTextLength();
          if (L > 0) h.set(tx, { "font-size": Math.min(16, (half / (L / fs)) * 1).toFixed(2) });
        }
        const mfs = +st.mark.getAttribute("font-size");
        const ML = st.mark.getComputedTextLength();
        if (ML > 0) h.set(st.mark, { "font-size": Math.min(30 * (S.RS / 104), (96 * (S.RS / 104)) / (ML / mfs)).toFixed(2) });

        // under the seal: the name darkens, the dater stamp lands, then what it covers
        const nameInk = t >= T ? 1 - lift : 0;
        st.name.style.opacity = Math.max(0.55 * landed, nameInk).toFixed(3);
        const dIn = tw(t, T + 0.42, 0.3, "snappy");
        st.date.style.opacity = (dIn * (1 - lift)).toFixed(3);
        st.date.style.transform = `rotate(${st.dateAngle.toFixed(2)}deg) scale(${(1.14 - 0.14 * dIn).toFixed(3)})`;
        const cIn = tw(t, T + 0.62, 0.5, "signature");
        st.ctl.style.opacity = (cIn * (1 - lift)).toFixed(3);
        st.ctl.style.transform = `translateY(${((1 - cIn) * 8).toFixed(1)}px)`;

        // the status line counts what the press has stamped
        if (t >= T + 0.05 && t < OUT + 0.45) sum += st.controls;
        const seg = S.segs[st.i];
        const fill = tw(t, T + 0.1, 0.6, "signature");
        seg.fill.style.transform = `scaleX(${fill.toFixed(4)})`;
        seg.fill.style.opacity = (1 - lift).toFixed(3);
        seg.tag.style.opacity = (0.55 + 0.45 * fill * (1 - lift)).toFixed(3);
      });

      // ---- the press: hovers in over the first seal, strikes each in turn, travels between them, leaves
      const list = S.S;
      if (list.length) {
        const first = list[0].T, last = list[list.length - 1].T;
        let px = list[0].x, hgt = 1;
        for (let i = 0; i < list.length; i++) {
          const T = list[i].T;
          if (t < T - DESC) break;
          px = list[i].x;
          if (t < T) { const d = (t - (T - DESC)) / DESC; hgt = 1 - d * d; } // accelerates into the paper
          else if (t < T + HOLD) hgt = 0;
          else hgt = tw(t, T + HOLD, RISE, "soft");
          const up = T + HOLD + RISE;
          if (i < list.length - 1 && t >= up) {
            px = list[i].x + (list[i + 1].x - list[i].x) * tw(t, up, list[i + 1].T - DESC - up, "inOut");
            hgt = 1;
          }
        }
        const vis = tw(t, first - 0.95, 0.5, "signature") * (1 - tw(t, last + HOLD + RISE + 0.1, 0.45, "soft"));
        const sc = 1 + 0.3 * hgt;
        const lifted = tw(t, last + HOLD + RISE, 0.55, "soft");
        S.head.setAttribute("transform", `translate(${(px + 26 * lifted).toFixed(1)} ${(ROW_Y - 40 * hgt - 30 * lifted).toFixed(1)}) scale(${(sc + 0.15 * lifted).toFixed(3)})`);
        S.head.setAttribute("opacity", (vis * 0.97).toFixed(3));
        S.shadow.setAttribute("transform", `translate(${(px + 22 * hgt).toFixed(1)} ${(ROW_Y + 26 * hgt).toFixed(1)}) scale(${(1 + 0.1 * hgt).toFixed(3)})`);
        S.shadow.setAttribute("opacity", (vis * (0.5 + 0.5 * (1 - hgt))).toFixed(3));
      }

      // the counter dips while the ink lifts, so the return to zero is never seen as a jump
      h.text(S.num, String(sum));
      const dip = 1 - tw(t, OUT + 0.2, 0.25, "soft") * (1 - tw(t, OUT + 0.55, 0.3, "soft"));
      S.num.style.opacity = clamp(dip).toFixed(3);
      S.num.classList.toggle("is-full", sum === S.total && S.total > 0);
    },
  });
})();
