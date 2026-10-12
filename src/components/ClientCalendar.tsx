"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Calendar, { DayStatus } from "@/components/Calendar";

type AWExercise = { id: string; name: string; sets: number | null; reps: string | null };
type AssignedWorkout = {
  id: string;
  title: string;
  date: string;
  completed_at: string | null;
  assigned_workout_exercises: AWExercise[];
};

export default function ClientCalendar({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("assigned_workouts")
      .select("*, assigned_workout_exercises(*)")
      .eq("client_id", clientId);
    setWorkouts((data as unknown as AssignedWorkout[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const statusByDate: Record<string, DayStatus> = {};
  const todayKey = new Date().toISOString().slice(0, 10);
  for (const w of workouts) {
    statusByDate[w.date] = w.completed_at ? "done" : w.date < todayKey ? "missed" : "planned";
  }

  const workout = selected ? workouts.find((w) => w.date === selected) : null;

  async function markDone() {
    if (!workout) return;
    setBusy(true);
    await supabase
      .from("assigned_workouts")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", workout.id);
    setBusy(false);
    load();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Тренування</h2>
      <Calendar statusByDate={statusByDate} selected={selected} onSelect={setSelected} />

      {selected && (
        <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
          <p className="mb-2 font-medium">{selected}</p>
          {workout ? (
            <div>
              <p className="font-medium">{workout.title}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted">
                {[...workout.assigned_workout_exercises]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((e) => (
                    <li key={e.id}>
                      {e.name}
                      {e.sets ? ` — ${e.sets}×${e.reps || "?"}` : e.reps ? ` — ${e.reps}` : ""}
                    </li>
                  ))}
              </ul>
              {workout.completed_at ? (
                <p className="mt-2 text-green-400">Виконано ✓</p>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={markDone}
                  className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
                >
                  {busy ? "Зберігаю…" : "Відмітити виконаним"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-muted">На цю дату тренувань не призначено.</p>
          )}
        </div>
      )}
    </div>
  );
}
