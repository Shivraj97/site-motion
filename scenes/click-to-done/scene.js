// @vendor ui-kit
/* click-to-done: a real product screen doing the one thing the feature is for.
 * A members page sits in a browser window. The camera moves in on the invite form, the cursor types two
 * addresses, picks a role and sends; the button confirms, the camera pulls back and the team list grows by
 * two rows marked Invited. Then the page quietly returns to its first frame, so it loops without a seam.
 * Cursor beats, camera keys and the four story times all live in content.json: retime it there, not here.
 */
(function () {
  const D = 11;
  SiteMotion.scene({
    width: 1600,
    height: 900,
    duration: D,
    loop: 0,
    still: 6.9,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      root.classList.add("ctd");
      el("div", "ctd-glow", root);
      const kit = SMUI.kit({ root, h, tokens, width: 1600, height: 900 });
      const app = kit.frame("browser", { url: content.url, x: 200, y: 76, w: 1200, h: 880 });

      // ---------- sidebar ----------
      const side = el("div", "ctd-side", app.body);
      const ws = el("div", "ctd-ws", side);
      el("span", "ctd-ws-mark", ws, content.workspace.text);
      el("span", "", ws, content.workspace.name);
      content.nav.forEach((n, i) => {
        const item = el("div", "ctd-nav" + (i === content.active ? " is-active" : ""), side);
        el("i", "", item);
        el("span", "", item, n);
      });

      // ---------- main ----------
      const main = el("div", "ctd-main", app.body);
      el("div", "ctd-h1", main, content.heading);
      el("div", "ctd-sub", main, content.sub);

      const inv = content.invite;
      const card = el("div", "ctd-card", main);
      card.dataset.ui = "invite";
      el("div", "ctd-label", card, inv.label);
      const row = el("div", "ctd-row", card);
      const field = kit.field(row, "ctd-field");
      field.node.dataset.ui = "email";
      const seg = el("div", "ctd-seg", row);
      const knob = el("span", "ctd-knob", seg);
      const opts = inv.roles.map((r, i) => { const o = el("span", "ctd-opt", seg, r); o.dataset.ui = "role-" + i; return o; });
      const send = el("div", "ctd-send", row);
      send.dataset.ui = "send";
      const sendLabel = el("span", "ctd-send-label", send, inv.send);
      const spin = el("span", "ctd-spin", send);
      const sent = el("span", "ctd-sent", send);
      el("i", "ctd-check", sent);
      el("span", "", sent, inv.sent);

      // ---------- members table: rows are absolutely placed so new ones can push the rest down ----------
      const table = el("div", "ctd-table", main);
      const head = el("div", "ctd-tr ctd-th", table);
      content.columns.forEach((c) => el("span", "", head, c));
      const ROW = 62;
      const person = (p, i, status, fresh) => {
        const tr = el("div", "ctd-tr ctd-member" + (fresh ? " is-new" : ""), table);
        const who = el("span", "ctd-who", tr);
        const av = el("i", "ctd-av", who, p.name.charAt(0));
        av.style.background = `var(--p-${i % 6})`;
        av.style.color = `var(--p-${i % 6}-on)`;
        const names = el("span", "ctd-names", who);
        el("b", "", names, p.name);
        el("em", "", names, p.email);
        el("span", "ctd-role", tr, p.role || inv.roles[inv.pick]);
        el("span", "ctd-pill" + (fresh ? " is-invited" : ""), tr, status);
        return tr;
      };
      const old = content.members.map((p, i) => person(p, i + 2, p.status, false));
      const fresh = content.invited.map((p, i) => person(p, i, content.invitedStatus, true));

      const toast = el("div", "ctd-toast", kit.world);
      el("i", "ctd-check", toast);
      el("span", "", toast, content.toast);
      el("b", "", toast, content.toastAction);

      kit.cursor(content.cursor, { start: [1000, 860] });
      kit.camera(content.camera);
      return { kit, content, field, knob, opts, send, sendLabel, spin, sent, old, fresh, ROW, toast };
    },

    render(t, S, h) {
      const { tw, span, clamp } = h;
      const c = S.content, T = c.times, inv = c.invite;
      S.kit.render(t);
      const R = T.reset; // everything that happened lets go here, and is back to its first frame well before D

      // the typed addresses fade away at the reset, then the placeholder returns
      const cleared = t >= R + 0.35;
      S.kit.type(S.field, cleared ? 0 : t, inv.value, T.type, { placeholder: inv.placeholder, cps: 22, blurAt: T.sending });
      S.field.text.style.opacity = cleared ? "1" : (1 - tw(t, R, 0.3, "soft")).toFixed(3);

      // role: the knob slides to the picked option on the click, and back at the reset
      const pickAt = S.kit.clickedAt("role-" + inv.pick) ?? 3.6;
      const k = tw(t, pickAt, 0.4, "snappy") * (1 - tw(t, R + 0.2, 0.45, "snappy"));
      const a = S.opts[0], b = S.opts[inv.pick];
      S.knob.style.width = (a.offsetWidth + (b.offsetWidth - a.offsetWidth) * k).toFixed(1) + "px";
      S.knob.style.transform = `translateX(${(a.offsetLeft + (b.offsetLeft - a.offsetLeft) * k).toFixed(1)}px)`;
      S.opts.forEach((o, i) => o.classList.toggle("is-on", i === (k > 0.5 ? inv.pick : 0)));

      // send: pressed by the click, a spinner while it sends, then a confirmed state until the reset
      const press = S.kit.pressed(t, "send");
      const sending = span(t, T.sending, T.sent, 0.15, 0.15);
      const done = tw(t, T.sent, 0.35, "snappy") * (1 - tw(t, R, 0.35, "soft"));
      S.send.style.transform = `scale(${(1 - press * 0.05).toFixed(3)})`;
      S.sendLabel.style.opacity = clamp(1 - tw(t, T.sending, 0.15, "soft") + tw(t, R + 0.25, 0.3, "soft")).toFixed(3);
      S.spin.style.opacity = sending.toFixed(3);
      S.spin.style.transform = `rotate(${((t - T.sending) * 540).toFixed(1)}deg)`;
      S.sent.style.opacity = done.toFixed(3);
      S.sent.style.transform = `translateY(${((1 - done) * 8).toFixed(2)}px)`;

      // the list: invited rows arrive at the top one after another, pushing the team down; all leave at the reset
      const rowIn = (i) => tw(t, T.sent + 0.35 + i * 0.12, 0.6, "signature") * (1 - tw(t, R + 0.1, 0.5, "inOut"));
      const ins = S.fresh.map((_, i) => rowIn(i));
      const pushed = ins.reduce((s, v) => s + v, 0);
      let above = 0; // each new row sits in the space opened by the rows before it
      S.fresh.forEach((tr, i) => {
        const p = ins[i];
        tr.style.transform = `translateY(${(40 + above * S.ROW - (1 - p) * 10).toFixed(2)}px)`;
        tr.style.opacity = p.toFixed(3);
        above += p;
      });
      S.old.forEach((tr, i) => { tr.style.transform = `translateY(${(40 + (i + pushed) * S.ROW).toFixed(2)}px)`; });

      const toast = span(t, T.sent + 0.6, R - 0.6, 0.55, 0.4);
      S.toast.style.opacity = toast.toFixed(3);
      S.toast.style.transform = `translateY(${((1 - toast) * -16).toFixed(2)}px)`; // drops in from above, top right
    },
  });
})();
