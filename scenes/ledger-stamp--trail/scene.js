/* ledger-stamp--trail: the audit trail is the scene (DOM + SVG).
 * One ledger page. Entries are written one at a time as sentences with typed chips (who, what, which, how much),
 * each with a rubber stamp in the margin and a round seal holding its hash. The hash is taken over the entry and the
 * hash above it, and a chain link joins each seal to the one before: the parent's stamp and seal, turned into a
 * tamper-evident log.
 *
 * The beat: someone edits a past amount. That row's hash no longer matches what was sealed, and from there down
 * every link snaps open and every seal turns to the warning colour. The edit is rejected and struck out, the
 * original returns, the chain re-links top to bottom, and the attempt itself is appended as a new entry.
 *
 * Every hash is real (FNV over the row and the previous hash), so the broken seals show the values the edited
 * ledger would really have. All state is a function of t; the page is blank at 0 and blank again before D.
 */
(function () {
  const W = 1600, H = 900, D = 14;
  const PAGE = { x: 90, y: 236, w: 1420, h: 634 };
  const HEAD = 56, ROW0 = 64, RH = 84; // page-relative: header band, first row top, row pitch
  const STAMP_X = 176, RULE_X = 262, SENT_X = 296, TIME_R = 1222, DIV_X = 1250, SEAL_X = 1298, SEAL_R = 32, LABEL_X = 1344;
  const yc = (k) => PAGE.y + ROW0 + k * RH + RH / 2; // a row's centre line, stage coordinates

  // timeline (seconds)
  const CUR = 4.4, SEL = 4.9, TYPE = 5.05, CPS = 22; // the editor arrives, selects the amount, types over it
  const BREAK = 5.75, REJECT = 7.3, FIX = 7.65; // hash mismatch cascades down; the edit is refused; links re-close
  // each entry is written at T; its stamp lands at STAMP and its seal is pressed at SEAL. [5] is the attempt itself:
  // written as pending once the mismatch is found, stamped when it is refused, sealed once the chain is whole again
  const T = [0.5, 1.2, 1.9, 2.6, 3.3, 6.45];
  const STAMP = [...T.slice(0, 5).map((x) => x + 0.4), REJECT + 0.15];
  const SEAL = [...T.slice(0, 5).map((x) => x + 0.25), FIX + 4 * 0.12 + 0.35];
  const OUT = 12.7, CLEAR = 13.55; // the page clears for the next loop

  const hashOf = (str) => { let x = 2166136261; for (const ch of str) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0; return x.toString(16).padStart(8, "0").slice(0, 4); };
  const fill = (tpl, v) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.05,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      const C = tokens.color, ink = ui.strokeColor(C.stroke || C.ink);
      const OUT_W = ui.stroke("regular", 1.5);
      root.classList.add("lt");
      const R = rng(4127);

      // ---------- data: five entries, then the attempt that was refused ----------
      const base = content.entries || [];
      const tp = content.tamper || {};
      const tRow = tp.row ?? 1;
      const target = base[tRow] || base[0];
      const entries = [
        ...base.map((e) => ({ ...e, parts: [["who", e.actor], ["word", e.verb], ["ref", e.ref], ["muted", content.for || "for"], ["amt", e.amount]] })),
        { actor: tp.actor, ref: target.ref, amount: tp.amount, time: tp.time, stamp: tp.stamp, rejected: true,
          parts: [["who", tp.actor], ["word", tp.verb], ["ref", target.ref], ["muted", content.to || "to"], ["amt", tp.amount]] },
      ];
      // the chain as sealed, and the chain the edited ledger would compute
      const sealed = [], forged = [];
      let prev = hashOf(content.prevPage || "page 13"), prevF = prev;
      const prevOf = [];
      entries.forEach((e, k) => {
        prevOf.push(prev);
        sealed.push(hashOf(prev + e.actor + e.ref + e.amount));
        const amt = k === tRow ? tp.amount : e.amount;
        forged.push(k >= tRow && k < base.length ? hashOf(prevF + e.actor + e.ref + amt) : sealed[k]);
        prev = sealed[k];
        prevF = k >= tRow && k < base.length ? forged[k] : sealed[k];
      });

      // ---------- copy ----------
      el("div", "lt-eyebrow", root, content.eyebrow || "");
      el("div", "lt-h", root, content.heading || "");
      el("div", "lt-sub", root, content.sub || "");

      // ---------- the page ----------
      const page = el("div", "lt-page", root);
      const head = el("div", "lt-head", page);
      el("span", "lt-pagelabel", head, content.pageLabel || "");
      const pill = el("span", "lt-pill", head);
      const pillDot = el("i", "lt-dot", pill);
      const pillText = el("span", "", pill);
      const foot = el("div", "lt-foot", page);
      el("span", "lt-footnote", foot, content.footnote || "");
      const footHead = el("span", "lt-foothead", foot);

      // rows: a sentence of chips and a time, inside the page
      const rows = entries.map((e, k) => {
        const r = el("div", "lt-row", page);
        Object.assign(r.style, { left: SENT_X - PAGE.x + "px", top: ROW0 + k * RH + "px", width: TIME_R - SENT_X + "px", height: RH + "px" });
        const sent = el("div", "lt-sent", r);
        const parts = e.parts.map(([kind, text]) => {
          if (kind !== "amt") return el("span", `lt-p lt-${kind}`, sent, text);
          const wrap = el("span", "lt-p lt-amtwrap", sent);
          const chip = el("span", "lt-amt", wrap);
          const value = el("span", "lt-amt-v", chip, text);
          const caret = el("i", "lt-caret", chip);
          return Object.assign(wrap, { chip, value, caret });
        });
        const time = el("span", "lt-time", r, e.time || "");
        const amt = parts[parts.length - 1];
        if (e.rejected) amt.chip.dataset.state = "edit";
        let struck = null, cursor = null;
        if (k === tRow) {
          // the refused value, struck out beside the restored one
          struck = el("span", "lt-struck", amt);
          const sv = el("span", "lt-struck-v", struck, tp.amount || "");
          struck.line = el("i", "lt-strike", sv);
          el("span", "lt-struck-note", struck, content.rejectedNote || "edit rejected");
          // the editor's cursor and name tag
          cursor = el("span", "lt-cursor", amt);
          const cs = svg("svg", { width: 22, height: 26, viewBox: "0 0 22 26", class: "lt-cursor-arrow" }, cursor);
          // sm-native: a pointer is a glyph and keeps its own outline
          svg("path", { d: "M2 2 L2 21 L7.5 16 L11 24 L14.5 22.5 L11 15 L18.5 15 Z", fill: C.ink, stroke: C.surface, "stroke-width": 1.5, "stroke-linejoin": "round" }, cs);
          el("span", "lt-cursor-tag", cursor, tp.actor || "");
        }
        return { r, parts, time, amt, struck, cursor };
      });

      // ---------- SVG over the page: ledger rules, stamps, seals and the chain ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "lt-svg" }, root);
      const rules = svg("g", {}, s);
      const top = PAGE.y + HEAD, bottom = PAGE.y + ROW0 + entries.length * RH + 4;
      for (let k = 1; k < entries.length; k++) svg("line", { x1: PAGE.x + 20, x2: PAGE.x + PAGE.w - 20, y1: PAGE.y + ROW0 + k * RH, y2: PAGE.y + ROW0 + k * RH, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, rules);
      // the ledger's double margin rule, and the rule before the seal column
      svg("line", { x1: RULE_X - 4, x2: RULE_X - 4, y1: top, y2: bottom, stroke: mix(C.surface, C.accent, 0.55), "stroke-width": ui.stroke("hair", 1) }, rules);
      svg("line", { x1: RULE_X, x2: RULE_X, y1: top, y2: bottom, stroke: mix(C.surface, C.accent, 0.55), "stroke-width": ui.stroke("hair", 1) }, rules);
      svg("line", { x1: DIV_X, x2: DIV_X, y1: top, y2: bottom, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, rules);

      // links sit over the seals' rims, as a chain link passes in front of the rings it joins
      const seals = svg("g", {}, s), links = svg("g", {}, s), stamps = svg("g", {}, s);
      const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
      const marks = entries.map((e, k) => {
        // stamp: the parent's rubber stamp, one ink, a little rotated
        const stamp = svg("g", {}, stamps);
        const col = e.rejected ? C.warningText || C.warning : C.accentText || C.accent;
        // sm-native: the rubber stamp is the scene's motif and keeps its own weight and corners
        svg("rect", { x: -70, y: -28, width: 140, height: 56, rx: 5, fill: "none", stroke: col, "stroke-width": 2.6 }, stamp);
        txt(stamp, { x: 0, y: 0, "text-anchor": "middle", fill: col }, "lt-stamp", e.stamp || "");
        txt(stamp, { x: 0, y: 19, "text-anchor": "middle", fill: col }, "lt-stamp-no", `${content.entryNo || "ENTRY"} ${String((content.firstEntry || 1) + k).padStart(4, "0")}`);
        const rot = (e.rejected ? 4 : -7) + (R() - 0.5) * 5;
        // seal: the parent's seal, carrying this row's hash
        const seal = svg("g", {}, seals);
        const disc = svg("circle", { r: SEAL_R, "stroke-width": OUT_W }, seal);
        const ring = svg("circle", { r: SEAL_R - 5, fill: "none", "stroke-width": ui.stroke("hair", 1), "stroke-dasharray": "2.4 3" }, seal);
        const hash = txt(seal, { x: 0, y: 5.5, "text-anchor": "middle" }, "lt-seal-hash");
        // link to the seal above: two halves of one oval, so it can snap open
        let link = null;
        if (k > 0) {
          const g = svg("g", { transform: `translate(${SEAL_X} ${(yc(k) - RH / 2).toFixed(1)})` }, links);
          // sm-native-start: the chain link is the scene's motif and keeps its own weight
          const half = (d) => {
            const hg = svg("g", {}, g);
            svg("path", { d, fill: "none", stroke: C.surface, "stroke-width": 7, "stroke-linecap": "round" }, hg); // a halo, so the link reads over the seal
            const line = svg("path", { d, fill: "none", "stroke-width": 3.2, "stroke-linecap": "round" }, hg);
            return Object.assign(hg, { line });
          };
          const a = half("M-7 2 V-16 A7 7 0 0 1 7 -16 V2");
          const b = half("M-7 -2 V16 A7 7 0 0 0 7 16 V-2");
          // sm-native-end
          link = { g, a, b };
        }
        // the check beside the seal: status, and the hash it was chained to
        const lab = el("div", "lt-chk", page);
        Object.assign(lab.style, { left: LABEL_X - PAGE.x + "px", top: ROW0 + k * RH + RH / 2 - 23 + "px" });
        const st = el("div", "lt-chk-st", lab);
        const sub = el("div", "lt-chk-sub", lab);
        return { stamp, rot, seal, disc, ring, hash, link, lab, st, sub };
      });

      return { content, C, ink, entries, sealed, forged, prevOf, rows, marks, pill, pillDot, pillText, footHead, tRow, base: base.length };
    },

    render(t, S, h) {
      const { clamp, tw, typed, set, text, motion } = h;
      const { C, ink, content, entries, sealed, forged, prevOf, rows, marks, tRow } = S;
      const n = entries.length;
      const scramble = (k, salt) => hashOf(`${k}:${salt}:${Math.floor(t * 24)}`);

      // how broken each row is, 0..1: row tRow's own hash fails first, then every link below it
      const broken = (k) => {
        if (k < tRow || k >= S.base) return 0;
        const j = k - tRow;
        return tw(t, BREAK + j * 0.14, 0.25, "snappy") * (1 - tw(t, FIX + j * 0.12, 0.3, "snappy"));
      };
      const flipAt = (k) => BREAK + (k - tRow) * 0.14, fixAt = (k) => FIX + (k - tRow) * 0.12;

      let written = 0;
      for (let k = 0; k < n; k++) {
        const e = entries[k], row = rows[k], M = marks[k];
        const T0 = T[k];
        const wIn = tw(t, T0, 0.6, "signature");
        const out = tw(t, OUT + motion.stagger(k, 0.06), 0.45, "inOut");
        const T1 = SEAL[k];
        if (t >= T1 + 0.15 && t < CLEAR) written = k + 1;
        const lift = -18 * out;

        // the sentence: chips arrive one after another
        row.r.style.opacity = (1 - out).toFixed(3);
        row.r.style.transform = `translateY(${lift.toFixed(1)}px)`;
        row.parts.forEach((p, j) => {
          const pin = tw(t, T0 + motion.stagger(j, 0.07), 0.55, "signature");
          p.style.opacity = pin.toFixed(3);
          p.style.transform = `translateY(${((1 - pin) * 12).toFixed(1)}px)`;
        });
        const tin = tw(t, T0 + motion.stagger(row.parts.length, 0.07), 0.55, "signature");
        row.time.style.opacity = tin.toFixed(3);
        row.time.style.transform = `translateY(${((1 - tin) * 12).toFixed(1)}px)`;

        // the stamp lands slightly oversized and settles
        const ts = STAMP[k], sc = tw(t, ts, 0.16, "snappy");
        set(M.stamp, {
          opacity: t < ts ? 0 : (1 - out).toFixed(3),
          transform: `translate(${STAMP_X} ${(yc(k) + lift).toFixed(1)}) rotate(${M.rot.toFixed(2)}) scale(${(1.14 - 0.14 * sc).toFixed(3)})`,
        });

        // the seal computes its hash, then holds it; a broken row shows the hash the edited ledger computes
        const b = broken(k), bad = b > 0.5;
        const sIn = tw(t, T1, 0.35, "snappy");
        const pulse = k >= tRow && k < S.base ? Math.sin(Math.PI * clamp((t - flipAt(k)) / 0.3)) + Math.sin(Math.PI * clamp((t - fixAt(k)) / 0.3)) : 0;
        set(M.seal, { opacity: (sIn * (1 - out)).toFixed(3), transform: `translate(${SEAL_X} ${(yc(k) + lift).toFixed(1)}) scale(${((0.85 + 0.15 * sIn) * (1 + 0.08 * pulse)).toFixed(3)})` });
        const computing = t < T1 + 0.37 || (t >= flipAt(k) && t < flipAt(k) + 0.22 && k >= tRow && k < S.base) || (t >= fixAt(k) && t < fixAt(k) + 0.22 && k >= tRow && k < S.base);
        text(M.hash, "#" + (computing ? scramble(k, "s") : bad ? forged[k] : sealed[k]));
        set(M.disc, { fill: bad ? C.surface : C.accentFill || C.accent, stroke: bad ? C.warning : ink });
        set(M.ring, { stroke: bad ? C.warning : C.onAccent || C.paper, opacity: bad ? 0.9 : 0.8 });
        set(M.hash, { fill: bad ? C.warningText || C.warning : C.onAccent || C.paper });

        // the link closes as the entry is chained, and snaps open while the row above it fails
        if (M.link) {
          const lIn = tw(t, T1 + 0.3, 0.35, "snappy");
          const lb = k > tRow ? b : 0;
          // closing: the halves meet; breaking: they part and swing open on the seal edges, like a cut link
          const gap = 6 * (1 - lIn) + 5 * lb, swing = 24 * lb;
          set(M.link.g, { opacity: (lIn * (1 - out)).toFixed(3), transform: `translate(${SEAL_X} ${(yc(k) - RH / 2 + lift).toFixed(1)})` });
          const col = lb > 0.5 ? C.warning : ink;
          set(M.link.a.line, { stroke: col });
          set(M.link.b.line, { stroke: col });
          set(M.link.a, { transform: `translate(0 ${(-gap).toFixed(2)}) rotate(${swing.toFixed(2)} 0 -20)` });
          set(M.link.b, { transform: `translate(0 ${gap.toFixed(2)}) rotate(${swing.toFixed(2)} 0 20)` });
        }

        // the check: sealed, chained to the hash above / hash mismatch, and what it was
        const pending = t < T1 + 0.37;
        const lin = tw(t, Math.min(T0 + 0.35, T1 + 0.35), 0.4, "soft");
        M.lab.style.opacity = (lin * (1 - out)).toFixed(3);
        M.lab.style.transform = `translateY(${lift.toFixed(1)}px)`;
        M.lab.dataset.state = bad ? "bad" : pending ? "pending" : "";
        text(M.st, bad ? content.mismatch || "hash mismatch" : pending ? content.pending || "pending" : content.sealed || "sealed");
        text(M.sub, bad ? `${content.was || "was"} #${sealed[k]}` : pending ? content.pendingNote || "not chained" : `${content.prev || "prev"} #${prevOf[k]}`);
      }

      // the edit: a cursor arrives, selects the amount, types over it; refused, it is struck out and the original returns
      const E = rows[tRow];
      if (E && E.cursor) {
        const orig = entries[tRow].amount, forgedAmt = content.tamper.amount;
        const cIn = tw(t, CUR, 0.5, "signature"), cOut = tw(t, REJECT - 0.05, 0.3, "inOut");
        E.cursor.style.opacity = (cIn * (1 - cOut)).toFixed(3);
        E.cursor.style.transform = `translate(${((1 - cIn) * 30).toFixed(1)}px, ${((1 - cIn) * 24).toFixed(1)}px)`;
        const editing = t >= TYPE && t < REJECT;
        text(E.amt.value, editing ? typed(forgedAmt, t, TYPE, CPS) : orig);
        E.amt.chip.dataset.state = editing ? "edit" : "";
        E.amt.value.dataset.sel = t >= SEL && t < TYPE ? "1" : "";
        const typing = t >= TYPE && t < TYPE + forgedAmt.length / CPS;
        const caretOn = t >= SEL && t < REJECT && (typing || Math.floor((t - TYPE) * 2.4) % 2 === 0);
        E.amt.caret.style.opacity = caretOn ? "1" : "0";
        const sIn = tw(t, REJECT + 0.05, 0.35, "soft");
        E.struck.style.opacity = sIn.toFixed(3);
        E.struck.style.transform = `translateX(${((1 - sIn) * -10).toFixed(1)}px)`;
        E.struck.line.style.transform = `scaleX(${tw(t, REJECT + 0.2, 0.3, "snappy").toFixed(3)})`;
      }

      // the page header: entries and links, derived from what has been written and what is broken
      const links = Math.max(0, written - 1); // every sealed entry after the first is chained to the one above
      let nb = 0;
      for (let k = tRow + 1; k < S.base; k++) if (broken(k) > 0.5 && k < written) nb++;
      const mism = broken(tRow) > 0.5;
      text(S.pillText, mism
        ? fill(content.statusBad, { ref: entries[tRow].ref, b: nb, links })
        : fill(content.statusOk, { n: written, links }));
      // the header reads once there is a chain to speak of: two sealed entries, one link
      S.pill.dataset.state = mism ? "bad" : "";
      const pOn = tw(t, SEAL[1] + 0.3, 0.35, "snappy") * (1 - tw(t, OUT + 0.3, 0.4, "inOut"));
      S.pill.style.opacity = pOn.toFixed(3);
      text(S.footHead, `${content.headLabel || "head"} #${written ? sealed[written - 1] : "0000"}`);
      S.footHead.style.opacity = pOn.toFixed(3);
    },
  });
})();
