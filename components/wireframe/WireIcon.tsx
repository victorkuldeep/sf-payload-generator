import { wireIconDef, type WireIconEl } from "@/lib/wireframe/icons";

/** Renders a wireframe icon glyph - stroke set outlines, brands paint solid. */
export function WireIcon({ name, size = 28 }: { name: string; size?: number }) {
  const def = wireIconDef(name);
  const paint = def.fill
    ? { fill: "currentColor" }
    : {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      };
  return (
    <svg
      width={size}
      height={size}
      viewBox={def.viewBox ?? "0 0 24 24"}
      aria-hidden="true"
      className="shrink-0 text-[#57534A]"
      {...paint}
    >
      {def.els.map((el: WireIconEl, i: number) => {
        if (el.tag === "path") return <path key={i} d={String(el.attrs.d)} />;
        if (el.tag === "circle") return <circle key={i} cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} />;
        if (el.tag === "rect")
          return <rect key={i} x={el.attrs.x} y={el.attrs.y} width={el.attrs.width} height={el.attrs.height} rx={el.attrs.rx} />;
        if (el.tag === "polygon") return <polygon key={i} points={String(el.attrs.points)} />;
        if (el.tag === "polyline") return <polyline key={i} points={String(el.attrs.points)} />;
        return <line key={i} x1={el.attrs.x1} y1={el.attrs.y1} x2={el.attrs.x2} y2={el.attrs.y2} />;
      })}
    </svg>
  );
}
