/* radar-sweep: every run on one scope, and the one you pause (Canvas 2D + DOM).
 * Each blip is a running job flying a straight course across the scope; the sweep paints it as it passes and
 * it fades like phosphor until the next turn. One job (the focus run) starts blinking amber when the sweep
 * finds it failing. An on-call cursor opens its menu and pauses it: the blip stops dead, its data block flips
 * to "Paused · retry at 09:42", and the sweep passes over it calmly while a ring counts down to the retry. The
 * ring closes, the run resumes on attempt 2 and flies off the scope.
 *
 * Pure in t, loop: 0. The sweep makes exactly 4 turns per loop. Every other run crosses its course once per
 * loop (u = u0 + t/D, wrapped), so each one is back where it started at the seam. The focus run only moves
 * while it is not paused, at the speed that still crosses its whole course once per loop.
 */
(function () {
  const W = 1600, H = 900, D = 16;
  const TAU = Math.PI * 2;
  const CX = 500, CY = 450, R = 370; // the scope
  const TURN = 4; // seconds per sweep turn: 4 turns per loop
  const OMEGA = TAU / TURN;

  // the story beats (seconds)
  const T = {
    curIn: 2.6, curAt: 3.6, click1: 3.7, menuIn: 3.75, toItem: 3.95, atItem: 4.3, click2: 4.42,
    pause: 4.5, rest0: 4.6, rest1: 5.3, curOut0: 7.2, curOut1: 8.1,
    resume: 11.5, back: 14.6, cross: 6.0, // cross: the sweep passes over the paused run
  };
  const MOVING = D - (T.resume - T.pause); // seconds per loop the focus run is in flight

  // courses: heading (deg, canvas: clockwise from east), offset of the course from the centre, phase at t = 0,
  // and which corner the data block hangs off (phases and corners picked so the first seven blocks, at 16 px, never
  // touch each other, the focus block or the paused card)
  const LANES = [
    { a: 76, d: 250, u0: 0.9, q: "se" },
    { a: -48, d: -250, u0: 0.58, q: "ne" },
    { a: 24, d: -89, u0: 0.58, q: "ne" },
    { a: 166, d: 52, u0: 0.76, q: "ne" },
    { a: 117, d: -63, u0: 0.86, q: "nw" },
    { a: -16, d: 197, u0: 0.02, q: "nw" },
    { a: -114, d: 59, u0: 0.34, q: "nw" },
    { a: -149, d: 250, u0: 0.768, q: "sw" }, // an eighth run, if the content brings one
  ];
  const FOCUS = { a: -18, d: 60, uP: 0.6, q: "ne" }; // paused at uP

  const frac = (x) => x - Math.floor(x);
  const wrapT = (t) => frac(t / D) * D;
  const course = (l) => {
    const a = (l.a * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
    const half = Math.sqrt(R * R - l.d * l.d);
    return { ox: CX - dy * l.d, oy: CY + dx * l.d, dx, dy, half };
  };
  const at = (c, u) => [c.ox + c.dx * (u - 0.5) * 2 * c.half, c.oy + c.dy * (u - 0.5) * 2 * c.half];
  const edge = (u) => Math.max(0, Math.min(1, (u - 0.03) / 0.07, (0.97 - u) / 0.07));
  // the focus run: in flight except while paused
  const focusU = (t) => {
    const w = wrapT(t);
    const m = w < T.pause ? w : w < T.resume ? T.pause : w - (T.resume - T.pause);
    return frac(FOCUS.uP - T.pause / MOVING + m / MOVING);
  };

  const hexRgb = (c) => {
    const m = c.replace("#", "");
    const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  };
  const lum = (c) => { const [r, g, b] = hexRgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));

  SiteMotion.scene({
    width: W, height: H, duration: D, loop: 0, still: 6.3,

    setup({ root, content, tokens, h }) {
      const { el, svg, mix } = h;
      const C = tokens.color;
      const WHITE = "#ffffff";
      root.classList.add("rs");

      // ---- colours: the scope is a dark instrument on any paper ----
      const dark = lum(C.paper) < 0.4;
      const deep = C.accentInk || C.accent;
      const disc = dark ? mix(C.paper, deep, 0.14) : mix(C.ink, deep, 0.22);
      const phos = lum(C.accent) < 0.35 ? mix(C.accent, WHITE, 0.45) : C.accent; // the phosphor
      const tagBg = mix(disc, phos, 0.08);
      const col = {
        disc, phos, tagBg,
        rimIn: mix(disc, phos, 0.04),
        calm: mix(disc, WHITE, 0.86), // a paused run: lit, but no colour
        warn: C.warning || C.accent,
        flipBg: mix(disc, WHITE, 0.94),
      };
      const vars = {
        "--rs-disc": disc,
        "--rs-tag-bg": tagBg,
        "--rs-tag-line": h.alpha(phos, 0.32),
        "--rs-tag-ink": h.textOn(tagBg, mix(phos, WHITE, 0.6)),
        "--rs-tag-sub": h.textOn(tagBg, mix(phos, disc, 0.2)),
        "--rs-warn": h.textOn(tagBg, col.warn),
        "--rs-flip-bg": col.flipBg,
        "--rs-flip-ink": h.textOn(col.flipBg, disc),
        "--rs-flip-sub": h.textOn(col.flipBg, mix(disc, col.flipBg, 0.42)),
        "--rs-warn-dot": col.warn,
      };
      for (const k in vars) root.style.setProperty(k, vars[k]);

      // ---- canvas ----
      const canvas = el("canvas", "rs-canvas", root);
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // the static scope (rings, ticks, bezel) is drawn once onto its own layer
      const base = document.createElement("canvas");
      base.width = W * dpr; base.height = H * dpr;
      const b = base.getContext("2d");
      b.scale(dpr, dpr);
      const hair = h.ui.stroke("hair", 1), fine = h.ui.stroke("fine", 1), regular = h.ui.stroke("regular", 1.5);
      if (fine > 0) { // the bezel on the paper
        b.strokeStyle = h.ui.strokeColor(C.line);
        b.lineWidth = fine;
        b.beginPath(); b.arc(CX, CY, R + 12, 0, TAU); b.stroke();
      }
      const g = b.createRadialGradient(CX, CY, 0, CX, CY, R);
      g.addColorStop(0, mix(disc, phos, 0.07));
      g.addColorStop(1, disc);
      b.fillStyle = g;
      b.beginPath(); b.arc(CX, CY, R, 0, TAU); b.fill();
      b.strokeStyle = h.alpha(phos, 0.16);
      b.lineWidth = Math.max(hair, 0.75); // sm-native: the range rings are the instrument, never erased
      for (let k = 1; k <= 3; k++) { b.beginPath(); b.arc(CX, CY, (R * k) / 4, 0, TAU); b.stroke(); }
      b.strokeStyle = h.alpha(phos, 0.1);
      b.beginPath(); b.moveTo(CX - R, CY); b.lineTo(CX + R, CY); b.moveTo(CX, CY - R); b.lineTo(CX, CY + R); b.stroke();
      b.strokeStyle = h.alpha(phos, 0.38);
      for (let deg = 0; deg < 360; deg += 5) {
        const a = (deg * Math.PI) / 180, len = deg % 30 === 0 ? 14 : 6;
        b.beginPath();
        b.moveTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
        b.lineTo(CX + Math.cos(a) * (R - len), CY + Math.sin(a) * (R - len));
        b.stroke();
      }
      b.strokeStyle = h.alpha(phos, 0.55);
      b.lineWidth = Math.max(regular, 1); // sm-native: the rim of the scope
      b.beginPath(); b.arc(CX, CY, R, 0, TAU); b.stroke();

      // bearings around the bezel
      [["000", 0, -1], ["090", 1, 0], ["180", 0, 1], ["270", -1, 0]].forEach(([s, x, y]) => {
        const n = el("div", "rs-bearing", root, s);
        n.style.left = CX + x * (R + 34) + "px";
        n.style.top = CY + y * (R + 30) + "px";
      });

      // ---- runs ----
      // a block's size from its longest line (16 px mono ≈ 9.7 px a glyph), so it can fade before the rim cuts it
      const blockW = (...lines) => Math.max(...lines.map((x) => x.length)) * 9.7 + 22;
      // data blocks live inside the scope: a block reaching past the rim is cut by it, as on a real display
      const tags = el("div", "rs-tags", root);
      tags.style.clipPath = `circle(${R - 1}px at ${CX}px ${CY}px)`;
      const runs = content.runs.map((r, i) => {
        const lane = LANES[i % LANES.length];
        const c = course(lane);
        const tag = el("div", "rs-tag", tags);
        tag.dataset.q = lane.q;
        el("div", "rs-id", tag, r.id);
        el("div", "rs-step", tag, r.step);
        return { ...r, lane, c, tag, w: blockW(r.id, r.step) };
      });

      // the focus run: a front data block (step / warning / resumed lines) and the paused card behind it
      const F = content.focus;
      const fc = course(FOCUS);
      const ftag = el("div", "rs-tag rs-focus", tags);
      el("div", "rs-id", ftag, F.id);
      const lines = el("div", "rs-lines", ftag);
      const fStep = el("div", "rs-step", lines, F.step);
      const fWarn = el("div", "rs-step rs-warnline", lines, F.warn);
      const fRes = el("div", "rs-step rs-resline", lines, F.resumed);
      const card = el("div", "rs-card", tags);
      el("div", "rs-card-id", card, F.id);
      const cardMain = el("div", "rs-card-main", card);
      const icon = el("span", "rs-pause", cardMain);
      el("i", "", icon); el("i", "", icon);
      el("span", "", cardMain, F.paused);

      const P = at(fc, FOCUS.uP);
      const phiP = Math.atan2(P[1] - CY, P[0] - CX);
      const theta0 = phiP - OMEGA * T.cross; // the sweep crosses the paused run at T.cross
      const theta = (t) => theta0 + OMEGA * t;
      const since = (t, x, y) => { // seconds since the sweep last painted (x, y)
        const d = theta(t) - Math.atan2(y - CY, x - CX);
        return (((d % TAU) + TAU) % TAU) / OMEGA;
      };
      // the sweep finds the focus run failing: the first pass after 1.2 s
      let warnAt = 1.2;
      for (let t = 1.2, prev = Infinity; t < 6; t += 0.002) {
        const p = at(fc, focusU(t));
        const s = since(t, p[0], p[1]);
        if (s < prev && prev !== Infinity && s < 0.1) { warnAt = t; break; }
        prev = s;
      }

      // ---- menu and cursor ----
      const clickAt = at(fc, focusU(T.click1));
      const menu = el("div", "rs-menu", root);
      menu.style.left = clickAt[0] + 20 + "px";
      menu.style.top = clickAt[1] + 22 + "px";
      const items = content.menu.map((m, i) => {
        const it = el("div", "rs-item" + (i === 2 ? " rs-item-quiet" : ""), menu);
        const ic = el("span", "rs-item-icon", it);
        ic.dataset.k = String(i);
        if (i === 0) { el("i", "", ic); el("i", "", ic); }
        el("span", "", it, m);
        return it;
      });
      const cursor = el("div", "rs-cursor", root);
      const arrow = svg("svg", { viewBox: "0 0 20 28", width: 20, height: 28 }, cursor);
      svg("path", { d: "M1.5 1.5 L1.5 22 L7 17 L10.8 25.6 L14.4 24 L10.6 15.6 L17.6 15.6 Z", fill: WHITE, stroke: "#000000", "stroke-width": 1.5, "stroke-linejoin": "round" }, arrow); // sm-native: an OS pointer keeps its outline on any backdrop
      el("span", "rs-pill", cursor, content.operator || "On call");
      const ripple = el("span", "rs-ripple", cursor);
      const itemAt = [clickAt[0] + 20 + 170, clickAt[1] + 22 + 24];
      const curKeys = [
        [0, 990, 980], [T.curIn, 990, 980], [T.curAt, ...at(fc, focusU(T.curAt))], [T.toItem, ...at(fc, focusU(T.curAt))],
        [T.atItem, ...itemAt], [T.rest0, ...itemAt], [T.rest1, P[0] + 54, P[1] + 92], [T.curOut0, P[0] + 54, P[1] + 92],
        [T.curOut1, 1000, 980], [D, 1000, 980],
      ];
      const curEase = ["linear", "signature", "linear", "snappy", "linear", "soft", "linear", "inOut", "linear"];

      // ---- copy and readout ----
      const copy = el("div", "rs-copy", root);
      el("div", "rs-eyebrow", copy, content.eyebrow || "");
      el("div", "rs-h", copy, content.heading || "");
      el("div", "rs-sub", copy, content.sub || "");
      const ro = el("div", "rs-readout", root);
      const stats = el("div", "rs-stats", ro);
      const N = content.runs.length + 1;
      const stat = (label, kind) => {
        const s = el("div", "rs-stat", stats);
        const l = el("div", "rs-stat-label", s);
        el("span", "rs-key rs-key-" + kind, l);
        el("span", "", l, label);
        const win = el("div", "rs-num", s);
        return { a: el("span", "rs-n", win), b: el("span", "rs-n", win) };
      };
      const sRun = stat(content.stats.running, "run");
      const sPause = stat(content.stats.paused, "pause");
      const st = el("div", "rs-status", ro);
      const who = content.operator || "On call";
      const sv = { n: N, id: F.id, who };
      const statusLines = ["healthy", "failing", "paused", "resumed"].map((k) => {
        const line = el("div", "rs-line rs-line-" + k, st);
        el("span", "rs-dot", line);
        el("span", "", line, fill(content.status[k], sv));
        return line;
      });

      const fW = blockW(F.id, F.step, F.warn, F.resumed);
      return { ctx, base, dpr, runs, fW, ftag, fStep, fWarn, fRes, card, fc, P, theta, since, warnAt, col, menu, items, cursor, ripple, curKeys, curEase, sRun, sPause, statusLines, N };
    },

    render(t, S, h) {
      const { ctx, col, fc } = S;
      const { clamp, tw, ease, mix, alpha } = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W * S.dpr, H * S.dpr);
      ctx.drawImage(S.base, 0, 0);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);

      // ---- the sweep: a fading wedge behind the beam ----
      const th = S.theta(t);
      const WEDGE = 1.15;
      ctx.save();
      ctx.beginPath(); ctx.arc(CX, CY, R - 1, 0, TAU); ctx.clip();
      const cg = ctx.createConicGradient(th - WEDGE, CX, CY);
      const f = WEDGE / TAU;
      cg.addColorStop(0, alpha(col.phos, 0));
      cg.addColorStop(f * 0.6, alpha(col.phos, 0.07));
      cg.addColorStop(f, alpha(col.phos, 0.3));
      cg.addColorStop(Math.min(1, f + 0.0005), alpha(col.phos, 0));
      cg.addColorStop(1, alpha(col.phos, 0));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R, th - WEDGE, th); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = alpha(col.phos, 0.85);
      ctx.lineWidth = 2; // sm-native: the beam is the subject, not an outline
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(th) * R, CY + Math.sin(th) * R); ctx.stroke();
      ctx.restore();

      // a data block fades out as its far corner nears the rim
      const rim = (x, y, q, w) => {
        const fx = x + (q[1] === "e" ? 12 + w : -12 - w), fy = y + (q[0] === "n" ? -64 : 64);
        const far = Math.max(Math.hypot(fx - CX, fy - CY), Math.hypot(fx - CX, y - CY), Math.hypot(x - CX, fy - CY));
        return clamp((R - 4 - far) / 30);
      };
      const lit = (x, y) => Math.exp(-S.since(t, x, y) / 1.1);
      const placeTag = (node, x, y, q, a, flip = 1) => {
        const ax = x + (q[1] === "e" ? 12 : -12), ay = y + (q[0] === "n" ? -12 : 12);
        const tx = q[1] === "e" ? "0" : "-100%", ty = q[0] === "n" ? "-100%" : "0";
        node.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) translate(${tx}, ${ty})` + (flip < 1 ? ` scaleY(${flip.toFixed(3)})` : "");
        node.style.opacity = a.toFixed(3);
        return [ax, ay];
      };
      const leader = (x, y, q, a, c) => {
        if (a < 0.02) return;
        const sx = q[1] === "e" ? 1 : -1, sy = q[0] === "n" ? -1 : 1;
        ctx.strokeStyle = alpha(c, 0.5 * a);
        ctx.lineWidth = 1; // sm-native: a leader line is a data mark
        ctx.beginPath(); ctx.moveTo(x + sx * 6, y + sy * 6); ctx.lineTo(x + sx * 12, y + sy * 12); ctx.stroke();
      };
      // a run's phosphor trail: where it was on the last few sweeps' worth of time
      const trail = (posAt, e) => {
        ctx.fillStyle = col.phos;
        for (let k = 1; k <= 5; k++) {
          const p = posAt(t - k * 0.55);
          ctx.globalAlpha = 0.26 * (1 - k / 6) * e;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.1, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      const blip = (x, y, c, a, l) => {
        ctx.fillStyle = alpha(c, 0.22 * l * a);
        ctx.beginPath(); ctx.arc(x, y, 6 + 6 * l, 0, TAU); ctx.fill();
        ctx.fillStyle = alpha(mix(c, "#ffffff", 0.35 * l), a * (0.45 + 0.55 * l));
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
      };

      // ---- the other runs ----
      S.runs.forEach((r) => {
        const u = frac(r.lane.u0 + t / D);
        const e = edge(u);
        const [x, y] = at(r.c, u);
        trail((tt) => at(r.c, frac(r.lane.u0 + tt / D)), e);
        const l = lit(x, y);
        blip(x, y, col.phos, e, l);
        const ta = e * rim(x, y, r.lane.q, r.w);
        leader(x, y, r.lane.q, ta, col.phos);
        placeTag(r.tag, x, y, r.lane.q, ta);
      });

      // ---- the focus run ----
      const u = focusU(t);
      const e = edge(u);
      const [x, y] = at(fc, u);
      trail((tt) => at(fc, focusU(tt)), e);
      const l = lit(x, y);
      const warnOn = clamp((t - S.warnAt) / 0.12) * (1 - clamp((t - T.pause) / 0.2));
      const pausedOn = tw(t, T.pause, 0.25, "snappy") * (1 - tw(t, T.resume, 0.25, "snappy"));
      // running and failing: a dot that blinks amber once the sweep finds it
      const runA = 1 - pausedOn;
      if (runA > 0.01) {
        const blink = 0.5 + 0.5 * Math.cos(TAU * 2 * Math.max(0, t - S.warnAt));
        const c = warnOn > 0 ? mix(col.phos, col.warn, warnOn) : col.phos;
        blip(x, y, c, e * runA * (1 - warnOn * 0.55 * (1 - blink)), Math.max(l, warnOn * blink));
        if (warnOn > 0) { // alarm rings, one every 0.8 s
          const k = frac((t - S.warnAt) / 0.8);
          ctx.strokeStyle = alpha(col.warn, 0.7 * (1 - k) * warnOn);
          ctx.lineWidth = 1.5; // sm-native: an alarm ring is a data mark
          ctx.beginPath(); ctx.arc(x, y, 8 + 24 * k, 0, TAU); ctx.stroke();
        }
      }
      // paused: a calm pause glyph, a countdown to the retry, one slow ring when the hold lands
      if (pausedOn > 0.01) {
        const a = pausedOn * e;
        const left = 1 - clamp((t - T.pause) / (T.resume - T.pause));
        ctx.fillStyle = alpha(col.calm, 0.1 * a + 0.12 * l * a);
        ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
        ctx.strokeStyle = alpha(col.calm, a * (0.7 + 0.3 * l));
        ctx.lineWidth = 1.5; // sm-native: data mark
        ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
        ctx.fillStyle = alpha(col.calm, a);
        ctx.fillRect(x - 3.5, y - 4, 2.4, 8);
        ctx.fillRect(x + 1.1, y - 4, 2.4, 8);
        ctx.strokeStyle = alpha(col.calm, 0.16 * a);
        ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke();
        ctx.strokeStyle = alpha(col.calm, 0.75 * a);
        ctx.lineWidth = 2; // sm-native: the countdown is a data mark
        ctx.beginPath(); ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
      }
      const pulse = (t0, c, r0, r1) => {
        const p = clamp((t - t0) / 0.9);
        if (p <= 0 || p >= 1) return;
        ctx.strokeStyle = alpha(c, 0.75 * (1 - p) * e);
        ctx.lineWidth = 1.5; // sm-native: data mark
        ctx.beginPath(); ctx.arc(x, y, r0 + (r1 - r0) * ease.signature(p), 0, TAU); ctx.stroke();
      };
      pulse(T.pause, col.calm, 12, 54);
      pulse(T.resume, col.phos, 16, 46);

      // ---- the focus data block: front (running / failing / resumed) flips to the paused card and back ----
      const flipP = (t0) => ease.inOut(clamp((t - t0) / 0.5));
      const toCard = flipP(T.pause), toFront = flipP(T.resume);
      const inCard = t >= T.pause && t < T.resume;
      const sFront = inCard ? Math.max(0, Math.cos(Math.PI * toCard)) : t >= T.resume ? Math.max(0, -Math.cos(Math.PI * toFront)) : 1;
      const sCard = inCard ? Math.max(0, -Math.cos(Math.PI * toCard)) : t >= T.resume ? Math.max(0, Math.cos(Math.PI * toFront)) : 0;
      leader(x, y, FOCUS.q, e, inCard ? col.calm : warnOn > 0 ? col.warn : col.phos);
      placeTag(S.ftag, x, y, FOCUS.q, e * rim(x, y, FOCUS.q, S.fW) * (sFront > 0.001 ? 1 : 0), sFront);
      placeTag(S.card, x, y, FOCUS.q, e * (sCard > 0.001 ? 1 : 0), sCard);
      // the front's second line: step → failures (amber) → resumed → step
      const warnLine = tw(t, S.warnAt + 0.1, 0.3, "snappy") * (1 - tw(t, T.pause, 0.1, "snappy"));
      const resLine = tw(t, T.resume, 0.1, "snappy") * (1 - tw(t, T.back, 0.35, "snappy"));
      S.fWarn.style.opacity = warnLine.toFixed(3);
      S.fRes.style.opacity = resLine.toFixed(3);
      S.fStep.style.opacity = Math.max(0, 1 - warnLine - resLine).toFixed(3);
      S.ftag.classList.toggle("is-warn", warnLine > 0.5);

      // ---- the menu and the cursor ----
      const mIn = tw(t, T.menuIn, 0.3, "snappy") * (1 - tw(t, T.pause, 0.22, "snappy"));
      S.menu.style.opacity = mIn.toFixed(3);
      S.menu.style.transform = `translateY(${((1 - tw(t, T.menuIn, 0.3, "snappy")) * -6).toFixed(2)}px) scale(${(0.96 + 0.04 * tw(t, T.menuIn, 0.3, "snappy")).toFixed(4)})`;
      const hover = tw(t, T.atItem - 0.06, 0.15, "soft");
      S.items[0].classList.toggle("is-hover", hover > 0.5 && t < T.click2);
      S.items[0].classList.toggle("is-press", t >= T.click2);

      const keys = S.curKeys;
      let k = 0;
      while (k < keys.length - 2 && t >= keys[k + 1][0]) k++;
      const [t0, x0, y0] = keys[k], [t1, x1, y1] = keys[k + 1];
      const curve = S.curEase[k];
      const p = curve === "linear" ? 0 : tw(t, t0, t1 - t0, curve);
      const cx = x0 + (x1 - x0) * p, cy = y0 + (y1 - y0) * p;
      const click = [T.click1, T.click2].find((c) => t >= c && t < c + 0.5);
      const press = click != null ? 1 - 0.12 * Math.sin(Math.PI * clamp((t - click) / 0.16)) : 1;
      S.cursor.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(${press.toFixed(3)})`;
      S.cursor.style.opacity = t > T.curIn - 0.05 && t < T.curOut1 + 0.05 ? "1" : "0";
      S.ripple.style.opacity = click != null ? (0.8 * (1 - (t - click) / 0.5)).toFixed(3) : "0";
      S.ripple.style.transform = `scale(${click != null ? (0.4 + (t - click) * 1.8).toFixed(3) : "0.4"})`;

      // ---- the readout: counts come from the blips' state ----
      const roll = (stat, from, to, at1, at2) => {
        // value before at1 = from, between = to, after at2 = from
        let prev = from, cur = from, p = 1;
        if (t >= at1 && t < at2) { prev = from; cur = to; p = tw(t, at1, 0.4, "snappy"); }
        else if (t >= at2) { prev = to; cur = from; p = tw(t, at2, 0.4, "snappy"); }
        h.text(stat.a, String(prev)); h.text(stat.b, String(cur));
        stat.a.style.transform = `translateY(${(-100 * p).toFixed(2)}%)`;
        stat.a.style.opacity = (1 - p).toFixed(3);
        stat.b.style.transform = `translateY(${(100 * (1 - p)).toFixed(2)}%)`;
        stat.b.style.opacity = p.toFixed(3);
      };
      roll(S.sRun, S.N, S.N - 1, T.pause, T.resume);
      roll(S.sPause, 0, 1, T.pause, T.resume);
      const segs = [
        [0, -1, S.warnAt + 0.15], [1, S.warnAt + 0.15, T.pause], [2, T.pause, T.resume], [3, T.resume, T.back], [0, T.back, D + 1],
      ];
      const lineA = [0, 0, 0, 0];
      segs.forEach(([i, a, b]) => { lineA[i] += tw(t, a, 0.32, "snappy") * (1 - tw(t, b, 0.18, "snappy")); });
      S.statusLines.forEach((n, i) => {
        n.style.opacity = clamp(lineA[i]).toFixed(3);
        n.style.transform = `translateY(${((1 - clamp(lineA[i])) * 8).toFixed(2)}px)`;
      });
    },
  });
})();
