# Third-party notices

## Excalidraw (Draw engine)

- Package: `@excalidraw/excalidraw` (exact pin `0.18.1`, see `package.json` / `package-lock.json`)
- License: **MIT** (as declared in the package's `package.json` and the npm registry)
- Source: <https://github.com/excalidraw/excalidraw>
- Integrated as an unmodified npm dependency rendered through our own
  `components/draw/DrawCanvas.tsx` adapter. No source is copied into this
  repository, `node_modules` is not modified, and no private fork exists.
- Runtime assets (fonts, locales) are copied verbatim from the installed
  package's `dist/prod` tree into `public/excalidraw-assets/` at build time by
  `scripts/copy-excalidraw-assets.mjs` and served from our own origin. The
  fonts ship inside the MIT-licensed package; no replacement fonts are used.

Required MIT notice (software distributed with this application):

> This software contains Excalidraw, MIT licensed. The MIT license requires
> this notice: "THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY
> KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT."
> See <https://github.com/excalidraw/excalidraw/blob/master/LICENSE> for the
> full license text.

## Wireframe icon glyphs (vendored path data)

- UI glyph geometry follows **Feather Icons** (MIT, Copyright (c) 2013-2023
  Cole Bemis / Feather contributors): <https://feathericons.com>
- GitHub brand mark follows **Octicons** (MIT, GitHub): <https://primer.style/octicons>
- LinkedIn brand mark follows **Simple Icons** (CC0 1.0 Universal):
  <https://simpleicons.org>
- Only path data is vendored into `lib/wireframe/icons.ts` (no icon package
  installed); glyphs render as inline SVG from our own origin.

Required MIT notice (Feather Icons, Octicons):

> "THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT."
