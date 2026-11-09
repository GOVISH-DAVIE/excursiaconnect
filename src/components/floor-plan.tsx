"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Booth, BoothStatus, Hall } from "@/lib/expo/types";

/*
  The floor plan, to scale in metres. One component serves the organiser's editor, the public plan, the
  exhibitor's portal and the show floor. A booth's colour carries its status, but never alone: its code is
  printed on it, the legend names every colour, and hover or focus shows the status in words.
*/

export const STATUS_STYLE: Record<BoothStatus, { fill: string; stroke: string; ink: string; label: string }> = {
  Available: {
    fill: "#e6f5ed",
    stroke: "#1e8e5a",
    ink: "#1c1c1e",
    label: "Available",
  },
  Held: {
    fill: "#fdf2dd",
    stroke: "#b86a00",
    ink: "#1c1c1e",
    label: "Held, contract to sign",
  },
  Reserved: {
    fill: "#cde2fb",
    stroke: "#2a78d6",
    ink: "#1c1c1e",
    label: "Reserved, deposit due",
  },
  Booked: {
    fill: "#2a78d6",
    stroke: "#1c5cab",
    ink: "#ffffff",
    label: "Booked",
  },
  Blocked: {
    fill: "#f1efea",
    stroke: "#cfcbc4",
    ink: "#5b6470",
    label: "Not for sale",
  },
};

export function PlanLegend({ statuses = ["Available", "Held", "Reserved", "Booked", "Blocked"], extra }: { statuses?: BoothStatus[]; extra?: { label: string; fill: string; stroke: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate" aria-label="Legend">
      {statuses.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-[2px] border"
            style={{
              background: STATUS_STYLE[s].fill,
              borderColor: STATUS_STYLE[s].stroke,
            }}
            aria-hidden="true"
          />
          {STATUS_STYLE[s].label}
        </li>
      ))}
      {extra?.map((x) => (
        <li key={x.label} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] border" style={{ background: x.fill, borderColor: x.stroke }} aria-hidden="true" />
          {x.label}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  hall: Hall;
  booths: Booth[];
  statusOf: (b: Booth) => BoothStatus;
  /** a second line inside the booth, such as the exhibitor's name, when it fits */
  labelOf?: (b: Booth) => string | undefined;
  /** what the tooltip says, line by line */
  tip?: (b: Booth) => string[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** booths to ring, such as the exhibitor's own */
  ring?: string[];
  /** booths to fade, such as those that do not match a filter */
  faded?: (b: Booth) => boolean;
  /** a fill that replaces the status colour, such as occupancy on show days */
  paint?: (b: Booth) => { fill: string; stroke: string; ink: string } | undefined;
  editable?: boolean;
  onMove?: (id: string, x: number, y: number) => void;
  /** why a booth may not sit at x, y; the dragged outline turns red while any reason holds */
  problemsAt?: (b: Booth, x: number, y: number) => string[];
};

export function FloorPlan({ hall, booths, statusOf, labelOf, tip, selected, onSelect, ring = [], faded, paint, editable, onMove, problemsAt }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    x: number;
    y: number;
  } | null>(null);
  const [hover, setHover] = useState<{
    id: string;
    left: number;
    top: number;
    bottom: number;
  } | null>(null);
  const pad = 1;

  // a pointer position in metres, snapped to the 1 m grid
  const toMetres = (e: PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const down = (b: Booth, e: PointerEvent<SVGGElement>) => {
    onSelect?.(b.id);
    if (!editable) return;
    const p = toMetres(e);
    svg.current!.setPointerCapture(e.pointerId);
    setDrag({ id: b.id, dx: p.x - b.x, dy: p.y - b.y, x: b.x, y: b.y });
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toMetres(e);
    setDrag({
      ...drag,
      x: Math.round(p.x - drag.dx),
      y: Math.round(p.y - drag.dy),
    });
  };
  const up = () => {
    if (!drag) return;
    const b = booths.find((x) => x.id === drag.id);
    if (b && (drag.x !== b.x || drag.y !== b.y)) onMove?.(b.id, drag.x, drag.y);
    setDrag(null);
  };
  const key = (b: Booth, e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(b.id);
    }
    // arrow keys nudge the selected booth a metre at a time
    if (editable && selected === b.id && onMove) {
      const step = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[e.key];
      if (step) {
        e.preventDefault();
        onMove(b.id, b.x + step[0], b.y + step[1]);
      }
    }
  };
  const showTip = (b: Booth, el: Element) => {
    if (!tip || !box.current) return;
    const r = el.getBoundingClientRect();
    const o = box.current.getBoundingClientRect();
    setHover({
      id: b.id,
      left: r.left - o.left + r.width / 2,
      top: r.top - o.top,
      bottom: r.bottom - o.top,
    });
  };
  const hovered = hover && booths.find((b) => b.id === hover.id);

  // on a phone the plan keeps about 13 px a metre, so a 3 m booth stays a tap target, and scrolls sideways instead
  return (
    <div className="max-sm:overflow-x-auto max-sm:-mx-1 max-sm:px-1">
      <div ref={box} className="relative" style={{ minWidth: Math.round((hall.width + pad * 2) * 13) }}>
        <svg
          ref={svg}
          viewBox={`${-pad} ${-pad} ${hall.width + pad * 2} ${hall.depth + pad * 2}`}
          className="block w-full select-none"
          style={{ touchAction: editable ? "none" : "auto" }}
          role="group"
          aria-label={`${hall.name}, ${hall.width} by ${hall.depth} metres`}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <pattern id={`hatch-${hall.id}`} width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="0.6" stroke="#cfcbc4" strokeWidth="0.15" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={hall.width} height={hall.depth} fill="#fbfaf8" stroke="#cfcbc4" strokeWidth={0.12} />
          {/* a 3 m grid, the module most booths use; 1 m while editing */}
          {Array.from({ length: Math.floor(hall.width / (editable ? 1 : 3)) - 1 }, (_, i) => (i + 1) * (editable ? 1 : 3)).map((x) => (
            <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={hall.depth} stroke="#e1e0d9" strokeWidth={editable && x % 3 ? 0.03 : 0.05} />
          ))}
          {Array.from({ length: Math.floor(hall.depth / (editable ? 1 : 3)) - 1 }, (_, i) => (i + 1) * (editable ? 1 : 3)).map((y) => (
            <line key={`gy${y}`} x1={0} y1={y} x2={hall.width} y2={y} stroke="#e1e0d9" strokeWidth={editable && y % 3 ? 0.03 : 0.05} />
          ))}
          {hall.features.map((f) => (
            <g key={f.id} aria-hidden="true">
              <rect x={f.x} y={f.y} width={f.w} height={f.d} fill={f.kind === "Pillar" ? "#3a3c42" : f.kind === "Fire exit" ? "#d23b2d" : f.kind === "Entrance" ? "#1e8e5a" : "#b86a00"} />
              {f.kind !== "Pillar" && (
                <text
                  x={f.x + f.w / 2 + (f.w < 1 ? (f.x < 1 ? 1.2 : -1.2) : 0)}
                  y={f.y + f.d / 2 + (f.d < 1 ? (f.y < 1 ? 1 : -0.8) : 0)}
                  fontSize={0.7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#5b6470"
                  transform={f.w < 1 ? `rotate(-90 ${f.x + f.w / 2 + (f.x < 1 ? 1.2 : -1.2)} ${f.y + f.d / 2})` : undefined}
                >
                  {f.kind}
                </text>
              )}
            </g>
          ))}
          {booths.map((b) => {
            const st = statusOf(b);
            const s = paint?.(b) ?? STATUS_STYLE[st];
            const label = labelOf?.(b);
            const sel = selected === b.id;
            const mine = ring.includes(b.id);
            const fade = faded?.(b);
            return (
              <g
                key={b.id}
                role="button"
                tabIndex={onSelect ? 0 : -1}
                aria-label={`${b.code}, ${STATUS_STYLE[st].label.toLowerCase()}, ${b.w} by ${b.d} metres${label ? `, ${label}` : ""}`}
                aria-pressed={onSelect ? sel : undefined}
                className={onSelect ? "cursor-pointer outline-none" : undefined}
                style={{ opacity: fade ? 0.3 : 1 }}
                onPointerDown={(e) => down(b, e)}
                onPointerEnter={(e) => showTip(b, e.currentTarget)}
                onFocus={(e) => showTip(b, e.currentTarget)}
                onBlur={() => setHover(null)}
                onKeyDown={(e) => key(b, e)}
              >
                <rect
                  x={b.x + 0.06}
                  y={b.y + 0.06}
                  width={b.w - 0.12}
                  height={b.d - 0.12}
                  fill={st === "Blocked" && !paint ? `url(#hatch-${hall.id})` : s.fill}
                  stroke={sel ? "#1c1c1e" : mine ? "#ff664c" : s.stroke}
                  strokeWidth={sel || mine ? 0.22 : 0.08}
                  rx={0.15}
                />
                {st === "Blocked" && !paint && <rect x={b.x + 0.06} y={b.y + 0.06} width={b.w - 0.12} height={b.d - 0.12} fill={s.fill} opacity={0.6} rx={0.15} pointerEvents="none" />}
                <text x={b.x + b.w / 2} y={b.y + b.d / 2 - (label && b.w >= 3 ? 0.35 : 0)} fontSize={b.w >= 3 ? 0.8 : 0.6} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill={s.ink} pointerEvents="none">
                  {b.code}
                </text>
                {label && b.w >= 3 && (
                  <text x={b.x + b.w / 2} y={b.y + b.d / 2 + 0.6} fontSize={0.5} textAnchor="middle" dominantBaseline="middle" fill={s.ink} opacity={0.85} pointerEvents="none">
                    {label.length > (b.w >= 6 ? 22 : 10) ? `${label.slice(0, b.w >= 6 ? 21 : 9)}…` : label}
                  </text>
                )}
              </g>
            );
          })}
          {drag &&
            (() => {
              const b = booths.find((x) => x.id === drag.id)!;
              const bad = problemsAt?.(b, drag.x, drag.y).length;
              return (
                <rect
                  x={drag.x}
                  y={drag.y}
                  width={b.w}
                  height={b.d}
                  fill={bad ? "rgba(210,59,45,0.15)" : "rgba(42,120,214,0.15)"}
                  stroke={bad ? "#d23b2d" : "#2a78d6"}
                  strokeWidth={0.12}
                  strokeDasharray="0.4 0.25"
                  pointerEvents="none"
                />
              );
            })()}
        </svg>
        {hovered && tip && !drag && (
          <div
            role="status"
            className={`pointer-events-none absolute z-10 -translate-x-1/2 ${hover!.top < 64 ? "" : "-translate-y-full"} rounded-md bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-lg`}
            style={{
              left: hover!.left,
              top: hover!.top < 64 ? hover!.bottom + 6 : hover!.top - 6,
            }}
          >
            {tip(hovered).map((l, i) => (
              <div key={i} className={i === 0 ? "text-[13px] font-medium" : "text-white/75 whitespace-nowrap"}>
                {l}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
