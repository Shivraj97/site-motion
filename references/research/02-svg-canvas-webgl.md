# Track 2: Rendering engineering for SVG, Canvas 2D, WebGL2 and WebGPU

*Research for site-motion. Compiled 5 November 2026. Spec versions used: SVG 2 W3C Candidate Recommendation Snapshot of 06 Oct 2026; WHATWG HTML Living Standard (last updated 4 Nov 2026); Khronos WebGL 1.0 / 2.0 Editor's Drafts of 30 Jun 2026; W3C WebGPU Candidate Recommendation Draft of 15 Sep 2026; CSS Masking 1 CRD of 5 Aug 2021; Filter Effects 1 WD of 18 Dec 2018.*

Lines marked **(inference)** are engineering conclusions drawn from the cited facts around them. They are not statements made by the sources.

---

## 1. Retained mode vs immediate mode

- **SVG is retained.** The browser keeps the scene as DOM nodes. You change an attribute or a CSS property and the browser works out what to repaint. SVG's `<use>` shows how far this goes: its instances live in a "use-element shadow tree", and "all mutations to the referenced document subtree" must be reflected in it ([SVG 2 §5.6, Struct](https://www.w3.org/TR/SVG2/struct.html)).
- **Canvas 2D is immediate.** Canvas is "an immediate mode drawing paradigm", so "the scene needs to be redrawn explicitly at each frame" ([web.dev, Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance)). Only the resulting pixels are kept, not the objects that made them. WebGL and WebGPU are immediate in the same way: you submit draw commands every frame ([webgl2fundamentals, How it works](https://webgl2fundamentals.org/webgl/lessons/webgl-how-it-works.html); [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)).

What this means in practice:

| Concern | Retained (SVG) | Immediate (Canvas / WebGL / WebGPU) |
|---|---|---|
| Hit-testing | Free. Every shape is an element that receives DOM events. | You write it yourself, with your own geometry math or a colour-picking buffer. **(inference)** |
| Accessibility | `<title>` is "the SVG accessible name element" ([MDN `<title>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title)). Text stays real text. | The spec says authors "should not use the canvas element in a document when a more suitable element is available". It also says to map interactive regions one-to-one to focusable fallback content ([WHATWG canvas](https://html.spec.whatwg.org/multipage/canvas.html)). |
| Memory | Grows with node count. Lighthouse links large DOMs to memory pressure and slower style and position recalculation ([Chrome Lighthouse, DOM size](https://developer.chrome.com/docs/lighthouse/performance/dom-size)). | Grows with pixel count: one backing bitmap, plus textures and buffers. Roughly constant whatever the object count. **(inference)** |
| Redraw cost | The browser repaints only what changed, but each change goes through style, layout and paint. Only `transform` and `opacity` can be handled by the compositor alone ([web.dev, compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). | You pay for a full redraw (or a dirty-rect redraw) every frame. Per-object cost is very low, especially on the GPU. |

---

## 2. SVG

### 2.1 How browsers render it

- Every SVG shape is a DOM element, so it is counted in style and layout work. Lighthouse warns above about 800 body nodes and errors above about 1,400. It gives repeated "position and styling" recalculation and memory as the reasons ([Lighthouse DOM size](https://developer.chrome.com/docs/lighthouse/performance/dom-size)). The page does not say whether SVG nodes are treated differently, so take these numbers as a general DOM budget, not an SVG limit.
- Animating anything other than `transform` or `opacity` triggers paint, and possibly layout ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). In Chromium 89 and later, SVG animations are hardware-accelerated by default, "join[ing] the likes of Firefox". Chrome's own spinner demo stopped repainting every frame ([Chrome, hardware-accelerated animations](https://developer.chrome.com/blog/hardware-accelerated-animations)). The post does not list which SVG properties qualify. Assume only transform and opacity do. **(inference)**
- **Stroke vs fill.** SVG 2 builds a separate "stroke shape" from the path geometry, using width, joins, caps and dash pattern. Markers are painted as a third operation, in `paint-order` order (fill, stroke, markers) ([SVG 2 Painting §13](https://www.w3.org/TR/SVG2/painting.html)). A stroked, dashed and marked path therefore costs more geometry work than a plain fill. **(inference: no primary source puts a number on the difference.)**
- **`shape-rendering`** is a hint: `auto`, `optimizeSpeed` (anti-aliasing may be turned off), `crispEdges` (may snap to device pixels and turn off AA), or `geometricPrecision` ([SVG 2 §13.10.1](https://www.w3.org/TR/SVG2/painting.html)). Use `crispEdges` for axis-aligned UI lines. Use `geometricPrecision` (or `auto`) for organic curves.
- **`vector-effect: non-scaling-stroke`** keeps outline width constant under transforms. The spec's example is a 2px map road that stays 2px when you zoom ([SVG 2 Coords](https://www.w3.org/TR/SVG2/coords.html)). This matters for scale-in reveals, where strokes would otherwise grow with the shape.

### 2.2 Filters, masks, clips, `<use>`

- **Filters rasterise.** Filter input is "rasterized into an initially clear RGBA raster", and filters "operate on premultiplied RGBA samples". The default filter region is the bounding box plus 10% padding on each side (x/y −10%, width/height 120%) ([Filter Effects 1](https://www.w3.org/TR/filter-effects-1/)). User agents "may reduce the resolution of filter primitives on limited platform resources" (same source). In headless capture, that can lower the quality of exported frames. **(inference)**
- **Why blur is slow.** Convolution filters are expensive "as for every output pixel a number of input pixels have to be considered". Cost grows with image size and blur radius, and animating blur "is not really an option as it is very slow". Chrome's recommended workaround is to pre-blur a few copies and cross-fade their opacity ([Chrome, Animating a blur](https://developer.chrome.com/blog/animated-blur)). MDN says blurring is "computation heavy" and should be used sparingly, especially on scrolled or animated elements ([MDN, Applying SVG effects to HTML](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/Applying_SVG_effects_to_HTML_content)). web.dev adds that blurring filters "tend to be slower than the others" ([web.dev, CSS filter effects](https://web.dev/articles/understanding-css)).
- **Clip vs mask.** A clip is defined by "a closed vector path, shape or polygon". A mask paints through per-point luminance or alpha, "completely or partially" hiding content ([CSS Masking 1](https://www.w3.org/TR/css-masking-1/)). A `clipPath` may contain only paths, text, basic shapes, or a `use` that points at those (same source). Prefer clip-path to mask when a hard edge is acceptable. **(inference: clips are geometric, masks are per-pixel image operations.)** Animating `clip-path` was not composited at the time of [Chrome's post](https://developer.chrome.com/blog/hardware-accelerated-animations), which said it would "soon join the list". Re-check this before you rely on it.
- **`<use>` and `<symbol>`.** `<use>` clones the referenced subtree into a shadow tree that stays live. `<symbol>` "must never be rendered directly" ([SVG 2 Struct](https://www.w3.org/TR/SVG2/struct.html)). This saves file size and authoring effort. Each instance is still rendered, and edits to the source spread to every clone (same source).

### 2.3 Animating SVG: SMIL vs CSS vs Web Animations API

- **SMIL** (`<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`) ([MDN SMIL guide](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_animation_with_SMIL)) is supported in every current engine, about 97% global usage ([caniuse svg-smil](https://caniuse.com/svg-smil)). It is the only option that works inside an SVG loaded with `<img>`, where scripts don't run. **(inference)** For export, `SVGSVGElement.setCurrentTime()` "adjusts the clock for this SVG document fragment", so you can seek to an exact frame. It is Baseline since 2015 ([MDN setCurrentTime](https://developer.mozilla.org/en-US/docs/Web/API/SVGSVGElement/setCurrentTime)).
- **CSS animations and transitions** can drive SVG presentation properties. SVG 2 turns geometry into CSS properties: `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height` ([SVG 2 Geometry Properties ch. 7](https://www.w3.org/TR/SVG2/geometry.html)). Watch for a trap: on nested `svg`, `use` and `symbol`, width and height are XML attributes only, and "CSS properties with the same names are ignored" (same source). `cx` as a CSS property is Baseline Widely available since July 2020 and animates by computed value ([MDN `cx`](https://developer.mozilla.org/en-US/docs/Web/CSS/cx)). `d` is a property in SVG 2 ([SVG 2 Paths](https://www.w3.org/TR/SVG2/paths.html)), but two values interpolate only "when the path data strings have the same structure". MDN marks CSS `d` as "Limited availability… not Baseline" ([MDN `d`](https://developer.mozilla.org/en-US/docs/Web/CSS/d)). Use SMIL or JavaScript for path morphing.
- **Web Animations API (WAAPI)** "was designed to underlie implementations of both CSS Animations and CSS Transitions". It exposes `pause()`, `playbackRate`, `currentTime` seeking, `document.getAnimations()` and a `finished` promise ([MDN, Using WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API)). For frame-accurate export, pause every animation from `document.getAnimations()` and set `currentTime` for each frame. **(inference)**

### 2.4 Practical limits

No primary source gives an SVG node ceiling. The closest authoritative budget is Lighthouse's ~800 / ~1,400 DOM-node thresholds ([Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/dom-size)). Treat "a few hundred animated shapes" as SVG's comfortable range. Above roughly a thousand moving parts, move to Canvas or WebGL. **(inference: benchmark on target hardware.)**

---

## 3. Canvas 2D

### 3.1 Model, Path2D, transforms, compositing

- Every frame you clear and redraw. To keep that cheap: batch into one path; avoid state changes, because "changing the state machine is expensive"; redraw only the differences; layer static and dynamic content on separate canvases; avoid `shadowBlur`; and round coordinates to skip sub-pixel AA work ([web.dev canvas performance](https://web.dev/articles/canvas-performance); [MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)). MDN also says "Avoid text rendering whenever possible" and to pre-render repeated primitives to an offscreen canvas ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)).
- **Path2D** lets you "retain and replay your path whenever desired". It is Baseline since August 2016 and works in workers ([MDN Path2D](https://developer.mozilla.org/en-US/docs/Web/API/Path2D)). Build static geometry (logos, icons) once as a Path2D and redraw it under different transforms. **(inference)**
- **Compositing.** `globalCompositeOperation` supports the Porter-Duff operators (`source-in`, `destination-out` and others), additive `lighter`, and the separable and non-separable blend modes (`multiply`, `screen`, …, `luminosity`) ([MDN globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)). That covers glows (`lighter`), cut-outs (`destination-out`) and duotones (`multiply`/`screen`) without a filter.
- Chrome's Canvas2D update added `roundRect`, conic gradients, `letterSpacing`/`wordSpacing`, `reset()`, a JavaScript `CanvasFilter`, and `contextlost`/`contextrestored` events for when GPU memory runs out ([Chrome, "It's always been you, Canvas2D"](https://developer.chrome.com/blog/canvas2d)).

### 3.2 Readback, workers, bitmaps

- **`getImageData` is the slow path.** The spec names readback via `getImageData()` as the "major exception" to GPU-backed performance ([WHATWG canvas](https://html.spec.whatwg.org/multipage/canvas.html)). Chrome calls it potentially "very slow" ([Chrome Canvas2D](https://developer.chrome.com/blog/canvas2d)). `willReadFrequently: true` "will force the use of a software (instead of hardware accelerated) 2D canvas and can save memory when calling `getImageData()` frequently" ([MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)). The spec puts it as the UA "may optimize the canvas for readback operations" ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)). Set it only on canvases you read every frame, such as pixel-sorting effects. Everything else gets slower to draw.
- **Other context options.** `alpha: false` tells the browser the backdrop is opaque, which "can speed up drawing" ([MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)). `desynchronized` lowers latency but may cause tearing ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)).
- **OffscreenCanvas** "decouples the DOM and the Canvas API". With `transferControlToOffscreen()` it can render from a Web Worker and keep animating while the main thread is busy. Support: Chrome 69, Edge 79, Firefox 105, Safari 16.4 ([web.dev OffscreenCanvas](https://web.dev/articles/offscreen-canvas)). Once control is transferred, the placeholder canvas cannot be resized or given its own context ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)).
- **ImageBitmap** "can be drawn to a `<canvas>` without undue latency", is transferable, and should be released with `close()` ([MDN ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap)). `createImageBitmap()` returns a promise and can crop and resize (`resizeWidth`/`resizeQuality`) as it creates the bitmap. It is Baseline since 2021 ([MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)). Decode sprites to ImageBitmaps up front and never scale inside `drawImage`, as [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) advises.

### 3.3 Sizing, text, GPU acceleration

- **devicePixelRatio.** Without correction, a canvas "can appear too blurry on retina screens". Set `canvas.width = floor(cssWidth × dpr)` and call `ctx.scale(dpr, dpr)`. Watch `matchMedia('(resolution: …dppx)')`, because the ratio changes when the window moves to another screen or the page is zoomed ([MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)). For exact device-pixel sizes, MDN recommends `ResizeObserver` with `device-pixel-content-box` ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).
- **Text.** `ctx.font` uses CSS `font` syntax and defaults to `10px sans-serif`. `measureText()` returns `TextMetrics` ([MDN Drawing text](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_text)). Canvas text is pixels, so it is not selectable or accessible and blurs if the DPR is wrong. **(inference)** Before the first draw, `await document.fonts.ready`. It resolves "once the document has completed loading fonts" ([MDN FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready)). Otherwise the first frames render in a fallback font, which is especially visible in exports. **(inference)**
- **When it's GPU-accelerated.** The spec frames GPU backing as the normal fast path, with readback as the exception ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)). `willReadFrequently` switches a canvas to software ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)). No primary source documents the per-browser rules for when acceleration is turned off. Check `chrome://gpu`, which Chrome calls "the best way to check whether hardware acceleration is turned on" ([Chrome, headless GPU testing](https://developer.chrome.com/blog/supercharge-web-ai-testing)).

---

## 4. WebGL2

### 4.1 The pipeline

WebGL 2.0 "is derived from OpenGL ES 3.0" ([Khronos WebGL 2.0 ED](https://registry.khronos.org/webgl/specs/latest/2.0/)). The stages:

1. "Buffers are the way of getting vertex and other per vertex data onto the GPU". Attributes are wired to buffers with `vertexAttribPointer`.
2. The vertex shader "gets called once for each vertex" and writes clip-space `gl_Position`.
3. Rasterisation works out which pixels each triangle covers.
4. The fragment shader runs "for each pixel", with varyings interpolated between vertices ([webgl2fundamentals, How it works](https://webgl2fundamentals.org/webgl/lessons/webgl-how-it-works.html)).
5. Blending and framebuffers finish the frame. WebGL 2 adds multiple render targets (`drawBuffers`), multisampled renderbuffers, `blitFramebuffer`, 3D and array textures, UBOs, transform feedback, and GLSL ES 3.00 ([Khronos WebGL 2.0](https://registry.khronos.org/webgl/specs/latest/2.0/)).

### 4.2 Where the cost is

- **Draw calls and state.** "If you have 1000 sprites to paint, try to do it as a single `drawArrays()` or `drawElements()` call". Use texture atlases. Keep VAOs static instead of mutating them, and set framebuffers up ahead of time, because attachment changes invalidate completeness ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).
- **Synchronous stalls.** `getError`, `getParameter`, `checkFramebufferStatus` and compile-status queries stall the calling thread. Avoid them in production loops (same source).
- **Instancing** is core in WebGL 2 (`drawArraysInstanced`, `vertexAttribDivisor`) ([Khronos](https://registry.khronos.org/webgl/specs/latest/2.0/)). It draws "more than one of the same thing faster", and the divisor advances an attribute "once per instance". The tutorial ends with "just 2 calls for all 5 shapes" ([webgl2fundamentals, instanced drawing](https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html)). It is the standard method for particles, confetti and grids of glyphs.
- **Texture uploads.** Allocate with `texStorage` and fill with `texSubImage`, but benchmark image and video uploads, which "can be slower than `texImage`". DOM-element uploads can cause "a pipeline flush", so upload before drawing starts ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Use `invalidateFramebuffer` for depth and MSAA attachments you no longer need (same source).
- **Precision.** `highp` everywhere in fragment shaders breaks "some older mobile hardware". Use the `GL_FRAGMENT_PRECISION_HIGH` guard, and use `highp` for 32-bit ints passed between stages ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).

### 4.3 Traps

- **`preserveDrawingBuffer` and blank screenshots.** With the default `false`, after compositing "the contents of the drawing buffer are cleared to their default values". Setting it to `true` "can have significant performance implications" on some hardware ([Khronos WebGL 1.0 ED, context attributes](https://registry.khronos.org/webgl/specs/latest/1.0/)). WebGL 2 inherits these attributes as an extension of 1.0. This is why `toDataURL()`/`toBlob()` called outside the render callback returns a blank image. The preferred fix is to re-render right before capture, or to capture inside the frame loop just after drawing. `preserveDrawingBuffer: true` is the fallback ([webgl2fundamentals, tips](https://webgl2fundamentals.org/webgl/lessons/webgl-tips.html)).
- **Context loss.** `webglcontextlost` fires when "the drawing buffer… has been lost" ([MDN webglcontextlost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)), for example when the GPU runs out of memory ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Call `event.preventDefault()` in the handler so the context can be restored. On `webglcontextrestored`, recreate every buffer, texture and program. Test with `WEBGL_lose_context.loseContext()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)). *(The preventDefault requirement is long-standing WebGL behaviour. The Khronos wiki that documents it returned HTTP 403 when fetched, so it is not cited here.)*
- **Antialiasing (MSAA).** `antialias: true` is only a request. "If the value is false or the implementation does not support antialiasing, no antialiasing is performed" ([Khronos WebGL 1.0](https://registry.khronos.org/webgl/specs/latest/1.0/)). When you render to framebuffers, the default AA does not apply. Use `renderbufferStorageMultisample` and then `blitFramebuffer` to resolve ([Khronos WebGL 2.0](https://registry.khronos.org/webgl/specs/latest/2.0/)).
- **Premultiplied alpha.** `premultipliedAlpha` defaults to true, so the page compositor assumes premultiplied colours ([Khronos WebGL 1.0](https://registry.khronos.org/webgl/specs/latest/1.0/); [webgl2fundamentals, WebGL and alpha](https://webgl2fundamentals.org/webgl/lessons/webgl-and-alpha.html)). Output where RGB exceeds alpha composites wrongly. Fixes include `alpha: false`, clearing alpha to 1 with `colorMask`, or `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` for premultiplied textures. To spot problems, set the canvas CSS background to bright red (same source). MDN separately warns that `alpha: false` "can be expensive" in WebGL ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Prefer writing alpha = 1 in the shader.
- **Headless and SwiftShader.** Headless Chrome "disables GPU" by default and renders on "SwiftShader Device", which is the CPU ([Chrome, headless GPU testing](https://developer.chrome.com/blog/supercharge-web-ai-testing)). Automatic SwiftShader fallback for WebGL "has been deprecated", and "WebGL context creation will soon fail instead". To opt in, pass `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`. Headless testing stays supported this way but is "not intended for running untrusted content" ([Chromium docs, SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). The deprecation started in Chrome 130 ([blink-dev, Intent to Remove: SwiftShader Fallback](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)).

---

## 5. WebGPU

**What changes**
- WebGPU is "the successor to WebGL", with "first-class support for GPGPU computations". WebGL's synchronous `getError()` is replaced by asynchronous validation and error scopes ([MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)).
- The flow is: request an adapter (the GPU) and a device (a logical device); record commands with a `GPUCommandEncoder`; call `finish()` to get a `GPUCommandBuffer`; send it with `device.queue.submit()`. Render pipelines (vertex and fragment) and compute pipelines (`dispatchWorkgroups`) are pre-built objects, and shaders are written in WGSL. WebGPU requires a secure context and is available in workers (same source).
- Render Bundles record command sets you can reuse, which cuts CPU overhead ([web.dev, WebGPU supported in major browsers, 25 Nov 2025](https://web.dev/blog/webgpu-supported-major-browsers)).
- Spec status: W3C Candidate Recommendation Draft, 15 Sep 2026 ([W3C WebGPU](https://www.w3.org/TR/webgpu/)).

**Support as of Nov 2026** (from the [gpuweb Implementation Status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status), edited 2 Oct 2026)
- **Chromium:** Windows, macOS and ChromeOS from 113. Android 12+ (Qualcomm/ARM/Intel) from 121. Linux Intel Gen12+ from 144 and NVIDIA on Wayland from 147. Other Linux setups are behind a flag.
- **Firefox:** Windows from 141. macOS from 145/147. Linux is Nightly-only, with shipping expected in 2026. Android is behind a flag.
- **Safari:** macOS, iOS and iPadOS 26.
- caniuse gives ~87.8% global support, with Safari 26 on macOS marked "partial" ([caniuse webgpu](https://caniuse.com/webgpu)). MDN still marks it "Limited availability… not Baseline" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)).

**Headless.** In Chrome's own test, headless WebGPU was "Disabled" by default and "Software only" with flags. It only became hardware-accelerated after the GPU drivers were fixed ([Chrome, headless GPU testing](https://developer.chrome.com/blog/supercharge-web-ai-testing)). A WebGPU-only asset is therefore an export risk for site-motion. Always ship a WebGL2 or Canvas fallback. **(inference)**

---

## 6. Decision table

| Asset profile | Renderer | Why |
|---|---|---|
| Logo, icon, line-art reveal, ≤ ~200 shapes, crisp at any size | **SVG** (CSS or WAAPI; SMIL for path morphs) | Resolution-independent, accessible `<title>` ([MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title)). Geometry is CSS-animatable ([SVG 2 ch. 7](https://www.w3.org/TR/SVG2/geometry.html)). Seekable for export via `setCurrentTime` or WAAPI `currentTime`. |
| Interactive diagram or UI with hover and click on each part, crisp text | **SVG** (or HTML plus SVG) | Free hit-testing and real text. Retained DOM. |
| SVG plus blur or glow on moving parts | **SVG for shapes; pre-blurred bitmap layers cross-faded**, or move to Canvas/WebGL | Animated blur "is not really an option" ([Chrome](https://developer.chrome.com/blog/animated-blur)). |
| 200 to ~5,000 simple 2D objects (particles, charts, generative lines) | **Canvas 2D** (OffscreenCanvas in a worker if the main thread is busy) | Immediate-mode cost depends on pixels, not on DOM node count. Batch with Path2D. Composite ops give cheap glows ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)). |
| Pixel effects that read back (dithering, pixel sort) | **Canvas 2D with `willReadFrequently`**, or a WebGL shader | Readback is the slow path ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)). The flag moves the canvas to software ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)). |
| 5,000+ objects, noise fields, lighting, gradients per pixel, full-bleed shader backgrounds | **WebGL2** (instanced) | One draw call for thousands of instances ([webgl2fundamentals](https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html)). Fragment shaders compute per pixel. |
| GPU simulation (fluid, 100k+ particles with physics) | **WebGPU compute, with WebGL2 fallback** | Compute pipelines ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)). Support is still incomplete on Linux and Android Firefox ([gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)). |
| Crisp text over a WebGL effect | **HTML/SVG text layered over the canvas** | Canvas text is raster, so a DOM text layer keeps it sharp and accessible. **(inference)** |
| Must export to video in headless Chrome (SwiftShader) | **SVG or Canvas 2D preferred. WebGL2 only with explicit flags and `preserveDrawingBuffer` or in-frame capture. Avoid WebGPU-only.** | SwiftShader is CPU rendering and needs opt-in flags ([Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). The drawing buffer is cleared after compositing ([Khronos](https://registry.khronos.org/webgl/specs/latest/1.0/)). WebGPU is "Disabled" by default in headless Chrome ([Chrome](https://developer.chrome.com/blog/supercharge-web-ai-testing)). |

---

## 7. Practical rules for site-motion

1. **Make every asset a pure function of time.** For export, drive SVG through `setCurrentTime()` (SMIL) or by pausing `document.getAnimations()` and setting `currentTime` (CSS/WAAPI) ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SVGSVGElement/setCurrentTime); [MDN WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API)). Drive Canvas and WebGL with a `render(t)` you call directly, not with wall-clock `requestAnimationFrame` deltas. **(inference)**
2. **Capture WebGL inside the frame.** Call `render(t)` and then `toBlob()` in the same task, or set `preserveDrawingBuffer: true` in export mode only, because it has a performance cost live ([webgl2fundamentals](https://webgl2fundamentals.org/webgl/lessons/webgl-tips.html); [Khronos](https://registry.khronos.org/webgl/specs/latest/1.0/)).
3. **Launch headless Chrome with explicit SwiftShader flags** (`--use-angle=swiftshader-webgl --enable-unsafe-swiftshader`), and fail loudly if `getContext('webgl2')` returns null instead of exporting blank frames ([Chromium SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). Render only trusted, self-authored content in that browser.
4. **Budget for CPU rendering in export.** Under SwiftShader, fragment-heavy shaders run on the CPU ([Chrome](https://developer.chrome.com/blog/supercharge-web-ai-testing)). Expose an export resolution and a quality knob that is separate from the live DPR. **(inference)**
5. **Size canvases to DPR, and watch for DPR changes.** Use `ResizeObserver` with `device-pixel-content-box`, and apply the resize at the start of the next frame, not inside the observer, so you don't clear a frame already drawn ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). In export, set the DPR deliberately.
6. **`await document.fonts.ready` before frame 0** for any asset that has canvas or SVG text ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready)).
7. **Never animate blur radius or `stdDeviation`.** Pre-render blur levels and cross-fade them ([Chrome](https://developer.chrome.com/blog/animated-blur)). In Canvas, avoid `shadowBlur` per frame ([web.dev](https://web.dev/articles/canvas-performance)).
8. **SVG: animate `transform` and `opacity` first.** Animate geometry properties next. Path morphing via CSS `d` is not Baseline, so use SMIL or JS with matching path structures ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count); [MDN `d`](https://developer.mozilla.org/en-US/docs/Web/CSS/d)). Use `vector-effect: non-scaling-stroke` for scale-in reveals.
9. **Keep SVG under roughly the Lighthouse DOM budget** (~800 to 1,400 nodes in total) ([Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/dom-size)). Above that, move to Canvas 2D or WebGL.
10. **WebGL hygiene.** Use instanced draws, an atlas for textures, static VAOs, and no `getError` in the loop. Handle `webglcontextlost` with `preventDefault()` plus a full resource rebuild ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Output premultiplied colour, or alpha = 1 ([webgl2fundamentals](https://webgl2fundamentals.org/webgl/lessons/webgl-and-alpha.html)).
11. **Feature-detect WebGPU** (`navigator.gpu`) and fall back to WebGL2. Never make WebGPU the only path for an asset that has to export ([gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)).
12. **Accessibility.** Give every canvas or WebGL asset fallback text, or `role="img"` with a label, per the spec's guidance on suitable elements and fallback ([WHATWG](https://html.spec.whatwg.org/multipage/canvas.html)). Give SVG assets a `<title>` or `aria-labelledby` ([MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title)).

---

## Sources

**Specifications**
- W3C, SVG 2 (Candidate Recommendation Snapshot, 06 Oct 2026): [overview](https://www.w3.org/TR/SVG2/), [Geometry Properties](https://www.w3.org/TR/SVG2/geometry.html), [Paths](https://www.w3.org/TR/SVG2/paths.html), [Coordinate Systems](https://www.w3.org/TR/SVG2/coords.html), [Painting](https://www.w3.org/TR/SVG2/painting.html), [Document Structure](https://www.w3.org/TR/SVG2/struct.html)
- W3C, [CSS Masking Module Level 1](https://www.w3.org/TR/css-masking-1/) (CRD, 5 Aug 2021)
- W3C, [Filter Effects Module Level 1](https://www.w3.org/TR/filter-effects-1/) (WD, 18 Dec 2018)
- WHATWG, [HTML Living Standard: canvas](https://html.spec.whatwg.org/multipage/canvas.html) (updated 4 Nov 2026)
- Khronos, [WebGL 1.0 Specification](https://registry.khronos.org/webgl/specs/latest/1.0/) (ED, 30 Jun 2026)
- Khronos, [WebGL 2.0 Specification](https://registry.khronos.org/webgl/specs/latest/2.0/) (ED, 30 Jun 2026)
- W3C, [WebGPU](https://www.w3.org/TR/webgpu/) (CRD, 15 Sep 2026)
- GPU for the Web WG, [Implementation Status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) (edited 2 Oct 2026)

**MDN**
- [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [HTMLCanvasElement.getContext()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)
- [webglcontextlost event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
- [Path2D](https://developer.mozilla.org/en-US/docs/Web/API/Path2D)
- [globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
- [ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap)
- [createImageBitmap()](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
- [Window.devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
- [Drawing text](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_text)
- [FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready)
- [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [SVG animation with SMIL](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_animation_with_SMIL)
- [SVGSVGElement.setCurrentTime()](https://developer.mozilla.org/en-US/docs/Web/API/SVGSVGElement/setCurrentTime)
- [Using the Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API)
- [CSS `d`](https://developer.mozilla.org/en-US/docs/Web/CSS/d)
- [CSS `cx`](https://developer.mozilla.org/en-US/docs/Web/CSS/cx)
- [SVG `<title>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title)
- [Applying SVG effects to HTML content](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/Applying_SVG_effects_to_HTML_content)

**Chrome / web.dev / Chromium**
- [It's always been you, Canvas2D](https://developer.chrome.com/blog/canvas2d)
- [Animating a blur](https://developer.chrome.com/blog/animated-blur)
- [Updates in hardware-accelerated animation capabilities](https://developer.chrome.com/blog/hardware-accelerated-animations)
- [Lighthouse: Avoid an excessive DOM size](https://developer.chrome.com/docs/lighthouse/performance/dom-size)
- [Supercharge Web AI model testing: WebGPU, WebGL, and Headless Chrome](https://developer.chrome.com/blog/supercharge-web-ai-testing)
- [Chromium docs: Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
- [blink-dev: Intent to Remove: SwiftShader Fallback](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)
- web.dev: [Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance), [OffscreenCanvas](https://web.dev/articles/offscreen-canvas), [Stick to compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count), [Understanding CSS filter effects](https://web.dev/articles/understanding-css), [WebGPU is now supported in major browsers (25 Nov 2025)](https://web.dev/blog/webgpu-supported-major-browsers)

**webgl2fundamentals.org**
- [How it works](https://webgl2fundamentals.org/webgl/lessons/webgl-how-it-works.html)
- [Instanced drawing](https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html)
- [Tips (screenshots, preserveDrawingBuffer)](https://webgl2fundamentals.org/webgl/lessons/webgl-tips.html)
- [WebGL and alpha](https://webgl2fundamentals.org/webgl/lessons/webgl-and-alpha.html)

**Support data**
- caniuse: [svg-smil](https://caniuse.com/svg-smil), [webgpu](https://caniuse.com/webgpu)
