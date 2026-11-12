/* window-stack: app windows layered over a painted Canvas backdrop.
 * A chat window asks for something, an agent window slides in over it and works through its steps
 * (each with a live timer), asks a question, and the chat gets the result. The backdrop is a
 * seeded, slowly drifting landscape painted in the palette, so no stock photo is needed.
 * Content "legible": true swaps in a layout for embeds shown small (see legibleSetup): one large app
 * window per step (a step names it with `window: { kind: mail | files | list | doc, app, mark, ... }`).
 */
(function () {
  // ---------- the painted backdrop: sky gradient, haze, three ridges, grain (or a flat ruled sheet) ----------
  function backdrop(canvas, content, tokens, h) {
    const { rng, mix } = h;
    const C = tokens.color, pal = tokens.palette;
    const ctx = canvas.getContext("2d");
    const rand = rng(content.seed || 11);
    // three ridges from a few seeded sines: smooth, never a cliff at the canvas edge
    const ridges = [0, 1, 2].map((k) => {
      const waves = [0, 1, 2].map((w) => ({ f: (1.2 + rand() * 2.2) * (w + 1), p: rand() * 6.28, a: (0.05 - w * 0.014) * (1 - k * 0.15) }));
      return Array.from({ length: 81 }, (_, i) => {
        const x = i / 80;
        return 0.5 + k * 0.12 + waves.reduce((y, w) => y + Math.sin(x * w.f * 3.1 + w.p) * w.a, 0);
      });
    });
    const grain = document.createElement("canvas");
    grain.width = 256; grain.height = 256;
    const g = grain.getContext("2d"), img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const n = rand() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 22; }
    g.putImageData(img, 0, 0);
    // scenery never goes dark under a colour mode: on a light brand, a landscape colour darker than mid-tone
    // (accent-on-ink turns the palette into ink greys) is lifted toward the paper. Native colours are untouched.
    const scenery = (c) => (h.dir.has("color") && luma(C.paper) > 0.5 && luma(c) < 0.45 ? mix(c, C.paper, 0.6) : c);
    const sky = content.backdrop || { top: scenery(pal[0]), bottom: scenery(pal[3]), ridges: [pal[4], pal[2], pal[5]].map(scenery) };
    // backdrop "ruled": a flat ruled sheet (hairlines + a double margin rule) for editorial brands
    const ruled = sky === "ruled" || sky.style === "ruled";
    function paint(t) {
      const W = canvas.width, H = canvas.height;
      if (ruled) {
        ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = mix(C.paper, C.ink, 0.07);
        for (let y = 40; y < H; y += 32) ctx.fillRect(0, y, W, 1);
        ctx.fillStyle = mix(C.paper, C.ink, 0.16);
        ctx.fillRect(56, 0, 1, H); ctx.fillRect(61, 0, 1, H);
        return;
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(0.55, mix(sky.top, sky.bottom, 0.6));
      grad.addColorStop(1, sky.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // drifting haze bands: phase advances one full cycle per loop, so the loop is seamless
      const phase = (t / 14) * Math.PI * 2;
      for (let b = 0; b < 3; b++) {
        const y = H * (0.18 + b * 0.12) + Math.sin(phase + b) * 10;
        const hz = ctx.createLinearGradient(0, y - 40, 0, y + 40);
        hz.addColorStop(0, "rgba(255,255,255,0)");
        hz.addColorStop(0.5, "rgba(255,255,255,0.16)");
        hz.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hz;
        ctx.fillRect(0, y - 40, W, 80);
      }
      ridges.forEach((pts, k) => {
        const shift = Math.sin(phase + k * 1.7) * (6 + k * 5);
        ctx.beginPath();
        ctx.moveTo(-40, H);
        pts.forEach((y, i) => ctx.lineTo(-40 + (i / 80) * (W + 80) + shift, y * H));
        ctx.lineTo(W + 40, H);
        ctx.closePath();
        // aerial perspective: far ridges fade toward the sky
        ctx.fillStyle = mix(sky.ridges[k % sky.ridges.length], sky.top, 0.55 - k * 0.25);
        ctx.fill();
      });
      ctx.fillStyle = ctx.createPattern(grain, "repeat");
      ctx.fillRect(0, 0, W, H);
    }
    return paint;
  }

  // ---------- legible: fewer, larger windows for embeds shown small (content "legible": true) ----------
  // One app window in front at a time (the chat app, then one per agent step), the ones before it stacked behind
  // with only their title bars showing; the agent's current step rides in a bar inside the front window.
  // A plan panel on the left lists every step. Type: primary >= 24px, rows >= 18px, ornament >= 15px.
  // The loop rests on the chat window with the request, so no moment is blank.
  const luma = (hex) => { const v = String(hex).replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

  function legibleSetup({ root, content, tokens, h }) {
    const { el, mix } = h;
    const C = tokens.color, pal = tokens.palette;
    const on = (hex) => h.textOn(hex, luma(hex) > 0.55 ? C.ink : C.surface);
    root.classList.add("ws", "is-legible");
    if (content.flat) root.classList.add("is-flat");
    root.style.setProperty("--ws-tint", mix(C.surface, C.accent, 0.1));
    root.style.setProperty("--ws-hl", mix(C.surface, C.accent, 0.26));
    root.style.setProperty("--ws-red", C.redline || C.warning || C.accent);
    root.style.setProperty("--ws-btn-ink", h.textOn(C.cta || C.accentInk || C.accent, on(C.cta || C.accentInk || C.accent)));
    const frame = el("div", "ws-frame", root);
    const hasCopy = !!content.copy;
    if (hasCopy) {
      const copy = el("div", "ws-copy", frame);
      el("div", "ws-copy-title", copy, content.copy.title);
      el("div", "ws-copy-body", copy, content.copy.body);
      if (content.copy.code) el("div", "ws-copy-code", copy, content.copy.code);
    } else frame.classList.add("ws-full");
    frame.classList.add(hasCopy ? "ws-l-copy" : "ws-l-full");
    const canvas = el("canvas", "ws-sky", frame);
    canvas.width = hasCopy ? 1080 : 1460;
    canvas.height = 860;
    const paint = backdrop(canvas, content, tokens, h);

    // lettermarks only: { text, bg, fg } or a plain string
    const mark = (parent, m, i) => {
      const spec = m && typeof m === "object" ? m : { text: String(m) };
      const bg = spec.bg || pal[i % Math.min(4, pal.length)];
      const node = el("span", "ws-mark", parent, spec.text);
      node.style.background = bg;
      node.style.color = spec.fg || on(bg);
      return node;
    };
    const bar = (win, title, m, i, sub) => {
      const b = el("div", "ws-bar", win);
      ["", "", ""].forEach(() => el("i", "", b));
      if (m != null) mark(b, m, i);
      el("span", "ws-bar-title", b, title);
      if (sub) el("span", "ws-bar-sub", b, sub);
      return b;
    };
    const icon = (parent, cls) => {
      const ic = el("span", cls, parent);
      return { ic, ring: el("i", "ws-spin", ic), tick: el("i", "ws-tick", ic, "✓") };
    };

    // ---------- schedule: the steps share the time between `agent.start` and the reply ----------
    const steps = content.agent.steps;
    const botMsg = content.chat.messages.find((m) => m.bot);
    const replyAt = botMsg ? botMsg.at : 11.2;
    const s0 = content.agent.start ?? 1.0, s1 = replyAt - 1.2;
    const total = steps.reduce((a, s) => a + (s.secs || 1), 0);
    let at = s0;
    const sched = steps.map((s) => { const d = ((s.secs || 1) / total) * (s1 - s0); const r = { start: at, dur: d }; at += d; return r; });

    // ---------- the chat window (front at rest), and its copy that returns with the reply ----------
    const people = Object.fromEntries(content.chat.people.map((p, i) => [p.name, { ...p, colour: pal[i % pal.length] }]));
    function chatWin(withReply) {
      const win = el("div", "ws-win ws-lwin ws-lchat", frame);
      bar(win, content.chat.app, content.chat.mark ?? content.chat.app[0], 0);
      const head = el("div", "ws-chat-head", win);
      const hl = el("div", "", head);
      el("div", "ws-channel", hl, content.chat.channel);
      el("div", "ws-members", hl, content.chat.members);
      const avatars = el("div", "ws-avatars", head);
      content.chat.people.slice(0, 4).forEach((p, i) => { const a = el("span", "ws-av", avatars, p.name[0].toUpperCase()); a.style.background = pal[i % pal.length]; a.style.color = on(pal[i % pal.length]); });
      const msgs = el("div", "ws-msgs", win);
      let mention = null, reply = null, button = null;
      const folds = [];
      // every row sits in a fold (a 1fr grid row) so a row can collapse without measuring it.
      // With the reply, the rows before the ask fold away as it lands, so the answer sits high;
      // at the reset they unfold and the reply fades, leaving exactly the resting chat.
      const ask = content.chat.messages.filter((m) => !m.bot).pop();
      content.chat.messages.forEach((m) => {
        if (m.bot && !withReply) return;
        const fold = el("div", "ws-fold", msgs);
        const row = el("div", "ws-msg", el("div", "ws-clip", fold));
        const av = el("span", "ws-av ws-av-lg" + (m.bot ? " ws-bot" : ""), row, m.bot ? "" : m.from[0].toUpperCase());
        if (!m.bot) { const c = people[m.from]?.colour || pal[0]; av.style.background = c; av.style.color = on(c); }
        const body = el("div", "ws-msg-body", row);
        const meta = el("div", "ws-meta", body);
        el("b", "", meta, m.from);
        if (m.bot) el("span", "ws-tag", meta, "APP");
        el("span", "ws-ago", meta, m.ago || "");
        const text = el("div", "ws-text", body);
        const hit = !m.bot && !mention && m.text.match(/@\w+/);
        if (hit) {
          text.append(m.text.slice(0, hit.index));
          mention = el("span", "ws-mention", text, hit[0]);
          text.append(m.text.slice(hit.index + hit[0].length));
        } else text.textContent = m.text;
        if (m.button) button = el("span", "ws-btn", body, m.button);
        if (m.bot) reply = row;
        else if (withReply && m !== ask && content.chat.messages.indexOf(m) < content.chat.messages.indexOf(ask)) folds.push({ fold, row });
      });
      return { el: win, mention, reply, button, folds };
    }

    // ---------- one tool window per step that names one ----------
    function toolWin(s, i, sc) {
      const w = s.window;
      const win = el("div", "ws-win ws-lwin ws-tool ws-k-" + w.kind, frame);
      bar(win, w.app, w.mark ?? w.app[0], i + 1, w.sub);
      const ab = el("div", "ws-agentbar", win);
      const ico = icon(ab, "ws-chk");
      el("span", "ws-ab-text", ab, s.text);
      const timer = el("span", "ws-ab-time", ab, "");
      const body = el("div", "ws-tbody", win);
      const fx = {};
      if (w.kind === "mail") {
        el("div", "ws-subj", body, w.subject);
        const from = el("div", "ws-from", body);
        const av = el("span", "ws-av ws-av-lg", from, (w.from || "?")[0].toUpperCase());
        const c = pal[(i + 2) % pal.length]; av.style.background = c; av.style.color = on(c);
        el("span", "ws-from-name", from, w.from);
        el("span", "ws-ago", from, w.when || "");
        (w.lines || []).forEach((line, k) => { const d = el("div", "ws-line", body); const sp = el("span", "", d, line); if (k === w.highlight) { sp.className = "ws-hl"; fx.hl = sp; } });
        if (w.attach) el("div", "ws-attach", body, w.attach);
      } else if (w.kind === "files" || w.kind === "list") {
        el("div", "ws-path", body, w.heading || w.path);
        const list = el("div", "ws-rows", body);
        if (w.kind === "files") fx.sel = el("div", "ws-sel", list);
        fx.rows = (w.rows || []).map((r) => {
          const spec = typeof r === "string" ? { name: r } : r;
          const row = el("div", "ws-row", list);
          const R = { row };
          if (w.kind === "files") el("span", "ws-file", row, spec.type || "DOC");
          else Object.assign(R, icon(row, "ws-chk"));
          el("span", "ws-row-name", row, spec.name);
          const meta = el("span", "ws-row-meta", row);
          if (w.kind === "list") { R.wait = el("span", "ws-st-wait", meta, w.wait || "checking"); R.done = el("span", "ws-st-done", meta, w.done || "verified"); }
          else el("span", "", meta, spec.meta || "");
          return R;
        });
        if (w.kind === "files") {
          fx.pick = Math.min(w.pick || 0, fx.rows.length - 1);
          fx.pill = el("span", "ws-pill", fx.rows[fx.pick].row, w.tag || "Opened");
          fx.rows[fx.pick].row.insertBefore(fx.pill, fx.rows[fx.pick].row.lastChild);
          fx.rowY = fx.rows.map((R) => R.row.offsetTop);
        }
      } else if (w.kind === "doc") {
        el("div", "ws-doc-head", body, w.heading);
        const doc = el("div", "ws-doc", body);
        const e = w.edit;
        (w.lines || []).forEach((line, k) => {
          const p = el("p", "", doc);
          const cut = e && k === e.line ? line.indexOf(e.del) : -1;
          if (cut < 0) { p.textContent = line; return; }
          p.append(line.slice(0, cut));
          fx.del = el("span", "ws-del", p, e.del);
          p.append(" ");
          fx.ins = el("span", "ws-ins", p, "");
          fx.insText = e.ins;
          p.append(line.slice(cut + e.del.length));
        });
      }
      return { el: win, ab, ico, timer, s, sc, w, fx };
    }

    const chat0 = chatWin(false);
    const tools = steps.map((s, i) => (s.window ? toolWin(s, i, sched[i]) : null)).filter(Boolean);
    const replyW = chatWin(true);
    // stacking order and the reset before the seam: the tools leave from behind the reply window, then the
    // reply window turns back into the resting chat, so the last frame matches the first
    const D = 14;
    const wins = [
      { ...chat0, enter: null, leave: null, until: replyAt },
      ...tools.map((T) => ({ el: T.el, enter: T.sc.start - 0.2, leave: D - 1.1, leaveDur: 0.4 })),
      { ...replyW, enter: replyAt - 0.6, leave: null },
    ];
    wins.forEach((w, i) => (w.el.style.zIndex = String(i + 1)));

    // ---------- the plan panel (full-frame layout only) ----------
    let panel = null;
    if (!hasCopy) {
      const win = el("div", "ws-win ws-agentp", frame);
      bar(win, content.agent.title, content.agent.mark ?? null, 0);
      const box = el("div", "ws-plan", win);
      if (content.agent.task) { el("div", "ws-label", box, content.agent.taskLabel || "Task"); el("div", "ws-task", box, content.agent.task); }
      el("div", "ws-label", box, content.agent.stepsLabel || "Steps");
      const rows = steps.map((s, i) => {
        const row = el("div", "ws-pstep", box);
        const ic = icon(row, "ws-chk");
        const txt = el("span", "ws-pstep-text", row, s.text);
        const tm = el("span", "ws-pstep-time", row, "");
        return { row, ...ic, txt, tm, s, sc: sched[i] };
      });
      let q = null, options = [];
      if (content.agent.question) {
        q = el("div", "ws-question", box);
        el("div", "ws-q-label", q, "Question");
        el("div", "ws-q-text", q, content.agent.question.text);
        options = content.agent.question.options.map((o, i) => {
          const r = el("div", "ws-opt", q);
          const bx = el("span", "ws-box", r, "[ ]");
          el("span", "", r, o);
          return { r, box: bx, picked: i === content.agent.question.pick };
        });
      }
      const status = el("div", "ws-status", box);
      el("span", "ws-ring", status);
      el("span", "", status, content.agent.status);
      const foot = el("div", "ws-foot", win);
      if (content.agent.mode) el("div", "ws-mode", foot, "● " + content.agent.mode);
      panel = { rows, q, options, status };
    }
    return { legible: true, paint, wins, chat0, replyW, tools, panel, s1, replyAt, D };
  }

  function legibleRender(t, S, h) {
    const { tw, clamp, lerp, typed } = h;
    S.paint(t);
    const spin = `rotate(${((t * 360) % 360).toFixed(1)}deg)`;
    const reset = tw(t, S.D - 0.75, 0.5, "inOut");

    // the stack: each window's depth is how many windows are in front of it
    let above = 0;
    for (let i = S.wins.length - 1; i >= 0; i--) {
      const w = S.wins[i];
      const inP = w.enter == null ? 1 : tw(t, w.enter, 0.6, "signature");
      const outP = w.leave == null ? 0 : tw(t, w.leave, w.leaveDur, "inOut");
      // the resting chat hides once the reply window covers it (it is the same window, back on top)
      const vis = inP * (1 - outP) * (w.until != null && t >= w.until ? 0 : 1);
      const y = (1 - inP) * 48 + outP * 24 - above * 46;
      w.el.style.transform = `translateY(${y.toFixed(2)}px) scale(${(1 - above * 0.035).toFixed(4)})`;
      w.el.style.opacity = (vis * clamp(3 - above, 0, 1)).toFixed(3);
      w.el.style.visibility = vis * clamp(3 - above, 0, 1) < 0.002 ? "hidden" : "visible";
      above += vis;
    }

    // the agent picks the request up: a marker draws under the @mention
    const markP = (tw(t, 0.15, 0.6, "inOut") * (1 - reset)).toFixed(3);
    [S.chat0, S.replyW].forEach((c) => c.mention && c.mention.style.setProperty("--p", markP));
    const fold = 1 - tw(t, S.replyAt - 0.35, 0.5, "inOut") * (1 - reset);
    S.replyW.folds.forEach((f) => { f.fold.style.gridTemplateRows = `${fold.toFixed(4)}fr`; f.row.style.opacity = fold.toFixed(3); });
    if (S.replyW.reply) {
      const rp = tw(t, S.replyAt, 0.5, "signature");
      S.replyW.reply.style.opacity = (rp * (1 - reset)).toFixed(3);
      S.replyW.reply.style.transform = `translateY(${((1 - rp) * 14).toFixed(2)}px)`;
      if (S.replyW.button) S.replyW.button.style.opacity = tw(t, S.replyAt + 0.35, 0.4, "soft").toFixed(3);
    }

    const timerText = (sc, secs) => (t >= sc.start ? `${Math.max(0, Math.min(secs, Math.floor(((t - sc.start) / sc.dur) * secs)))}s` : "");
    S.tools.forEach((T) => {
      const { start, dur } = T.sc;
      const done = tw(t, start + dur - 0.05, 0.25, "snappy");
      T.ico.ring.style.opacity = (1 - done).toFixed(3);
      T.ico.ring.style.transform = spin;
      T.ico.tick.style.opacity = done.toFixed(3);
      T.timer.textContent = timerText(T.sc, T.s.secs || 1);
      const p = (a, b) => tw(t, start + a * dur, (b - a) * dur, "inOut");
      const fx = T.fx;
      if (fx.hl) fx.hl.style.setProperty("--p", p(0.12, 0.62).toFixed(3));
      if (fx.sel) {
        const y = lerp(fx.rowY[0], fx.rowY[fx.pick], p(0.08, 0.5));
        fx.sel.style.transform = `translateY(${y.toFixed(2)}px)`;
        const picked = t >= start + 0.62 * dur;
        fx.rows[fx.pick].row.classList.toggle("is-picked", picked);
        fx.pill.style.opacity = tw(t, start + 0.62 * dur, 0.3, "snappy").toFixed(3);
      }
      if (T.w.kind === "list") {
        const n = fx.rows.length;
        fx.rows.forEach((R, k) => {
          const c = start + dur * (0.15 + (0.7 * k) / Math.max(1, n - 1));
          const d = tw(t, c, 0.25, "snappy");
          const active = t >= (k ? start + dur * (0.15 + (0.7 * (k - 1)) / Math.max(1, n - 1)) : start) && t < c;
          R.ring.style.opacity = (active ? 1 - d : 0).toFixed(3);
          R.ring.style.transform = spin;
          R.tick.style.opacity = d.toFixed(3);
          R.wait.style.opacity = (1 - d).toFixed(3);
          R.done.style.opacity = d.toFixed(3);
        });
      }
      if (fx.del) {
        const s = p(0.08, 0.32);
        fx.del.style.setProperty("--s", s.toFixed(3));
        fx.del.classList.toggle("is-struck", s > 0);
        const from = start + 0.36 * dur, cps = fx.insText.length / (0.42 * dur);
        const shown = typed(fx.insText, t, from, cps);
        fx.ins.textContent = shown;
        fx.ins.classList.toggle("is-typing", t >= from && shown.length < fx.insText.length);
      }
    });

    if (S.panel) {
      const P = S.panel;
      P.rows.forEach((R) => {
        const { start, dur } = R.sc;
        const started = tw(t, start, 0.3, "soft") * (1 - reset);
        const done = tw(t, start + dur - 0.05, 0.25, "snappy") * (1 - reset);
        R.txt.style.opacity = (0.62 + 0.38 * started).toFixed(3);
        R.ring.style.opacity = (started * (1 - done)).toFixed(3);
        R.ring.style.transform = spin;
        R.tick.style.opacity = done.toFixed(3);
        R.tm.textContent = timerText(R.sc, R.s.secs || 1);
        R.tm.style.opacity = started.toFixed(3);
        R.row.classList.toggle("is-running", t >= start && t < start + dur);
      });
      const out = 1 - tw(t, S.D - 0.8, 0.45, "inOut");
      if (P.q) {
        const qp = tw(t, S.s1, 0.45, "signature");
        P.q.style.opacity = (qp * out).toFixed(3);
        P.q.style.transform = `translateY(${((1 - qp) * 12).toFixed(2)}px)`;
        P.options.forEach((o) => {
          const picked = o.picked && t >= S.s1 + 0.5 && t < S.D - 0.4;
          o.box.textContent = picked ? "[x]" : "[ ]";
          o.r.classList.toggle("is-picked", picked);
        });
      }
      P.status.style.opacity = (tw(t, S.s1 + 0.7, 0.4, "soft") * out).toFixed(3);
      P.status.style.setProperty("--spin", `${((t * 360) % 360).toFixed(1)}deg`);
    }
  }

  SiteMotion.scene({
    width: 1600,
    height: 1000,
    loop: 0,
    duration: 14,
    still: 9.6,
    setup({ root, content, tokens, h }) {
      if (content.legible) return legibleSetup({ root, content, tokens, h });
      const { el, rng, mix } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("ws");
      // initials on an avatar: dark ink on light colours, light paper on dark ones
      const onColour = (hex) => h.textOn(hex, luma(hex) > 0.55 ? C.ink : C.surface);
      root.style.setProperty("--ws-btn-ink", h.textOn(C.cta || C.accentInk || C.accent, onColour(C.cta || C.accentInk || C.accent)));
      const frame = el("div", "ws-frame", root);
      if (content.copy) {
        const copy = el("div", "ws-copy", frame);
        el("div", "ws-copy-title", copy, content.copy.title);
        el("div", "ws-copy-body", copy, content.copy.body);
        if (content.copy.code) el("div", "ws-copy-code", copy, content.copy.code);
      } else frame.classList.add("ws-full");
      const canvas = el("canvas", "ws-sky", frame);
      canvas.width = content.copy ? 1080 : 1460;
      canvas.height = 860;
      // ---------- the painted backdrop: sky gradient, haze, three ridges, grain ----------
      const paint = backdrop(canvas, content, tokens, h);
      if (content.flat) root.classList.add("is-flat");

      // ---------- chat window ----------
      const chat = el("div", "ws-win ws-chat", frame);
      const bar = el("div", "ws-bar", chat);
      ["", "", ""].forEach(() => el("i", "", bar));
      el("span", "ws-bar-title", bar, content.chat.app);
      const head = el("div", "ws-chat-head", chat);
      const hl = el("div", "", head);
      el("div", "ws-channel", hl, content.chat.channel);
      el("div", "ws-members", hl, content.chat.members);
      const avatars = el("div", "ws-avatars", head);
      content.chat.people.slice(0, 4).forEach((p, i) => { const a = el("span", "ws-av", avatars, p.name[0].toUpperCase()); a.style.background = pal[i % pal.length]; a.style.color = onColour(pal[i % pal.length]); });
      const msgs = el("div", "ws-msgs", chat);
      const people = Object.fromEntries(content.chat.people.map((p, i) => [p.name, { ...p, colour: pal[i % pal.length] }]));
      const messages = content.chat.messages.map((m) => {
        const row = el("div", "ws-msg", msgs);
        const av = el("span", "ws-av ws-av-lg" + (m.bot ? " ws-bot" : ""), row, m.bot ? "" : m.from[0].toUpperCase());
        if (!m.bot) { av.style.background = people[m.from]?.colour || pal[0]; av.style.color = onColour(people[m.from]?.colour || pal[0]); }
        const body = el("div", "ws-msg-body", row);
        const meta = el("div", "ws-meta", body);
        el("b", "", meta, m.from);
        if (m.bot) el("span", "ws-tag", meta, "APP");
        el("span", "ws-ago", meta, m.ago || "");
        el("div", "ws-text", body, m.text);
        if (m.button) el("span", "ws-btn", body, m.button);
        return { row, m };
      });
      const typing = el("div", "ws-typing", msgs);
      [0, 1, 2].forEach(() => el("i", "", typing));

      // ---------- agent window ----------
      const agent = el("div", "ws-win ws-agent", frame);
      const abar = el("div", "ws-bar", agent);
      ["", "", ""].forEach(() => el("i", "", abar));
      el("span", "ws-bar-title", abar, content.agent.title);
      const log = el("div", "ws-log", agent);
      const steps = content.agent.steps.map((s) => {
        const row = el("div", "ws-step", log);
        el("span", "ws-dot", row);
        const label = el("span", "", row, s.text);
        const timer = el("span", "ws-timer", row, "");
        return { row, label, timer, s };
      });
      const q = el("div", "ws-question", log);
      el("div", "ws-q-label", q, "Question");
      el("div", "ws-q-text", q, content.agent.question.text);
      const options = content.agent.question.options.map((o, i) => {
        const r = el("div", "ws-opt", q);
        const box = el("span", "ws-box", r, "[ ]");
        el("span", "", r, o);
        return { r, box, picked: i === content.agent.question.pick };
      });
      const status = el("div", "ws-status", log);
      el("span", "ws-ring", status);
      el("span", "", status, content.agent.status);
      const input = el("div", "ws-input", agent);
      el("span", "", input, "→ Add a follow-up");
      el("span", "ws-muted", input, "esc to stop");
      const foot = el("div", "ws-foot", agent);
      el("div", "ws-mode", foot, "● " + content.agent.mode);
      el("div", "ws-muted", foot, content.agent.model);
      return { paint, chat, agent, messages, typing, steps, q, options, status };
    },

    render(t, S, h) {
      if (S.legible) return legibleRender(t, S, h);
      const { tw, span } = h;
      S.paint(t);
      const out = 1 - tw(t, 13.2, 0.7, "inOut"); // everything settles away just before the loop

      S.chat.style.opacity = (tw(t, 0.1, 0.7, "signature") * out).toFixed(3);
      S.chat.style.transform = `translateY(${((1 - tw(t, 0.1, 0.9, "signature")) * 24).toFixed(2)}px)`;

      // chat messages arrive at their times; the bot's reply waits for the agent to finish
      S.messages.forEach(({ row, m }) => {
        const p = tw(t, m.at, 0.5, "signature");
        row.style.opacity = (p * out).toFixed(3);
        row.style.transform = `translateY(${((1 - p) * 10).toFixed(2)}px)`;
        row.style.display = t >= m.at - 0.01 ? "" : "none";
      });
      const bot = S.messages.find((x) => x.m.bot);
      const typingOn = bot ? span(t, bot.m.at - 1.6, bot.m.at - 0.1, 0.25, 0.2) : 0;
      S.typing.style.display = typingOn > 0.01 ? "" : "none";
      S.typing.style.opacity = typingOn.toFixed(3);
      [...S.typing.children].forEach((d, i) => { d.style.opacity = (0.3 + 0.7 * Math.max(0, Math.sin(t * 7 - i * 0.9))).toFixed(2); });

      // agent window slides up over the chat, then works through its steps
      const A = 2.6;
      const ap = tw(t, A, 0.9, "signature");
      S.agent.style.opacity = (ap * out).toFixed(3);
      // when the reply lands in chat, the agent window eases aside so the answer is readable
      const aside = bot ? tw(t, bot.m.at - 0.7, 0.8, "snappy") : 0;
      S.agent.style.transform = `translate(${(aside * 70).toFixed(2)}px, ${((1 - ap) * 40 + aside * 90).toFixed(2)}px)`;
      let at = A + 0.7;
      S.steps.forEach((st) => {
        const begin = at, dur = st.s.secs * 0.45;
        const p = tw(t, begin, 0.35, "soft");
        st.row.style.opacity = p.toFixed(3);
        st.row.style.display = t >= begin ? "" : "none";
        const running = t >= begin && t < begin + dur;
        st.row.classList.toggle("is-running", running);
        const secs = Math.max(0, Math.min(st.s.secs, Math.floor(((t - begin) / dur) * st.s.secs)));
        st.timer.textContent = t >= begin ? `${secs || 0}s` : "";
        at += dur + 0.15;
      });
      const qAt = at + 0.2;
      const qp = tw(t, qAt, 0.45, "signature");
      S.q.style.display = t >= qAt ? "" : "none";
      S.q.style.opacity = qp.toFixed(3);
      S.options.forEach((o) => {
        const picked = o.picked && t > qAt + 1.3;
        o.box.textContent = picked ? "[x]" : "[ ]";
        o.r.classList.toggle("is-picked", picked);
      });
      const sAt = qAt + 1.8;
      S.status.style.display = t >= sAt ? "" : "none";
      S.status.style.opacity = tw(t, sAt, 0.4, "soft").toFixed(3);
      S.status.style.setProperty("--spin", `${((t * 360) % 360).toFixed(1)}deg`);
    },
  });
})();
