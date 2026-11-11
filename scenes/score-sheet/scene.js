/* score-sheet: a multi-agent run written as a musical score (SVG).
 * Each agent or tool is a stave, each step a note whose length is its duration, and dependencies are
 * slurs between notes on different staves. A playhead plays the score: notes light as it reaches them,
 * a short label says what the step did, slurs draw as work hands off, and parallel steps sound
 * together like a chord. It makes timing and parallelism, which flowcharts hide, obvious.
 *
 * content.legible (default false): a re-typeset layout for embeds shown smaller than the stage (about 0.75x on
 * a page, or a phone crop of [12, 166, 960, 540] without a heading). Staves span the full width and fill the frame vertically,
 * stave names sit above each stave, step labels sit inside the notes at 28px (stave names 30px, footer 20px,
 * bar numbers 16px), notes fill as the playhead travels through them, and corners stay <= 3px with no shadows.
 * Keep step labels short (about 12 characters for a 3-beat note). With legible false the scene draws exactly as before.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.6,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      // note outlines, slurs and the playhead follow the style pack when it directs stroke; the staff paper stays
      const NOTE = ui.stroke("regular", 1.6), NOTE_ON = ui.stroke("bold", 2.6), INK = ui.strokeColor(C.ink);
      root.classList.add("ss");
      const L = content.legible === true;
      if (L) root.classList.add("ss--legible");
      const head = el("div", "ss-copy", root);
      el("div", "ss-eyebrow", head, content.eyebrow || "");
      el("div", "ss-h", head, content.heading || "");

      const beats = content.beats || 16;
      let left = 300, right = 1500, top = 330, gap = 112;
      // legible: the score runs edge to edge and its staves fill the height left under the heading (if any)
      const hasHead = !!(content.heading || content.eyebrow);
      const BAR = 48, rx = Math.min(3, ui.radius("sm", (tokens.radius && tokens.radius.sm) ?? 3));
      if (L) {
        left = 96; right = 1504; top = hasHead ? 340 : 250;
        gap = content.staves.length > 1 ? ((hasHead ? 712 : 676) - top) / (content.staves.length - 1) : 0;
      }
      const NOTE_L = ui.stroke("regular", 2), NOTE_ON_L = ui.stroke("bold", 3.2);
      const bw = (right - left) / beats;
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ss-svg" }, root);
      const staves = content.staves.map((name, i) => {
        const y = top + i * gap;
        for (const dy of L ? [-BAR / 2 - 4, BAR / 2 + 4] : [-14, 14]) svg("line", { x1: left, y1: y + dy, x2: right, y2: y + dy, stroke: mix(C.ink, C.paper, 0.82), "stroke-width": ui.stroke("hair", 1) }, s);
        // the middle line is a string: it vibrates while this agent is working
        const string = svg("path", { d: `M${left} ${y}H${right}`, fill: "none", stroke: mix(C.ink, C.paper, 0.62), "stroke-width": L ? 1.6 : 1.2 }, s);
        const badge = el("div", "ss-stave", root);
        badge.style.top = (L ? y - 56 - 18 : y - 20) + "px";
        if (L) badge.style.left = left + 16 + "px";
        const sq = el("span", "ss-sq", badge, name[0]);
        sq.style.background = pal[i % pal.length];
        if (L) sq.style.borderRadius = rx + "px";
        sq.style.color = h.inkOn(pal[i % pal.length]);
        el("span", "", badge, name);
        return { y, badge, string, colour: pal[i % pal.length] };
      });
      // bar lines every 4 beats, and the beat numbers along the top
      for (let b = 0; b <= beats; b += 4) {
        svg("line", { x1: left + b * bw, y1: top - (L ? 80 : 40), x2: left + b * bw, y2: top + (staves.length - 1) * gap + 40, stroke: mix(C.ink, C.paper, b % beats === 0 ? 0.3 : 0.7), "stroke-width": b % beats === 0 ? 2 : 1 }, s);
        if (b < beats) { const n = svg("text", { x: left + b * bw + (L ? 8 : 6), y: top - (L ? 92 : 52), "font-family": "var(--font-mono)", "font-size": L ? 16 : 12, fill: C.muted }, s); n.textContent = `${b / 4 + 1}`; }
      }
      const slurLayer = svg("g", {}, s);
      const notes = content.notes.map((n) => {
        const st = staves[n.stave];
        const x = left + n.at * bw, w = Math.max(bw * 0.55, n.dur * bw - 8), y = st.y;
        const g = svg("g", {}, s);
        if (L) {
          // the note fills left to right while the playhead travels through it; a second copy of the label,
          // in the colour that reads on the fill, is clipped to the same width so the text never loses contrast
          const body = svg("rect", { x, y: y - BAR / 2, width: w, height: BAR, rx, fill: C.surface }, g);
          const fill = svg("rect", { x, y: y - BAR / 2, width: 0, height: BAR, rx, fill: st.colour }, g);
          svg("rect", { x, y: y - BAR / 2, width: w, height: BAR, rx, fill: "none", stroke: INK, "stroke-width": NOTE_L }, g);
          const outline = g.lastChild;
          const label = el("div", "ss-label ss-in", root, n.label);
          const lit = el("div", "ss-label ss-in ss-in-lit", root, n.label);
          const v = st.colour.replace("#", ""); const [r, gg, b] = [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16) / 255);
          lit.style.color = 0.2126 * r + 0.7152 * gg + 0.0722 * b < 0.4 ? C.paper : C.ink;
          for (const node of [label, lit]) Object.assign(node.style, { left: x + "px", top: y - BAR / 2 + "px", width: w + "px", height: BAR + "px" });
          // sm-native: the ring flashes as the note sounds; a state cue, not outline style
          const ring = svg("rect", { x, y: y - BAR / 2, width: w, height: BAR, rx, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, g);
          return { ...n, x, w, y, body, fill, outline, label, lit, ring, colour: st.colour };
        }
        const body = svg("rect", { x, y: y - 11, width: w, height: 22, rx: 11, fill: C.surface, stroke: INK, "stroke-width": NOTE }, g);
        const label = el("div", "ss-label", root, n.label);
        Object.assign(label.style, { left: x + 10 + "px", top: y - 46 + "px" });
        // a ring that sounds when the playhead reaches the note
        // sm-native: the ring flashes as the note sounds; a state cue, not outline style
        const ring = svg("circle", { cx: x + 11, cy: y, r: 11, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, g);
        return { ...n, x, w, y, body, label, ring, colour: st.colour };
      });
      const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
      const slurs = [];
      notes.forEach((n) => (n.after || []).forEach((id) => {
        const a = byId[id];
        const x0 = a.x + a.w, y0 = a.y, x1 = n.x, y1 = n.y;
        const mx = (x0 + x1) / 2;
        const path = svg("path", { d: `M${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`, fill: "none", stroke: mix(C.ink, C.paper, 0.35), "stroke-width": L ? NOTE_L : NOTE, "stroke-dasharray": "4 5", "stroke-linecap": "round" }, slurLayer);
        slurs.push({ path, from: a, to: n });
      }));
      const playhead = svg("g", {}, s);
      if (L) {
        svg("line", { x1: 0, y1: top - 72, x2: 0, y2: top + (staves.length - 1) * gap + 44, stroke: C.accent, "stroke-width": ui.stroke("bold", 3) }, playhead);
        svg("path", { d: `M-10 ${top - 86} h20 l-10 15 z`, fill: C.accent }, playhead);
      } else {
      svg("line", { x1: 0, y1: top - 70, x2: 0, y2: top + (staves.length - 1) * gap + 50, stroke: C.accent, "stroke-width": ui.stroke("bold", 2.5) }, playhead);
      svg("path", { d: `M-8 ${top - 80} h16 l-8 12 z`, fill: C.accent }, playhead);
      }
      const log = el("div", "ss-log", root);
      const logText = el("span", "", log, "");
      return { notes, slurs, staves, playhead, left, right, bw, beats, logText, run: content.run, NOTE: L ? NOTE_L : NOTE, NOTE_ON: L ? NOTE_ON_L : NOTE_ON, L };
    },

    render(t, S, h) {
      const { tw, clamp, lerp } = h;
      const T0 = 0.8, T1 = 10.4; // the playhead plays the whole score between these times
      const beat = clamp((t - T0) / (T1 - T0)) * S.beats;
      const out = 1 - tw(t, 11.1, 0.6, "inOut");
      S.playhead.setAttribute("transform", `translate(${(S.left + beat * S.bw).toFixed(1)} 0)`);
      S.playhead.setAttribute("opacity", (tw(t, 0.2, 0.5) * out).toFixed(3));
      const tOf = (b) => T0 + (b / S.beats) * (T1 - T0);
      let done = 0, active = 0;
      S.notes.forEach((n) => {
        const started = t >= T0;
        const on = started && beat >= n.at, playing = on && beat < n.at + n.dur;
        const lit = tw(t, tOf(n.at), 0.18, "snappy") * out;
        if (S.L) {
          // the fill travels with the playhead through the note; the lit label copy is clipped to it
          const p = started ? clamp((beat - n.at) / n.dur) : 0;
          const fw = p * n.w;
          n.fill.setAttribute("width", fw.toFixed(1));
          n.fill.setAttribute("opacity", out.toFixed(3));
          n.outline.setAttribute("stroke-width", playing ? S.NOTE_ON : S.NOTE);
          n.lit.style.clipPath = `inset(0 ${(n.w - fw).toFixed(1)}px 0 0)`;
          n.lit.style.opacity = out.toFixed(3);
          const ping = tw(t, tOf(n.at), 0.7, "soft");
          const grow = ping * 10;
          n.ring.setAttribute("x", (n.x - grow).toFixed(1));
          n.ring.setAttribute("y", (n.y - 24 - grow).toFixed(1));
          n.ring.setAttribute("width", (n.w + grow * 2).toFixed(1));
          n.ring.setAttribute("height", (48 + grow * 2).toFixed(1));
          n.ring.setAttribute("opacity", (ping > 0 && ping < 1 ? (1 - ping) * 0.9 * out : 0).toFixed(3));
          if (on) done++;
          if (playing) active++;
          return;
        }
        n.body.setAttribute("fill", lit > 0 ? n.colour : "var(--c-surface)");
        n.body.setAttribute("stroke-width", playing ? S.NOTE_ON : S.NOTE);
        n.label.style.opacity = (lit * (playing ? 1 : 0.55)).toFixed(3);
        n.label.style.transform = `translateY(${((1 - tw(t, tOf(n.at), 0.35)) * 6).toFixed(1)}px)`;
        const ping = tw(t, tOf(n.at), 0.7, "soft");
        n.ring.setAttribute("r", (11 + ping * 26).toFixed(1));
        n.ring.setAttribute("opacity", (ping > 0 && ping < 1 ? (1 - ping) * 0.9 * out : 0).toFixed(3));
        if (on) done++;
        if (playing) active++;
      });
      // a slur draws itself while the work hands off from one note to the next
      S.slurs.forEach(({ path, from, to }) => {
        const len = path.__len ?? (path.__len = path.getTotalLength());
        const p = clamp((beat - (from.at + from.dur)) / Math.max(0.3, to.at - (from.at + from.dur)));
        path.setAttribute("stroke-dasharray", `${(p * len).toFixed(1)} ${len.toFixed(1)}`);
        path.setAttribute("opacity", out.toFixed(3));
      });
      // stave names glow while their agent is playing
      S.staves.forEach((st, i) => {
        const busy = t >= T0 && S.notes.some((n) => n.stave === i && beat >= n.at && beat < n.at + n.dur);
        st.badge.classList.toggle("is-busy", busy && out > 0.5);
        // string amplitude: rises as a note starts, decays after it ends (pure in t)
        const amp = Math.max(0, ...S.notes.filter((n) => n.stave === i).map((n) => h.span(t, tOf(n.at), tOf(n.at + n.dur), 0.15, 0.4))) * (S.L ? 5 : 3.2) * out;
        if (amp < 0.02) { st.string.setAttribute("d", `M${S.left} ${st.y}H${S.right}`); return; }
        let d = "";
        for (let x = S.left; x <= S.right; x += 6) {
          const env = Math.sin(((x - S.left) / (S.right - S.left)) * Math.PI); // fixed at both ends, like a string
          d += `${x === S.left ? "M" : "L"}${x} ${(st.y + Math.sin(x * 0.11 - t * 26) * amp * env).toFixed(2)}`;
        }
        st.string.setAttribute("d", d);
      });
      const secs = Math.round(lerp(0, S.run.seconds, clamp((t - T0) / (T1 - T0))));
      S.logText.textContent = `${S.run.name} · ${done}/${S.notes.length} steps · ${active} running · ${secs}s`;
      S.logText.parentNode.style.opacity = (tw(t, 0.4, 0.5) * out).toFixed(3);
    },
  });
})();
