# 03: Animation engineering and deterministic frame capture

Track 3 of 5 for site-motion. Research done 5 November 2026. Spec dates are the Editor's Draft (ED) or Working Draft (WD) dates shown on each page that day. Browser versions come from MDN's [browser-compat-data](https://github.com/mdn/browser-compat-data) (BCD) as of the same date. A sentence marked *(derived)* is my own reasoning from the cited definitions, not something the source says outright.

---

## 1. CSS Transitions and CSS Animations

**Transitions** start because a computed value changed. CSS Transitions 1 ([WD, 8 Oct 2026](https://www.w3.org/TR/css-transitions-1/)) groups simultaneous style changes into a *style change event*. It deliberately does not define when that event fires: implementations usually run one per screen refresh, and also whenever script asks for up-to-date style or layout ([css-transitions-1](https://drafts.csswg.org/css-transitions/)). A transition therefore has no authored start time. It starts whenever the engine happens to notice the change.

Level 1 can only start a transition on an element that was rendered in the previous style change event. Level 2 adds `@starting-style` to give newly displayed elements a before-change style ([css-transitions-2, ED 22 Apr 2026](https://drafts.csswg.org/css-transitions-2/)). `transition-behavior: allow-discrete` shipped in Chrome 117, Firefox 129 and Safari 17.4 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/properties/transition-behavior.json)).

**Animations** are declared with `@keyframes` and the `animation-*` properties ([css-animations-1, ED 13 Sep 2026](https://drafts.csswg.org/css-animations/)). The parts that matter for timing:

- **Delay.** A negative `animation-delay` is valid: the animation "appears to start partway through its active duration" ([css-animations-1 §4.7](https://drafts.csswg.org/css-animations/#animation-delay)).
- **Duration.** A `0s` duration still fires its events, and with `backwards`/`both` fill it shows the first frame ([css-animations-1 §4.2](https://drafts.csswg.org/css-animations/#animation-duration)).
- **Fill modes.** Web Animations defines them: `none` has no effect outside the active interval, `forwards` holds the final value in the after phase, `backwards` holds the first value in the before phase, and `both` does both ([web-animations-1 §4.6.8](https://drafts.csswg.org/web-animations-1/#fill-behavior)).
- **Easing scope.** `animation-timing-function` applies per keyframe segment, not to the whole iteration ([css-animations-1 §4.3](https://drafts.csswg.org/css-animations/#animation-timing-function)).
- **Play state.** Level 2 makes every CSS animation a `CSSAnimation` object. After a successful script call to `play()` or `pause()`, later changes to `animation-play-state` are ignored ([css-animations-2 §6.1, ED 18 Aug 2026](https://drafts.csswg.org/css-animations-2/#cssanimation)). This matters for capture: once script has paused an animation, the stylesheet cannot restart it.

**Compositor.** Only `transform` and `opacity` can be animated by the compositor without layout or paint ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). Every promoted layer costs memory ([same](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). A compositor animation keeps running when the main thread is busy, so in live playback its clock and your `render(t)` clock can drift apart *(derived)*.

## 2. The Web Animations API: one model under everything

Web Animations ([WD 5 Jun 2023](https://www.w3.org/TR/web-animations-1/); [ED 8 Oct 2026](https://drafts.csswg.org/web-animations-1/)) is the shared timing model behind CSS animations, CSS transitions and `element.animate()`.

- **`document.timeline`.** Its current time is "a fixed offset from the now timestamp" taken each time *update animations and send events* runs. It "will roughly correspond to `Performance.now()`" but does not change between those updates ([web-animations-1](https://www.w3.org/TR/web-animations-1/)). The `requestAnimationFrame` timestamp equals `document.timeline.currentTime` ([MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
- **`Animation.currentTime`** is in milliseconds and can be read or set whether the animation is running or paused. It includes the delay, so to land on the midpoint you set `delay + activeDuration/2` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime)). Firefox rounds it to 0.02 ms by default, and to 16.667 ms or more under `privacy.resistFingerprinting`. Safari rounds to 0.001 ms; Chrome does not round ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime)).
- **`pause()` is asynchronous.** It queues a *pending pause task* and replaces the `ready` promise. Setting `currentTime` while a pause is pending "synchronously complete[s] the pause operation": the hold time becomes the seek time, the start time is cleared, and `ready` resolves ([web-animations-1 §4.5.4](https://drafts.csswg.org/web-animations-1/#setting-the-current-time-of-an-animation)). The sequence **`pause()` then set `currentTime`** therefore freezes the animation at an exact time in one task.
- **`getAnimations()`** returns CSS Animations, CSS Transitions and script animations ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations)). It has been Baseline since September 2020 (Chrome 84, Firefox 75, Safari 14 per [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Document.json)). There are three traps:
  1. It returns only **relevant** animations: those whose effect is *current* or *in effect* ([web-animations-1](https://drafts.csswg.org/web-animations-1/#relevant-animations)). A paused animation seeked past its end with `fill: none` is neither, so it drops out of the list *(derived)*. Build the list once, then keep it.
  2. For a document, "subtree" means *descendants* plus their pseudo-elements ([web-animations-1](https://drafts.csswg.org/web-animations-1/#relevant-animations)). Shadow trees are not descendants, so call `shadowRoot.getAnimations()` on each shadow root. Iframes are separate documents *(derived)*.
  3. Calling `getAnimations()` flushes pending style, so the `CSSAnimation` objects exist before it returns ([css-animations-2 §6.2](https://drafts.csswg.org/css-animations-2/#requirements-on-pending-style-changes)).

**Freezing every animation at time `t`** (a sketch):

```js
// Once, after load and after fonts/images are ready:
const roots = [document, ...[...document.querySelectorAll('*')].map(e => e.shadowRoot).filter(Boolean)];
const anims = roots.flatMap(r => r.getAnimations());
anims.forEach(a => a.pause());            // stylesheet play-state is now ignored (css-animations-2)
// Per frame:
function seekAll(tMs) { for (const a of anims) a.currentTime = tMs; } // completes the pending pause synchronously
```

This assumes every animation should count time from the composition's zero. It does not catch animations created later, such as a transition triggered by `render(t)` changing a style. Either re-query after each `render(t)` and pause the new ones, or set `transition: none` while capturing.

The DevTools protocol can do the same thing from outside the page. The `Animation` domain has `setPaused`, `seekAnimations` (one shared `currentTime` or one per animation) and `setPlaybackRate` for the document timeline ([Animation.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Animation.pdl)).

## 3. Scroll-driven animations and View Transitions

**Scroll-driven animations** ([scroll-animations-1, ED 25 Sep 2026](https://drafts.csswg.org/scroll-animations-1/)) replace the document timeline with one of two timelines:

- **`ScrollTimeline`** (`scroll()`) maps a scroller's position to progress from 0% to 100%.
- **`ViewTimeline`** (`view()`) tracks a subject element as it crosses its scrollport.

`currentTime` on these timelines is a **percentage `CSSUnitValue`**, not milliseconds ([spec](https://drafts.csswg.org/scroll-animations-1/#scrolltimeline-interface)). Because of that, `animation-duration` should stay `auto` ([developer.chrome.com](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)). Support: Chrome 115, Safari 26 and Firefox 159 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/properties/animation-timeline.json); Firefox 159 shipped on 27 Oct 2026 per [BCD firefox.json](https://github.com/mdn/browser-compat-data/blob/main/browsers/firefox.json)). MDN marks the feature **Baseline 2026, newly available** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline)).

**Why scroll is not time for export.** Scroll progress depends on layout: viewport height, content length and font metrics. It has no clock, and Web Animations treats a timeline that is not monotonically increasing as a separate case ([web-animations-1 "current"](https://drafts.csswg.org/web-animations-1/#current)). One scroll position is one frame. Scrolling a headless page at a fixed speed gives you a screen recording of a scroll, not the design *(derived)*. For video, map a scripted `t → progress` explicitly. Either rebuild the effect on the document timeline, or drive scroll position as a function of `t` and accept that layout is now an input.

**View Transitions.** Same-document transitions shipped in Chrome 111 and cross-document transitions in Chrome 126 ([developer.chrome.com](https://developer.chrome.com/docs/web-platform/view-transitions)). In BCD, `startViewTransition` has Chrome 111, Firefox 144 and Safari 18, and `@view-transition` (cross-document) has Chrome 126 and Safari 18.2, with Firefox still in preview ([BCD Document](https://github.com/mdn/browser-compat-data/blob/main/api/Document.json), [BCD @view-transition](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/view-transition.json)). The browser snapshots the old and new states, and "the transitions are powered by CSS Animations" ([developer.chrome.com](https://developer.chrome.com/docs/web-platform/view-transitions)), on a `::view-transition` pseudo-element tree ([css-view-transitions-1](https://www.w3.org/TR/css-view-transitions-1/)). Those pseudo-elements hang off the root element, so `document.getAnimations()` should return their animations and they can be paused and seeked like any other *(derived from the subtree definition above)*. The snapshot step is still asynchronous and depends on rendering. Treat View Transitions as a live-only feature unless they have been tested frame by frame.

## 4. Easing maths

### cubic-bézier

CSS Easing 2 ([ED 23 Feb 2026](https://drafts.csswg.org/css-easing-2/)) defines `cubic-bezier(x1, y1, x2, y2)` as a cubic Bézier with endpoints fixed at (0,0) and (1,1). The *input progress* is the **x** value and the *output progress* is the **y** value. The x coordinates are restricted to `[0,1]`, which keeps x(s) monotonic, so the curve is a function. The y values are unbounded, which is how overshoot works ([css-easing-2 §2.2](https://drafts.csswg.org/css-easing-2/#cubic-bezier-easing-functions)). The keyword equivalents are `ease` = `(0.25, 0.1, 0.25, 1)`, `ease-in` = `(0.42, 0, 1, 1)`, `ease-out` = `(0, 0, 0.58, 1)` and `ease-in-out` = `(0.42, 0, 0.58, 1)` (same).

As a parametric curve, x(s) = 3(1−s)²s·x1 + 3(1−s)s²·x2 + s³, and y(s) has the same form. To evaluate an easing you must **invert x**: find the s where x(s) equals the input progress, then return y(s). Chromium does this in [`cubic_bezier.cc`](https://chromium.googlesource.com/chromium/src/+/main/ui/gfx/geometry/cubic_bezier.cc):

1. It makes an initial guess by linear interpolation over a table of spline samples.
2. It runs at most 4 Newton–Raphson iterations to ε = 1e-7.
3. It falls back to bisection "for reliability".

A JavaScript easing that copies this (or simply bisects to 1e-7) matches CSS to well under a pixel *(derived)*.

### `linear()`

`linear()` is a piecewise-linear function through control points. Each point is an output value with optional input percentages, and a missing input is spread evenly between its neighbours ([css-easing-2 §2.1](https://drafts.csswg.org/css-easing-2/#linear-easing-function)). Outputs may go outside [0,1], so dense points can approximate **springs and bounces**. "By merely doubling the number of stops, you already get a smooth result." The Archibald/Argyle generator converts a JavaScript easing into stops ([developer.chrome.com](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)). It shipped in Chrome 113, Firefox 112 and Safari 17.2 and has been Baseline since December 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear), [BCD](https://github.com/mdn/browser-compat-data/blob/main/css/types/easing-function.json)).

A `linear()` spring is a recording at a fixed duration. It cannot respond to an interrupting velocity *(derived)*. For site-motion that is a strength: it is a pure function of progress.

### Springs as pure functions of time

A damped spring with mass *m*, stiffness *k* and damping *c* obeys m·x″ + c·x′ + k·x = 0, measured relative to its target. Remotion's implementation, which it took from Reanimated ([remotion.dev/docs/spring](https://www.remotion.dev/docs/spring)), uses the closed-form solution ([spring-utils.ts](https://github.com/remotion-dev/remotion/blob/main/packages/core/src/spring/spring-utils.ts)):

- ζ = c / (2√(km)) (damping ratio), ω₀ = √(k/m), ω₁ = ω₀√(1−ζ²)
- **Underdamped (ζ < 1)** oscillates: x(t) = target − e^(−ζω₀t)·[x₀cos ω₁t + ((v₀ + ζω₀x₀)/ω₁)·sin ω₁t]
- **Critically damped (ζ = 1)** is the fastest approach with no overshoot: x(t) = target − e^(−ω₀t)·(x₀ + (v₀ + ω₀x₀)t)

Here x₀ is the initial distance from the target and v₀ the initial velocity. For any ζ ≥ 1, Remotion uses the critically damped branch, which approximates the overdamped case ([source](https://github.com/remotion-dev/remotion/blob/main/packages/core/src/spring/spring-utils.ts)). Its defaults are `mass: 1`, `damping: 10`, `stiffness: 100`, so ζ = 0.5, a bouncy spring. `overshootClamping` and `durationInFrames` stretching are options ([docs](https://www.remotion.dev/docs/spring)).

Remotion advances the spring frame by frame from 0, with each step capped at 64 ms, and caches the results ([source](https://github.com/remotion-dev/remotion/blob/main/packages/core/src/spring/spring-utils.ts)). Each step is exact for a linear ODE, so the result is still a pure function of (frame, fps, config) *(derived)*. The simplest choice for site-motion is to evaluate the closed form directly at `t` with v₀ = 0. Then the spring needs no history and seeks in O(1).

## 5. Interpolation

### Colour

CSS Color 4 ([ED 3 Nov 2026](https://drafts.csswg.org/css-color-4/#interpolation)) is explicit about which space to use:

- **Linear-light spaces** (`srgb-linear`, XYZ) give the result of physically mixing light.
- **Oklab** gives perceptually even steps "such as in a gradient".
- **OkLCh** avoids "graying out" because it keeps chroma.
- **Gamma-encoded sRGB** "produces poorer results (overly dark or greyish mixes)".

That last point is the muddy-midpoint problem. Mixing gamma-encoded values neither averages light nor follows perception, so a red-to-green blend sinks to a dark olive. CSS Images 4 demonstrates it with `#f01 → #081`: the sRGB gradient is "clearly too dark at the midpoint" ([css-images-4](https://drafts.csswg.org/css-images-4/#linear-gradients)).

**The default is a trap.** When the host syntax names no space, interpolation defaults to **Oklab**. However, implementations **must** interpolate legacy colours (hex, named, `rgb()`, `hsl()`, `hwb()`) in **gamma-encoded sRGB** for web compatibility ([css-color-4 §13](https://drafts.csswg.org/css-color-4/#interpolation)). Your `#hex` tweens and gradients are therefore sRGB unless you write `in oklab` or use a modern colour form. Interpolation happens on premultiplied-alpha values ([same](https://drafts.csswg.org/css-color-4/#interpolation)).

`color-mix()` (CSS Color 5, [ED 29 Oct 2026](https://drafts.csswg.org/css-color-5/#color-mix)) defaults to Oklab when no method is given. It shipped in Chrome 111, Firefox 113 and Safari 16.2 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/types/color.json)). Polar spaces default to `shorter` hue interpolation ([css-color-4](https://drafts.csswg.org/css-color-4/#interpolation)). Interpolating in OkLCh can also leave the display gamut even when both endpoints are inside it ([css-color-4 §13.1](https://drafts.csswg.org/css-color-4/#interpolation-gamut)).

### Transforms

CSS Transforms 1 ([ED](https://drafts.csswg.org/css-transforms-1/#interpolation-of-transforms)) interpolates transform lists in three steps:

1. Pad the shorter list with identity functions.
2. Interpolate pairs that share a name or primitive one by one.
3. At the first mismatch, multiply the rest of each list into a 4×4 matrix and interpolate the matrices by **decomposition**. That means translate, scale, skew, perspective and a quaternion rotation, then recompose ([css-transforms-2 §13](https://drafts.csswg.org/css-transforms-2/#interpolation-of-3d-matrices)).

So `rotate(0)` → `rotate(720deg)` spins twice. If the lists don't match, the 720° collapses to an identity matrix and nothing spins *(derived: a rotation's matrix forgets whole turns)*. Keep function lists the same shape, or use the separate `translate`/`rotate`/`scale` properties from css-transforms-2.

## 6. Lottie

Lottie's JSON started as the Bodymovin After Effects export. It is now standardised by the **Lottie Animation Community**, a Linux Foundation project under the Joint Development Foundation ([lottie.github.io](https://lottie.github.io/)). The **v1.0 spec** was announced on 17 September 2024 ([Linux Foundation](https://www.linuxfoundation.org/press/lottie-animation-community-announces-lottie-v1.0-specification)), and the spec holds only features the LAC has approved ([spec](https://lottie.github.io/lottie-spec/latest/)).

The top-level Animation object has these fields ([composition](https://lottie.github.io/lottie-spec/latest/specs/composition/)):

| Field | Meaning |
|---|---|
| `ver` | Spec version, encoded `MMmmpp` |
| `fr` | Frames per second |
| `ip` / `op` | In and out **frames** |
| `w`, `h` | Size |
| `layers`, `assets` | Content |
| `slots` | A dictionary of slot ids that "will replace matching properties" |

Time is measured in frames, so t seconds = `ip + t·fr` frames *(derived)*. **Colours** are vectors of 0–1 floats for RGB. Gradients are packed into flat float arrays: 4 floats per colour stop and 2 per opacity stop ([values](https://lottie.github.io/lottie-spec/latest/specs/values/)).

**Recolouring** has two routes: rewrite those float arrays, or, better, use **slots** to swap named properties without touching the layer tree ([composition](https://lottie.github.io/lottie-spec/latest/specs/composition/)).

**lottie-web** supports `renderer: 'svg' | 'canvas' | 'html'`, with `loop`, `autoplay`, `path`/`animationData` and `rendererSettings`. `goToAndStop(value, isFrame)` takes time by default and a frame when `isFrame` is true. `setSubframe(true)` (the default) updates on every rAF with intermediate values; `false` keeps the original AE frame rate ([lottie-web README](https://github.com/airbnb/lottie-web)). For capture, load with `autoplay: false` and call `goToAndStop(frame, true)` each frame.

## 7. Rive

Rive files (`.riv`) hold artboards containing **timeline animations** (linear) and **state machines**. A state machine is "a set of animation states and the transitions between them". It is controlled indirectly, through transitions conditioned on Data Binding properties, and "user input or data binding changes" unsettle it ([state machines](https://rive.app/docs/runtimes/web/state-machines)). The docs recommend `@rive-app/webgl2` ([web-js](https://rive.app/docs/runtimes/web/web-js)). The `animations`/`stateMachines` parameters are deprecated in favour of a single `stateMachine` ([parameters](https://rive.app/docs/runtimes/web/rive-parameters)), and `scrub()` is listed under Deprecated ([same](https://rive.app/docs/runtimes/web/rive-parameters)).

**Seeking.** The low-level API advances by a time delta: `LinearAnimationInstance.advance(seconds)`, then `.apply(mix)`, then `artboard.advance()`. A state machine runs `stateMachine.advance()` and then `artboard.advance()`. The docs show no settable absolute time ([low-level API](https://rive.app/docs/runtimes/web/low-level-api-usage)). The high-level instance has `stopRendering()`, `startRendering()` and `drawFrame()` ([parameters](https://rive.app/docs/runtimes/web/rive-parameters)).

To seek to t, create a fresh instance and advance it by t, or step forward by 1/fps with fixed inputs. Random-access seeking costs a reset each time *(derived)*.

## 8. GSAP

- **Nesting.** GSAP timelines nest, and each has its own playhead. When a parent renders at time T, it "loops through its children" and renders each at the matching local time ([Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)).
- **`paused: true`** pauses a timeline the moment it is created (same).
- **`seek(position, suppressEvents = true)`** "jumps to a specific time (or label) without affecting whether or not the instance is paused" ([seek()](https://gsap.com/docs/v3/GSAP/Timeline/seek())).
- **The ticker.** `gsap.ticker` updates the global timeline on every `requestAnimationFrame`. Lag smoothing is on by default (threshold 500 ms, adjusted lag 33 ms) and is turned off with `lagSmoothing(0)` ([ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker)). Advanced users can unhook the ticker with `gsap.ticker.remove(gsap.updateRoot)` and drive time with `gsap.updateRoot(seconds)` ([updateRoot](https://gsap.com/docs/v3/GSAP/gsap.updateRoot())).

**Why a paused timeline is deterministic.** Its rendered state depends only on its playhead, and a paused playhead moves only when you seek. Neither the ticker nor lag smoothing changes it *(derived from the above)*. The remaining risk is `from()` tweens, which capture their start values when created. HyperFrames therefore advises `fromTo()` "when both endpoints matter; it remains reliable after backward or random seeks" ([HyperFrames GSAP guide](https://hyperframes.heygen.com/guides/gsap-animation)).

## 9. Deterministic capture in headless Chrome

### Virtual time and BeginFrame: status

- **`Emulation.setVirtualTimePolicy`** (experimental) takes `advance`, `pause` or `pauseIfNetworkFetchesPending`, plus an optional `budget` in virtual ms that fires `virtualTimeBudgetExpired`, a starvation count, and `initialVirtualTime` ([Emulation.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl)).
- **`HeadlessExperimental.beginFrame`** "sends a BeginFrame to the target and returns when the frame was completed". It can return a screenshot. It requires a target created with BeginFrameControl and is "designed for use with `--run-all-compositor-stages-before-draw`" ([HeadlessExperimental.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/HeadlessExperimental.pdl)).
- **`Target.createTarget`'s `enableBeginFrameControl`** is documented as "headless shell only, **not supported on MacOS yet**" ([Target.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Target.pdl)).
- **New headless.** A Chromium engineer wrote on 19 Nov 2024 that virtual time and manual frame control "are not supported in the new headless" and remain only in `headless_shell` ([headless-dev](https://groups.google.com/a/chromium.org/g/headless-dev/c/WgNE0CAlx-8)).
- **`chrome-headless-shell`.** Since Chrome 132.0.6793.0, the old headless mode exists only as this standalone binary (Puppeteer `headless: 'shell'`) ([developer.chrome.com](https://developer.chrome.com/docs/chromium/headless)).

The practical consequence: on macOS with new headless, neither virtual time nor BeginFrame is available. Determinism has to come from **seeking a paused page** and then taking a screenshot with `Page.captureScreenshot` ([Page.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl)). For a transparent background, use `Emulation.setDefaultBackgroundColorOverride` ([Emulation.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl)).

### How Remotion and HyperFrames do it

**Remotion** renders frames in parallel tabs that share no state. Its rules ([flickering](https://www.remotion.dev/docs/flickering), [CSS animations](https://www.remotion.dev/docs/troubleshooting/css-animations), [randomness](https://www.remotion.dev/docs/using-randomness), [delayRender](https://www.remotion.dev/docs/delay-render)):

- Animations must run "purely off the value of `useCurrentFrame()`".
- A component must not rely on frames rendering in order.
- CSS animations, transitions and timers are unsupported.
- Use seeded `random()` rather than `Math.random()`.
- `delayRender()` blocks capture until `continueRender()` is called, with a default 30 s timeout.

**HyperFrames** ([determinism](https://hyperframes.heygen.com/concepts/determinism), [frame adapters](https://hyperframes.heygen.com/concepts/frame-adapters)):

- Time is `floor(frame)/fps` in integer maths.
- Rules: no wall clock (no `Date.now`, rAF or timers), no unseeded randomness, no mid-render fetches, fixed size and fps, and a finite length.
- Adapters seek GSAP, CSS, WAAPI, Lottie, Three.js and Anime.js. The adapter contract is that `seekFrame(n)` gives the same result for the same frame, works in any order, and leaves nothing to resolve after the commit.
- The engine captures with `HeadlessExperimental.beginFrame` in `chrome-headless-shell` ([engine README](https://github.com/heygen-com/hyperframes/blob/main/packages/engine/README.md)).
- Docker pins Chromium, fonts and FFmpeg, because fonts and Chrome versions vary between machines ([determinism](https://hyperframes.heygen.com/concepts/determinism)).

### Fonts, images, rAF

- **Fonts.** `document.fonts.ready` resolves once fonts have loaded, layout is complete and "no further font loads are needed" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready)). It does **not** request a face that nothing uses yet. Call `document.fonts.load('700 64px "Face"', text)` before measuring text ([HyperFrames](https://hyperframes.heygen.com/guides/gsap-animation)).
- **Images.** `img.decode()` resolves when the image "is decoded and is safe to be appended" with no decode delay ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)).
- **rAF.** Callbacks get the frame's timestamp, which equals `document.timeline.currentTime` and is shared by every callback in that frame. rAF is paused in background tabs and hidden iframes, and its rate follows the display (60, 120 or 144 Hz) ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). Never derive the exported `t` from rAF timestamps. In capture mode, rAF is at most a "paint now" hook.

### Frame rate and encoding

- **Frame rate.** Render at the target fps directly. ffmpeg's `fps` filter converts to a constant rate "by duplicating or dropping frames" ([ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html#fps)), which judders. `-fps_mode cfr` duplicates or drops to force a constant rate ([ffmpeg](https://ffmpeg.org/ffmpeg.html)). For image sequences, set the input rate with `-framerate` ([same](https://ffmpeg.org/ffmpeg.html)).
- **MP4/H.264.** Common H.264 profiles (Constrained Baseline, Main, High) are 8-bit 4:2:0 ([MDN codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs)). Pass `-pix_fmt yuv420p` explicitly; x264 also supports other formats ([ffmpeg-codecs libx264](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb)), and RGB PNG input could otherwise come out as 4:4:4, which those profiles don't cover. 4:2:0 halves chroma resolution in both axes, so width and height must be even *(derived)*.
- **WebM alpha.** VP8/VP9 need `yuva420p` from PNG frames ([Remotion](https://www.remotion.dev/docs/transparent-videos)), and Safari does not support alpha in VP8 or VP9 ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs)).
- **GIF.** Each pixel is an 8-bit index into a palette of at most 256 colours ([MDN images](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)), and transparency is on or off. Hence `palettegen` ("one palette for a whole video stream", with `reserve_transparent` and `stats_mode=full|diff|single`) followed by `paletteuse` with a dither such as `bayer` (deterministic) or `floyd_steinberg` ([ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html#palettegen)). Frame delays are in **centiseconds** ([GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt), [ffmpeg GIF muxer](https://ffmpeg.org/ffmpeg-formats.html#gif-2)). 60 fps (1.667 cs) cannot be represented, so use 50, 25 or 20 fps for exact timing *(derived)*.
- **WebP.** Lossy WebP is VP8 and YUV420 only; lossless is RGB; both support alpha ([ffmpeg-codecs libwebp](https://ffmpeg.org/ffmpeg-codecs.html#libwebp)). Animation and looping are supported ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)).
- **AVIF.** Animated AVIF supports alpha at 8, 10 or 12 bits ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)). ffmpeg has an `avif` muxer with a `loop` option ([ffmpeg-formats](https://ffmpeg.org/ffmpeg-formats.html#avif)).

## 10. Reduced motion

`prefers-reduced-motion: no-preference | reduce` detects that the user asked the system to minimise "non-essential motion". `reduce` targets motion that triggers vestibular discomfort or distraction for people with attention deficits ([mediaqueries-5 §12.1](https://drafts.csswg.org/mediaqueries-5/#prefers-reduced-motion)). WCAG 2.2 SC 2.3.3 *Animation from Interactions* (AAA) says interaction-triggered motion can be disabled, using techniques C39 (CSS query) and SCR40 (JS) ([W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).

web.dev's guidance ([article](https://web.dev/articles/prefers-reduced-motion)):

- Parallax and zoom are the main triggers.
- Remove unnecessary or decorative motion.
- Apply animation only under `no-preference`.
- In JavaScript, use `matchMedia('(prefers-reduced-motion: reduce)')` and listen for `change`, because JS animations aren't updated automatically.

For exports, CDP `Emulation.setEmulatedMedia` with `features` can render a reduced-motion variant ([Emulation.pdl](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl)).

---

## Practical rules for site-motion

1. **`render(t)` owns time.** Derive all motion from `t` in seconds, computed as `frame/fps` with integer frames. Never read `Date.now`, `performance.now` or rAF timestamps in capture mode. Seed any randomness.
2. **Freeze foreign clocks once, then seek them each frame.**
   - CSS and WAAPI: `getAnimations()` on the document **and each shadow root**, `pause()`, keep the list, then set `currentTime = t*1000` every frame.
   - GSAP: `paused: true` + `seek(t)`.
   - Lottie: `goToAndStop(ip + t*fr, true)`.
   - Rive: reset and advance by t.
3. **Kill transitions while capturing** (`transition: none !important`). A style change made by `render(t)` would otherwise start a new animation on the wall clock.
4. **Don't export scroll-driven animations or View Transitions as-is.** Map progress to `t` explicitly, or rebuild the effect on the document timeline.
5. **Easing parity.** Solve cubic-bézier by Newton plus bisection to 1e-7. Use the closed-form spring with v₀ = 0 so seeks cost O(1). Bake a spring to `linear()` when CSS must play it live.
6. **Colour.** Write tweens and gradients `in oklab` (or OkLCh for saturated hue sweeps). Hex-to-hex in CSS is sRGB by default.
7. **Transforms.** Keep transform lists the same shape at every keyframe, or use the separate `translate`/`rotate`/`scale` properties.
8. **Ready gate before frame 0.** Wait for `document.fonts.load(...)` for every face, `document.fonts.ready`, `img.decode()` on every image, and Lottie/Rive load events. Fail loudly on timeout, as Remotion does at 30 s.
9. **Capture path.** On macOS and new headless, use seek + `Page.captureScreenshot`. BeginFrame and virtual time need `chrome-headless-shell` on Linux. Pin the Chrome version and fonts (Docker) when you need byte-identical output.
10. **Encoding defaults.**
    - MP4: `libx264 -pix_fmt yuv420p`, even dimensions.
    - WebM with alpha: `yuva420p` from PNG frames.
    - GIF: `palettegen` → `paletteuse` (bayer for stable dithering), at an fps that divides 100.
    - WebP/AVIF for alpha with a smaller file than GIF.
11. **Reduced motion is an output variant.** Live playback honours `prefers-reduced-motion`. Export can emulate it to produce a calm version, and should never assume it.

## Sources

**Specs (CSSWG/W3C)**
- [CSS Transitions 1 (WD 8 Oct 2026)](https://www.w3.org/TR/css-transitions-1/) · [ED](https://drafts.csswg.org/css-transitions/) · [CSS Transitions 2 (ED 22 Apr 2026)](https://drafts.csswg.org/css-transitions-2/)
- [CSS Animations 1 (ED 13 Sep 2026)](https://drafts.csswg.org/css-animations/) · [CSS Animations 2 (ED 18 Aug 2026)](https://drafts.csswg.org/css-animations-2/)
- [Web Animations 1 (WD 5 Jun 2023)](https://www.w3.org/TR/web-animations-1/) · [ED 8 Oct 2026](https://drafts.csswg.org/web-animations-1/)
- [Scroll-driven Animations 1 (ED 25 Sep 2026)](https://drafts.csswg.org/scroll-animations-1/)
- [CSS View Transitions 1](https://www.w3.org/TR/css-view-transitions-1/)
- [CSS Easing 2 (ED 23 Feb 2026)](https://drafts.csswg.org/css-easing-2/)
- [CSS Color 4 (ED 3 Nov 2026)](https://drafts.csswg.org/css-color-4/) · [CSS Color 5 (ED 29 Oct 2026)](https://drafts.csswg.org/css-color-5/) · [CSS Images 4](https://drafts.csswg.org/css-images-4/)
- [CSS Transforms 1](https://drafts.csswg.org/css-transforms-1/) · [CSS Transforms 2](https://drafts.csswg.org/css-transforms-2/)
- [Media Queries 5](https://drafts.csswg.org/mediaqueries-5/) · [WCAG 2.2 Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) · [GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt)

**Browser vendors and docs**
- MDN: [getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations), [Animation.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime), [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready), [HTMLImageElement.decode](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode), [linear()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear), [animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline), [Video codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs), [Image types](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) (accessed 5 Nov 2026)
- developer.chrome.com: [linear()](https://developer.chrome.com/docs/css-ui/css-linear-easing-function), [scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations), [view transitions](https://developer.chrome.com/docs/web-platform/view-transitions), [Chrome Headless](https://developer.chrome.com/docs/chromium/headless)
- web.dev: [compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count), [prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
- Chrome DevTools Protocol, tip-of-tree PDL (the [chromedevtools.github.io](https://chromedevtools.github.io/devtools-protocol/) source): [Emulation](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl), [HeadlessExperimental](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/HeadlessExperimental.pdl), [Animation](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Animation.pdl), [Target](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Target.pdl), [Page](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl)
- [Chromium headless-dev: BeginFrame and virtual time (19 Nov 2024)](https://groups.google.com/a/chromium.org/g/headless-dev/c/WgNE0CAlx-8) · [Chromium cubic_bezier.cc](https://chromium.googlesource.com/chromium/src/+/main/ui/gfx/geometry/cubic_bezier.cc)

**Libraries and tools**
- Lottie: [LAC](https://lottie.github.io/), [spec](https://lottie.github.io/lottie-spec/latest/), [composition](https://lottie.github.io/lottie-spec/latest/specs/composition/), [values](https://lottie.github.io/lottie-spec/latest/specs/values/), [v1.0 announcement (17 Sep 2024)](https://www.linuxfoundation.org/press/lottie-animation-community-announces-lottie-v1.0-specification), [lottie-web](https://github.com/airbnb/lottie-web)
- Rive: [web runtime](https://rive.app/docs/runtimes/web/web-js), [parameters](https://rive.app/docs/runtimes/web/rive-parameters), [state machines](https://rive.app/docs/runtimes/web/state-machines), [low-level API](https://rive.app/docs/runtimes/web/low-level-api-usage)
- GSAP: [Timeline](https://gsap.com/docs/v3/GSAP/Timeline/), [seek()](https://gsap.com/docs/v3/GSAP/Timeline/seek()), [ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker), [updateRoot()](https://gsap.com/docs/v3/GSAP/gsap.updateRoot())
- Remotion: [flickering](https://www.remotion.dev/docs/flickering), [CSS animations](https://www.remotion.dev/docs/troubleshooting/css-animations), [spring()](https://www.remotion.dev/docs/spring), [spring-utils.ts](https://github.com/remotion-dev/remotion/blob/main/packages/core/src/spring/spring-utils.ts), [randomness](https://www.remotion.dev/docs/using-randomness), [delayRender](https://www.remotion.dev/docs/delay-render), [transparent videos](https://www.remotion.dev/docs/transparent-videos)
- HyperFrames: [determinism](https://hyperframes.heygen.com/concepts/determinism), [frame adapters](https://hyperframes.heygen.com/concepts/frame-adapters), [GSAP guide](https://hyperframes.heygen.com/guides/gsap-animation), [engine README](https://github.com/heygen-com/hyperframes/blob/main/packages/engine/README.md)
- ffmpeg: [filters](https://ffmpeg.org/ffmpeg-filters.html), [codecs](https://ffmpeg.org/ffmpeg-codecs.html), [formats](https://ffmpeg.org/ffmpeg-formats.html), [ffmpeg manual](https://ffmpeg.org/ffmpeg.html)
