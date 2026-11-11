/* account-health: a health table for accounts, services or members (SVG sparklines in a DOM table).
 * Each row is one item: a lettermark and name, its plan or segment, a health score with a status pill, a 30-day
 * sparkline, one meta value (renewal, region, members) and an owner. The month replays: every sparkline draws to
 * today together and each score reads the value under its line's tip. One row slides below the thresholds; its line
 * turns warm, the row tints and opens, a playbook chip fires at the trough, and over the following days the line
 * recovers and the score climbs back to healthy. The footer counts the rows in each state as it happens.
 *
 * Everything comes from content: columns, thresholds, state names, the footer and cursor templates, and per row
 * `series` (any length >= 2, spread across `days`). The row with a `playbook` is the one that dips; its trough is
 * the lowest point of its series (or `playbook.at`). Built for 4–7 rows.
 */
(function () {
  const D = 14, LOOP = 1.2, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: LOOP,
    duration: D,
    still: 10.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const dark = window.SMTokens ? SMTokens.lum(C.paper) < 0.2 : false;
      root.classList.add("ah");
      const cols = content.columns || {};
      const states = content.states || {};
      const thr = content.thresholds || { healthy: 70, watch: 50 };
      const rows = content.accounts || [];
      const n = rows.length;
      const days = content.days || 30;
      const hasMeta = !!cols.meta;

      // status colours: healthy, watch, and at risk (a brand's own danger colour when it has one; otherwise the deep
      // shade of warning, and the at-risk pill is the solid fill so it never reads like "watch")
      const GOOD = C.positive, WARN = C.warning, RISK = C.danger || C.negative || C.warningText || C.warning;
      const NEUTRAL = mix(C.ink, C.surface, dark ? 0.3 : 0.38);

      // ---- layout numbers from the item count ----
      const rowH = Math.max(60, Math.min(80, Math.floor(440 / Math.max(1, n))));
      const SW = content.trendWidth || 420, SH = Math.min(52, rowH - 14), PADX = 5, PADY = 5;
      const STRIP = 46;
      const all = rows.flatMap((r) => r.series);
      const lo = Math.max(0, Math.min(thr.watch, ...all) - 3), hi = Math.min(100, Math.max(...all) + 2);
      const xOf = (p) => PADX + p * (SW - PADX * 2);
      const yOf = (v) => SH - PADY - ((v - lo) / (hi - lo)) * (SH - PADY * 2);
      const valAt = (s, p) => { const f = h.clamp(p) * (s.length - 1), i = Math.min(s.length - 2, Math.floor(f)); return h.lerp(s[i], s[i + 1], f - i); };

      // ---- the incident row and the time map ----
      const inc = rows.findIndex((r) => r.playbook);
      let p0 = 1, pT = 1, trough = -1;
      if (inc >= 0) {
        const s = rows[inc].series;
        trough = rows[inc].playbook.at ?? s.indexOf(Math.min(...s));
        let start = 0;
        for (let i = 0; i < trough; i++) if (s[i] >= thr.healthy + 5) start = i;
        p0 = Math.max(0.15, (start - 1) / (s.length - 1));
        pT = trough / (s.length - 1);
      }
      // A: every line draws in to the day before the slide; B: the slide to the trough; hold while the playbook fires;
      // C: the recovery to today
      const pAt = (t) => inc < 0
        ? h.tw(t, 1.5, 3.2, "signature")
        : p0 * h.tw(t, 1.5, 1.8, "signature") + (pT - p0) * h.tw(t, 3.4, 2.1, "inOut") + (1 - pT) * h.tw(t, 6.3, 3.2, "inOut");
      const tFire = 5.55;
      let tRisk = 99, tRecover = 99;
      if (inc >= 0) {
        for (let t = 3.4; t < 9.6; t += 1 / 120) {
          const v = valAt(rows[inc].series, pAt(t));
          if (tRisk > 90 && v < thr.watch) tRisk = t;
          if (t > tFire && tRecover > 90 && v >= thr.healthy) tRecover = t;
        }
      }

      // ---- copy ----
      const wrap = el("div", "ah-wrap", root);
      const copy = el("div", "ah-copy", wrap);
      const left = el("div", "ah-copy-l", copy);
      el("div", "ah-eyebrow", left, content.eyebrow || "");
      el("div", "ah-h", left, content.heading || "");
      if (content.sub) el("div", "ah-sub", copy, content.sub);

      // ---- the table: one grid, rows share its columns through subgrid ----
      const card = el("div", "ah-card", wrap);
      const tmpl = ["max-content", "max-content", "max-content", SW + "px", ...(hasMeta ? ["max-content"] : []), "max-content"];
      card.style.gridTemplateColumns = tmpl.join(" ");
      const head = el("div", "ah-row ah-head", card);
      const hc = (txt) => el("div", "ah-hc", head, txt || "");
      hc(cols.account); hc(cols.segment); hc(cols.health);
      const trendHead = el("div", "ah-hc ah-hc-trend", head);
      el("span", "", trendHead, cols.trend || "");
      const cursor = el("span", "ah-cursor", trendHead, "");
      if (hasMeta) hc(cols.meta);
      hc(cols.owner);

      const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
      const R = rows.map((r, i) => {
        const row = el("div", "ah-row ah-item", card);
        row.style.gridTemplateRows = `${rowH}px` + (i === inc ? " auto" : "");
        const bar = el("div", "ah-bar", row);
        // account
        const acc = el("div", "ah-acc", row);
        const markBg = pal[i % pal.length];
        const mark = el("span", "ah-mark", acc, r.mark || initials(r.name));
        mark.style.background = markBg;
        mark.style.color = h.inkOn(markBg);
        el("span", "ah-name", acc, r.name);
        // segment
        const segC = el("div", "ah-cell", row);
        el("span", "ah-seg", segC, r.segment || "");
        // health
        const hcell = el("div", "ah-cell ah-health", row);
        const score = el("span", "ah-score", hcell, "");
        const pill = el("span", "ah-pill", hcell);
        const dot = el("span", "ah-dot", pill);
        const stack = el("span", "ah-pill-stack", pill);
        const lab = ["healthy", "watch", "risk"].map((k) => el("span", "ah-pill-l", stack, states[k] || k));
        // trend
        const tcell = el("div", "ah-cell ah-trend", row);
        const s = svg("svg", { width: SW, height: SH, viewBox: `0 0 ${SW} ${SH}`, class: "ah-spark" }, tcell);
        s.style.top = ((rowH - SH) / 2).toFixed(1) + "px";
        const defs = svg("defs", {}, s);
        const gid = `ah-g-${i}`, cid = `ah-c-${i}`;
        const grad = svg("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 0, y2: SH }, defs);
        const oH = h.clamp(yOf(thr.healthy) / SH), oW = h.clamp(yOf(thr.watch) / SH);
        [[0, NEUTRAL], [oH, NEUTRAL], [oH, WARN], [oW, WARN], [oW, RISK], [1, RISK]].forEach(([o, c]) => svg("stop", { offset: o.toFixed(4), "stop-color": c }, grad));
        const clipRect = svg("rect", { x: 0, y: -4, width: 0, height: SH + 8 }, svg("clipPath", { id: cid }, defs));
        // the watch threshold, faint, so a line crossing it reads as crossing something
        svg("line", { x1: 0, x2: SW, y1: yOf(thr.watch).toFixed(1), y2: yOf(thr.watch).toFixed(1), stroke: C.line, "stroke-width": ui.stroke("hair", 1), "stroke-dasharray": "2 4" }, s);
        const pts = r.series.map((v, k) => [xOf(k / (r.series.length - 1)), yOf(v)]);
        const dLine = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
        const g = svg("g", { "clip-path": `url(#${cid})` }, s);
        // sm-native: the sparkline is data; its weight stays with the data
        const line = svg("path", { d: dLine, fill: "none", stroke: `url(#${gid})`, "stroke-width": 1.8, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
        // sm-native: state cues around the tip, not outline style
        const ping = svg("circle", { r: 4, fill: "none", stroke: GOOD, "stroke-width": 1.5, opacity: 0 }, s);
        // sm-native: the tip's surface halo separates it from the line; not an outline
        const tip = svg("circle", { r: 3.5, fill: GOOD, stroke: C.surface, "stroke-width": 1.5 }, s);
        let mk = null;
        if (i === inc) {
          const xT = xOf(pT), yT = yOf(r.series[trough]);
          // sm-native: the trough marker is a state cue
          const ring = svg("circle", { cx: xT.toFixed(1), cy: yT.toFixed(1), r: 5, fill: C.surface, stroke: RISK, "stroke-width": 1.6, opacity: 0 }, s);
          const stem = el("div", "ah-stem", tcell);
          const top = (rowH - SH) / 2 + yT + 6;
          Object.assign(stem.style, { left: (xT - 0.5).toFixed(1) + "px", top: top.toFixed(1) + "px", height: (rowH + 8 - top).toFixed(1) + "px" });
          const chip = el("div", "ah-chip", tcell);
          Object.assign(chip.style, { left: (xT - 14).toFixed(1) + "px", top: rowH + 8 + "px" });
          const pb = r.playbook;
          el("span", "ah-chip-dot", chip);
          el("span", "ah-chip-k", chip, (pb.label || "Playbook") + ":");
          el("span", "ah-chip-n", chip, pb.name || "");
          const st = el("span", "ah-chip-st", chip);
          const pend = el("span", "ah-chip-pend", st, pb.pending ? "· " + pb.pending : "");
          const sent = el("span", "ah-chip-sent", st, "· " + (pb.status || "sent") + " ✓");
          const strip = el("div", "ah-strip", row);
          mk = { ring, stem, chip, pend, sent, strip };
        }
        // meta and owner
        if (hasMeta) el("div", "ah-cell ah-meta", row, r.meta || "");
        const own = el("div", "ah-cell ah-own", row);
        const ownerName = typeof r.owner === "string" ? r.owner : (r.owner && r.owner.name) || "";
        el("span", "ah-av", own, (r.owner && r.owner.initials) || initials(ownerName));
        el("span", "ah-own-n", own, ownerName);
        return { row, bar, score, pill, dot, lab, clipRect, line, tip, ping, mk, series: r.series };
      });

      // ---- footer: a segmented bar and the derived count ----
      const foot = el("div", "ah-foot", wrap);
      const fbar = el("div", "ah-fbar", foot);
      const seg = ["healthy", "watch", "risk"].map((k) => { const sEl = el("span", "ah-fseg", fbar); sEl.style.background = { healthy: GOOD, watch: WARN, risk: RISK }[k]; return sEl; });
      const fText = el("span", "ah-ftext", foot, "");
      const spacer = el("div", "ah-spacer", wrap);

      return { R, card, inc, pAt, valAt, xOf, yOf, thr, tFire, tRisk, tRecover, STRIP, SW, days, cursor, seg, fText, spacer, head,
        tpl: { footer: content.footer || "{healthy} of {total} healthy · {risk} at risk", cursor: content.cursor || "" },
        col: { GOOD, WARN, RISK, surface: C.surface, ink: C.ink, positiveText: C.positiveText || C.positive, warningText: C.warningText || C.warning, onWarning: C.onWarning || C.ink, n } };
    },

    render(t, S, h) {
      const { tw, clamp, mix } = h;
      const { thr, col } = S;
      const p = S.pAt(t);
      const out = 1 - tw(t, 12.2, 0.8, "inOut");
      const vis = tw(t, 1.4, 0.45, "snappy") * out;
      // a soft band around each threshold so a state changes over a few frames, not one
      const band = (v, edge) => clamp((v - (edge - 1.5)) / 3);
      const blend3 = (a, b, c, wa, wb, wc) => mix(mix(a, b, wb / Math.max(1e-6, wa + wb)), c, wc);

      // intro: header and rows settle in once; everything is in place by the loop point
      const intro = (k) => tw(t, 0.05 + Math.min(0.5, h.motion.stagger(k, 0.075)), 0.6, "signature");
      const ih = intro(0);
      S.head.style.opacity = ih.toFixed(3);
      S.card.style.opacity = tw(t, 0, 0.4, "snappy").toFixed(3);
      S.head.style.transform = `translateY(${((1 - ih) * 12).toFixed(1)}px)`;

      const totals = { healthy: 0, watch: 0, risk: 0 }, wsum = [0, 0, 0];
      let stripH = 0;
      S.R.forEach((r, i) => {
        const ir = intro(i + 1);
        r.row.style.opacity = ir.toFixed(3);
        r.row.style.transform = `translateY(${((1 - ir) * 14).toFixed(1)}px)`;
        const v = S.valAt(r.series, p);
        const wg = band(v, thr.healthy), wr = 1 - band(v, thr.watch), ww = Math.max(0, 1 - wg - wr);
        wsum[0] += wg; wsum[1] += ww; wsum[2] += wr;
        totals[v >= thr.healthy ? "healthy" : v >= thr.watch ? "watch" : "risk"]++;
        const x = S.xOf(p), y = S.yOf(v);
        h.set(r.clipRect, { width: (x + 1).toFixed(1) });
        const lineOp = (clamp((t - 1.45) / 0.15) * out).toFixed(3);
        h.set(r.line, { opacity: lineOp });
        const tipC = blend3(col.GOOD, col.WARN, col.RISK, wg, ww, wr);
        h.set(r.tip, { cx: x.toFixed(1), cy: y.toFixed(1), fill: tipC, opacity: lineOp });
        // score and pill
        h.text(r.score, String(Math.round(v)));
        r.score.style.opacity = vis.toFixed(3);
        const bgG = mix(col.surface, col.GOOD, 0.16), bgW = mix(col.surface, col.WARN, 0.22);
        const bg = blend3(bgG, bgW, col.RISK, wg, ww, wr);
        r.pill.style.background = bg;
        r.pill.style.opacity = vis.toFixed(3);
        r.dot.style.background = tipC;
        const fg = h.textOn(bg, wr > 0.5 ? col.onWarning : wg > 0.5 ? col.positiveText : col.warningText);
        r.lab.forEach((l, k) => { l.style.opacity = [wg, ww, wr][k].toFixed(3); l.style.color = fg; });

        // the row: tinted while it is in trouble, and a quiet green once the playbook has brought it back
        let ping = 0, res = 0;
        if (i === S.inc) {
          const m = r.mk;
          res = tw(t, S.tRecover, 0.6, "soft") * out;
          const open = tw(t, S.tFire - 0.4, 0.45, "snappy") * out;
          stripH = S.STRIP * open;
          m.strip.style.height = stripH.toFixed(1) + "px";
          const chipIn = tw(t, S.tFire, 0.45, "snappy") * out;
          m.chip.style.opacity = chipIn.toFixed(3);
          m.chip.style.transform = `translateY(${((1 - chipIn) * 8).toFixed(1)}px)`;
          m.stem.style.opacity = (tw(t, S.tFire + 0.1, 0.3, "snappy") * out).toFixed(3);
          const sent = tw(t, S.tFire + 0.55, 0.35, "snappy");
          m.pend.style.opacity = (1 - sent).toFixed(3);
          m.sent.style.opacity = sent.toFixed(3);
          const ringIn = tw(t, S.tFire - 0.05, 0.35, "snappy") * out;
          h.set(m.ring, { opacity: ringIn.toFixed(3) });
          // the recovery: one ping from the tip as the score crosses back into healthy
          ping = tw(t, S.tRecover, 0.9, "soft");
          const pr = tw(t, S.tRisk, 0.7, "soft");
          const pc = ping > 0 ? col.GOOD : col.RISK, pk = ping > 0 ? ping : pr;
          h.set(r.ping, { cx: x.toFixed(1), cy: y.toFixed(1), r: (4 + pk * 14).toFixed(1), stroke: pc, opacity: (pk > 0 && pk < 1 ? (1 - pk) * 0.9 * out : 0).toFixed(3) });
          r.pill.style.boxShadow = ping > 0 && ping < 1 ? `0 0 0 ${(ping * 6).toFixed(1)}px ${h.alpha(col.GOOD, (1 - ping) * 0.35)}` : "none";
        }
        const tint = mix(mix(mix(col.surface, col.WARN, 0.07 * ww), col.RISK, 0.08 * wr), col.GOOD, 0.07 * res * wg);
        const tinted = wr + ww + res > 0.001 && out > 0;
        r.row.style.background = tinted ? mix(col.surface, tint, out) : "";
        r.bar.style.background = blend3(col.GOOD, col.WARN, col.RISK, wg, ww, wr);
        r.bar.style.opacity = (Math.max(wr, ww * 0.6, res) * out).toFixed(3);
      });
      S.spacer.style.height = (S.STRIP - stripH).toFixed(1) + "px";

      // footer: the bar splits by state weight, the line counts rows by threshold
      const total = S.R.length;
      S.seg.forEach((sEl, k) => { sEl.style.flexGrow = (wsum[k] / total).toFixed(4); });
      const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (k === "total" ? total : k === "day" ? 1 + Math.round(p * (S.days - 1)) : k === "days" ? S.days : totals[k] ?? ""));
      h.text(S.fText, fill(S.tpl.footer));
      S.fText.parentNode.style.opacity = vis.toFixed(3);
      h.text(S.cursor, fill(S.tpl.cursor));
      S.cursor.style.opacity = vis.toFixed(3);
    },
  });
})();
