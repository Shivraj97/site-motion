/* moving-boxes: a migration as moving day (SVG + DOM, closed-form).
 * A cramped old office holds four labelled boxes on cluttered shelves. A hand truck takes them one at a time: the box
 * slides out of the door onto the toe plate, the truck tips back and rolls (wheels turn by distance) along the
 * walkway to the new building, tips upright and the box slides into the lobby. There it opens and its contents
 * fly into the matching room, filling a shelf and the floor; the room's count rises with what has landed. The fragile
 * box travels gently and gets an "intact" check before it is opened. The progress line counts boxes whose contents
 * have all landed. Before the seam the rooms clear and the old shelves restock, back to the t = 0 state.
 */
(function () {
  const D = 14, W = 1600, H = 900;
  const GROUND = 796, WHEEL = 13;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.2,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, alpha, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("mb");
      const rand = rng(content.seed || 31);

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
      const sat = pal.filter((c) => hsl(c)[1] > 0.15);
      const near = (hue) => (sat.length ? sat : pal).slice().sort((a, b) => hueDist(hsl(a)[0], hue) - hueDist(hsl(b)[0], hue))[0];
      const warm = near(36);
      const light = lum(C.paper) > 0.5;
      const deep = light ? C.ink : C.paper, bright = light ? C.surface : C.ink;
      const INK = ui.strokeColor(C.stroke || C.ink);
      const card = mix(warm, deep, light ? 0.12 : 0.3), cardDark = mix(warm, deep, light ? 0.3 : 0.45), tape = mix(warm, bright, 0.35);
      const itemCols = [near(220), near(300), near(160), C.accent].map((c, i) => c || pal[i % pal.length]);

      // ---- layout ----
      const OLD = { x0: 584, x1: 806, top: 300, door: GROUND - 200 };
      const NEW = { x0: 1146, x1: 1560, top: 236, door: GROUND - 210, lobby: 1300 };
      const BW = 144, BH = 78;
      const REST = 826, ARRIVE = 1019; // axle x at the old door and at the new door
      const POST = 990; // the checkpoint on the walkway
      const levels = [448, 564, 680, GROUND]; // shelf boards (the last is the floor)
      const boxes = content.boxes.slice(0, 4);
      const MID = NEW.lobby + 128, FLOOR2 = NEW.top + 278; // the wall between the rooms, the upper floor
      const rooms = [
        { x: NEW.lobby + 6, y: NEW.top + 6, w: MID - NEW.lobby - 8, h: FLOOR2 - NEW.top - 8 },
        { x: MID + 2, y: NEW.top + 6, w: NEW.x1 - MID - 4, h: FLOOR2 - NEW.top - 8 },
        { x: NEW.lobby + 6, y: FLOOR2 + 4, w: MID - NEW.lobby - 8, h: GROUND - FLOOR2 - 4 },
        { x: MID + 2, y: FLOOR2 + 4, w: NEW.x1 - MID - 4, h: GROUND - FLOOR2 - 4 },
      ];
      rooms.forEach((r) => { r.shelf = r.y + r.h - 106; r.floor = r.y + r.h; });
      const PER = 8;

      // ---- timing ----
      const plan = boxes.map((bx, i) => {
        const a = 0.5 + i * 2.45;
        const gentle = !!bx.fragile;
        const travel = gentle ? 1.15 : 0.85;
        const p = { a, gentle, load: a, tilt: a + 0.6, go: a + 0.75, travel };
        p.untilt = p.go + travel;
        p.unload = p.untilt + 0.18;
        p.check = gentle ? p.unload + 0.4 : null;
        p.open = p.unload + (gentle ? 0.75 : 0.38);
        p.fly0 = p.open + 0.22;
        p.back = p.unload + 0.32;
        p.items = Array.from({ length: PER }, (_, k) => ({ start: p.fly0 + k * 0.07, dur: 0.55 }));
        p.done = p.items[PER - 1].start + p.items[PER - 1].dur;
        p.fade = p.fly0 + PER * 0.07 + 0.1;
        return p;
      });
      // later boxes wait for the truck to come back
      for (let i = 1; i < plan.length; i++) {
        const need = plan[i - 1].back + 0.7 - 0.5;
        if (plan[i].a < need) {
          const dt = need - plan[i].a;
          const p = plan[i];
          ["a", "load", "tilt", "go", "untilt", "unload", "open", "fly0", "back", "done", "fade"].forEach((k) => (p[k] += dt));
          if (p.check != null) p.check += dt;
          p.items.forEach((it) => (it.start += dt));
        }
      }
      plan.forEach((p) => { let t = p.go; while (t < p.go + p.travel && REST + (ARRIVE - REST) * h.tw(t, p.go, p.travel, "inOut") + 5 + BW / 2 < POST) t += 0.002; p.pass = t; });
      const RESET = 12.7, RDUR = 0.8;
      const lastDone = Math.max(...plan.map((p) => p.done));
      if (lastDone > RESET - 0.4) console.warn(`moving-boxes: last box lands at ${lastDone.toFixed(2)} s`);

      // ---- drawing: buildings ----
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "mb-svg" }, root);
      const thick = ui.stroke("regular", 2), fine = ui.stroke("fine", 1.5);
      // sm-native-start: buildings, shelves and the walkway are drawn scenery (fills, planks, grain)
      // ground and walkway
      svg("rect", { x: 560, y: GROUND, width: 1020, height: 14, fill: mix(C.line, C.paper, 0.2) }, s);
      svg("line", { x1: 560, y1: GROUND, x2: 1580, y2: GROUND, stroke: INK, "stroke-width": thick, "stroke-linecap": "round" }, s);
      for (let x = OLD.x1 + 16; x < NEW.x0 - 14; x += 30) svg("path", { d: `M${x} ${GROUND + 3} l7 4 l-7 4`, fill: "none", stroke: C.muted, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.7 }, s);
      // old building: a cramped, cluttered office
      const oldWall = mix(C.raised || C.surface, C.muted, light ? 0.22 : 0.16), oldBack = mix(oldWall, deep, light ? 0.1 : 0.2);
      svg("rect", { x: OLD.x0, y: OLD.top, width: OLD.x1 - OLD.x0, height: GROUND - OLD.top, fill: oldBack }, s);
      // planks are axis-aligned on whole pixels: boxes slide over them, and slanted hairlines re-rasterise differently under a moved layer
      for (let y = OLD.top + 20; y < GROUND; y += 22) svg("rect", { x: OLD.x0 + 4, y, width: OLD.x1 - OLD.x0 - 8, height: 1, fill: mix(oldBack, deep, 0.12) }, s);
      // a crack and a cobweb
      svg("path", { d: `M${OLD.x0 + 150} ${OLD.top + 4} l-8 26 l10 14 l-6 22`, fill: "none", stroke: mix(oldBack, deep, 0.35), "stroke-width": 1.4, "stroke-linejoin": "round" }, s);
      const web = `M${OLD.x0 + 4} ${OLD.top + 42} Q${OLD.x0 + 22} ${OLD.top + 22} ${OLD.x0 + 42} ${OLD.top + 4} M${OLD.x0 + 4} ${OLD.top + 26} Q${OLD.x0 + 14} ${OLD.top + 14} ${OLD.x0 + 26} ${OLD.top + 4} M${OLD.x0 + 4} ${OLD.top + 4} L${OLD.x0 + 34} ${OLD.top + 34}`;
      svg("path", { d: web, fill: "none", stroke: mix(oldBack, bright, 0.5), "stroke-width": 1, opacity: 0.8 }, s);
      // shelf unit
      const shelfC = mix(warm, deep, light ? 0.45 : 0.35);
      [OLD.x0 + 10, OLD.x0 + 160].forEach((x) => svg("rect", { x, y: OLD.top + 34, width: 6, height: GROUND - OLD.top - 34, fill: shelfC, stroke: INK, "stroke-width": fine }, s));
      levels.slice(0, 3).forEach((y) => svg("rect", { x: OLD.x0 + 6, y, width: 166, height: 6, fill: shelfC, stroke: INK, "stroke-width": fine }, s));
      // paper pile on top and a hanging bulb
      for (let k = 0; k < 4; k++) svg("rect", { x: OLD.x0 + 22 + k * 2, y: OLD.top + 26 - k * 5, width: 46, height: 5, fill: mix(C.surface, oldBack, 0.2 + k * 0.1), stroke: INK, "stroke-width": 1, transform: `rotate(${(k % 2 ? 3 : -2)} ${OLD.x0 + 45} ${OLD.top + 28})` }, s);
      svg("line", { x1: OLD.x1 - 34, y1: OLD.top, x2: OLD.x1 - 34, y2: OLD.top + 40, stroke: INK, "stroke-width": 1.4 }, s);
      svg("circle", { cx: OLD.x1 - 34, cy: OLD.top + 48, r: 8, fill: mix(C.warning || warm, C.surface, 0.3), stroke: INK, "stroke-width": fine }, s);
      // sticky notes, too many of them
      [[762, 404, -8], [784, 424, 6], [766, 452, 4], [786, 480, -5], [762, 506, 9], [784, 532, -3], [768, 560, 5]].forEach(([x, y, r], k) => svg("rect", { x, y, width: 20, height: 18, fill: mix(pal[(k * 2 + 1) % pal.length], C.surface, light ? 0.1 : 0.0), stroke: INK, "stroke-width": 1, transform: `rotate(${r} ${x + 10} ${y + 9})` }, s));
      // walls and roof
      svg("path", { d: `M${OLD.x0} ${GROUND} V${OLD.top} H${OLD.x1} V${OLD.door}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 3), "stroke-linejoin": "round", "stroke-linecap": "round" }, s);
      svg("path", { d: `M${OLD.x0 - 16} ${OLD.top + 2} L${OLD.x0 + 24} ${OLD.top - 40} L${OLD.x1 - 20} ${OLD.top - 36} L${OLD.x1 + 14} ${OLD.top + 2} Z`, fill: mix(C.muted, deep, light ? 0.2 : 0.4), stroke: INK, "stroke-width": thick, "stroke-linejoin": "round" }, s);
      svg("rect", { x: OLD.x1 - 6, y: OLD.door - 6, width: 12, height: 6, fill: shelfC, stroke: INK, "stroke-width": fine }, s);

      // new building: clean rooms, one per kind of data
      const newWall = C.surface;
      svg("rect", { x: NEW.x0, y: NEW.top, width: NEW.x1 - NEW.x0, height: GROUND - NEW.top, fill: mix(newWall, C.paper, 0.35) }, s);
      rooms.forEach((r, i) => {
        svg("rect", { x: r.x, y: r.y, width: r.w, height: r.h, fill: mix(newWall, itemCols[i], light ? 0.16 : 0.1) }, s);
        svg("rect", { x: r.x + 8, y: r.shelf, width: r.w - 16, height: 5, fill: mix(newWall, deep, light ? 0.16 : 0.25), stroke: INK, "stroke-width": 1 }, s);
      });
      // lobby: a window, a lamp, a mat and a plant
      const winX = NEW.x0 + 28, winY = NEW.top + 80;
      svg("rect", { x: winX, y: winY, width: 84, height: 128, fill: mix(itemCols[0], C.surface, light ? 0.55 : 0.75), stroke: INK, "stroke-width": thick }, s);
      svg("path", { d: `M${winX + 42} ${winY} V${winY + 128} M${winX} ${winY + 64} H${winX + 84}`, stroke: INK, "stroke-width": fine }, s);
      svg("path", { d: `M${winX + 10} ${winY + 46} L${winX + 30} ${winY + 14} M${winX + 52} ${winY + 112} L${winX + 72} ${winY + 80}`, stroke: mix(C.surface, bright, 0.5), "stroke-width": 3, "stroke-linecap": "round", opacity: 0.8 }, s);
      svg("line", { x1: NEW.x0 + 70, y1: NEW.top, x2: NEW.x0 + 70, y2: NEW.top + 30, stroke: INK, "stroke-width": 1.4 }, s);
      svg("path", { d: `M${NEW.x0 + 54} ${NEW.top + 46} Q${NEW.x0 + 70} ${NEW.top + 24} ${NEW.x0 + 86} ${NEW.top + 46} Z`, fill: C.accent, stroke: INK, "stroke-width": fine, "stroke-linejoin": "round" }, s);
      svg("rect", { x: NEW.x0 + 14, y: GROUND - 5, width: 116, height: 5, fill: mix(C.accent, deep, 0.2) }, s);
      svg("path", { d: `M${NEW.x0 + 120} ${GROUND - 26} q-10 -26 -2 -44 M${NEW.x0 + 120} ${GROUND - 26} q12 -22 4 -40 M${NEW.x0 + 120} ${GROUND - 26} q-2 -30 10 -50`, fill: "none", stroke: C.positive || C.accent, "stroke-width": 3, "stroke-linecap": "round" }, s);
      svg("rect", { x: NEW.x0 + 110, y: GROUND - 28, width: 20, height: 28, fill: mix(warm, deep, 0.2), stroke: INK, "stroke-width": fine }, s);
      // structure
      svg("path", { d: `M${NEW.x0} ${NEW.door} V${NEW.top} H${NEW.x1} V${GROUND} M${NEW.lobby + 2} ${NEW.top} V${GROUND} M${NEW.lobby + 2} ${FLOOR2} H${NEW.x1} M${MID} ${NEW.top} V${GROUND}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 3), "stroke-linejoin": "round", "stroke-linecap": "round" }, s);
      svg("rect", { x: NEW.x0 - 12, y: NEW.top - 22, width: NEW.x1 - NEW.x0 + 24, height: 22, fill: C.accent, stroke: INK, "stroke-width": thick }, s);
      svg("rect", { x: NEW.x0 - 6, y: NEW.door - 6, width: 12, height: 6, fill: C.accent, stroke: INK, "stroke-width": fine }, s);
      // the checkpoint post on the walkway: a pole, a lamp that blinks as each box passes
      svg("rect", { x: POST - 4, y: GROUND - 240, width: 8, height: 240, fill: mix(C.muted, C.surface, 0.3), stroke: INK, "stroke-width": fine }, s);
      svg("rect", { x: POST - 16, y: GROUND - 6, width: 32, height: 6, fill: mix(C.muted, deep, 0.2), stroke: INK, "stroke-width": fine }, s);
      // sm-native-end
      const lamp = svg("circle", { cx: POST, cy: GROUND - 246, r: 8, fill: C.positive || C.accent, ...ui.strokeAttrs("regular", 2, INK) }, s);
      const lampGlow = svg("circle", { cx: POST, cy: GROUND - 246, r: 8, fill: "none", stroke: C.positive || C.accent, "stroke-width": 3, opacity: 0 }, s); // sm-native: the blink ring is a signal, not an outline

      // ---- the hand truck (axle at the origin, toe plate to the right, handle up and back) ----
      const truck = svg("g", {}, s);
      const frameC = mix(C.warning || C.accent, deep, light ? 0.05 : 0.1);
      svg("path", { d: "M0 8 L0 -104 Q0 -124 -20 -126", fill: "none", stroke: INK, "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" }, truck); // sm-native: the rail is a drawn tube (ink casing)
      svg("path", { d: "M0 8 L0 -104 Q0 -124 -20 -126", fill: "none", stroke: frameC, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, truck); // sm-native: the rail's paint
      svg("rect", { x: -4, y: 4, width: 74, height: 7, fill: frameC, ...ui.strokeAttrs("regular", 2, INK) }, truck);
      svg("line", { x1: -6, y1: -40, x2: 6, y2: -40, stroke: INK, "stroke-width": thick, "stroke-linecap": "round" }, truck);
      const wheel = svg("g", {}, truck);
      svg("circle", { r: WHEEL, fill: mix(C.ink, C.paper, light ? 0.2 : 0.75), ...ui.strokeAttrs("regular", 2, INK) }, wheel);
      svg("circle", { r: 5, fill: mix(C.surface, C.muted, 0.3), stroke: INK, "stroke-width": fine }, wheel);
      svg("line", { x1: 0, y1: -WHEEL + 3, x2: 0, y2: -6, stroke: mix(C.surface, C.muted, 0.2), "stroke-width": 2.4, "stroke-linecap": "round" }, wheel); // sm-native: hub mark shows the wheel turning

      // ---- boxes (DOM, so their labels are real type) ----
      const fmt = (v) => Math.round(v).toLocaleString("en-US");
      const boxEls = boxes.map((bx, i) => {
        const b = el("div", "mb-box", root);
        b.style.background = card;
        b.style.boxShadow = `inset 0 0 0 ${ui.stroke("regular", 2)}px ${INK}`;
        const tp = el("i", "mb-tape", b); tp.style.background = tape;
        const fl = el("i", "mb-flap mb-flap-l", b), fr = el("i", "mb-flap mb-flap-r", b);
        [fl, fr].forEach((f) => { f.style.background = cardDark; });
        const lab = el("div", "mb-label", b);
        el("b", "", lab, bx.name);
        el("span", "", lab, `${fmt(bx.count)} ${bx.unit}`);
        let sticker = null, check = null;
        if (bx.fragile) {
          sticker = el("div", "mb-fragile", b, bx.fragile);
          sticker.style.background = C.warning || C.accent;
          sticker.style.color = h.inkOn(C.warning || C.accent);
          check = el("div", "mb-check", root, content.intact || "Intact");
        }
        return { b, fl, fr, sticker, check, i };
      });

      // ---- items that file into the rooms (front layer) ----
      const front = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "mb-svg" }, root);
      const shapes = [
        (g, c) => { svg("rect", { x: -11, y: -8, width: 22, height: 16, rx: ui.radius("sm", 2), fill: c, ...ui.strokeAttrs("fine", 1.5, INK) }, g); [-3, 2].forEach((yy) => svg("line", { x1: -7, y1: yy, x2: 7, y2: yy, stroke: INK, "stroke-width": ui.stroke("fine", 1.2) }, g)); },
        (g, c) => { svg("rect", { x: -10, y: -9, width: 20, height: 18, rx: ui.radius("sm", 3), fill: c, ...ui.strokeAttrs("fine", 1.5, INK) }, g); svg("circle", { cx: 0, cy: -2, r: 3.5, fill: C.surface, stroke: INK, "stroke-width": ui.stroke("fine", 1.2) }, g); svg("path", { d: "M-6 7 Q0 1 6 7", fill: "none", stroke: INK, "stroke-width": ui.stroke("fine", 1.2) }, g); },
        (g, c) => { svg("path", { d: "M-8 -10 H4 L9 -5 V10 H-8 Z", fill: c, ...ui.strokeAttrs("fine", 1.5, INK), "stroke-linejoin": "round" }, g); svg("path", { d: "M4 -10 V-5 H9", fill: "none", stroke: INK, "stroke-width": ui.stroke("fine", 1.2) }, g); },
        (g, c) => { svg("path", { d: "M-11 -6 H6 L11 0 L6 6 H-11 Z", fill: c, ...ui.strokeAttrs("fine", 1.5, INK), "stroke-linejoin": "round" }, g); svg("circle", { cx: -5, cy: 0, r: 2, fill: INK }, g); },
      ];
      const items = boxes.map((bx, i) => {
        const room = rooms[i];
        return Array.from({ length: PER }, (_, k) => {
          const row = k < 4 ? 0 : 1, c = k % 4;
          const sx = room.x + 22 + c * 26, sy = (row ? room.floor : room.shelf) - 11;
          const g = svg("g", { opacity: 0 }, front);
          const inner = svg("g", {}, g);
          shapes[i % shapes.length](inner, itemCols[i]);
          return { g, inner, sx, sy, spin: (rand() - 0.5) * 50 };
        });
      });

      // ---- labels ----
      const copy = el("div", "mb-copy", root);
      el("div", "mb-eyebrow", copy, content.eyebrow || "");
      el("div", "mb-h", copy, content.heading || "");
      el("div", "mb-sub", copy, content.sub || "");
      const sOld = el("div", "mb-sign mb-sign-old", root, content.oldSign || "");
      Object.assign(sOld.style, { left: OLD.x0 + 20 + "px", top: OLD.top - 86 + "px" });
      const sNew = el("div", "mb-sign mb-sign-new", root, content.newSign || "");
      Object.assign(sNew.style, { left: NEW.x0 + "px", width: NEW.x1 - NEW.x0 + "px", top: NEW.top - 62 + "px" });
      const roomLabels = rooms.map((r, i) => {
        const box = el("div", "mb-room", root);
        Object.assign(box.style, { left: r.x + 12 + "px", top: r.y + 12 + "px", width: r.w - 24 + "px" });
        el("div", "mb-room-name", box, boxes[i].room);
        const n = el("div", "mb-room-n", box, "0");
        el("div", "mb-room-u", box, boxes[i].unit);
        return n;
      });
      // the checkpoint's sign: boxes that have passed it, and the ones lost on the way (none)
      const post = el("div", "mb-post", root);
      Object.assign(post.style, { left: POST - 75 + "px", top: GROUND - 234 + "px" });
      el("div", "mb-post-k", post, (content.checkpoint || {}).label || "Checkpoint");
      const postN = el("div", "mb-post-n", post, "");
      const postL = el("div", "mb-post-l", post, `0 ${(content.progress || {}).lost || "lost"}`);
      void postL;
      const prog = el("div", "mb-prog", root);
      const bar = el("div", "mb-bar", prog);
      const segs = boxes.map(() => el("i", "", bar));
      const progT = el("div", "mb-prog-t", prog, "");
      const P = content.progress || {};
      return { plan, boxes, boxEls, items, rooms, truck, wheel, levels, OLD, NEW, BW, BH, REST, ARRIVE, PER, RESET, RDUR, roomLabels, segs, progT, P, fmt, postN, lamp, lampGlow, passed: (content.checkpoint || {}).passed || "passed" };
    },

    render(t, S, h) {
      const { tw, lerp, set, text, clamp } = h;
      const reset = tw(t, S.RESET, S.RDUR, "inOut");
      const after = t >= S.RESET + S.RDUR; // fully reset: the t = 0 state
      // the truck: out and back per box, tipping back while it rolls
      let x = S.REST, tilt = 0;
      S.plan.forEach((p) => {
        x += (S.ARRIVE - S.REST) * (tw(t, p.go, p.travel, "inOut") - tw(t, p.back, 0.7, "inOut"));
        tilt += (p.gentle ? 5 : 9) * (tw(t, p.tilt, 0.2, "snappy") - tw(t, p.untilt, 0.2, "snappy"));
      });
      const axleY = GROUND - 13;
      set(S.truck, { transform: `translate(${x.toFixed(2)} ${axleY}) rotate(${(-tilt).toFixed(2)})` });
      set(S.wheel, { transform: `rotate(${(((x - S.REST) / 13) * (180 / Math.PI) + tilt).toFixed(1)})` });
      const rad = (-tilt * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      const onTruck = (lx, ly) => [x + lx * cs - ly * sn, axleY + lx * sn + ly * cs];

      let delivered = 0;
      S.plan.forEach((p, i) => {
        const be = S.boxEls[i];
        // poses: shelf, toe plate, lobby floor
        const shelf = [S.OLD.x0 + 22, S.levels[i] - S.BH];
        const plate = [S.REST + 5, GROUND - 13 + 4 - S.BH];
        const lobby = [S.NEW.x0 + 4, GROUND - S.BH - 4];
        let bx, by, rot = 0, op = 1;
        if (after) { bx = shelf[0]; by = shelf[1]; }
        else if (t >= S.RESET) { bx = shelf[0]; by = shelf[1]; op = reset; } // restocked on the shelf for the next loop
        else if (t < p.load + 0.55) {
          const u = tw(t, p.load, 0.55, "inOut");
          bx = lerp(shelf[0], plate[0], u); by = lerp(shelf[1], plate[1], u) - Math.sin(Math.PI * u) * 22;
        } else if (t < p.unload) {
          [bx, by] = onTruck(5, 4 - S.BH); rot = -tilt;
        } else {
          const u = tw(t, p.unload, 0.36, "snappy");
          const from = [S.ARRIVE + 5, GROUND - 13 + 4 - S.BH];
          bx = lerp(from[0], lobby[0], u); by = lerp(from[1], lobby[1], u);
          op = 1 - tw(t, p.fade, 0.4, "soft");
        }
        be.b.style.transform = `translate(${bx.toFixed(2)}px, ${by.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
        be.b.style.opacity = op.toFixed(3);
        be.b.style.display = op < 0.001 ? "none" : "block"; // a hidden box must not leave a layer behind
        const open = t >= S.RESET ? 0 : tw(t, p.open, 0.3, "snappy");
        be.fl.style.transform = `rotate(${(-125 * open).toFixed(1)}deg)`;
        be.fr.style.transform = `rotate(${(125 * open).toFixed(1)}deg)`;
        if (be.check) {
          const c = p.check != null && t < S.RESET ? tw(t, p.check, 0.35, "snappy") * (1 - tw(t, p.fade, 0.4, "soft")) : 0;
          be.check.style.opacity = c.toFixed(3);
          be.check.style.display = c < 0.001 ? "none" : "block";
          be.check.style.transform = `translate(${(lobby[0] + 18).toFixed(1)}px, ${(lobby[1] - 34 + (1 - c) * 8).toFixed(1)}px) scale(${(0.85 + 0.15 * c).toFixed(3)})`;
        }
        // contents fly from the open box into the room
        let landed = 0;
        const ox = lobby[0] + S.BW / 2, oy = lobby[1] + 4;
        S.items[i].forEach((it, k) => {
          const pk = p.items[k];
          const u = after ? 0 : tw(t, pk.start, pk.dur, "inOut");
          if (u <= 0) { set(it.g, { opacity: 0 }); return; }
          if (u >= 1) landed++;
          const ix = lerp(ox, it.sx, u), iy = lerp(oy, it.sy, u) - Math.sin(Math.PI * u) * (90 + (oy - it.sy) * 0.25);
          set(it.g, { transform: `translate(${ix.toFixed(1)} ${iy.toFixed(1)})`, opacity: (clamp(u * 4) * (1 - reset)).toFixed(3) });
          set(it.inner, { transform: `rotate(${(it.spin * (1 - u)).toFixed(1)}) scale(${(0.7 + 0.3 * u).toFixed(3)})` });
        });
        const present = landed * (1 - reset);
        text(S.roomLabels[i], S.fmt((S.boxes[i].count * present) / S.PER));
        const done = landed === S.PER && reset < 0.5;
        if (done) delivered++;
        S.segs[i].className = done ? "on" : "";
      });
      // checkpoint: counts loaded boxes whose centre has crossed the post; its lamp blinks once per box
      let passed = 0, blink = 0;
      S.plan.forEach((p) => {
        if (t >= p.pass && reset < 0.5) passed++;
        const b = t >= p.pass ? Math.max(0, 1 - (t - p.pass) / 0.6) : 0;
        blink = Math.max(blink, after ? 0 : b);
      });
      text(S.postN, `${passed} ${S.passed}`);
      set(S.lampGlow, { r: (8 + (1 - blink) * 0 + (blink > 0 ? (1 - blink) * 16 : 0)).toFixed(1), opacity: blink.toFixed(3) });
      set(S.lamp, { r: (8 + blink * 2).toFixed(2) });
      text(S.progT, `${S.P.imported || "Imported"} ${delivered} ${S.P.of || "of"} ${S.boxes.length} · 0 ${S.P.lost || "lost"}`);
    },
  });
})();
