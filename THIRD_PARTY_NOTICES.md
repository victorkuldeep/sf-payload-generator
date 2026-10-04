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

## Wireframe icon glyphs (Lucide + two vendored brands)

- UI glyphs render from the **`lucide-react` npm package** (ISC):
  <https://lucide.dev> — pinned in `package.json` / `package-lock.json`,
  imported statically per glyph in `components/wireframe/WireIcon.tsx` so
  bundlers tree-shake to only the glyphs on the palette.
- GitHub brand mark follows **Octicons** (MIT, GitHub): <https://primer.style/octicons>
- LinkedIn brand mark follows **Simple Icons** (CC0 1.0 Universal):
  <https://simpleicons.org>
- Only the two brand marks are vendored as path data in
  `lib/wireframe/icons.ts` (Lucide no longer ships brand icons); everything
  renders as inline SVG from our own origin.

Required ISC notice (Lucide):

> "THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT."

Required MIT notice (Octicons):

> "THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT."
