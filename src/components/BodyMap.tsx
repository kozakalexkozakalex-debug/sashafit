"use client";

import { haptic } from "@/lib/telegram";

// Силует тіла для замірів: торкаєшся зони — вибираєш, що вписувати.
// Зони відповідають полям чек-іна в базі: груди, талія, стегна.

export type Zone = "chest" | "waist" | "hips";

export const ZONE_LABEL: Record<Zone, string> = {
  chest: "Груди",
  waist: "Талія",
  hips: "Стегна",
};

// Розміщення зон на силуеті (viewBox 200×300).
const ZONES: { id: Zone; cx: number; cy: number; rx: number; ry: number }[] = [
  { id: "chest", cx: 100, cy: 92, rx: 38, ry: 15 },
  { id: "waist", cx: 100, cy: 140, rx: 28, ry: 12 },
  { id: "hips", cx: 100, cy: 186, rx: 40, ry: 14 },
];

export default function BodyMap({
  values,
  selected,
  onSelect,
}: {
  values: Record<Zone, string>;
  selected: Zone | null;
  onSelect: (z: Zone) => void;
}) {
  return (
    <svg viewBox="0 0 200 300" className="mx-auto h-72 w-auto" role="group" aria-label="Силует для замірів">
      {/* Тіло: голова, шия, торс, руки, ноги */}
      <g style={{ fill: "rgb(var(--c-line))" }}>
        <circle cx="100" cy="26" r="17" />
        <rect x="93" y="40" width="14" height="14" rx="5" />
        <path d="M62 62 Q100 50 138 62 L132 100 Q127 122 123 142 Q132 164 139 200 L61 200 Q68 164 77 142 Q73 122 68 100 Z" />
      </g>
      <g fill="none" strokeLinecap="round" style={{ stroke: "rgb(var(--c-line))" }}>
        <path d="M60 68 L42 150" strokeWidth="13" />
        <path d="M140 68 L158 150" strokeWidth="13" />
        <path d="M84 200 L80 288" strokeWidth="24" />
        <path d="M116 200 L120 288" strokeWidth="24" />
      </g>

      {ZONES.map((z) => {
        const val = values[z.id];
        const isSel = selected === z.id;
        const filled = val.trim() !== "";
        return (
          <g
            key={z.id}
            onClick={() => {
              haptic("select");
              onSelect(z.id);
            }}
            className="cursor-pointer"
            role="button"
            aria-label={`${ZONE_LABEL[z.id]}${filled ? `: ${val} см` : ""}`}
          >
            <ellipse
              cx={z.cx}
              cy={z.cy}
              rx={z.rx}
              ry={z.ry}
              strokeWidth={isSel ? 2.5 : 1.5}
              strokeDasharray={filled || isSel ? undefined : "4 3"}
              style={{
                fill: filled ? "rgb(var(--c-accent))" : "rgb(var(--c-surface))",
                stroke: isSel || filled ? "rgb(var(--c-accent))" : "rgb(var(--c-muted))",
              }}
            />
            <text
              x={z.cx}
              y={z.cy + 4}
              textAnchor="middle"
              fontSize={filled ? 12 : 10}
              fontWeight={filled ? 700 : 500}
              style={{ fill: filled ? "rgb(var(--c-paper))" : "rgb(var(--c-muted))" }}
            >
              {filled ? val : ZONE_LABEL[z.id]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
