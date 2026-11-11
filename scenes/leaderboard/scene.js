/* leaderboard: contributions that count. A table of contributors in an app window; each event
 * lands on one row (its chip changes, points count up) and the rows re-sort by total, gliding to
 * their new places. Rows enter at the start and leave before the seam, so the loop is clean.
 */
(function () {
  const D = 12, ROW = 76;
  SiteMotion.scene({
    width: 1600,
    height: 900,
    loop: 0,
    duration: D,
    still: 9.2,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      const pal = tokens.palette, C = tokens.color;
      // a palette chip or avatar takes the ink when it reads on that colour, else the nearest shade that does
      const paint = (node, bg) => { node.style.background = bg; node.style.color = h.inkOn(bg); };
      // the points column sits on the row's glow at its brightest too, so its green is checked against that
      const addedInk = h.textOn(h.mix(C.surface, C.cta || pal[0], 0.45), C.positiveText || C.positive);
      root.classList.add("lb");
      const copy = el("div", "lb-copy", root);
      if (content.eyebrow) el("div", "lb-eyebrow", copy, content.eyebrow);
      el("div", "lb-h", copy, content.heading);
      el("div", "lb-body", copy, content.body);

      const win = el("div", "lb-win", root);
      const bar = el("div", "lb-bar", win);
      [pal[5], pal[0], pal[1]].forEach((c) => { el("i", "", bar).style.background = c; });
      const table = el("div", "lb-table", win);
      const head = el("div", "lb-row lb-head", table);
      content.columns.forEach((c) => el("span", "", head, c));
      const body = el("div", "lb-rows", table);
      body.style.height = content.people.length * ROW + "px";
      const rows = content.people.map((p, i) => {
        const row = el("div", "lb-row lb-person", body);
        const who = el("span", "lb-who", row);
        const av = el("span", "lb-av", who, p.name[0]);
        paint(av, pal[(i * 2) % pal.length]);
        el("span", "", who, p.name);
        const chips = el("span", "lb-chips", row);
        const base = el("span", "lb-chip", chips, p.chip);
        paint(base, pal[(i + 3) % pal.length]);
        const added = el("span", "lb-added", row, "");
        added.style.color = addedInk;
        const total = el("span", "lb-total", row, "");
        return { p, row, chips, base, added, total, events: [] };
      });
      // attach each event to its row, and give it its own chip
      const byName = Object.fromEntries(rows.map((r) => [r.p.name, r]));
      content.events.forEach((e, k) => {
        const r = byName[e.who];
        const chip = el("span", "lb-chip lb-chip-new", r.chips, e.chip);
        paint(chip, pal[(k + 1) % pal.length]);
        r.events.push({ ...e, chip });
      });
      const note = el("div", "lb-note", root);
      const check = el("span", "lb-check", note, "✓");
      el("span", "", note, content.note);
      return { rows, events: content.events, note, check, win, copy };
    },

    render(t, S, h) {
      const { tw, span, lerp, count } = h;
      const out = 1 - tw(t, 11.0, 0.7, "inOut");
      S.copy.style.opacity = (tw(t, 0.1, 0.7) * out).toFixed(3);
      S.win.style.opacity = (tw(t, 0.2, 0.7) * out).toFixed(3);
      S.win.style.transform = `translateY(${((1 - tw(t, 0.2, 0.9)) * 20).toFixed(2)}px)`;
      S.note.style.opacity = (tw(t, 1.4, 0.6) * out).toFixed(3);

      // totals at time t (events land after a short beat), and ranks after each event
      const totalAt = (r, time) => r.p.points + r.events.reduce((s, e) => s + (time >= e.at ? e.add : 0), 0);
      const rankAt = (time) => [...S.rows].sort((a, b) => totalAt(b, time) - totalAt(a, time));
      const order0 = rankAt(0);
      S.rows.forEach((r, i) => {
        // y: start at the initial rank, then glide to each new rank as events re-sort the table
        let y = order0.indexOf(r) * ROW;
        for (const e of S.events) y = lerp(y, rankAt(e.at).indexOf(r) * ROW, tw(t, e.at + 1.0, 0.75, "inOut"));
        const enter = tw(t, 0.6 + h.motion.stagger(i, 0.08), 0.6);
        r.row.style.transform = `translateY(${(y + (1 - enter) * 14).toFixed(1)}px)`;
        r.row.style.opacity = enter.toFixed(3);
        // the latest event replaces the chip, with a highlight while it counts
        const latest = [...r.events].reverse().find((e) => t >= e.at);
        r.base.style.opacity = latest ? 0 : 1;
        r.events.forEach((e) => { e.chip.style.opacity = e === latest ? tw(t, e.at, 0.3, "snappy").toFixed(3) : 0; });
        const glow = latest ? span(t, latest.at, latest.at + 1.6, 0.2, 0.6) : 0;
        r.row.style.setProperty("--glow", glow.toFixed(3));
        r.row.style.zIndex = latest && t < latest.at + 2.2 ? 2 : 1; // the row that is climbing passes over the others
        const shownTotal = r.p.points + r.events.reduce((s, e) => s + count(t, e.at, 0.9, 0, e.add, "soft"), 0);
        r.total.textContent = Math.round(shownTotal).toLocaleString("en-US");
        r.added.textContent = latest ? "+" + Math.round(count(t, latest.at, 0.9, 0, latest.add, "soft")).toLocaleString("en-US") : "+" + r.p.added.toLocaleString("en-US");
      });
      S.check.style.transform = `scale(${(0.6 + 0.4 * tw(t, 1.6, 0.5, "signature")).toFixed(3)})`;
    },
  });
})();
