/* parchment-changelog: release history as a hanging scroll (SVG + DOM, closed-form).
 * A wooden roller hangs from a nail; the parchment unrolls downward one release at a time, its loose end wound on
 * a curl that turns as it drops. Each row is inked as it appears: version and date are written on, tag stamps press
 * in, the item text is written after its stamp. The ink goes on wet and blue-black, settles to its tone, then ages
 * toward sepia as newer rows arrive (iron-gall ink does exactly that). The tally counts stamps that are inked and
 * still unrolled, so it lands on the content's total and counts back down as the scroll rolls up before the seam.
 * Deckled edges are a fixed seeded path in paper coordinates: the paper never slides, it only unrolls.
 */
(function () {
  const D = 13, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.8,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, alpha, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("pc");
      const rand = rng(content.seed || 23);

      // ---- colour ----
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
      const near = (hue) => pal.filter((c) => hsl(c)[1] > 0.15).sort((a, b) => hueDist(hsl(a)[0], hue) - hueDist(hsl(b)[0], hue))[0] || C.accent;
      const warm = near(36), cool = near(220);
      const light = lum(C.paper) > 0.5;
      const deep = light ? C.ink : C.paper, bright = light ? C.surface : C.ink;
      const tone = (p) => mix(warm, deep, p), lift = (p) => mix(warm, bright, p);
      const paperC = mix(C.raised || C.surface, warm, light ? 0.32 : 0.14);
      const INK = ui.strokeColor(C.stroke || C.ink);
      // ink states: wet blue-black, settled, aged sepia
      const inkWet = mix(C.ink, cool, light ? 0.32 : 0.25), inkSet = mix(C.ink, paperC, light ? 0.1 : 0.08), inkFaded = mix(mix(C.ink, warm, 0.45), paperC, light ? 0.38 : 0.42);
      // aged entries fade toward the paper, but only as far as still reads at AA: an old release stays legible
      const inkOld = h.textOn(paperC, inkFaded);
      // a tag pill's text on its own tint of the paper, at AA (judged on a deeper tint than drawn, for margin)
      const pillInk = (col) => h.textOn(mix(paperC, col, light ? 0.4 : 0.3), mix(col, C.ink, light ? 0.55 : 0.2));
      const tagCol = { new: C.accent, improved: cool, fixed: C.warning || near(30) };

      // ---- layout ----
      const PX = 770, PW = 660, TOP = 142; // paper left, width, top edge (under the roller)
      const releases = content.releases;
      let y = TOP + 30;
      const rows = releases.map((rel) => {
        const hgt = Math.max(54, rel.items.length * 27) + 30;
        const r = { rel, top: y, hgt };
        y += hgt;
        return r;
      });
      const FULL = y + 2, BASE = TOP + 6;
      // ---- timing: unroll one row, then ink it ----
      const U0 = 0.5, USTEP = 1.32, UDUR = 0.62;
      rows.forEach((r, i) => {
        r.u = U0 + i * USTEP;
        r.ink = r.u + 0.36;
        r.verEnd = r.ink + 0.32;
        r.items = r.rel.items.map(([tag, txt], k) => {
          const stamp = r.ink + 0.28 + k * 0.28;
          return { tag, txt, stamp, write: stamp + 0.14, dur: Math.max(0.35, txt.length / 52) };
        });
        r.target = r.top + r.hgt;
      });
      const ROLL = 10.7, RDUR = 1.4, DONE = ROLL + RDUR;

      // ---- drawing: back layer (shadow, paper, rules) ----
      const back = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "pc-svg" }, root);
      const defs = svg("defs", {}, back);
      const clip = svg("clipPath", { id: "pc-clip" }, defs);
      const clipRect = svg("rect", { x: PX - 20, y: TOP - 10, width: PW + 40, height: 0 }, clip);
      // deckle: fixed per paper y, every 5 px, two sides
      const STEP = 5, NS = Math.ceil((H - TOP) / STEP) + 2;
      const dk = () => { const a = []; let v = 0; for (let k = 0; k < NS; k++) { v = v * 0.55 + (rand() - 0.5) * 3.4; a.push(v + Math.sin(k * 0.21 + 1.3) * 1.2); } return a; };
      const dl = dk(), dr = dk();
      const paperD = (bottom) => {
        const kEnd = Math.max(1, Math.ceil((bottom - TOP) / STEP));
        let d = `M${PX + dl[0]} ${TOP}`;
        for (let k = 1; k <= kEnd; k++) d += `L${(PX + dl[k]).toFixed(1)} ${Math.min(bottom, TOP + k * STEP).toFixed(1)}`;
        d += `L${(PX + PW + dr[kEnd]).toFixed(1)} ${bottom.toFixed(1)}`;
        for (let k = kEnd; k >= 0; k--) d += `L${(PX + PW + dr[k]).toFixed(1)} ${Math.min(bottom, TOP + k * STEP).toFixed(1)}`;
        return d + "Z";
      };
      // sm-native-start: the parchment and its cast shadow are material fills with a deckled edge
      const shadow = svg("path", { fill: alpha(deep, light ? 0.1 : 0.32), transform: "translate(12 14)" }, back);
      const paper = svg("path", { fill: paperC, stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linejoin": "round" }, back);
      // a faint darkening just inside each edge, like handled vellum
      const edgeTint = svg("path", { fill: "none", stroke: mix(paperC, warm, 0.55), "stroke-width": 7, opacity: 0.45, "clip-path": "url(#pc-clip)" }, back);
      // sm-native-end
      // ruled lines under each row, hand-drawn (fixed wobble), drawn on after the row is inked
      const rules = rows.map((r, i) => {
        if (i === rows.length - 1) return null;
        let d = `M${PX + 34} ${r.top + r.hgt - 12}`;
        for (let x = PX + 34 + 24; x <= PX + PW - 34; x += 24) d += `L${x} ${(r.top + r.hgt - 12 + (rand() - 0.5) * 1.6).toFixed(1)}`;
        const p = svg("path", { d, fill: "none", stroke: inkFaded, "stroke-width": ui.stroke("fine", 1.2), "stroke-linecap": "round", "clip-path": "url(#pc-clip)" }, back);
        return { p, len: PW - 68 };
      });

      // ---- the writing (DOM, clipped to the unrolled paper) ----
      const sheet = el("div", "pc-sheet", root);
      Object.assign(sheet.style, { left: PX + "px", top: TOP + "px", width: PW + "px", height: H - TOP + "px" });
      rows.forEach((r) => {
        const row = el("div", "pc-row", sheet);
        row.style.top = r.top - TOP + "px";
        const ver = el("div", "pc-ver", row);
        r.verEl = el("div", "pc-ver-n", ver, r.rel.version);
        r.dateEl = el("div", "pc-date", ver, r.rel.date);
        const list = el("div", "pc-items", row);
        r.items.forEach((it) => {
          const line = el("div", "pc-item", list);
          it.pill = el("span", "pc-pill", line, (content.tags || {})[it.tag] || it.tag);
          const col = tagCol[it.tag] || C.accent;
          it.pill.style.color = pillInk(col);
          it.pill.style.background = alpha(col, light ? 0.28 : 0.2);
          it.pill.style.boxShadow = `inset 0 0 0 1.5px ${mix(col, C.ink, light ? 0.35 : 0.1)}`;
          it.rot = (rand() - 0.5) * 6;
          it.txtEl = el("span", "pc-text", line, it.txt);
        });
      });

      // ---- front layer: the curl, the roller, the cord ----
      const front = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "pc-svg" }, root);
      const RX0 = PX - 54, RX1 = PX + PW + 54, RY = TOP - 4;
      // sm-native-start: wood, cord and the paper curl are drawn objects (fills, grain, highlight bands)
      const nail = [PX + PW / 2, 62];
      svg("path", { d: `M${RX0 + 30} ${RY} L${nail[0]} ${nail[1]} L${RX1 - 30} ${RY}`, fill: "none", stroke: tone(light ? 0.5 : 0.3), "stroke-width": 3, "stroke-linejoin": "round" }, front);
      svg("circle", { cx: nail[0], cy: nail[1], r: 7, fill: C.faint || C.muted, stroke: INK, "stroke-width": ui.stroke("regular", 2) }, front);
      svg("circle", { cx: nail[0] - 1.5, cy: nail[1] - 1.5, r: 2, fill: bright }, front);
      // the curl (loose end of the scroll): a paper roll whose end spiral turns as it unrolls
      const curl = svg("g", {}, front);
      const CR = 15;
      svg("rect", { x: PX - 8, y: -CR, width: PW + 16, height: CR * 2, rx: CR, fill: mix(paperC, deep, light ? 0.08 : 0.12), stroke: INK, "stroke-width": ui.stroke("regular", 2) }, curl);
      svg("rect", { x: PX + 4, y: -CR + 5, width: PW - 8, height: 4, rx: 2, fill: mix(paperC, bright, 0.5), opacity: 0.8 }, curl);
      svg("rect", { x: PX + 4, y: CR - 8, width: PW - 8, height: 3, rx: 1.5, fill: mix(paperC, deep, 0.25), opacity: 0.6 }, curl);
      const spirals = [PX - 8 + CR, PX + PW + 8 - CR].map((cx) => {
        svg("circle", { cx, cy: 0, r: CR - 1, fill: mix(paperC, deep, 0.05), stroke: INK, "stroke-width": ui.stroke("fine", 1.5) }, curl);
        let d = "";
        for (let k = 0; k <= 40; k++) { const a = k * 0.42, rr = 1.5 + k * 0.3; d += `${k ? "L" : "M"}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`; }
        const g = svg("g", { transform: `translate(${cx} 0)` }, curl);
        return svg("path", { d, fill: "none", stroke: mix(paperC, light ? deep : C.ink, 0.5), "stroke-width": 1.3, "stroke-linecap": "round" }, g);
      });
      // the roller: a turned dowel with knobs
      const wood = tone(light ? 0.18 : 0.05), woodDark = tone(light ? 0.45 : 0.4), woodHi = lift(0.35);
      svg("rect", { x: RX0, y: RY - 16, width: RX1 - RX0, height: 32, rx: 16, fill: wood, stroke: INK, "stroke-width": ui.stroke("regular", 2) }, front);
      svg("rect", { x: RX0 + 14, y: RY - 10, width: RX1 - RX0 - 28, height: 5, rx: 2.5, fill: woodHi, opacity: 0.9 }, front);
      svg("rect", { x: RX0 + 14, y: RY + 6, width: RX1 - RX0 - 28, height: 5, rx: 2.5, fill: woodDark, opacity: 0.55 }, front);
      for (let k = 0; k < 9; k++) { const x = RX0 + 60 + rand() * (RX1 - RX0 - 120), w = 40 + rand() * 70; svg("path", { d: `M${x.toFixed(1)} ${(RY - 2 + rand() * 6).toFixed(1)} q${(w / 2).toFixed(1)} ${(rand() * 3 - 1.5).toFixed(1)} ${w.toFixed(1)} 0`, fill: "none", stroke: woodDark, "stroke-width": 1, opacity: 0.5 }, front); }
      [RX0 - 4, RX1 + 4].forEach((cx) => {
        svg("circle", { cx, cy: RY, r: 22, fill: tone(light ? 0.3 : 0.15), stroke: INK, "stroke-width": ui.stroke("regular", 2) }, front);
        svg("circle", { cx, cy: RY, r: 13, fill: "none", stroke: woodDark, "stroke-width": 2 }, front);
        svg("circle", { cx: cx - 6, cy: RY - 7, r: 4, fill: woodHi, opacity: 0.85 }, front);
      });
      // sm-native-end

      // ---- copy and tally ----
      const copy = el("div", "pc-copy", root);
      el("div", "pc-eyebrow", copy, content.eyebrow || "");
      el("div", "pc-h", copy, content.heading || "");
      el("div", "pc-sub", copy, content.sub || "");
      const tally = el("div", "pc-tally", root);
      const tallyN = el("b", "pc-tally-n", tally, "0");
      el("span", "pc-tally-l", tally, content.tallyLabel || "changes");
      const tagRow = el("div", "pc-tags", tally);
      const tagKeys = Object.keys(tagCol).filter((k) => rows.some((r) => r.items.some((it) => it.tag === k)));
      const tagCounts = tagKeys.map((k) => {
        const cell = el("div", "pc-tag", tagRow);
        const pill = el("span", "pc-pill", cell, (content.tags || {})[k] || k);
        const col = tagCol[k];
        pill.style.color = pillInk(col);
        pill.style.background = alpha(col, light ? 0.28 : 0.2);
        pill.style.boxShadow = `inset 0 0 0 1.5px ${mix(col, C.ink, light ? 0.35 : 0.1)}`;
        return { k, n: el("b", "", cell, "0") };
      });
      return { rows, rules, sheet, paper, shadow, edgeTint, clipRect, paperD, curl, spirals, CR, BASE, TOP, PX, PW, H, UDUR, ROLL, RDUR, DONE, inkWet, inkSet, inkOld, tallyN, tagCounts, mix };
    },

    render(t, S, h) {
      const { tw, set, text, lerp } = h;
      // where the curl is: unrolled row by row, then rolled back up
      let yb = S.BASE;
      S.rows.forEach((r) => { yb = lerp(yb, r.target, tw(t, r.u, S.UDUR, "signature")); });
      yb = lerp(yb, S.BASE, tw(t, S.ROLL, S.RDUR, "inOut"));
      const live = t < S.DONE; // after the roll-up every row is back to un-inked, as at t = 0
      const pd = S.paperD(yb);
      set(S.paper, { d: pd }); set(S.shadow, { d: pd }); set(S.edgeTint, { d: pd });
      set(S.clipRect, { height: Math.max(0, yb - S.TOP + 10).toFixed(1) });
      S.sheet.style.clipPath = `inset(0 0 ${Math.max(0, S.H - yb).toFixed(1)}px 0)`;
      set(S.curl, { transform: `translate(0 ${yb.toFixed(1)})` });
      const turn = ((yb - S.BASE) / S.CR) * (180 / Math.PI);
      S.spirals.forEach((sp, k) => set(sp, { transform: `rotate(${(k ? -turn : turn).toFixed(1)})` }));

      // ink: wet → settled; then aged by each newer row that is inked after it
      const tally = {}; let total = 0;
      S.rows.forEach((r, i) => {
        const settle = tw(t, r.ink + 0.5, 1.3, "soft");
        let age = 0;
        for (let q = i + 1; q < S.rows.length; q++) age += 0.3 * tw(t, S.rows[q].ink, 0.9, "soft");
        age = Math.min(1, age);
        const col = S.mix(S.mix(S.inkWet, S.inkSet, settle), S.inkOld, age);
        const wet = (1 - settle) * (t >= r.ink ? 1 : 0);
        const glow = wet > 0.01 ? `0 0 ${(2.5 * wet).toFixed(2)}px ${col}` : "none";
        const write = (node, start, dur) => {
          const p = live ? tw(t, start, dur, "linear") : 0;
          node.style.clipPath = `inset(-6px ${((1 - p) * 100).toFixed(2)}% -6px -2px)`;
          node.style.color = col;
          node.style.textShadow = glow;
        };
        write(r.verEl, r.ink, 0.3);
        write(r.dateEl, r.ink + 0.18, 0.32);
        r.items.forEach((it, k) => {
          const visible = yb > r.top + 15 + k * 27 + 16;
          const st = live ? tw(t, it.stamp, 0.36, "snappy") : 0;
          const sc = 1 + (1 - st) * 0.45;
          it.pill.style.opacity = (Math.min(1, st * 2.2) * (1 - age * 0.35)).toFixed(3);
          it.pill.style.transform = `rotate(${(it.rot * (0.4 + 0.6 * st)).toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          write(it.txtEl, it.write, it.dur);
          if (st > 0.5 && visible) { tally[it.tag] = (tally[it.tag] || 0) + 1; total++; }
        });
        const rule = S.rules[i];
        if (rule) {
          const p = live ? tw(t, r.items[r.items.length - 1].write + 0.2, 0.5, "soft") : 0;
          set(rule.p, { "stroke-dasharray": `${rule.len + 20}`, "stroke-dashoffset": ((1 - p) * (rule.len + 20)).toFixed(1) });
        }
      });
      text(S.tallyN, String(total));
      S.tagCounts.forEach((c) => text(c.n, String(tally[c.k] || 0)));
    },
  });
})();
