"use client";

import { useState } from "react";

export type DayStatus = "planned" | "done" | "missed" | null;

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export default function Calendar({
  statusByDate,
  selected,
  onSelect,
}: {
  statusByDate: Record<string, DayStatus>;
  selected: string | null;
  onSelect: (dateKey: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // понеділок = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const colorFor: Record<Exclude<DayStatus, null>, string> = {
    done: "bg-green-500/20 text-green-400 border-green-500/40",
    missed: "bg-red-500/20 text-red-400 border-red-500/40",
    planned: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded bg-paper px-2 py-1 text-xs"
        >
          ‹
        </button>
        <span className="text-sm font-medium">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded bg-paper px-2 py-1 text-xs"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = toKey(d);
          const status = statusByDate[key];
          const isToday = key === todayKey;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`aspect-square rounded-lg border text-xs ${
                status ? colorFor[status] : "border-line bg-paper text-muted"
              } ${isToday ? "ring-1 ring-accent" : ""} ${isSelected ? "outline outline-2 outline-accent" : ""}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
