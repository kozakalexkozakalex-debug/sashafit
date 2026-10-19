"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Бібліотека звичок тренера — шаблони (Вода/Кроки/Сон/свої), з яких потім
// призначаємо звички клієнтам (AssignHabits). Картки в тому ж стилі, що й
// база вправ/продуктів.

type HabitTemplate = { id: string; label: string; icon: string | null; position: number };

const QUICK_ICONS = ["💧", "🚶", "😴", "🥗", "📖", "🧘", "☀️", "✅"];
const DEFAULTS = [
  { label: "Вода", icon: "💧" },
  { label: "Кроки", icon: "🚶" },
  { label: "Сон", icon: "😴" },
];

export default function HabitTemplatesLibrary() {
  const [templates, setTemplates] = useState<HabitTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("habit_templates").select("*").order("position", { ascending: true });
    setTemplates((data as HabitTemplate[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addDefaults() {
    setBusy(true);
    await supabase
      .from("habit_templates")
      .insert(DEFAULTS.map((d, i) => ({ label: d.label, icon: d.icon, position: templates.length + i })));
    setBusy(false);
    load();
  }

  async function addTemplate() {
    if (!label.trim()) return;
    setBusy(true);
    await supabase.from("habit_templates").insert({ label: label.trim(), icon, position: templates.length });
    setLabel("");
    setBusy(false);
    load();
  }

  async function removeTemplate(id: string) {
    await supabase.from("habit_templates").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Нова звичка в бібліотеку</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base transition ${
                  icon === ic ? "border-accent bg-accent/15" : "border-line bg-paper"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Назва (напр. Розтяжка)"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={addTemplate}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              Додати
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Бібліотека звичок ({templates.length})</h2>
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        {!loading && templates.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Звичок у бібліотеці ще немає.</p>
            <button
              type="button"
              disabled={busy}
              onClick={addDefaults}
              className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
            >
              Додати базові (вода, кроки, сон)
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="relative flex flex-col items-center gap-2 rounded-xl border-l-2 border-accent bg-paper p-4 text-center shadow-sm transition hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => removeTemplate(t.id)}
                title="Видалити з бібліотеки"
                className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-muted/60 transition hover:text-red-400"
              >
                ✕
              </button>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl">
                {t.icon}
              </span>
              <span className="font-display text-sm font-semibold text-ink">{t.label}</span>
            </div>
          ))}
        </div>
        {templates.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Щоб призначити ці звички клієнтам — познач клієнтів у списку (вигляд «Списком») і натисни «Призначити
            звички».
          </p>
        )}
      </div>
    </div>
  );
}
