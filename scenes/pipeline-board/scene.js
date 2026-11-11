/* pipeline-board: a workflow as a kanban board (DOM).
 * Three to five stage columns, each headed by its name, the number of cards in it and (when cards carry a value)
 * their total. Cards advance one stage at a time, in the order content.moves gives; each move lifts the card, carries
 * it to the top of the next column and sets it down while the columns around it close and open. Counts and totals
 * are read from the cards that sit in a column at that moment, so they change exactly when a card lands.
 * The last move is the signature: that card lands in the final column, its value turns into the success chip
 * ("Won · $48k") and the column's total takes it in. Everything on the board comes from content: stages, cards,
 * owners, values, tags, the moves and the success line, so the same scene is a sales pipeline, a hiring loop or an
 * editorial calendar. Cards enter at the start and leave before the seam, so the loop is clean.
 *
 * Ranges the layout fits: 3–5 stages, 5–14 cards, 3–8 moves, up to 5 cards in one column at once (4 when titles
 * wrap to two lines; more than that and the cards tighten to share the height).
 */
(function () {
  const D = 12, W = 1600;
  const BOARD = { left: 96, right: 1504, gap: 16, head: 54, pad: 8, margin: 60, below: 48 };
  const MOVE_FIRST = 2.0, MOVE_LAST = 7.6, MOVE_SPAN = 6.6; // ordinary moves share 2.0–6.6 s; the signature move waits until 7.6 s
  const EXIT = 10.9;

  SiteMotion.scene({
    width: W,
    height: 900,
    loop: 0,
    duration: D,
    still: 8.95,
    async setup({ root, content, tokens, h }) {
      const { el } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("pb");

      // ---------- copy: heading on the left, the sub line answering it on the right ----------
      const copy = el("div", "pb-copy", root);
      const lead = el("div", "pb-lead", copy);
      if (content.eyebrow) el("div", "pb-eyebrow", lead, content.eyebrow);
      el("div", "pb-h", lead, content.heading || "");
      if (content.sub) el("div", "pb-sub", copy, content.sub);

      // ---------- data ----------
      const stages = (content.stages || []).map((s) => (typeof s === "string" ? { name: s } : s));
      const N = stages.length;
      const fmt = content.format || {};
      const money = (v) => `${fmt.prefix || ""}${Number.isInteger(v) ? v : v.toFixed(1)}${fmt.suffix || ""}`;
      const hasValue = (content.cards || []).some((c) => typeof c.value === "number");
      const owners = [...new Set(content.cards.map((c) => c.owner || ""))];
      const cards = content.cards.map((c, i) => ({ ...c, i, key: c.id || c.title, stage0: Math.max(0, Math.min(N - 1, c.stage || 0)) }));
      const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
      const moves = (content.moves || []).map((m) => byKey[typeof m === "string" ? m : m.card]).filter(Boolean);
      const M = moves.length;

      // the board after each move: columns of card indices, top first. A moved card goes to the top of the next column
      const states = [stages.map((_, s) => cards.filter((c) => c.stage0 === s).map((c) => c.i))];
      moves.forEach((c) => {
        const cols = states[states.length - 1].map((col) => col.slice());
        const from = cols.findIndex((col) => col.includes(c.i));
        const to = Math.min(N - 1, from + 1);
        cols[from].splice(cols[from].indexOf(c.i), 1);
        cols[to].unshift(c.i);
        states.push(cols);
      });
      const maxStack = Math.max(1, ...states.flat().map((col) => col.length));

      // when each move starts: ordinary moves spread evenly, the last one (the signature) after a short rest
      const starts = moves.map((_, k) => (k === M - 1 ? MOVE_LAST : M <= 2 ? MOVE_FIRST + k * 1.6 : MOVE_FIRST + (k * (MOVE_SPAN - MOVE_FIRST)) / Math.max(1, M - 2)));

      // ---------- geometry, from the counts ----------
      const colW = (BOARD.right - BOARD.left - (N - 1) * BOARD.gap) / N;
      const cardW = colW - BOARD.pad * 2, textW = cardW - 28;
      // each title takes one line or two, measured in the brand face (with a little room to spare); a card is as tall as its title
      const font = `500 16px ${tokens.font && tokens.font.sans ? tokens.font.sans : "sans-serif"}`;
      try { if (document.fonts) await document.fonts.load(font, cards.map((c) => c.title).join(" ")); } catch (e) { /* measure in the fallback */ }
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = font;
      cards.forEach((c) => { c.lines = ctx.measureText(c.title).width * 1.03 > textW ? 2 : 1; });
      // the copy and the board share the height: the board is as deep as its deepest column, and the pair is centred
      const copyH = (content.eyebrow ? 31 : 0) + String(content.heading || "").split("\n").length * 50.4;
      const room = 900 - BOARD.margin * 2 - copyH - BOARD.below - BOARD.head - 6 - BOARD.pad;
      const inner = (c) => c.lines * 21 + 10 + 26; // title, gap, owner row
      // a crowded column first gives up card padding, then the gaps between cards, so titles and rows keep their size
      let shrink = 0;
      states.forEach((cols) => cols.forEach((col) => {
        const need = col.reduce((a, i) => a + inner(cards[i]) + 28 + 10, 0);
        if (col.length) shrink = Math.max(shrink, (need - room) / col.length);
      }));
      shrink = Math.min(14, Math.max(0, shrink));
      const padY = 14 - Math.min(10, shrink) / 2, gapY = 10 - Math.max(0, shrink - 10);
      cards.forEach((c) => { c.h = inner(c) + padY * 2; });
      const deepest = Math.max(...states.flatMap((cols) => cols.map((col) => col.reduce((a, i) => a + cards[i].h + gapY, 0))));
      const boardH = BOARD.head + 6 + deepest + BOARD.pad + Math.min(56, Math.max(0, room - deepest));
      const top = Math.max(BOARD.margin, (900 - copyH - BOARD.below - boardH) / 2);
      const boardTop = top + copyH + BOARD.below;
      copy.style.top = top + "px";
      const cardsTop = boardTop + BOARD.head + 6;
      // where every card sits after each move: y stacks the cards above it in its column
      const yAt = states.map((cols) => {
        const y = [];
        cols.forEach((col) => { let acc = cardsTop; col.forEach((i) => { y[i] = acc; acc += cards[i].h + gapY; }); });
        return y;
      });

      // ---------- lanes ----------
      const board = el("div", "pb-board", root);
      const lanes = stages.map((s, i) => {
        const x = BOARD.left + i * (colW + BOARD.gap);
        const lane = el("div", "pb-lane" + (i === N - 1 ? " pb-lane-last" : ""), board);
        Object.assign(lane.style, { left: x + "px", top: boardTop + "px", width: colW + "px", height: boardH + "px" });
        const tint = el("div", "pb-lane-tint", lane);
        const head = el("div", "pb-head", lane);
        const name = el("div", "pb-name", head);
        if (i === N - 1) el("span", "pb-dot", name);
        el("span", "", name, s.name);
        const count = el("span", "pb-count", name, "0");
        const right = el("div", "pb-right", head);
        const delta = el("span", "pb-delta", right, "");
        const total = el("span", "pb-total", right, "");
        return { x, lane, tint, count, total, delta };
      });

      // ---------- cards ----------
      const okInk = h.inkOn(C.positive || C.accent);
      const layer = el("div", "pb-cards", root);
      const nodes = cards.map((c) => {
        const card = el("div", "pb-card", layer);
        Object.assign(card.style, { width: cardW + "px", height: c.h + "px", paddingTop: padY + "px", paddingBottom: padY + "px" });
        const lift = el("div", "pb-lift", card);
        const ring = el("div", "pb-ring", card);
        const ok = el("div", "pb-okline", card);
        el("div", "pb-title", card, c.title);
        const row = el("div", "pb-row", card);
        const who = el("span", "pb-av", row, (c.owner || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
        const bg = pal[(owners.indexOf(c.owner || "") * 2 + 1) % pal.length];
        who.style.background = bg;
        who.style.color = h.inkOn(bg);
        const tag = el("span", "pb-tag", row, c.tag || "");
        const value = el("span", "pb-value", row, typeof c.value === "number" ? money(c.value) : "");
        return { c, card, lift, ring, ok, tag, value, chip: null };
      });

      // the card that makes the last move earns the success chip
      const hero = M ? moves[M - 1] : null;
      if (hero) {
        const line = String(content.success || "Done · {value}")
          .replace("{value}", typeof hero.value === "number" ? money(hero.value) : "")
          .replace("{tag}", hero.tag || "")
          .replace("{stage}", stages[N - 1].name)
          .replace(/\s*·\s*$/, "");
        const n = nodes[hero.i];
        n.chip = el("span", "pb-chip", n.card.querySelector(".pb-row"));
        el("span", "pb-check", n.chip, "✓");
        el("span", "", n.chip, line);
        n.chip.style.background = C.positive || C.accent;
        n.chip.style.color = okInk;
      }

      return { N, M, cards, nodes, lanes, states, yAt, moves, starts, hasValue, money, hero };
    },

    render(t, S, h) {
      const { tw, lerp } = h;
      const nC = S.cards.length;
      const out = (i) => tw(t, EXIT + h.motion.stagger(i, Math.min(0.04, 0.5 / nC)), 0.45, "inOut");
      const slot = (s, i) => {
        const col = S.states[s].findIndex((c) => c.includes(i));
        return { col, row: S.states[s][col].indexOf(i) };
      };
      const xOf = (col) => S.lanes[col].x + 8;
      const LAND = 0.42; // a moving card counts as landed this long after its move starts

      // ---------- cards ----------
      // which column each card sits in at time t (for the counts): it changes the moment the card lands
      const inCol = new Array(nC);
      S.nodes.forEach((n, i) => {
        // entrance: column by column, top to bottom
        const order = S.states[0].flat().indexOf(i);
        const enter = tw(t, 0.3 + h.motion.stagger(order, Math.min(0.07, 0.9 / nC)), 0.6);
        const gone = out(order);
        let p0 = slot(0, i), x = xOf(p0.col), y = S.yAt[0][i], lift = 0, moving = false;
        inCol[i] = enter > 0.5 && gone < 0.5 ? p0.col : -1;
        S.moves.forEach((m, k) => {
          const s = S.starts[k], next = slot(k + 1, i);
          if (m.i === i) {
            // the moving card: lifted, carried to the top of the next column, set down
            const p = tw(t, s + 0.08, 0.62, "snappy");
            x = lerp(x, xOf(next.col), p);
            y = lerp(y, S.yAt[k + 1][i], p);
            const l = tw(t, s, 0.16, "soft") * (1 - tw(t, s + 0.5, 0.28, "soft"));
            lift = Math.max(lift, l);
            if (l > 0.01) moving = true;
            if (t >= s + LAND && inCol[i] >= 0) inCol[i] = next.col;
          } else {
            // the others make room in the column it lands in, then close the gap in the one it left
            const p = tw(t, s + (S.yAt[k + 1][i] > S.yAt[k][i] ? 0.1 : 0.26), 0.45, "snappy");
            y = lerp(y, S.yAt[k + 1][i], p);
          }
        });
        n.card.style.transform = `translate(${x.toFixed(1)}px, ${(y + (1 - enter) * 14 - gone * 10 - lift * 6).toFixed(1)}px) rotate(${(lift * 1.2).toFixed(2)}deg)`;
        n.card.style.opacity = (enter * (1 - gone)).toFixed(3);
        n.card.style.zIndex = moving ? 3 : 1;
        n.lift.style.opacity = lift.toFixed(3);
      });

      // ---------- the signature: the last card lands in the last column ----------
      let win = 0;
      if (S.hero) {
        const n = S.nodes[S.hero.i];
        const land = S.starts[S.M - 1] + LAND;
        const order = S.states[0].flat().indexOf(S.hero.i);
        win = tw(t, land + 0.08, 0.42, "snappy") * (1 - out(order));
        n.ok.style.opacity = win.toFixed(3);
        n.value.style.opacity = (1 - win).toFixed(3);
        n.tag.style.opacity = (1 - win).toFixed(3);
        n.chip.style.opacity = win.toFixed(3);
        n.chip.style.transform = `translateX(${((1 - win) * -8).toFixed(1)}px) scale(${(0.92 + 0.08 * win).toFixed(3)})`;
        const ping = tw(t, land + 0.05, 0.75, "soft");
        n.ring.style.opacity = (ping > 0 && ping < 1 ? (1 - ping) * 0.8 : 0).toFixed(3);
        n.ring.style.transform = `scale(${(1 + ping * 0.06).toFixed(4)}, ${(1 + ping * 0.16).toFixed(4)})`;
        S.lanes[S.N - 1].tint.style.opacity = (tw(t, land, 0.5, "soft") * (1 - tw(t, EXIT, 0.6, "inOut"))).toFixed(3);
      }

      // ---------- headers: counts and totals read from the cards in each column right now ----------
      S.lanes.forEach((L, col) => {
        const here = S.cards.filter((c) => inCol[c.i] === col);
        h.text(L.count, String(here.length));
        if (S.hasValue) {
          const sum = here.reduce((a, c) => a + (typeof c.value === "number" ? c.value : 0), 0);
          h.text(L.total, here.length ? S.money(Math.round(sum * 10) / 10) : "");
        }
        // a count that just changed blinks its pill once
        let blink = 0;
        S.moves.forEach((m, k) => {
          const s = S.starts[k] + LAND, from = slot(k, m.i).col, to = slot(k + 1, m.i).col;
          if (col === from || col === to) blink = Math.max(blink, tw(t, s, 0.12, "soft") * (1 - tw(t, s + 0.25, 0.5, "soft")));
        });
        L.count.style.setProperty("--blink", blink.toFixed(3));
      });

      // the last column shows what the signature card added, for a beat
      if (S.hero) {
        const L = S.lanes[S.N - 1], land = S.starts[S.M - 1] + LAND;
        h.text(L.delta, typeof S.hero.value === "number" ? "+" + S.money(S.hero.value) : "+1");
        const d = tw(t, land + 0.05, 0.4, "snappy") * (1 - tw(t, land + 1.7, 0.5, "soft"));
        L.delta.style.opacity = d.toFixed(3);
        L.delta.style.transform = `translateY(${((1 - tw(t, land + 0.05, 0.4, "snappy")) * 6).toFixed(1)}px)`;
      }
    },
  });
})();
