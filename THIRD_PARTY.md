# Third-party code and assets

site-motion is MIT licensed. These files in the repo come from other projects, under their own licences. A scene inlines a library only when its first line asks for it (`// @vendor …`).

| File | Project | Version | Licence |
|---|---|---|---|
| `vendor/three-full.min.js` | [three.js](https://github.com/mrdoob/three.js) (core + GLTFLoader, SVGLoader, RoundedBoxGeometry, BufferGeometryUtils, MeshoptDecoder), bundled by `vendor-src/` | 0.186.1 | MIT |
| `vendor/three.min.js` | [three.js](https://github.com/mrdoob/three.js) | r149 | MIT |
| `vendor/p5.min.js` | [p5.js](https://github.com/processing/p5.js) | 1.9.4 | LGPL-2.1 (used unmodified; you can swap in your own build of the same file) |
| `vendor/matter.min.js` | [Matter.js](https://github.com/liabru/matter-js) | 0.19.0 | MIT |
| `lib/extract-rendered.mjs` (parts) | [dembrandt](https://github.com/dembrandt/dembrandt): consent-platform selectors and accept-text pattern, status-colour pattern, brand-intent class weights and the localized home-link test, adapted (not bundled; no dependency) | 0.39.2 | MIT (notice below) |
| `assets/models/kenney-furniture/` | [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | — | CC0 1.0 (see its `License.txt` and `assets/LICENSES.json`) |
| `scenes/coverage-map/scene.js` (land mask) | [Natural Earth](https://www.naturalearthdata.com/) 1:50m land, rasterised to a 160 × 62 cell grid and embedded | — | Public domain |

Fonts are not bundled: token files point at Google Fonts (SIL Open Font License).

### dembrandt (MIT)

Copyright (c) 2025 thevangelist

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
