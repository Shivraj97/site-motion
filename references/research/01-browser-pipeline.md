# 01 — How the browser renders and animates a frame

Track 1 of 5 for **site-motion**. Audience: an engineer-designer choosing between SVG, DOM, Canvas 2D and WebGL for assets that play live on websites and also export frame by frame through headless Chrome.

Research date: 5 November 2026. Most developer.chrome.com and web.dev pages cited here show no visible "last updated" date. Where a page shows a date, a spec status or a version, it is noted inline.

---

## 1. The mental model in one paragraph

A frame comes out of a chain of stages. Each stage turns one data structure into the next: DOM to computed style, to layout fragments, to property trees and display lists, to GPU texture tiles, to a compositor frame, and finally to pixels. Chromium, Firefox and Safari all run most of this chain off the main JavaScript thread. An animation is smooth when each frame re-runs only the cheapest tail of the chain, and that tail runs on a thread your JavaScript cannot block. Everything below adds detail to that idea.

## 2. Chromium RenderingNG: the twelve pipeline stages

Chromium's own architecture page lists these stages ([RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture), Chris Harrelson, no date shown):

| # | Stage | What it does | Where it runs |
|---|---|---|---|
| 1 | **Animate** | Changes computed styles and mutates property trees over time | Main thread *or* compositor |
| 2 | **Style** | Applies CSS to the DOM and produces computed styles | Main thread |
| 3 | **Layout** | Computes size and position and builds the immutable fragment tree | Main thread |
| 4 | **Pre-paint** | Computes property trees and invalidates display lists and tiles as needed | Main thread |
| 5 | **Scroll** | Updates scroll offsets by mutating property trees | Main thread *or* compositor |
| 6 | **Paint** | Computes a display list describing how to raster the DOM | Main thread |
| 7 | **Commit** | Copies property trees and the display list to the compositor thread | Main thread to compositor |
| 8 | **Layerize** | Breaks the display list into a composited layer list that can be rastered and animated independently | Compositor |
| 9 | **Raster, decode, paint worklets** | Turns display lists, encoded images and worklet code into GPU texture tiles | Raster in Viz; decode and worklets on compositor helper threads |
| 10 | **Activate** | Builds a compositor frame that says how to draw and position tiles, plus visual effects | Compositor |
| 11 | **Aggregate** | Combines compositor frames from all visible sources (tabs, iframes, browser UI) into one global frame | Viz display compositor thread |
| 12 | **Draw** | Executes the aggregated frame on the GPU to produce pixels | Viz GPU main thread |

The same page says "Animate and scroll can occur in both the main thread and the compositor", and that stages "can be skipped if they aren't needed". A visual-effect animation can skip layout, pre-paint and paint and run entirely on the compositor ([RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)). That skip is the whole performance story for animation.

### Processes and threads

Per [RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture):

- **Renderer process main thread.** Runs scripts, the rendering event loop, the document lifecycle (style, layout, paint), hit testing, event dispatch and HTML parsing. It is shared with all your JavaScript, which is why long tasks cause jank.
- **Renderer compositor thread.** Processes input, scrolls, runs animations, computes layerization, and coordinates decodes, paint worklets and raster. The page calls the main/compositor split "critically important for performance isolation".
- **Viz process.** There is one for all of Chromium. Its *GPU main thread* rasters display lists and video frames into tiles and draws compositor frames. Its *display compositor thread* aggregates frames from every renderer and the browser process. The display compositor is kept separate so it does not "block on any possible source of slowdown on the GPU main thread".
- **Raster is asynchronous.** "Chromium often doesn't wait for the raster to complete". A sync token gates the later step instead. If GPU raster fails, for example because of driver bugs, worker threads fall back to CPU raster ([RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)).

RenderingNG's stated pillars are "GPU raster and draw everywhere" and "a long-term effort to move all scrolling, non-layout-inducing animations, and image decoding off of the main thread". The milestones include compositor-thread image decodes (2017), percentage transform animations and SVG animations on the compositor (2021), and CompositeAfterPaint, which "disentangles compositing from style, layout and paint" and finished shipping in 2021 ([RenderingNG overview](https://developer.chrome.com/docs/chromium/renderingng)).

## 3. Key data structures: property trees, display lists, tiles, frames

From [Key data structures in RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-data-structures) (no date shown):

- **Property trees.** Every document has four: *transform* (CSS transforms and scrolling), *clip* (overflow clips), *scroll*, and *effect* (opacity, filters, masks and other visual effects). An element's visual state is a pointer into each tree. This is why a transform or opacity animation can be applied by mutating one tree node on the compositor, with no repaint.
- **Display lists and paint chunks.** Paint produces display items, which are low-level drawing commands "ordered back-to-front". These are grouped into **paint chunks** of items that "share the same property tree state". Paint chunks are the input to layerize.
- **Layerization trade-off.** "The layerize step has to make tradeoffs between GPU memory and reducing the costs when things change." By default, chunks are merged, *except* chunks whose property-tree state is expected to change on the compositor (that is, things being animated).
- **Tiles.** Content is split into tiles, and "a separate GPU texture tile backs each tile with the rasterized pixels". Only the tiles that change need re-rastering.
- **Compositor frames, render passes, quads and surfaces.** A compositor frame is a list of render passes. Each render pass is a list of quads, and each quad references a texture. A frame is submitted with a **surface ID**, and Viz aggregation "replaces surface draw quads by the compositor frames they specify". This is how cross-origin iframes, video and canvas are stitched in without re-rastering.

The older explainer [Inside look at modern web browser, part 3](https://developer.chrome.com/blog/inside-browser-part3) describes the same flow in simpler terms: the compositor splits layers into tiles, "Raster threads rasterize each tile and store them in GPU memory", and "the benefit of compositing is that it is done without involving the main thread." It also warns that "compositing across an excess number of layers could result in slower operation."

## 4. What stays on the compositor and what forces layout or paint

### The three paths

[Rendering performance](https://web.dev/articles/rendering-performance) (Paul Lewis, no date shown) describes three paths through the pixel pipeline:

1. **Layout path.** JS/CSS > Style > Layout > Paint > Composite. Triggered by geometry properties: `width`, `height`, `left`, `top`.
2. **Paint path.** JS/CSS > Style > Paint > Composite. Triggered by `color`, `background-image`, `box-shadow`.
3. **Composite-only path.** JS/CSS > Style > Composite. The cheapest path, and the one you want for animation.

MDN states the same classification ([Animation performance and frame rate](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate), last modified 7 Nov 2025). Geometry properties (`left`, `max-width`, `border-width`, `margin-left`, `font-size`) trigger style, layout and repaint. `color` triggers style and repaint. Properties "rendered in their own layer" such as `transform` and `opacity` "don't even trigger a repaint".

### Which properties are composited

- **Transform and opacity** are the canonical pair. "Restrict animations to `opacity` and `transform`" ([Animations guide](https://web.dev/articles/animations-guide), Basques and Andrew). In the guide's DevTools test, a `top`/`left` animation dropped about 50% of frames.
- **Filter** is also hardware-accelerated by default in Chromium: "the current CSS properties that are hardware-accelerated by default only include `opacity`, `filter`, and `transform`" ([Hardware-accelerated animation capabilities](https://developer.chrome.com/blog/hardware-accelerated-animations), no date shown). The same post says `background-color` and `clip-path` "will soon join the list". I could not find a primary source confirming that they have shipped in stable, so verify them in DevTools before relying on them.
- **SVG.** "As of Chromium 89, Chrome will join the likes of Firefox to enable hardware-acceleration by default on SVG animations", with no author action needed. Percentage-based transforms (Chromium 89) are composited "as long as the layout size is not changing every frame" ([Hardware-accelerated animations](https://developer.chrome.com/blog/hardware-accelerated-animations)).
- **Canvas.** The same post lists OffscreenCanvas and WebGL as the other routes to accelerated drawing.

### Which animations can run off the main thread

There are two conditions. The property must be compositor-animatable, **and** the animation must be declarative (CSS animations, CSS transitions or the Web Animations API). Declarative animations of composite properties let "an animation to be driven entirely by the compositor thread even when the main thread is busy" ([Towards an animation smoothness metric](https://web.dev/articles/smoothness)). A `requestAnimationFrame` loop that writes `el.style.transform` still skips layout and paint. But it runs *on the main thread*, so a long task stalls it. This distinction matters a lot for site-motion's live playback.

### Forced synchronous layout

When JavaScript reads geometry after writing styles, the browser has to run layout early. Doing that repeatedly is layout thrashing. The fix is to "read style values then make style changes" ([Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing), last updated 7 May 2025).

### Layer promotion with `will-change`

- **Spec.** If a property would create a stacking context, naming it in `will-change` "must create a stacking context on the element". The same applies to containing blocks for absolutely positioned descendants. The spec's own guidance includes the headings "Don't Spam will-change Across Too Many Properties or Elements" and "Use will-change Sparingly In Stylesheets". Remove the hint afterwards so "the browser can recover whatever resources the optimizations are claiming" ([CSS Will Change Module Level 1](https://www.w3.org/TR/css-will-change-1/), W3C Candidate Recommendation Draft, 5 May 2022).
- **MDN** (last modified 7 Oct 2026): use it "as a last resort to try to deal with existing performance problems". Overuse "will result in excessive memory use". Applying it to a large subtree such as `<body>` "can actually be bad for a page's performance". Toggle it from script before and after the change ([MDN will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)).
- **Memory cost.** "Every layer you create requires memory and management, and that's not free". Layer textures must also be uploaded to the GPU. "Do not promote elements unnecessarily" ([Stick to compositor-only properties and manage layer count](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count), Paul Lewis). As a rough estimate (my arithmetic, not from a source), a full-viewport layer at 1920×1080 CSS px and DPR 2 costs about 3840 × 2160 × 4 B ≈ 33 MB of GPU memory.
- **Legacy hack.** `transform: translateZ(0)` is the fallback for browsers without `will-change` ([Animations guide](https://web.dev/articles/animations-guide)).

## 5. The frame budget, the event loop, rAF and vsync

### The HTML event loop's "update the rendering"

In the [HTML Living Standard](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model) (last updated 4 Nov 2026), rendering is one task the event loop runs at each **rendering opportunity**. A navigable has one when the UA can present its contents, "accounting for hardware refresh rate constraints and user agent throttling for performance reasons". The spec gives examples: at 60 Hz there is at most one opportunity per ~16.7 ms. A page that cannot keep up may drop to 30/s, and a hidden page may drop to about 4/s or fewer.

The order inside one rendering update, abridged from the spec:

1. Set *last render opportunity time*.
2. Run resize steps.
3. Run scroll steps.
4. Evaluate media queries.
5. **Update animations and send events** (CSS and Web Animations events).
6. Run fullscreen steps.
7. Handle lost or restored canvas contexts.
8. **Run animation frame callbacks** (rAF).
9. Recalculate style and layout, looping over **ResizeObserver** until settled.
10. Fix up focus and run view transitions.
11. Run **IntersectionObserver** updates.
12. Mark paint timing.
13. **Update the rendering** (paint).

Three things follow for authors:

- rAF runs *after* animations are updated and *before* style and layout. A style write inside rAF is picked up by the same frame's style and layout pass, so there is no extra layout.
- ResizeObserver runs after layout and before paint. This is the right hook for resizing a canvas backing store without a one-frame-late flash (see §6).
- The rAF timestamp is the event loop's *last render opportunity time*, not the moment your callback starts ([HTML spec, event loop](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)). MDN puts it this way: it is "the end time of the previous frame's rendering", and every callback in one frame "receives the same timestamp" ([MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), last modified 21 Aug 2026).

### Budget and refresh rate

- At 60 Hz the browser has 16.66 ms per frame. Because of browser overhead, "all of your work needs to be completed inside 10 milliseconds" ([Rendering performance](https://web.dev/articles/rendering-performance)). At 120 Hz the frame interval halves to about 8.3 ms, which leaves roughly 5 ms of script time by the same ratio. That figure is my inference, not a published number.
- rAF "will generally match the display refresh rate… 60hz… though 75hz, 120hz, and 144hz are also widely used". Always derive progress from the timestamp, "otherwise, the animation will run faster on high refresh-rate screens". rAF is paused in background tabs and hidden iframes ([MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).

### When a frame is missed

When an update misses the deadline, the browser "drops a frame". The screen "just repeats itself". Chromium also produces **partially presented frames**: the main thread misses its deadline, but the compositor still ships an update, for example a threaded scroll or a compositor animation ([Towards an animation smoothness metric](https://web.dev/articles/smoothness)). This is why a CSS transform animation keeps moving during a long task while a rAF-driven one freezes. Once the main thread frees up, rAF fires once per rendering opportunity. It does not catch up on missed calls, which is another reason to compute state from elapsed time instead of incrementing per frame.

## 6. Canvas: devicePixelRatio and backing-store size

- `devicePixelRatio` is "the ratio of the resolution in physical pixels to the resolution in CSS pixels". MDN's canonical fix for a blurry canvas sets `canvas.width = Math.floor(cssSize * dpr)`, keeps `canvas.style.width = cssSize + 'px'`, and calls `ctx.scale(dpr, dpr)`. DPR can change at runtime (zoom, or dragging the window to another monitor). Listen with `matchMedia('(resolution: Xdppx)')` and re-create the query after each change ([MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio), last modified 21 Aug 2026).
- **Use `devicePixelContentBox` for pixel-exact canvases.** `cssSize × dpr` can be fractional, and browsers snap fractions differently ("one browser might render the element at `792px`… another… at `791px`"). That mismatch causes blur or moiré. `ResizeObserver` with `{box: 'device-pixel-content-box'}` reports the exact physical size. Its callback runs after layout and before paint. The article text says Chrome 84+. Its support badges show Firefox 108 as supported and Safari as not supported, so feature-detect `'devicePixelContentBoxSize' in entry` ([web.dev device-pixel-content-box](https://web.dev/articles/device-pixel-content-box)).
- **Memory and fill cost scale with DPR².** A 2D canvas with the default `colorType: "unorm8"` stores 4 bytes per pixel. `"float16"` doubles that. Other context options: `alpha: false` tells the browser "the backdrop is always opaque", which speeds up compositing. `willReadFrequently: true` "will force the use of a software (instead of hardware accelerated) 2D canvas", so use it only when you call `getImageData` every frame. `desynchronized` lowers latency by decoupling canvas paint from the event loop. WebGL's `preserveDrawingBuffer: true` keeps the buffer between frames, which some frame-capture approaches need ([MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext), last modified 2 Jul 2025).
- **OffscreenCanvas moves drawing off the main thread.** `transferControlToOffscreen()` hands the canvas to a worker. There, `requestAnimationFrame` drives frames and "the busy main thread does not influence the animation running on a worker" (Chrome 69+) ([web.dev OffscreenCanvas](https://web.dev/articles/offscreen-canvas)).

## 7. Colour management

- **Default is sRGB.** "Colors specified in HTML, and untagged images must be treated as being in the sRGB color space." CSS Color 4 adds predefined spaces: `srgb`, `srgb-linear`, `display-p3`, `display-p3-linear`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d50`, `xyz-d65`. It also adds the `oklab()` and `oklch()` notations ([CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/), W3C Candidate Recommendation Draft, 3 Nov 2026).
- **Interpolation is not neutral, and transitions and gradients depend on it.** According to the CSS Color 4 changelog, syntax that declares no default interpolation space "now uses Oklab by default". However, "interpolation between legacy sRGB colors is (once again) in sRGB space, for compatibility". Gamut mapping is defined as "chroma reduction in OkLCh", with EdgeSeeker and Ray Trace methods added in 2025 ([CSS Color 4 changes section](https://www.w3.org/TR/css-color-4/)). In practice, `#f00 → #00f` and `oklch(...) → oklch(...)` animate through different midpoints, so pick the space on purpose, for example `in oklch` on gradients.
- **Canvas colour space.** `getContext('2d', {colorSpace: 'display-p3'})` selects a P3 backing store. The default is `"srgb"` ([MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)). Per WebKit, Safari supports it on macOS 12.1+ and iOS 15.1+. Out-of-gamut drawing "will be clamped so that it is in gamut". `getImageData` returns values in the canvas's space unless you pass `colorSpace`. On a P3 canvas, `toDataURL`/`toBlob` "embed an appropriate color profile in the generated PNG or JPEG" ([WebKit: Wide Gamut 2D Graphics using HTML Canvas](https://webkit.org/blog/12058/wide-gamut-2d-graphics-using-html-canvas/), 14 Dec 2021). Chrome added the option in Chrome 94 ([New in Chrome 94](https://developer.chrome.com/blog/new-in-chrome-94)).
- **Implication for video export.** Frames captured from a P3 canvas or P3 CSS carry wide-gamut values. Most web video pipelines expect sRGB/Rec.709, so convert explicitly at encode time, or the export will look different from the live page. That last point is a design inference for track 5 to confirm.

## 8. Firefox (WebRender) and Safari (WebKit): differences that matter

### Firefox / WebRender

- WebRender "fundamentally changes the way we render, removing the distinction between paint and composite". It works like a game engine: it repaints the whole screen each frame from a display list turned into batched GPU draw calls. It avoids guessing at layers, because layers "take up a lot of memory and can actually make things slower" ([Mozilla Hacks: The whole web at maximum FPS](https://hacks.mozilla.org/2017/10/the-whole-web-at-maximum-fps-how-webrender-gets-rid-of-jank/), Lin Clark, 10 Oct 2017). The aim is to remove the "performance cliffs" seen when animating paint properties such as `background-color`.
- "As of Firefox 92, WebRender has shipped to our entire release population". macOS got it earlier, in Firefox 83/84 ([Mozilla Wiki: WebRender Where](https://wiki.mozilla.org/Platform/GFX/WebRender_Where), an older wiki page). Firefox 92 was released 7 Sep 2021 ([Firefox 92 release notes](https://www.firefox.com/en-US/firefox/92.0/releasenotes/)).
- Gecko still separates main-thread and compositor-thread **animation sampling** (OMTA). Properties that do not trigger reflow or repaint, most commonly `transform`, can be sampled off the main thread ([MDN CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance), last modified 7 Nov 2025). **Practical upshot:** paint-property animations are cheaper in Firefox than in Chromium, but the transform/opacity-with-declarative-animation rule is still the portable fast path.

### Safari / WebKit

- **The 120 Hz split.** On ProMotion devices, "accelerated animations already run at 120Hz thanks to Core Animation's built-in support for the ProMotion technology", while "the rest of the Web page only updates at 60Hz". That includes "script-driven animations using `requestAnimationFrame()`" and all non-accelerated CSS and Web Animations. WebKit cites power use and pages that misbehaved at non-60 Hz rAF as the reasons. It proposes a per-animation `frameRate` API and `animation-frame-rate` CSS ([WebKit explainer: animation-frame-rate](https://github.com/WebKit/explainers/blob/main/animation-frame-rate/README.md)). Users can toggle this with the Safari feature flag "Prefer Page Rendering Updates near 60fps" ([WebKit bug 173434 discussion](https://lists.webkit.org/pipermail/webkit-unassigned/2024-May/1165397.html)). On iPhone and iPad, a canvas or WebGL rAF loop therefore runs at 60 fps by default even on a 120 Hz screen, while a CSS transform animation can run at 120 fps.
- **Threading is catching up.** Safari Technology Preview 234 added threaded scroll-driven animations for opacity, transform, translate, scale, rotate, filter, backdrop-filter and Motion Path properties ([STP 234 notes](https://webkit.org/blog/17674/release-notes-for-safari-technology-preview-234/)). STP 238 (26 Feb 2026) "enabled threaded time-based animation resolution… running animations off the main thread" and "allows CSS Motion Path animations to be accelerated" ([STP 238 notes](https://webkit.org/blog/17848/release-notes-for-safari-technology-preview-238/)). These are Technology Preview builds, so check stable Safari before relying on them.
- **Canvas.** Safari supports P3 canvas, and so does Chrome 94+ (§7). Safari does not support `devicePixelContentBox`, according to the web.dev support badges (§6).

## 9. Renderer choice through the pipeline lens

| Renderer | What changes per frame | Off-main-thread? | Notes for site-motion |
|---|---|---|---|
| **DOM/CSS, transform/opacity/filter, declarative** | Property-tree node only | Yes in all three engines | Best live performance. 120 Hz on ProMotion. Watch layer count. |
| **DOM/CSS, paint or layout properties** | Re-paint or re-layout and re-raster | No | Cheaper in WebRender, expensive in Chromium |
| **SVG with CSS transform/opacity** | Composited since Chromium 89 | Yes | Animating path `d`, attributes or SMIL means repaint |
| **Canvas 2D on main thread** | Whole bitmap redrawn, then uploaded as one texture | No (rAF) | Cost ∝ CSS area × DPR². 60 Hz cap on iOS Safari. |
| **Canvas 2D / WebGL in OffscreenCanvas worker** | Bitmap from worker | Yes (worker) | Immune to main-thread jank |
| **WebGL** | GPU draw calls | Main thread unless OffscreenCanvas | Fill rate ∝ DPR². Set `alpha`, `antialias` and `powerPreference` deliberately. |

---

## Practical rules for site-motion

1. **Animate transform, opacity and filter only, and do it declaratively** (CSS or WAAPI) when the asset is DOM or SVG. Only declarative composite animations survive main-thread jank and reach 120 Hz in Safari ([smoothness](https://web.dev/articles/smoothness), [WebKit explainer](https://github.com/WebKit/explainers/blob/main/animation-frame-rate/README.md)).
2. **Never animate `top/left/width/height/margin/font-size`.** Use FLIP or transforms instead ([Rendering performance](https://web.dev/articles/rendering-performance)).
3. **Treat `will-change` as a scalpel.** Apply it just before an animation, remove it after, and never on large subtrees. Budget layers in MB: width × height × DPR² × 4 bytes ([MDN will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)).
4. **Make time a pure input.** Compute every frame as `render(t)` from the rAF timestamp, or from an injected clock in export mode. Never use per-frame increments, so playback is correct at 60/120/144 Hz, after dropped frames, and under headless frame stepping ([MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
5. **Batch DOM reads before writes inside rAF** to avoid forced synchronous layout ([layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)).
6. **Size canvases from `devicePixelContentBox`**, fall back to `round(css × dpr)`, and re-size inside ResizeObserver. Cap DPR (for example at 2) for large full-bleed canvases, because cost grows with DPR² ([device-pixel-content-box](https://web.dev/articles/device-pixel-content-box)).
7. **Set context options deliberately:** `alpha:false` for opaque canvases, `willReadFrequently` only for per-frame readback, and `preserveDrawingBuffer` only if capture needs it ([MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)).
8. **Move heavy Canvas and WebGL to OffscreenCanvas in a worker** when the host page is unknown, which site-motion assets always are ([OffscreenCanvas](https://web.dev/articles/offscreen-canvas)).
9. **Pick colour spaces on purpose.** Author in sRGB unless the brand needs P3. Specify the interpolation space on gradients and transitions. Convert to the video's colour space at export ([CSS Color 4](https://www.w3.org/TR/css-color-4/), [WebKit wide-gamut canvas](https://webkit.org/blog/12058/wide-gamut-2d-graphics-using-html-canvas/)).
10. **Test in three engines and on a 120 Hz iPhone.** Chromium-only testing hides Safari's 60 Hz rAF cap and Firefox's different paint economics. Check with DevTools paint flashing and the layers panel before shipping.

---

## Sources

- Chrome for Developers — [RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture) (no date shown)
- Chrome for Developers — [Overview of the RenderingNG architecture / RenderingNG](https://developer.chrome.com/docs/chromium/renderingng) (no date shown; milestones to 2021)
- Chrome for Developers — [Key data structures in RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-data-structures) (no date shown)
- Chrome for Developers — [Inside look at modern web browser (part 3)](https://developer.chrome.com/blog/inside-browser-part3) (2018 series)
- Chrome for Developers — [Hardware-accelerated animation capabilities](https://developer.chrome.com/blog/hardware-accelerated-animations) (Chromium 89 era)
- Chrome for Developers — [New in Chrome 94](https://developer.chrome.com/blog/new-in-chrome-94)
- web.dev — [Rendering performance](https://web.dev/articles/rendering-performance)
- web.dev — [How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- web.dev — [Stick to compositor-only properties and manage layer count](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)
- web.dev — [Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) (last updated 7 May 2025)
- web.dev — [Towards an animation smoothness metric](https://web.dev/articles/smoothness)
- web.dev — [Pixel-perfect rendering with devicePixelContentBox](https://web.dev/articles/device-pixel-content-box)
- web.dev — [OffscreenCanvas](https://web.dev/articles/offscreen-canvas)
- WHATWG — [HTML Living Standard: event loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model) (last updated 4 Nov 2026)
- W3C — [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) (CRD, 3 Nov 2026)
- W3C — [CSS Will Change Module Level 1](https://www.w3.org/TR/css-will-change-1/) (CRD, 5 May 2022)
- MDN — [Window.requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) (modified 21 Aug 2026)
- MDN — [Window.devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) (modified 21 Aug 2026)
- MDN — [will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) (modified 7 Oct 2026)
- MDN — [HTMLCanvasElement.getContext()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext) (modified 2 Jul 2025)
- MDN — [Animation performance and frame rate](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate) (modified 7 Nov 2025)
- MDN — [CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance) (modified 7 Nov 2025)
- Mozilla Hacks — [The whole web at maximum FPS: How WebRender gets rid of jank](https://hacks.mozilla.org/2017/10/the-whole-web-at-maximum-fps-how-webrender-gets-rid-of-jank/) (10 Oct 2017)
- Mozilla Wiki — [Platform/GFX/WebRender Where](https://wiki.mozilla.org/Platform/GFX/WebRender_Where) (older page)
- Mozilla — [Firefox 92 release notes](https://www.firefox.com/en-US/firefox/92.0/releasenotes/) (7 Sep 2021)
- WebKit — [Wide Gamut 2D Graphics using HTML Canvas](https://webkit.org/blog/12058/wide-gamut-2d-graphics-using-html-canvas/) (14 Dec 2021)
- WebKit — [Explainer: animation-frame-rate](https://github.com/WebKit/explainers/blob/main/animation-frame-rate/README.md)
- WebKit — [Release Notes for Safari Technology Preview 234](https://webkit.org/blog/17674/release-notes-for-safari-technology-preview-234/)
- WebKit — [Release Notes for Safari Technology Preview 238](https://webkit.org/blog/17848/release-notes-for-safari-technology-preview-238/) (26 Feb 2026)
- WebKit Bugzilla mailing list — [Bug 173434: Support for 120Hz requestAnimationFrame](https://lists.webkit.org/pipermail/webkit-unassigned/2024-May/1165397.html) (user reports; used only for the feature-flag name)
