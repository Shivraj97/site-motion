/* score-sheet--hero: one agent run played as a single phrase, resolving into a chord (SVG).
 * The parent writes a whole multi-agent run as a score and sweeps a playhead across parallel bars. The hero keeps
 * the material (staves are agents, notes are steps, the stave string sounds when its agent works) and reduces it
 * to three wide, quiet five-line staves under a large headline (up to six: more staves draw smaller to fit). One run plays across them as a melodic line:
 * a cursor travels note to note, each note lands on the stave of the agent doing that step, and after the last
 * step the line comes to rest on a chord, one notehead per stave on a single stem, with the result beside it.
 * The summary's step count is the number of notes the phrase played. Everything clears before the seam.
 */
(function () {
  const D = 12, W = 1600, H = 900, STILL = 9.2;
  const T0 = 0.9, BT = 0.45; // first note at T0, then one beat every BT seconds
  const OUT = 10.7; // the phrase, the chord and the tag fade out from here, and are gone well before D

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: STILL,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("ssh");
      const head = el("div", "ssh-copy", root);
      el("div", "ssh-eyebrow", head, content.eyebrow || "");
      el("div", "ssh-h", head, content.heading || "");
      if (content.sub) el("div", "ssh-sub", root, content.sub);

      // the system: three staves (up to six), names in the margin, a bracket on the left and a final double bar on the right
      const LEFT = 216, END = 1252, X0 = 300, XC = 1172;
      const staveNames = content.staves.slice(0, 6);
      const n = staveNames.length;
      // up to three staves keep the hero's wide spacing; four to six shrink the staff to fit the same band (y 404–836)
      const SP = n <= 3 ? 20 : Math.min(16, Math.floor(((432 - 30 * (n - 1)) / (4 * n)) * 10) / 10);
      const GAP = n <= 3 ? 150 : 4 * SP + 30;
      const CY0 = n <= 3 ? (n === 3 ? 452 : n === 2 ? 527 : 602) : 620 - ((n - 1) * GAP) / 2;
      const LABEL_DY = n <= 3 ? 12 : 6;
      const notesIn = content.notes.filter((q) => q.stave < n);
      const beats = content.beats || Math.max(...notesIn.map((q) => q.at)) + 2;
      const bw = (XC - X0) / beats;
      const yOf = (cy, pitch) => cy + 2 * SP - (pitch * SP) / 2; // pitch 0 = bottom line, 8 = top line
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ssh-svg" }, root);
      const quiet = mix(C.ink, C.paper, 0.8);
      const staves = staveNames.map((name, i) => {
        const cy = CY0 + i * GAP;
        for (const k of [-2, -1, 1, 2]) svg("line", { x1: LEFT, y1: cy + k * SP, x2: END, y2: cy + k * SP, stroke: quiet, "stroke-width": ui.stroke("hair", 1) }, s);
        // the middle line is the parent's string: it sounds when a note lands on this stave
        const string = svg("path", { d: `M${LEFT} ${cy}H${END}`, fill: "none", stroke: quiet, "stroke-width": ui.stroke("hair", 1) }, s);
        const label = el("div", "ssh-name", root, name);
        label.style.top = cy - 9 + "px";
        return { cy, string, colour: pal[(i + 1) % pal.length] };
      });
      const sysTop = CY0 - 2 * SP, sysBot = CY0 + (n - 1) * GAP + 2 * SP;
      const frame = mix(C.ink, C.paper, 0.45);
      svg("path", { d: `M${LEFT + 12} ${sysTop - 10} H${LEFT} V${sysBot + 10} H${LEFT + 12}`, fill: "none", stroke: frame, "stroke-width": ui.stroke("bold", 3) }, s);
      for (let i = 0; i < n; i++) svg("line", { x1: LEFT, y1: staves[i].cy - 2 * SP, x2: LEFT, y2: staves[i].cy + 2 * SP, stroke: frame, "stroke-width": ui.stroke("hair", 1) }, s);
      svg("line", { x1: END - 9, y1: sysTop, x2: END - 9, y2: sysBot, stroke: frame, "stroke-width": ui.stroke("hair", 1.2) }, s);
      svg("line", { x1: END, y1: sysTop, x2: END, y2: sysBot, stroke: frame, "stroke-width": ui.stroke("bold", 4) }, s);

      // the phrase line runs under the noteheads; segments are drawn one by one as the cursor travels them
      const phraseLayer = svg("g", {}, s);
      const noteLayer = svg("g", {}, s);
      const K = SP / 20, RX = 20 * K, RY = 14 * K, TILT = -20;
      const NOTE = ui.stroke("regular", 1.6), INK = ui.strokeColor(C.ink);
      const notes = notesIn.map((q) => {
        const st = staves[q.stave];
        const x = X0 + q.at * bw, y = yOf(st.cy, q.pitch ?? 4);
        const g = svg("g", { opacity: 0 }, noteLayer);
        const ring = svg("ellipse", { cx: x, cy: y, rx: RX, ry: RY, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, noteLayer); // sm-native: the ping as a note sounds is a state cue
        svg("ellipse", { cx: 0, cy: 0, rx: RX, ry: RY, transform: `rotate(${TILT})`, fill: st.colour, stroke: INK, "stroke-width": NOTE }, g);
        const label = el("div", "ssh-label", root, q.label || "");
        label.style.left = x + "px";
        label.style.top = st.cy + 2 * SP + LABEL_DY + "px";
        return { ...q, x, y, g, ring, label, cy: st.cy };
      });
      notes.sort((a, b) => a.at - b.at);

      // the chord: one head per stave on one stem, rolled outward from the stave the phrase lands on
      const pitches = (content.result && content.result.chord) || [];
      const last = notes[notes.length - 1];
      const land = last ? last.stave : n - 1;
      const chordHeads = staves.map((st, i) => {
        const y = yOf(st.cy, pitches[i] ?? 4);
        const g = svg("g", { opacity: 0 }, noteLayer);
        svg("ellipse", { cx: 0, cy: 0, rx: RX + 3 * K, ry: RY + 2 * K, transform: `rotate(${TILT})`, fill: C.ink }, g);
        const ring = svg("ellipse", { cx: XC, cy: y, rx: RX + 3 * K, ry: RY + 2 * K, fill: "none", stroke: C.accent, "stroke-width": 2.5, opacity: 0 }, noteLayer); // sm-native: the ping as the chord sounds is a state cue
        return { i, y, g, ring, order: Math.abs(i - land) };
      });
      const yTop = Math.min(...chordHeads.map((c) => c.y)), yBot = Math.max(...chordHeads.map((c) => c.y));
      const STEM_X = XC + RX + 1;
      const stemTop = yTop - 3.5 * SP;
      const stem = svg("line", { x1: STEM_X, y1: yBot, x2: STEM_X, y2: stemTop, stroke: C.ink, "stroke-width": 3.5, "stroke-linecap": "round" }, noteLayer); // sm-native: the chord's stem is a data mark
      const stemLen = yBot - stemTop;
      // a rolled-chord squiggle beside the heads, drawn in the order the heads sound
      const AX = XC - 46;
      const up = land >= (n - 1) / 2;
      let ad = "";
      const a0 = yTop - 14, a1 = yBot + 14, steps = Math.round((a1 - a0) / 12);
      for (let k = 0; k <= steps; k++) {
        const yy = up ? a1 - (k * (a1 - a0)) / steps : a0 + (k * (a1 - a0)) / steps;
        ad += `${k ? "L" : "M"}${(AX + (k % 2 ? 5 : -5)).toFixed(1)} ${yy.toFixed(1)}`;
      }
      const arp = svg("path", { d: ad, fill: "none", stroke: C.ink, "stroke-width": 2, "stroke-linejoin": "round" }, phraseLayer); // sm-native: the arpeggio mark is part of the chord

      // phrase points: every note, then the chord head on the landing stave
      const pts = notes.map((q) => [q.x, q.y]).concat([[XC, chordHeads[land] ? chordHeads[land].y : yBot]]);
      const ats = notes.map((q) => q.at).concat([beats]);
      const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        const d = `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} C ${c1.map((v) => v.toFixed(1)).join(" ")}, ${c2.map((v) => v.toFixed(1)).join(" ")}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        const path = svg("path", { d, fill: "none", stroke: mix(C.accent, C.ink, 0.22), "stroke-width": ui.stroke("bold", 3), "stroke-linecap": "round" }, phraseLayer); // the phrase is a data mark
        segs.push({ path, len: 0, a: ats[i], b: ats[i + 1] });
      }
      const cursor = svg("g", { opacity: 0 }, s);
      svg("circle", { cx: 0, cy: 0, r: 16, fill: C.accent, opacity: 0.18 }, cursor);
      svg("circle", { cx: 0, cy: 0, r: 7, fill: C.accent }, cursor);

      const tag = el("div", "ssh-tag", root);
      el("div", "ssh-tag-word", tag, (content.result && content.result.label) || "");
      const sum = el("div", "ssh-tag-sum", tag, "");
      tag.style.top = (chordHeads[Math.floor((n - 1) / 2)] ? staves[Math.floor((n - 1) / 2)].cy : CY0) - 34 + "px";
      const summary = (content.result && content.result.summary) || "{run} · {steps} steps · {seconds}s";
      const run = content.run || { name: "", seconds: 0 };

      return { notes, staves, segs, cursor, chordHeads, stem, stemLen, yBot, arp, tag, sum, summary, run, beats, LEFT, END, XC };
    },

    render(t, S, h) {
      const { tw, clamp, ease } = h;
      const tOf = (b) => T0 + b * BT;
      const beat = (t - T0) / BT;
      const out = 1 - tw(t, OUT, 0.6, "inOut");
      const tc = tOf(S.beats); // the phrase reaches the chord
      const resolved = tw(t, tc, 0.6, "soft");

      // notes land as the cursor reaches them; the current label reads in ink, the rest in muted
      let played = 0;
      S.notes.forEach((q, i) => {
        const ta = tOf(q.at);
        const pop = tw(t, ta, 0.55, "signature");
        const k = 0.55 + 0.45 * pop;
        q.g.setAttribute("transform", `translate(${q.x} ${q.y}) scale(${k.toFixed(3)})`);
        q.g.setAttribute("opacity", (clamp(pop * 3) * out).toFixed(3));
        const ping = tw(t, ta, 0.8, "soft");
        const g = ping * 18;
        h.set(q.ring, { rx: (20 + g).toFixed(1), ry: (14 + g * 0.8).toFixed(1), opacity: (ping > 0 && ping < 1 ? (1 - ping) * 0.8 * out : 0).toFixed(3) });
        const li = tw(t, ta + 0.05, 0.5, "signature");
        const next = S.notes[i + 1];
        const current = t >= ta && (next ? t < tOf(next.at) : t < tc);
        q.label.style.opacity = (li * out).toFixed(3);
        q.label.style.color = current ? "var(--c-ink)" : "var(--c-muted)";
        q.label.style.transform = `translate(-50%, ${((1 - li) * 8).toFixed(1)}px)`;
        if (t >= ta) played++;
      });

      // the phrase: each segment draws while the cursor travels it, easing out of one note and into the next
      let cx = null, cy = null;
      S.segs.forEach((sg) => {
        const len = sg.len || (sg.len = sg.path.getTotalLength());
        const p = ease.inOut(clamp((beat - sg.a) / (sg.b - sg.a)));
        sg.path.setAttribute("stroke-dasharray", `${(p * len).toFixed(1)} ${(len + 1).toFixed(1)}`);
        sg.path.setAttribute("opacity", (p > 0 ? out * (1 - 0.45 * resolved) : 0).toFixed(3)); // a zero-length round cap would still draw a dot
        if (beat >= sg.a && beat < sg.b) { const pt = sg.path.getPointAtLength(p * len); cx = pt.x; cy = pt.y; }
      });
      if (cx === null && S.segs.length) {
        const sg = S.segs[S.segs.length - 1];
        const pt = sg.path.getPointAtLength(beat >= sg.b ? sg.len : 0);
        cx = pt.x; cy = pt.y;
      }
      const cursorOn = tw(t, T0 - 0.35, 0.35, "soft") * (1 - tw(t, tc, 0.3, "soft"));
      S.cursor.setAttribute("transform", `translate(${(cx ?? 0).toFixed(1)} ${(cy ?? 0).toFixed(1)})`);
      S.cursor.setAttribute("opacity", (cursorOn * out).toFixed(3));

      // the chord rolls outward from the landing stave, then one stem joins it
      S.chordHeads.forEach((c) => {
        const at = tc + h.motion.stagger(c.order, 0.09);
        const pop = tw(t, at, 0.6, "signature");
        c.g.setAttribute("transform", `translate(${S.XC} ${c.y}) scale(${(0.5 + 0.5 * pop).toFixed(3)})`);
        c.g.setAttribute("opacity", (clamp(pop * 3) * out).toFixed(3));
        const ping = tw(t, at, 0.9, "soft");
        const g = ping * 30;
        h.set(c.ring, { rx: (23 + g).toFixed(1), ry: (16 + g * 0.8).toFixed(1), opacity: (ping > 0 && ping < 1 ? (1 - ping) * 0.9 * out : 0).toFixed(3) });
      });
      const arpLen = S.arp.__len || (S.arp.__len = S.arp.getTotalLength());
      const ap = tw(t, tc - 0.05, 0.35, "snappy");
      S.arp.setAttribute("stroke-dasharray", `${(ap * arpLen).toFixed(1)} ${(arpLen + 1).toFixed(1)}`);
      S.arp.setAttribute("opacity", (ap > 0 ? out : 0).toFixed(3));
      const sp = tw(t, tc + 0.22, 0.55, "signature");
      S.stem.setAttribute("stroke-dasharray", `${(sp * S.stemLen).toFixed(1)} ${(S.stemLen + 1).toFixed(1)}`);
      S.stem.setAttribute("opacity", (sp > 0 ? out : 0).toFixed(3));

      // each stave's middle line sounds when a note lands on it, and all of them at the chord
      S.staves.forEach((st, i) => {
        let amp = 0;
        const hit = (ta) => { const u = t - ta; if (u > 0 && u < 1) amp = Math.max(amp, Math.min(1, u / 0.06) * (1 - u) * (1 - u)); };
        S.notes.forEach((q) => { if (q.stave === i) hit(tOf(q.at)); });
        const c = S.chordHeads[i];
        if (c) hit(tc + h.motion.stagger(c.order, 0.09));
        amp *= 3.2 * out;
        if (amp < 0.02) { h.set(st.string, { d: `M${S.LEFT} ${st.cy}H${S.END}` }); return; }
        let d = "";
        for (let x = S.LEFT; x <= S.END; x += 6) {
          const env = Math.sin(((x - S.LEFT) / (S.END - S.LEFT)) * Math.PI); // fixed at both ends, like a string
          d += `${x === S.LEFT ? "M" : "L"}${x} ${(st.cy + Math.sin(x * 0.1 - t * 26) * amp * env).toFixed(2)}`;
        }
        st.string.setAttribute("d", d);
      });

      // the result: its step count is the number of notes the phrase played
      const ti = tw(t, tc + 0.4, 0.7, "signature");
      S.tag.style.opacity = (ti * out).toFixed(3);
      S.tag.style.transform = `translateX(${((1 - ti) * 24).toFixed(1)}px)`;
      const secs = Math.round(S.run.seconds * clamp(beat / S.beats));
      h.text(S.sum, S.summary.replace("{run}", S.run.name).replace("{steps}", String(played)).replace("{seconds}", String(secs)));
    },
  });
})();
