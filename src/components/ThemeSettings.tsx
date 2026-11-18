"use client";

import { useEffect, useState } from "react";
import { ModePref, readPrefs, saveAndApply, ThemeId, THEMES } from "@/lib/theme";

const MODES: { id: ModePref; label: string }[] = [
  { id: "auto", label: "Авто" },
  { id: "dark", label: "Темна" },
  { id: "light", label: "Світла" },
];

// Вкладка "Оформлення": вибір теми й режиму. Зберігається на цьому пристрої.
export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeId>("lime");
  const [mode, setMode] = useState<ModePref>("auto");

  useEffect(() => {
    const p = readPrefs();
    setTheme(p.theme);
    setMode(p.mode);
  }, []);

  function pick(t: ThemeId, m: ModePref) {
    setTheme(t);
    setMode(m);
    saveAndApply(t, m);
  }

  // Прев'ю показуємо у тому режимі, який зараз реально діє.
  const previewMode: "dark" | "light" =
    typeof document !== "undefined" && document.documentElement.getAttribute("data-mode") === "light"
      ? "light"
      : "dark";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Тема</h2>
        <div className="flex flex-col gap-2">
          {THEMES.map((t) => {
            const [bg, card, accent, small] = t[previewMode];
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id, mode)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left ${
                  active ? "border-brand bg-brand/10" : "border-line"
                }`}
              >
                <span
                  className="flex h-12 w-16 flex-none flex-col justify-between rounded-md border border-line p-1.5"
                  style={{ background: bg }}
                >
                  <span className="h-2 w-full rounded-sm" style={{ background: card }} />
                  <span className="flex gap-1">
                    <span className="h-2.5 w-5 rounded-sm" style={{ background: accent }} />
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: small }} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted">{t.hint}</span>
                </span>
                {active && <span className="flex-none text-sm text-brand">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold">Режим</h2>
        <p className="mb-3 text-xs text-muted">«Авто» бере тему з Telegram або телефону.</p>
        <div className="flex gap-1 rounded-full border border-line bg-paper p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(theme, m.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
                mode === m.id ? "bg-accent text-paper" : "text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
