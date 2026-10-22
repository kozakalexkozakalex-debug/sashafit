"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Звички клієнта (вода/кроки/сон/довільні) — простий чекліст на день
// зі стріком. Список звичок призначає тренер (вкладка "Призначити звички"),
// клієнт тут лише відмічає виконання — не додає й не видаляє звички сам.

type Habit = { id: string; label: string; icon: string | null; position: number };
type HabitLog = { habit_id: string; date: string; done: boolean };

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Стрік звички — скільки днів поспіль підряд (рахуючи від сьогодні назад)
// відмічено виконаним. Як і зі стріком тренувань, пропуск дня рве стрік.
function computeHabitStreak(logs: HabitLog[]): number {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    const key = toKey(cursor);
    const log = byDate.get(key);
    if (log?.done) streak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function HabitsChecklist({ clientId }: { clientId: string }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: h } = await supabase
      .from("habits")
      .select("id, label, icon, position")
      .eq("client_id", clientId)
      .order("position", { ascending: true });
    const habitRows = (h as Habit[]) || [];
    setHabits(habitRows);
    if (habitRows.length > 0) {
      const { data: l } = await supabase
        .from("habit_logs")
        .select("habit_id, date, done")
        .in("habit_id", habitRows.map((x) => x.id));
      setLogs((l as HabitLog[]) || []);
    } else {
      setLogs([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function toggleToday(habitId: string) {
    const todayKey = toKey(new Date());
    const existing = logs.find((l) => l.habit_id === habitId && l.date === todayKey);
    if (existing) {
      await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("date", todayKey);
    } else {
      await supabase.from("habit_logs").insert({ habit_id: habitId, date: todayKey, done: true });
    }
    load();
  }

  if (loading) return null;

  const todayKey = toKey(new Date());

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <h2 className="mb-2 text-sm font-semibold">Звички</h2>

      {habits.length === 0 ? (
        <p className="text-xs text-muted">Тренер ще не призначив тобі звичок.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {habits.map((h) => {
            const doneToday = logs.some((l) => l.habit_id === h.id && l.date === todayKey && l.done);
            const streak = computeHabitStreak(logs.filter((l) => l.habit_id === h.id));
            return (
              <div key={h.id} className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleToday(h.id)}
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-sm ${
                    doneToday ? "border-accent bg-accent text-paper" : "border-line text-muted"
                  }`}
                >
                  {doneToday ? "✓" : h.icon || ""}
                </button>
                <span className="flex-1 text-sm text-ink">{h.label}</span>
                {streak > 0 && <span className="text-[11px] text-muted">🔥{streak}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
