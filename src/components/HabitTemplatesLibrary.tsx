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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {QUICK_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base transition ${
                  icon === ic ? "border-accent bg-accent/15" : "border-line bg-paper"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Назва (напр. Розтяжка)"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border-l-2 border-accent bg-paper p-3 text-sm"
            >
              <span className="text-xl">{t.icon}</span>
              <span className="flex-1 font-medium">{t.label}</span>
              <button type="button" onClick={() => removeTemplate(t.id)} className="text-xs text-muted">
                ✕
              </button>
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
