"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Призначення звичок з бібліотеки (habit_templates) одному чи кільком
// клієнтам одразу — додає рядки в habits кожного клієнта, пропускаючи ті,
// що вже є в нього з такою ж назвою (щоб не дублювати).

type HabitTemplate = { id: string; label: string; icon: string | null };
type ExistingHabit = { client_id: string; label: string };

export default function AssignHabits({
  clientIds,
  onClose,
  onSaved,
}: {
  clientIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templates, setTemplates] = useState<HabitTemplate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    supabase
      .from("habit_templates")
      .select("id, label, icon")
      .order("position", { ascending: true })
      .then(({ data }) => setTemplates((data as HabitTemplate[]) || []));
  }, []);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
  }

  async function assign() {
    if (picked.size === 0) return;
    setBusy(true);
    setResult(null);

    const chosen = templates.filter((t) => picked.has(t.id));
    const { data: existing } = await supabase
      .from("habits")
      .select("client_id, label")
      .in("client_id", clientIds);
    const existingRows = (existing as ExistingHabit[]) || [];
    const existingSet = new Set(existingRows.map((e) => `${e.client_id}::${e.label}`));

    let created = 0;
    let skipped = 0;
    const toInsert: { client_id: string; label: string; icon: string | null; position: number }[] = [];

    for (const clientId of clientIds) {
      const already = existingRows.filter((e) => e.client_id === clientId).length;
      let pos = already;
      for (const t of chosen) {
        const key = `${clientId}::${t.label}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }
        toInsert.push({ client_id: clientId, label: t.label, icon: t.icon, position: pos });
        pos++;
        created++;
      }
    }

    if (toInsert.length > 0) {
      await supabase.from("habits").insert(toInsert);
    }

    setBusy(false);
    setResult({ created, skipped });
    onSaved();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Призначити звички{clientIds.length > 1 ? ` (${clientIds.length} клієнтам)` : ""}
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-muted">
          Закрити
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted">Спочатку додай звички у вкладці «База» → «Звички».</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  picked.has(t.id) ? "border-accent bg-accent text-paper" : "border-line bg-paper text-muted"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || picked.size === 0}
            onClick={assign}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Призначаю…" : "Призначити"}
          </button>
          {result && (
            <p className="text-sm text-green-400">
              Додано {result.created} звичок
              {result.skipped ? `, пропущено ${result.skipped} (вже були в клієнта)` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
