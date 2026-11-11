/* card-story: a feature list on the left drives a product card on the right.
 * Each step has a progress rule that fills like a clock; when it completes, the card changes state
 * (loading → fields → a flagged exception that resolves → synced). The loop is seamless: t = 0 is the
 * transition from the last step back into the first.
 */
(function () {
  const STEP = 3.4; // seconds per step
  const SWAP = 0.55; // card transition
  let N = 4;

  SiteMotion.scene({
    width: 1600,
    height: 900,
    loop: 0,
    get duration() { return STEP * N; },
    still: STEP * 1 + 2.4,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      N = content.steps.length;
      root.classList.add("cs");

      // ---------- left: the step list ----------
      if (content.heading) {
        const head = el("div", "cs-heading", root);
        if (content.eyebrow) el("div", "cs-eyebrow", head, content.eyebrow);
        el("div", "cs-h", head, content.heading);
      }
      const list = el("div", "cs-list" + (content.heading ? " cs-list-low" : ""), root);
      const items = content.steps.map((step) => {
        const item = el("div", "cs-item", list);
        const title = el("div", "cs-title", item, step.title);
        const bodyWrap = el("div", "cs-body-wrap", item);
        el("div", "cs-body", bodyWrap, step.body);
        const rule = el("div", "cs-rule", item);
        const fill = el("div", "cs-fill", rule);
        return { item, title, bodyWrap, fill };
      });

      // ---------- right: panel and card ----------
      const panel = el("div", "cs-panel", root);
      const card = el("div", "cs-card", panel);
      const head = el("div", "cs-head", card);
      const logo = el("div", "cs-logo", head, content.card.logo.text);
      logo.style.background = content.card.logo.bg || tokens.color.ink;
      logo.style.color = content.card.logo.fg || tokens.color.surface;
      const who = el("div", "cs-who", head);
      el("div", "cs-name", who, content.card.name);
      el("div", "cs-sub", who, content.card.sub);
      el("div", "cs-amount", head, content.card.amount);
      const rowsHost = el("div", "cs-rows", card);

      const ROW = 64, GAP = 12;
      const sets = content.steps.map((step) => {
        const c = step.card;
        const set = el("div", "cs-set", rowsHost);
        const rows = [];
        const add = (cls, label) => { const r = el("div", "cs-row " + cls, set); if (label != null) el("span", "cs-label", r, label); rows.push(r); return r; };
        if (c.kind === "loading") {
          const r = add("cs-loading");
          const spin = el("span", "cs-spin", r);
          const dots = Array.from({ length: 8 }, (_, i) => { const d = el("i", "", spin); d.style.transform = `rotate(${i * 45}deg) translateY(-9px)`; return d; });
          const a = el("span", "cs-label cs-accent", r, c.text);
          const b = el("span", "cs-label cs-memo", r, c.then);
          set._loading = { dots, a, b };
        } else if (c.kind === "fields") {
          c.rows.forEach((label) => add("", label));
        } else if (c.kind === "flag") {
          c.rows.forEach((label, i) => {
            const r = add(i === c.flag.row ? "cs-flagged" : "", label);
            if (i === c.flag.row) {
              const chip = el("span", "cs-chip", r);
              const warn = el("span", "cs-chip-warn", chip, c.flag.text);
              const ok = el("span", "cs-chip-ok", chip, "✓ " + c.flag.resolved);
              set._flag = { r, warn, ok };
            }
          });
        } else if (c.kind === "synced") {
          const r = add("cs-synced", c.text);
          el("span", "cs-check", r, "✓");
          (c.rows || []).forEach((label) => add("cs-ledger", label));
        }
        set._height = rows.length * ROW + (rows.length - 1) * GAP;
        set._rows = rows;
        return set;
      });
      return { items, sets, card, rowsHost, ROW, GAP, headH: 156 };
    },

    render(t, S, h) {
      const { tw, clamp, lerp } = h;
      const i = Math.floor(t / STEP) % N;
      const local = t - i * STEP;
      const prev = (i - 1 + N) % N;

      // list: active item expands, its rule fills across the step like a clock
      S.items.forEach((it, k) => {
        const open = k === i ? tw(local, 0, 0.6, "snappy") : k === prev ? 1 - tw(local, 0, 0.45, "snappy") : 0;
        it.bodyWrap.style.height = (it.bodyWrap.firstChild.scrollHeight * open).toFixed(1) + "px";
        it.bodyWrap.style.opacity = open.toFixed(3);
        it.title.style.opacity = (0.32 + 0.68 * open).toFixed(3);
        // the finished step's rule stays full and fades, so nothing snaps at a step change or the loop seam
        it.fill.style.transform = `scaleX(${k === i ? clamp(local / STEP).toFixed(4) : k === prev ? 1 : 0})`;
        it.fill.style.opacity = k === prev ? (1 - tw(local, 0, 0.4, "soft")).toFixed(3) : 1;
      });

      // card: the outgoing set leaves, the new set arrives row by row, the card height eases between them
      const swap = tw(local, 0, SWAP, "snappy");
      const hFrom = S.sets[prev]._height, hTo = S.sets[i]._height;
      S.card.style.height = (S.headH + lerp(hFrom, hTo, swap) + 28).toFixed(1) + "px";
      S.sets.forEach((set, k) => {
        if (k === i) {
          set.style.opacity = 1;
          set._rows.forEach((row, r) => {
            const p = tw(local, 0.18 + h.motion.stagger(r, 0.075), 0.5, "signature");
            row.style.opacity = p.toFixed(3);
            row.style.transform = `translateY(${((1 - p) * 14).toFixed(2)}px)`;
          });
        } else if (k === prev && local < 0.4) {
          const p = tw(local, 0, 0.3, "soft");
          set.style.opacity = (1 - p).toFixed(3);
          set._rows.forEach((row) => { row.style.opacity = 1; row.style.transform = `translateY(${(-8 * p).toFixed(2)}px)`; });
        } else set.style.opacity = 0;
      });

      // per-state details, all pure functions of the step's local time
      const L = S.sets[i]._loading;
      if (L) {
        const done = tw(local, 1.5, 0.35, "soft");
        L.dots.forEach((d, k) => { const ph = (((t * 1.25 - k / 8) % 1) + 1) % 1; d.style.opacity = ((0.2 + 0.8 * (1 - ph)) * (1 - done)).toFixed(3); });
        L.a.style.opacity = (1 - done).toFixed(3);
        L.b.style.opacity = done.toFixed(3);
        L.b.style.transform = `translateY(${((1 - done) * 6).toFixed(2)}px)`;
      }
      const F = S.sets[i]._flag;
      if (F) {
        const flagged = tw(local, 0.7, 0.35, "snappy"), ok = tw(local, 2.0, 0.4, "snappy");
        F.r.style.setProperty("--flag", (flagged * (1 - ok)).toFixed(3));
        F.r.style.setProperty("--ok", ok.toFixed(3));
        F.warn.style.opacity = (flagged * (1 - ok)).toFixed(3);
        F.ok.style.opacity = ok.toFixed(3);
      }
    },
  });
})();
