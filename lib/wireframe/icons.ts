/**
 * Wireframe icon set - popular UI glyphs vendored as path data.
 *
 * Stroke icons follow the Feather Icons geometry (MIT); brand marks are
 * GitHub Octicons (MIT) and a LinkedIn mark (Simple Icons, CC0). See
 * THIRD_PARTY_NOTICES.md. No icon package is installed, so the wireframe
 * stays dependency-free and every glyph works offline.
 */

export interface WireIconEl {
  tag: "path" | "circle" | "rect" | "polygon" | "polyline" | "line";
  attrs: Record<string, string | number>;
}

export interface WireIconDef {
  label: string;
  /** Fill icons (brands) paint solid; stroke icons outline. */
  fill: boolean;
  viewBox?: string;
  els: WireIconEl[];
}

const L = (x1: number, y1: number, x2: number, y2: number): WireIconEl => ({
  tag: "line",
  attrs: { x1, y1, x2, y2 },
});
const P = (d: string): WireIconEl => ({ tag: "path", attrs: { d } });
const PL = (points: string): WireIconEl => ({ tag: "polyline", attrs: { points } });
const C = (cx: number, cy: number, r: number): WireIconEl => ({
  tag: "circle",
  attrs: { cx, cy, r },
});

function stroke(label: string, els: WireIconEl[]): WireIconDef {
  return { label, fill: false, els };
}

export const WIRE_ICONS: Record<string, WireIconDef> = {
  menu: stroke("Menu", [L(3, 6, 21, 6), L(3, 12, 21, 12), L(3, 18, 21, 18)]),
  x: stroke("Close", [L(18, 6, 6, 18), L(6, 6, 18, 18)]),
  plus: stroke("Plus", [L(12, 5, 12, 19), L(5, 12, 19, 12)]),
  check: stroke("Check", [PL("20 6 9 17 4 12")]),
  "chevron-right": stroke("Chevron right", [PL("9 18 15 12 9 6")]),
  "chevron-down": stroke("Chevron down", [PL("6 9 12 15 18 9")]),
  "arrow-right": stroke("Arrow right", [L(5, 12, 19, 12), PL("12 5 19 12 12 19")]),
  search: stroke("Search", [C(11, 11, 8), L(21, 21, 16.65, 16.65)]),
  bell: stroke("Notification", [
    P("M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"),
    P("M13.73 21a2 2 0 0 1-3.46 0"),
  ]),
  user: stroke("User", [P("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"), C(12, 7, 4)]),
  home: stroke("Home", [P("M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"), PL("9 22 9 12 15 12 15 22")]),
  sliders: stroke("Settings", [
    L(4, 21, 4, 14), L(4, 10, 4, 3), L(12, 21, 12, 12), L(12, 8, 12, 3),
    L(20, 21, 20, 16), L(20, 12, 20, 3), L(1, 14, 7, 14), L(9, 8, 15, 8), L(17, 16, 23, 16),
  ]),
  trash: stroke("Delete", [
    PL("3 6 5 6 21 6"),
    P("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"),
  ]),
  eye: stroke("View", [P("M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"), C(12, 12, 3)]),
  star: stroke("Star", [
    { tag: "polygon", attrs: { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" } },
  ]),
  heart: stroke("Favorite", [
    P("M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"),
  ]),
  mail: stroke("Mail", [
    { tag: "rect", attrs: { x: 2, y: 4, width: 20, height: 16, rx: 2 } },
    PL("22 6 12 13 2 6"),
  ]),
  book: stroke("Book", [
    P("M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"),
    P("M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"),
  ]),
  lock: stroke("Lock", [
    { tag: "rect", attrs: { x: 3, y: 11, width: 18, height: 11, rx: 2 } },
    P("M7 11V7a5 5 0 0 1 10 0v4"),
  ]),
  globe: stroke("Globe", [
    C(12, 12, 10),
    L(2, 12, 22, 12),
    P("M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"),
  ]),
  calendar: stroke("Calendar", [
    { tag: "rect", attrs: { x: 3, y: 4, width: 18, height: 18, rx: 2 } },
    L(16, 2, 16, 6), L(8, 2, 8, 6), L(3, 10, 21, 10),
  ]),
  clock: stroke("Clock", [C(12, 12, 10), PL("12 6 12 12 16 14")]),
  pin: stroke("Location", [P("M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"), C(12, 10, 3)]),
  download: stroke("Download", [
    P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"),
    PL("7 10 12 15 17 10"),
    L(12, 15, 12, 3),
  ]),
  upload: stroke("Upload", [
    P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"),
    PL("17 8 12 3 7 8"),
    L(12, 3, 12, 15),
  ]),
  filter: stroke("Filter", [
    { tag: "polygon", attrs: { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" } },
  ]),
  cart: stroke("Cart", [
    C(9, 21, 1), C(20, 21, 1),
    P("M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"),
  ]),
  info: stroke("Info", [C(12, 12, 10), L(12, 16, 12, 12), L(12, 8, 12.01, 8)]),
  alert: stroke("Warning", [
    P("M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"),
    L(12, 9, 12, 13), L(12, 17, 12.01, 17),
  ]),
  refresh: stroke("Refresh", [
    PL("23 4 23 10 17 10"),
    PL("1 20 1 14 7 14"),
    P("M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"),
  ]),
  github: {
    label: "GitHub",
    fill: true,
    els: [
      P("M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"),
    ],
  },
  linkedin: {
    label: "LinkedIn",
    fill: true,
    viewBox: "0 0 34 34",
    els: [
      P("M34 2.5v29a2.5 2.5 0 0 1-2.5 2.5h-29A2.5 2.5 0 0 1 0 31.5v-29A2.5 2.5 0 0 1 2.5 0h29A2.5 2.5 0 0 1 34 2.5M10 13H5v16h5zm.45-5.5a2.88 2.88 0 0 0-2.86-2.9H7.5a2.9 2.9 0 0 0 0 5.8 2.88 2.88 0 0 0 2.95-2.81zM29 19.28c0-4.81-3.06-6.68-6.1-6.68a5.7 5.7 0 0 0-5.06 2.58h-.14V13H13v16h5v-8.51a3.32 3.32 0 0 1 3-3.58h.19c1.59 0 2.77 1 2.77 3.52V29h5z"),
    ],
  },
};

export function wireIconNames(): string[] {
  return Object.keys(WIRE_ICONS);
}

export function wireIconDef(name: string): WireIconDef {
  return WIRE_ICONS[name] ?? WIRE_ICONS.star;
}
