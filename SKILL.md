---
name: site-motion
description: Make animated website assets — hero and feature illustrations, product-UI micro-stories, isometric and 2.5D scenes, 3D product/brand objects (Three.js, glTF models, extruded logos), app-window composites, physics and generative visuals — in SVG, Canvas, CSS 3D or WebGL, themed only from a design system's tokens, and export each as a live, embeddable HTML file plus frame-exact MP4, WebM, animated WebP, GIF, poster PNG and 9:16 social cuts. Use for any visual or animation that goes ON a website, landing page, feature section, docs or launch post ("animated hero", "feature animation", "product demo loop", "isometric illustration", "3D logo", "GIF of our UI", "in our brand colours"), even if SVG or Canvas is never mentioned. For narrated or captioned videos, promos and slideshows, use HyperFrames instead.
---

# site-motion

> Scenes marked **Pro**, or named in these notes but missing from `scenes/`, are site-motion Pro scenes. Learn from what the notes say about them; build from the scenes that are here (`site-motion list`).

A scene is **a pure function of time**. `render(t)` draws the same frame for the same `t`, whatever came before. That one rule is why the same file can play live on a website *and* render frame-exact to video: the exporter just seeks to every frame time and screenshots.

Repo root: the folder holding this file (install it with `git clone https://github.com/Shivraj97/site-motion ~/.claude/skills/site-motion`, or link a clone there). Node 22+, Chrome, ffmpeg. No npm installs. From any project, run the CLI by its full path; builds and renders land in that project's `out/`, and `--tokens` / `--content` take paths relative to it:

```bash
SM=~/.claude/skills/site-motion/bin/site-motion.mjs
node $SM init card-story --tokens ledger          # writes ./brand.json (from the preset) and ./card-story.json to edit
node $SM make card-story --tokens ./brand.json --content ./card-story.json --out public/motion/story.html
```

To put a scene into the project's own source so the team can edit it, use `add` instead of `make`. It copies `scene.js`, `scene.css`, `content.json` and `tokens.json` to `public/motion/<scene>/` (or `motion/<scene>/` when there is no `public/`), the player and vendor libraries to `runtime/`, and writes `<scene>.html`, a single-file embed. The copied folder is a valid scene for `build`, `render` and `make`:

```bash
node $SM add ledger-stamp --tokens ./brand.json --content ./ledger.json          # → public/motion/ledger-stamp/ + ledger-stamp.html
node $SM make public/motion/ledger-stamp --tokens public/motion/ledger-stamp/tokens.json --formats png,sheet
```

Inside the repo itself the short form works:

```bash
node bin/site-motion.mjs list                                   # scenes and token presets
node bin/site-motion.mjs make iso-blocks --tokens mint          # build + render mp4, webp, poster
node bin/site-motion.mjs make card-story --tokens ./brand.json --content ./my-story.json --formats mp4,webm,webp,gif,png,sheet
node bin/site-motion.mjs build window-stack --tokens night --out public/hero.html   # live embed only
node bin/site-motion.mjs render out/hero.html --formats mp4 --scale 2 --range loop        # export an existing build
```

Outputs land in `out/<content>-<tokens>/`. `--range loop` exports only the seamless loop (the default for GIF and WebP); `full` is intro plus one loop (the default for MP4 and WebM). `sheet` writes a 4×3 contact sheet: always make one and read it.

## Workflow

**A whole site (several sections or pages) starts with a plan, not with one scene.** Brand first: `node $SM theme <their-url> --out brand.json`, check its notes and fix by eye, so the plan (and every scene `plan apply` adds) is in their colours; `plan` uses `brand.json` from the folder or `--tokens <file>`, and says when it falls back to the default colours. Then run `node $SM plan` in the project:
- with `--brief brief.md` when you know the sections. This is the best input. Write the brief from the site's real copy:
  ```markdown
  # Acme: what the product does, in one line
  ## home
  - hero: the hero headline
  - feature: each feature section's heading and one line under it
  ## pricing
  - hero: …
  ```
- or with `--url https://their-site.com[,https://their-site.com/pricing]` to read the live pages' own headings;
- or with `--pages home,features,pricing --about "…"` when there's nothing else (generic picks; say so).

It maps every section to one scene, each used once, all in one look. The look is the home hero's, locked in `site-motion.json`. It draws `site-motion-plan.png`: every section as its scene's frame in the brand and look, with the score's verdict on top. **Show the user the sheet and get approval before `plan apply`.**
- A pick marked `?` had no strong match. Read its note ("ledger-stamp fits better but is on home.hero") and either swap (`plan swap <slot> <scene>`), reuse the better scene, or tell the user the library has no scene for that story yet.
- Never apply over a weak pick without saying so.

`plan apply` adds every scene and prints each section's embed. Then write each scene's copy in its `content.json`, run `sync`, and finish with `score --project`.

For one scene, follow the steps below.

1. **Get the design system first.** Tokens are the only source of colour and type. Find them in the order: the project's tokens/theme file (CSS variables, Tailwind config, `tokens.json`), then the live site (measure computed styles), then ask. Write them as `tokens/<brand>.json` (shape below). Never invent a colour once the palette exists; derive shades with `h.mix(a, b, p)` from tokens.
2. **Pick the archetype** that tells the product's story, or write a new scene:
   | Scene | Story it tells | Renderer |
   |---|---|---|
   | `iso-blocks` | infrastructure, platforms, "many parts working": blocks with live data on their faces over a tiled floor | SVG |
   | `card-story` | a workflow that removes work: a feature list drives a product card through states | DOM |
   | `window-stack` | "works where you work": app windows over a painted Canvas backdrop, an agent doing steps | Canvas + DOM |
   | `live-room` **Pro** | multiplayer: named cursors over an app window, a proposal, a vote that passes, a change shipping, an activity ticker | Canvas + DOM |
   | `leaderboard` | credit and standing: contributions land on rows, points count up, rows re-sort | DOM |
   | `bloom-flow` | automation: an event runs through a workflow graph and each step blooms into generative flowers | Canvas + SVG |
   | `signal-field` | messy → structured: noisy strands pass a gate and leave as clean lanes | p5.js |
   | `drop-pile` | many → one: work items fall into one tray with real physics, a counter tallies them | Matter.js (baked) |
   | `galton-router` | routing, approvals, A/B: payments drop through a pegboard; a rule flips a switch and the flow moves to the best bins | SVG (seeded random walk) |
   | `receipt-printer` | messy → structured: documents feed a slot, a receipt prints each extracted field with its confidence | DOM + SVG |
   | `score-sheet` | orchestration, multi-agent: a run written as a musical score, staves vibrate while each agent works | SVG |
   | `css3d-stack` | architecture, layers: real HTML boxes in CSS 3D lift apart while a request drops through | CSS 3D |
   | `loom` | many → one, integrations: each tool is a band of warp threads woven into one twill fabric that rolls onto the product's beam | Canvas 2D |
   | `domino-run` | automation, triggers: one ball tips a chain of dominoes grouped into steps, each step lights as the wave reaches it | Matter.js (baked) |
   | `weather-board` | reliability, failover: a storm (shader clouds, rain, lightning) builds over one region of a status map, traffic reroutes, it clears with 0 failed requests | WebGL shader + DOM |
   | `ledger-stamp` | approvals, compliance, trust: payments ride an indexed belt past a policy scanner, an APPROVED stamp press and a sign-and-seal press into an audit trail; one over the limit is stamped HELD and waits for a second approver | SVG + DOM |
   | `grain-tally` | metrics, scale: thousands of grains (each a fixed batch of real events) breathe as a dust ring, pour into the digits of the total, then sort into one bar per source with its exact count; the number is built from its data, not counted up | Canvas 2D (particles, pure t) |
   | `lens-of-order` | messy → structured, classification, AI that sees: a 1-bit dithered field of drifting blobs (not understood yet); a magnifying lens fills each blob in its class colour, outlines it and labels it with a confidence, leaving a fading coloured trail | Canvas 2D (per-cell field, Bayer dither) |
   | `water-slide-funnel` | conversion funnel: riders slide one ramp per stage; each lip's pool catches that stage's drop-offs | SVG |
   | `gold-pan` **Pro** | search-as-you-type: every keystroke swirls the pan until three priced nuggets are left | Canvas 2D |
   | `museum-heatmap` **Pro** | product analytics: visitor footprints warm the floor around the features people stop at; the ranking comes from the heat | Canvas 2D |
   | `cell-division` | database branching: main divides into branches, one is discarded, one merges back with its change | Canvas 2D (metaballs) |
   | `scratch-off` **Pro** | prediction: foil scratches off the real departure time before the airline's board catches up | Canvas 2D |
   | `sieve-tray` **Pro** | early detection: markers fall through a fine mesh; the few that catch are lifted out and flagged | Matter.js (baked) |
   | `rube-goldberg` **Pro** | before / after: a receipt marble jams in five old contraptions, then drops down one chute in a second | SVG |
   | `language-balloons` **Pro** | localisation: word bubbles in eight scripts float up and assemble each locale's sentence, RTL included | Matter.js (baked) |
   | `balloon-deploy` **Pro** | deploys: each build step inflates the envelope; at 100% the release lifts off | SVG |
   | `pufferfish` **Pro** | autoscaling: a pufferfish swells to match each traffic wave while a fixed-capacity fish gets tossed | SVG |
   | `gear-tiers` **Pro** | pricing: plans drawn as camping kit, tent to basecamp, with a monthly / annual toggle | SVG |
   | `permission-chessboard` **Pro** | roles and permissions: each role piece lands on the board and lights only the squares it may use | SVG |
   | `tree-rings` | year in review: one ring per year, as wide as the year was busy, with notches for the firsts | SVG |
   | `parchment-changelog` | changelog: a scroll unrolls one release at a time, each inked as it ships | SVG + DOM |
   | `moving-boxes` | migration: a hand truck carries each old tool's box into the new building, nothing lost | SVG + DOM |
   | `privacy-pebbles` **Pro** | PII redaction: a squeegee turns every personal detail into an identical pebble; the sentence still reads | SVG + DOM |
   | `ant-trail` **Pro** | auto-categorisation: ants carry each swipe's receipt, memo and approval to the right ledger slot | Canvas 2D |
   | `sunrise-payroll` **Pro** | global payroll: a sunrise crosses eight time zones and pays each city at its own 9 am | SVG |
   | `whiteout` **Pro** | calm: a busy dashboard dissolves into fog, leaving the one number that matters | WebGL shader + DOM |
   | `ink-flood` **Pro** | theming, white-label: a paint chip floods the whole product in a new colourway | SVG |
   | `integration-deck` **Pro** | integrations: every tool is a key on one isometric macro pad; a workflow plays as a chord while a run log types each step | Three.js |
   | `margin-rails` **Pro** | provenance: a memo writes itself while passages carried forward from past files slide in on rails naming their source | SVG + DOM |
   | `pigeonhole-wall` | memory: documents file into labelled pigeonholes, and a request pulls the three sources it needs | SVG + DOM |
   | `redline-front` **Pro** | contract review: a review front sweeps down the document and returns it as a finished redline with verified authorities | SVG + DOM |
   | `step-rail` | how it works, onboarding: a token travels numbered steps; each card opens on what its step produced and the last lands the result | SVG + DOM |
   | `pipeline-board` | workflows, pipeline: cards advance column by column on a kanban board while counts and totals follow them | DOM |
   | `account-health` | retention, customer success: a health table replays the month; one account slips to at risk, a playbook fires and it recovers | SVG |
   | `split-wipe` | before / after, consolidation: a divider sweeps across scattered manual work and each fragment snaps into one product surface | DOM |
   | `roadmap-rail` | roadmap, milestones: a Today marker walks the time axis; shipped milestones fill in and the key launch opens into a card | SVG |
   | `trust-rings` | security, compliance: requests pass concentric control rings around the data; the unauthorised one is stopped and logged | SVG |
   | `balance-scale` | pricing, quality vs cost: three pan balances, each tilt computed from the scores; ours tips to quality | SVG |
   | `crate-discrepancy` | reconciliation: trays lift out of a crate and tick off the packing slip; the short one floats up with its note | SVG + DOM |
   | `press-qa` | testing, CI: builds roll off a press; an arm flicks the one with a failing test down a chute and it passes on the re-run | SVG |
   | `radar-sweep` | observability: every running job is a blip on a radar scope; a cursor reaches in and pauses the failing one | Canvas 2D + DOM |
   | `agent-checkout` | **product UI demo**, agent payments: a purchase request, a masked virtual card autofills, the limit meter moves by the amount, the receipt joins the list | DOM + ui-kit |
   | `click-to-done` | **product UI demo**, any one-action feature (invite, send, approve, publish): a real screen in a browser frame, the cursor types, picks and clicks, the camera moves in and pulls back on the result | DOM + ui-kit |
   | `dashboard-push` | **product UI demo**, analytics and reporting: the headline figure builds from the chart as it draws, the cursor scrubs a tooltip, the camera pushes in on the moment that matters, a range switch morphs every series | DOM + SVG + ui-kit |
   | `phone-stack` | **product UI demo**, mobile and notifications: alerts land on a lock screen with a signal ring each, a tap opens the newest into the app screen, a swipe home clears it | DOM + ui-kit |
   | `shot-demo` | **product UI demo from a screenshot**: the customer's own screenshot in a frame; the cursor types into its real fields and clicks its real button, values change in the brand's face, a spotlight and a callout land on the result | DOM + screenshot + ui-kit |
   `integration-deck` is the 3D standard: one tactile object, one physical action, flat toon bands, an ink outline, a true isometric camera and labels in the brand's type. The other Three.js object scenes (an orbit hub, a sorting wall, an extruded logo, a glTF showcase) live outside the public set until they're reworked; the 3D tooling (`vendor/three-full.min.js`, `vendor/three-kit.js`) stays, and `weather-board` uses it for its shader.
   **Before inventing a new scene, check the story against the scenes that exist** (`site-motion list`, and the table above): pick a metaphor that isn't already used for it. "Many → one" drawn as lines converging on a logo is the most overused visual on the web.
   **Libraries:** a scene names what it needs in its first line, `// @vendor three p5 matter`, and the build inlines the pinned copy from `vendor/`. `RENDERERS.md` explains how each library fits `render(t)`: pose from t (Three.js, p5, shaders), seek a paused timeline (GSAP, Lottie, Theatre.js), or bake a simulation in `setup` (Matter.js, Rive state machines).
   Measuring a live site for tokens: download its HTML and CSS into a scratch folder, read the CSS custom properties and `@font-face` names, and record the source in the token file's `source` field. Licensed fonts get a free stand-in from Google Fonts; say which. Keep a brand's content sets together in `brands/<brand>/*.json`. `node bin/site-motion.mjs theme <url>` drafts a token file from a live site. With Chrome installed it measures the rendered page: the colours that cover the screen, the main button, the logo, and the faces text actually renders in (headings become `font.display`). `--fast` reads HTML and CSS only, `--scheme dark` measures the dark mode, `--shot page.png` saves the screenshot it measured. Requests to private or internal addresses are refused. Always check its notes and correct by eye.
3. **Write the content JSON**, never edit the scene for copy. Every scene has a `content.json` of defaults; pass `--content` with only the keys you change (it deep-merges). Use the product's real nouns and numbers; use fictional names for third-party brands (no real logos).
4. **Build, render, look.** Render `png,sheet` first (seconds), read both images, fix, then render the motion formats. Check: nothing overlaps, every number is the product's, text fits its container at its longest value, the loop seam (first and last sheet frames) matches.
5. **Ship.** Live: drop the `.html` in an `<iframe>` or copy the stage into the page (it scales to its container, pauses offscreen, honours reduced motion with a still frame). Files: `mp4`/`webm` for `<video autoplay muted loop playsinline>`, `webp` for anywhere a GIF would go (a third of the size), `gif` only for email and old tools, `png` as the poster.
6. **Social cuts (9:16), when asked.** Render the 16:9 MP4s first, then frame a crop of each in the brand's type at 1080×1920 (see below).

## Product UI demos (`runtime/ui-kit.js`)

When the story is the product itself ("show the invite flow", "animate our dashboard", "a phone with our notifications"), build a **UI demo**: the product's real screen, rebuilt in the DOM in the brand's tokens, with a cursor that does the job and a camera that frames it. It is not a screenshot in a frame: rebuilt UI stays sharp under the camera's zoom, re-themes with the brand and style pack, and its copy lives in `content.json`. Start from the closest existing `ui-demo` scene (meta `"family": "ui-demo"`), or write a new one with the kit:

```js
// @vendor ui-kit
setup({ root, content, tokens, h }) {
  const kit = SMUI.kit({ root, h, tokens, width: 1600, height: 900 }); // kit.world: the layer the camera moves; tokens give it AA-checked tints
  const app = kit.frame("browser", { url: content.url, x: 200, y: 80, w: 1200, h: 740 });  // or "window", "phone"
  const send = h.el("div", "send", app.body, "Send");
  send.dataset.ui = "send";                                          // a name the cursor and camera can aim at
  kit.cursor(content.cursor, { start: [1000, 860] });                // { kind: "touch" } on a phone
  kit.camera(content.camera);
  return { kit, send };
},
render(t, S, h) {
  S.kit.render(t);                                                   // camera, cursor, click ripples
  S.send.style.transform = `scale(${1 - S.kit.pressed(t, "send") * 0.05})`;  // the button answers the click
  const sentAt = S.kit.clickedAt("send");                            // key the result to the click, not to a constant
}
```

The **script is content**, so an agent retimes a demo by editing JSON, never the scene:
- `cursor`: `[{ at, to: "<data-ui name>" | [x, y], anchor?: [fx, fy], click?: true, move?: s, drag?: "<name>", shape?: "arrow" | "text" | "hand" | "grab" | "resize" }, { at, hide: true }, { at, show: true }]`. `at` is when the pointer *arrives*; it leaves `move` seconds earlier (default from the distance) on a slight arc. A click lands 0.06 s after arrival. A target with `data-cursor="text"` sets the shape on arrival. Call `kit.cursor` again with `{ label: "Agent", color: "#…" }` for a second, named pointer (the first one leads).
- `camera`: `[{ at, dur, zoom, focus: "<name>" | [x, y], anchor?, offset?: [dx, dy], ease? }]`. It starts on the whole stage; every key eases from wherever the last one left it. Zoom is interpolated in log space. End the loop with a key back to `zoom: 1`.
- `annotate`: `kit.annotate({ spotlight: [{ on, at, until, pad?, r? }], callouts: [{ to, text, at, until, side?, gap?, offset? }], pins: [{ to, n, at, until, anchor? }] })`. All of them sit in the world, so they ride the camera. A callout says what the change *means*, not what it is.

### The kit

Build screens from these, not from lookalike classes. Each part takes its parent first; `{ name }` makes it a target.

| Group | Parts |
|---|---|
| Frames | `kit.frame("browser" \| "window" \| "phone" \| "terminal", { x, y, w, h, url, title, glass, float })`, `kit.keyboard(screen)`, `kit.island(phone)`, `kit.notification(screen, { app, title, body })`, `kit.thread(parent, [{ text, me }])` |
| Filler | `kit.filler(parent, { w, h, strong })`, `kit.lines(parent, widths)`, `kit.label(parent, text, { story })` |
| Controls | `kit.button(parent, text, { primary, name })` (presses itself on a click), `kit.toggle`, `kit.segmented(parent, items)`, `kit.tabs(parent, items)`, `kit.field` + `kit.type`, `kit.menu(parent, items)` |
| Content | `kit.card`, `kit.row(parent, { lead, text, sub, trail })`, `kit.badge(parent, text, { tone: "accent" \| "good" \| "warn" })`, `kit.chip`, `kit.kbd(parent, ["⌘", "K"])`, `kit.avatar(parent, name, { i, size })`, `kit.code(parent, lines)`, `kit.chart(parent, values, { w, h })`, `kit.popover`, `kit.toast(parent, text, { action })` |
| Motion | `kit.roll(parent)` → `render(from, to, p)` digits rolling, `kit.stream(parent, text)` → `render(t, start, wps)` words arriving with no reflow, `kit.collapse(node)` → `render(p)`, `kit.swap(a, b, p)`, `kit.connector(from, to, { dot, route })` → `render(p)`, `kit.fly(node, from, to)` → `render(p)`, `kit.dragged(t, name)` → `{ x, y, lift }`, `kit.pointerAt(t)` |
| Stage | `kit.ground("dots" \| "grid" \| "ruled" \| "blueprint" \| "glow" \| "wash" \| "tint" \| "stripes")`; `SMUI.kit({ fidelity: "minimal" \| "standard" \| "realistic" })` |

Handles with `render` take a value you compute from `t`, so they stay pure. **Fidelity** decides how much is real: at `minimal`, every `kit.label` not marked `{ story: true }` becomes a filler bar; `realistic` adds browser controls. Light and dark come from tokens (`mint`, `night`); a blueprint look is the `blueprint` ground with the `outline` style pack; glass is `{ glass: true }` on a frame over a `wash` or `glow` ground.

### Writing a demo

Work in this order:

1. **Place and size.** Where will it sit? Build with `--view`: default is the 1600×900 hero; `strip` (1600×756) beside copy, `card` (800×600) in a grid, `compact` (720×900) in a phone column. A smaller view crops the design and follows the cursor; a key with `fixed: true` opts out, and `content.views.<view>` overrides any content for that view. Choose how it plays with `--play loop | once | hover`: `once` plays when first in view and stops on the poster; `hover` rests on the poster and plays while hovered. In a project, pass both to `add` (`add agent-checkout --view card --play once`): they are kept in `site-motion.json` and every `sync` rebuilds the demo the same way.
2. **Story: 3–5 beats and one payoff, 10–16 seconds.** Every cursor move needs a reason. Fill in what the motion means; if you can't, cut it.
3. **Screen.** A full, structured screen in quiet colour. Real words only where the story is, about 3–7 strings; filler everywhere else, at the edges rather than where the eye lands.
4. **Choreograph.** Keep elements mounted and animate them in and out, so exits play. Stagger groups and overlap beats.
5. **Rehearse.** `node bin/site-motion.mjs rehearse <scene> --tokens mint` runs every check at the design size, the seam and text again in the compact view, and writes contact sheets at shown width and phone width, plus `REHEARSAL.md`. It ends with `rehearsal passed.` Look at both sheets; fix in this order: framing, hierarchy, motion, polish. Fill in the note, including what you didn't check.

**Framing** (checked; a window with air on all four sides reads as a card on a slide):
- The main window or phone fills at least two thirds of the stage along one side and runs off at least one edge. Use `{ float: true }` only for a deliberate float: a pair of devices, a tilted stack, a phone whose home gesture needs the whole device.
- Only filler bleeds off the edge; keep what opens in view.
- No plate behind the window, no empty bands, no cut controls, no dead corners.

**What goes wrong:**
- *Too much*: dense real text everywhere. *Wireframe*: grey blobs with no product. *Boxed*: a shrunken window with even margins. *Flat*: every object the same weight. *Bland*: ignoring the brand.
- No stock AI styling (sparkles, purple gradients), no invented logos beyond a lettermark.
- Content moves rather than swaps; no long holds; no reset without a cause.

Rules for demos (each one broke a frame once):
- **One action, one result.** A demo is one beat of the product: type → pick → send → the list grows. Three features in one loop reads as a busy trailer, not a product.
- **The result answers the click.** Key every state change to `kit.clickedAt(name)` so retiming the cursor moves the UI with it. Ease the response `snappy`, 0.3–0.45 s; spinners last under a second.
- **Camera: push in on the action, pull back on the result.** Zoom 1.3–1.9 on the field or point being worked; pull back to 1 when the outcome (a new row, a toast) needs its context. Don't zoom on a full-height phone: it crops the device; zoom on the card inside it.
- **Numbers come from the UI.** A headline figure is built from the chart that draws it (`dashboard-push`), not counted up on its own.
- **Real-feeling, fictional brands.** Lettermarks from content, invented companies and people, plausible numbers. Never a real product's chrome or logo.
- **Targets are HTML elements** (`data-ui` on a div or span, not an SVG node); for a point on a chart, place a zero-size `<i data-ui="pt-3">` at it. Targets are measured from layout, again once fonts load, so a target mid-animation is still found where it sits.
- **New rows and toasts never cover text** the contrast check must read; give them their own space.

`site-motion check` runs the layout checks on every scene, and on `ui-demo` scenes the jump and framing checks too (`--jumps` for any other):
- **text-fit**: every word fits the box it sits in, not cut off by an ellipsis or clipped edge, not spilling past its card or pill.
- **jumps**: no frame step is far bigger than the steps on *both* sides of it: a state set without a tween, a panel that appears in one frame. A camera coming to rest or a transition starting differs from one side only and is fine.
- **framing**: the main device frame is big enough and runs off an edge.

## From a screenshot (`shot-demo`, `lib/shot.mjs`)

When someone hands over a **raw screenshot of their own product** ("make a demo from this"), don't rebuild the screen: put the screenshot itself in the scene and act on it. `shot-demo` takes the image plus a script of hotspots and beats; the scene code never changes. It is the fast path: faithful to the pixels, and no screen to rebuild. Rebuilding the screen in the DOM (the scenes above) is the upgrade when the demo must re-theme or zoom past ~2x.

1. **Save the screenshot to a file** (a pasted image in chat has no path: ask for the file, or a URL to capture). A 2x capture (Retina, `width ≥ 2400` for a desktop page) keeps the camera sharp up to ~2.4x zoom.
2. **Scaffold:** `node bin/site-motion.mjs shot <image> --name <brand> --url <shown in the address bar> [--frame browser|window|phone|none] [--out shots/<brand>]`. It reads the size and guesses the frame (tall = phone), reads the screen's colours (paper = most coverage, ink = hardest contrast with real coverage, accent = most saturated colour used enough to be a choice), derives a token file through the same rules as `theme <url>`, and writes `shot.png`, `shot.jpg` (the embed copy), `grid.png`, `tokens.json` and a starter `content.json`. Keep customer screenshots out of version control (a git-ignored folder), never in `assets/`.
3. **Fix the font.** Pixels don't name a face; the token file says Inter as a guess. Identify the face by eye (or `theme <url>` if there is a URL) and set `font.sans` and `font.import`: replaced text in the wrong face is the first thing that reads as fake.
4. **Read the grid, name the hotspots.** `grid.png` rules the screenshot every 100 image px, labelled in **image pixels**, so coordinates read off a downscaled view go straight into JSON. For anything the cursor lands on or text gets replaced in, take a close-up: `shot grid shot.png --crop x,y,w,h --step 20`. Hotspots are `[x, y, w, h]` (or `{ "box": [...], "r": 12 }` with the element's corner radius) in image px:
   - the **field** the cursor clicks (the whole input), and separately the **text area** inside it that gets retyped
   - each **value** that changes: a tight box around the glyphs, from the cap top to below the descenders (a comma's tail left outside shows under the patch)
   - the **button** that's clicked: it presses (its own pixels scale in place) and darkens under the pointer
   - a **region** for the camera to frame (a form, a results panel)
5. **Write one action and its true result.** Pick the single thing the product is for and compute the real outcome (a calculator's new figures from its own formula, not invented ones). Then the beats in `content.json`:
   - `edits`: `{ in, text, mode: "type" | "swap", at, size (image px), weight, align, tracking, dx, dy, focus: "<field>", clear, blur }`. A patch in the colour sampled under the text hides the old pixels; the new text takes the colour sampled from the old glyphs. `type` clears the field at `clear`, types at `cps` with a caret and a focus ring on `focus`; `swap` rises in with a brief accent tint. Values that would run wider than their box shrink to fit. Size: cap height ÷ 0.7 for most sans faces.
   - `cursor` / `camera`: the ui-kit beats, with hotspot names as targets (`focus`, `fit` + `fill` to pick a zoom that frames a hotspot). Zoomed in, the view is kept inside the screen, so the frame's edge never shows.
   - `spotlight: [{ on, at, until, pad }]` dims the whole stage but one hotspot; `callouts: [{ to, text, at, until, side, gap }]` pins a short label beside it. The callout says what the change *means* ("$154.27 less, every month"), not what it is.
   - `states: [{ image, at, reveal: "fade" | "circle", from }]` reveals a second screenshot (the screen after the click) from a hotspot; `scroll: [{ at, dur, to }]` travels down a tall capture.
   - `cursorHidden: true` with a `show` beat, and a `hide` beat after the last click: a hidden pointer hovers nothing, so the loop's last frame matches its first.
   - `times.reset`: everything lets go here, well before `duration`.
6. **Look with `debug: true`** (every hotspot outlined and named) on a `png,sheet` render, fix boxes and sizes, then set `debug: false` and render the motion formats. (`check shot-demo` checks the scene against its own example content; for a new demo, confirm the sheet's first and last frames match: nothing typed, swapped, lit or hovered at the end.)
   `node bin/site-motion.mjs make shot-demo --content shots/<brand>/content.json --tokens shots/<brand>/tokens.json --formats mp4,webp,png`

The scene's own `content.json` is the worked example: Tallyhand, a fictional AI accountant. The agent is told to match the open items; the difference goes $2,318.40 → $0.00, the book balance $180,087.75 → $182,406.15, and all the changed figures add up from the items on screen.

## Social cuts (`bin/social.mjs`)

Turns rendered 16:9 MP4s into 1080×1920 vertical videos for Reels, Shorts, TikTok and LinkedIn: label, serif headline and one line at the top, a cropped close-up of the animation in a rounded slot, and the wordmark, URL and call-to-action pill at the bottom. Chrome renders the text from the brand tokens; ffmpeg composites background → cropped video → corner mask. Writes `<name>-9x16.mp4` and `<name>-9x16-poster.png`.

```bash
node bin/social.mjs brands/<brand>/social.json                 # every cut
node bin/social.mjs brands/<brand>/social.json --only live-room  # one cut
```

```json
{
  "tokens": "acme",
  "out": "out/acme/social",
  "footer": { "wordmark": "Acme", "url": "acme.dev", "cta": "Join the waitlist" },
  "items": [
    { "name": "live-room", "source": "out/acme/live-room/live-room.mp4", "crop": [340, 40, 1220, 860], "still": 8.4,
      "eyebrow": "Currently in early testing", "headline": "AI app-building,\nnow multiplayer", "sub": "Build, edit and own an app together…",
      "frame": true }
  ]
}
```
- **Crop** is `[x, y, w, h]` in the source video's pixels. Crop to the part that tells the story so UI text stays readable on a phone: the slot is 1000 px wide, so a 1220-wide crop shows the scene at 82%. Crop inside the scene's own background: a crop that reaches past a panel or frame edge shows a sliver of paper or a white strip along that side.
- **Placement** is measured: the slot is centred between the bottom of the copy and the top of the footer. If the crop is too tall to fit, the tool warns; crop it shorter or trim the copy.
- **`frame: false`** drops the outline and tinted background around the slot. Use it when the crop already sits in its own window (a table, an app window), or the result reads as a double frame.
- **`still`** is the time in seconds for the poster frame; pick a moment where the story has landed.
- Optional token colours the cut uses: `cta` (pill fill, falls back to `accent`), `stroke` (ink outlines on every shape), and `font.display` (headline and wordmark).
- Check: tile the four posters side by side with ffmpeg `hstack` and read the result before calling it done.

## Choosing a renderer

**House preference (2026-11-05): go bold in 2D, not 3D.** The Three.js object scenes kept reading as dummy boxes. For new scenes, and when improving old ones, push SVG, CSS, Canvas 2D, Matter.js and WebGL shaders (fragment effects, GPU particles, 2D fields) as far as they go. Build a Three.js 3D object scene only when the user asks for one. The existing 3D scenes stay as they are.

From `references/research/` (every rule there is cited to a spec or vendor doc):

| The asset needs | Use | Why |
|---|---|---|
| Crisp UI text, cards, product mockups, under ~1,000 nodes | **DOM/CSS** (`card-story`, `live-room`) | Text and layout for free; animate only `transform`/`opacity` so it stays on the compositor |
| Diagrams, icons, line art, fewer than a few hundred moving shapes | **SVG** (`galton-router`, `score-sheet`) | Retained mode, scales sharp, accessible (`<title>`); above ~800–1,400 DOM nodes, move to Canvas |
| Isometric blocks, stacks, architecture, fixed-angle 3D look | **2.5D: SVG iso or CSS 3D** (`iso-blocks`, `css3d-stack`) | No GPU, tiny, crisp text, deterministic; `rotateX(54.7356deg) rotateZ(-45deg)` |
| Thousands of particles, flow fields, generative texture | **Canvas 2D / p5** (`signal-field`) | Immediate mode; draw from t, never integrate |
| Real 3D objects, turning, lighting, a brand mark in 3D | **WebGL / Three.js** (`weather-board` uses it for a shader; build object scenes only on request) | One hero per page; export runs on SwiftShader (CPU), so keep shaders light |
| Piles, drops, collisions where the tumble is the story | **Matter.js, baked** (`drop-pile`) | Simulate once in `setup`, look frames up in `render` |

Rules that came out of the research:
- Never animate blur radius (pre-blur and cross-fade).
- Safari runs `requestAnimationFrame` at 60 Hz even on 120 Hz screens.
- Interpolate colours `in oklab`, because hex tweens go muddy in sRGB.
- Set `preserveDrawingBuffer: true` for export, or WebGL frames come out blank.
- Feature-detect WebGPU and always keep a WebGL2 path.

## 3D models (`vendor/three-full` + `vendor/three-kit`)

A WebGL scene starts with `// @vendor three-full three-kit`. That gives three.js 0.186.1 with GLTFLoader, SVGLoader, RoundedBoxGeometry, BufferGeometryUtils and the meshopt decoder (rebuild with `cd vendor-src && bun install && bun run build`), plus `window.SM3`:
- **`renderer`:** sRGB output, `preserveDrawingBuffer`, pixel ratio 1 when exporting.
- **`loadGLB(h.asset(content.model))`:** loads an embedded model.
- **`recolor(model, pick)`** and **`toon(colour)`:** flat 3-band toon materials in token colours.
- **`outline(obj, ink, thickness)`:** an inverted-hull outline.
- **`fit`, `isoCamera`:** true isometric orthographic camera at 35.264° and 45°.
- **`studio`, `contactShadow`:** lighting and a cheap soft shadow.
- **`extrudeSVG(svgText)`:** a brand mark becomes a solid.

`setup` may be `async`; the exporter waits for it, and fails loudly if it throws, instead of recording blank frames.

- **Models:** reference a file in content as `"asset:models/<name>.glb"` and the build embeds it, so the page stays one offline file. `add` copies every `asset:` file into the scene's folder under the same path, so an added scene (including `shot-demo`) builds and syncs on its own.
  - **Licences:** CC0 only by default (Kenney, Quaternius, Poly Haven), recorded in `assets/LICENSES.json`.
  - **Getting files:** download by hand or through an official API, never by scraping. Poly Pizza's terms forbid scripted downloads, and its licences vary per model.
- **No model fits?** Build it in code: extrude the brand's SVG, use rounded boxes or a lathe, and `InstancedMesh` for repeats.
- **Choose 2.5D instead** when the asset is mostly text or UI, must be tiny and accessible, or only needs a fixed isometric angle.
- **Choose WebGL** for turning lighting, curved real objects, more than about 20 overlapping 3D pieces, or a full rotation.

Deep references, each fully cited: `references/research/01-browser-pipeline.md`, `02-svg-canvas-webgl.md`, `03-animation-engineering.md` and `04-3d-assets.md`.

## Style packs (one look per site)

Tokens are the brand. A style pack (`styles/*.json`) is the art direction every scene on a site shares. It has 13 knobs, each a named choice: `stroke`, `elevation`, `corner`, `depth`, `texture`, `glow`, `colorMode`, `label`, `type`, `motion`, `tempo`, `stagger` and `motif`. The launch packs are `ink`, `soft-ui`, `outline`, `dimensional` and `field`; `native` means each scene keeps its own look. `node $SM style list` prints every pack with its short code.

- **The project decides.** `site-motion.json` (found by walking up from the working folder) holds the tokens, the style and any overrides. The first `add` writes it with that scene's home pack. **If it exists, never pass `--tokens` or `--style`**: every build, add and sync uses it, and a conflicting `--style` is refused. To change the look, run `style set <pack>` (or `--only knob,knob`), then `sync`.
- **Without a project**, choose one pack (the home pack of the first scene picked, from its `meta.json` `home`) and pass that same `--style` to every scene for the site.
- **A scene follows a pack only on the axes in its `meta.json` `directable` list.** The rest keeps its own look, so an unported scene is never broken by a pack. Every public scene is ported.
- **Writing or porting a scene:**
  - Every look value takes the native value as its fallback, so `native` stays pixel-identical:
    - CSS: `var(--sm-shadow-2, <native>)`, `var(--sm-radius-md, var(--r-md))`, `var(--sm-stroke-fine, 1px) solid var(--sm-stroke-color, …)`;
    - label voice: `var(--sm-label-font|transform|tracking|style, …)`;
    - type: `calc(46px * var(--sm-type-k, 1))`, plus `var(--sm-type-tracking, <native>)` and `var(--sm-type-weight, 400)` on headlines and big numbers. Type never grows, because a headline written to fill its width would re-wrap; `display` is lighter and tighter instead;
    - JS: `h.ui.stroke("regular", 1.5)`, `h.ui.strokeAttrs(...)`, `h.ui.shadow(level, native)`, `h.ui.radius("md", native)`;
    - staggers: `h.motion.stagger(i, 0.075)`.
  - Use named easing roles in `h.tw` (signature, snappy, soft, inOut), so the pack can remap motion. Tempo stretches them but never past the scene's end.
  - Leave the scene's own background transparent (the stage paints the paper), so the motif shows. A scene that paints its own full-stage scenery (live-room's hill, window-stack's ridges) doesn't list `motif`.
  - Painted scenery that takes palette colours must not go dark under a colour mode (accent-on-ink turns the palette into ink greys): when `h.dir.has("color")` and the brand is light, lift colours darker than mid-tone toward the paper. Native colours stay as they are.
  - Then list the axes in `directable`.
  - Run `node bin/site-motion.mjs lint <scene>`: on every axis listed in `directable` it flags raw stroke widths, shadows (a layer with blur or an outward offset), radii (not pills, circles or 0) and curves, and everywhere it flags hex colours (pure black and white allowed), `Date.now`, `Math.random` and CSS transitions. A value kept on purpose gets a reason in the source, which lint accepts: `// sm-native: a pill stays a pill` on the line or the line above, or `sm-native-start: …` / `sm-native-end` around a block. Data marks keep their weight (they are content, and `stroke: none` would erase them).
  - Check with `node bin/site-motion.mjs check <scene> --baseline` (native must stay at least 50 dB) and `check <scene> --style <pack>` for every pack.
- **The site's own UI follows the look too.** When you build components around the scenes (buttons, cards, transitions), take values from `site-motion style export --format tailwind|css|dtcg` (or the MCP tool `export_style`), and write `--format design-md --out DESIGN.md` so later agents keep to it. Never invent shadows, radii or curves next to a scene set.
- **Before handing over a set,** run `site-motion score --project` (or `score a b c`). It names the scene that doesn't match and why. A finding on an axis the scene doesn't follow can't be fixed with the look: port the scene or pick another.

## Tokens (`tokens/*.json`)
```json
{
  "name": "Brand",
  "color": { "paper": "#…", "surface": "#…", "raised": "#…", "ink": "#…", "muted": "#…", "faint": "#…", "line": "#…",
             "accent": "#…", "accentInk": "#…", "onAccent": "#…", "positive": "#…", "warning": "#…", "attention": "#…" },
  "palette": ["#…", "#…", "#…", "#…", "#…", "#…"],
  "font": { "sans": "…", "mono": "…", "display": "…", "import": "https://fonts.googleapis.com/css2?…&display=block" },
  "radius": { "sm": 6, "md": 12, "lg": 20 }
}
```
`attention` is optional: the colour for things that wait on a person (held, needs approval), apart from `warning` (something went wrong); it defaults to `warning`. `font.display` is optional: headline type (`--font-display`), falling back to `sans` in every scene.
`paper, surface, ink, muted, line, accent` and 3+ palette colours are required. They become CSS variables (`--c-paper`, `--c-accent-ink`, `--p-0`, `--font-mono`, `--r-md`) and are passed to the scene as `tokens`. Use `display=block` for web fonts so frames never render in a fallback face.

## Writing a new scene

`scenes/<name>/scene.js` (+ optional `scene.css`, `content.json`):
```js
SiteMotion.scene({
  width: 1600, height: 900,     // design size; the live embed scales it to its container
  duration: 12, loop: 2,        // plays 0 → 12 once, then loops 2 → 12 forever (loop: 0 = no intro)
  still: 7,                     // the poster frame and the reduced-motion frame
  setup({ root, content, tokens, h }) { /* build DOM/SVG/canvas ONCE, return refs */ },
  render(t, refs, h) { /* set attributes/styles from t only */ },
});
```
Helpers `h`: `tw(t, start, dur, ease)` eased 0→1 progress; `span(t, in, out)` in-hold-out envelope; `typed(text, t, start, cps)`; `count(t, start, dur, from, to)`; `ease.signature|snappy|soft|inOut|linear`; `clamp`, `lerp`, `rng(seed)`; `mix`, `alpha` for colour; `svg(tag, attrs, parent)`, `el(tag, class, parent, text)`, `set(node, attrs)` (writes only on change), `text(node, value)`; `isoCamera(origin, scale, angle)` with `p(x,y,z)`, `pts(list)` and `matrix(at, along, down)` for text lying on a face.

### Rules (each one broke a frame once)
- **Export freezes CSS and WAAPI animations at t too, and turns transitions off.** Anything animated by CSS still lands on the right frame, but drive it from `render(t)` when you can.
- **Pure in t.** No `Date.now()`, no accumulated state, no `Math.random()` in `render`; seed `h.rng` in `setup`. Test by rendering the sheet twice: identical.
- **Seamless loop.** The state at `duration` must equal the state at `loop`. Every repeating pattern must complete whole cycles per loop: the loom weaves 48 rows because its twill repeats every 4, its shuttle every 2 and its colour stripe every 16 (36 rows jumped at the seam). Continuous motion (drift, pulses, rotations) must complete whole cycles in `duration − loop` (e.g. a 12-tile period at 1.2 tiles/s over 10 s). Content that builds up must clear before the seam (`span(..., outAt)` ending by `duration`).
- **No `will-change` on exported DOM.** It puts an element on its own compositor layer, and in headless Chrome that layer can rasterise slightly differently depending on the frames seeked before it (a sorting wall's floating chips repeated at 51 dB with it, pixel-identical without it). Animate `transform` and `opacity` with no layer hints.
- **Motion language.** Entrances decelerate (`signature`, 0.5–0.9 s); UI changes `snappy` (0.35–0.5 s); stagger 60–120 ms, capped; `linear` only for continuous loops; move ≤ 24–40 px. Animate transform and opacity; heights only for small UI.
- **Live data reads true.** Counters land on the content's value; charts draw from the content's series; timers count in whole units; the number on screen at `still` is the one in the copy.
- **Text fits its box at its longest value** — set fixed widths/positions from the widest string, not the first.
- **No real third-party marks.** Logos are lettermarks from content (`{ text, bg, fg }`).
- **Physics when the physics is the point.** Real simulation (Matter.js) adds scatter. When the story needs a reliable outcome ("the rule moves traffic to the best processor"), compute each path yourself as a seeded random walk, as `galton-router` does; keep real physics for piles, drops and collisions (`drop-pile`).
- **Anything that starts in an intro must finish by `loop`.** The stage treats a tween begun before `loop` as complete once the loop starts, so the loop's first frame matches its last; never rely on an easing curve's flat tail to hide an unfinished intro.
- **`site-motion check <scene>` measures determinism, the seam, contrast, text fit (and one-frame jumps on UI demos)** (against the frame steps right beside it, so busy or stepped scenes are judged fairly). `--baseline write|compare` guards native pixels while porting. Text a scene dims on purpose is listed, not failed: by its own opacity, or under an overlay marked `data-sm-dim="<strength>"` (a spotlight that dims everything outside its box).
- **Check the seam by measurement, not by eye.** Render the last frame (`duration − 1/fps`) and the first frame of the loop, then compare with ffmpeg `psnr`. Above ~50 dB is seamless for a scene that rests at its seam. For a scene that is always moving (a turning model), compare the seam with an ordinary step, `loop` vs `loop + 1/fps`: the seam PSNR should be within about 1 dB of it. Typical faults: copy or labels that fade in at t = 0 (give the scene an intro and set `loop` after it), or an element counted as "active" before the playhead starts.
- **Read the page's console on every check.** A WebGL shader that fails to compile only logs an error and draws nothing (the first outline helper did exactly that), so a render can look fine and still be missing a layer.
- **Colour only from tokens.** Face shading in iso scenes is `mix(accent, accentInk, p)` and `mix(accent, white, p)`, never a new hex.

## Files
`runtime/stage.js` the player and helpers · `runtime/ui-kit.js` frames, parts, motion, cursors, camera and annotations for product-UI demos · `lib/shot.mjs` screenshot → colours, tokens, ruled grid and a shot-demo folder · `lib/layout.mjs` the text-fit, jump and framing checks · `lib/build.mjs` HTML assembly and token CSS · `lib/render.mjs` frame export via `lib/chrome.mjs` (DevTools protocol, no deps) and ffmpeg · `scenes/` archetypes · `tokens/` presets (`mint`, `ledger`, `night`) · `bin/site-motion.mjs` CLI · `bin/social.mjs` 9:16 social cuts · `brands/<brand>/` per-brand content and `social.json`.
