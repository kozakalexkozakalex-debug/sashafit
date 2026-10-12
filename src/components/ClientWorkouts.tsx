"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type WorkoutExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  done: boolean;
  position: number;
};

type Workout = {
  id: string;
  title: string;
  created_at: string;
  workout_exercises: WorkoutExercise[];
};

export default function ClientWorkouts({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("workouts")
      .select("*, workout_exercises(*)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setWorkouts((data as unknown as Workout[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function toggleDone(exerciseId: string, done: boolean) {
    // оптимістично оновлюємо на екрані
    setWorkouts((prev) =>
      prev.map((w) => ({
        ...w,
        workout_exercises: w.workout_exercises.map((e) =>
          e.id === exerciseId ? { ...e, done } : e
        ),
      }))
    );
    await supabase.from("workout_exercises").update({ done }).eq("id", exerciseId);
  }

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Тренування</h2>
      <div className="flex flex-col gap-2">
        {workouts.map((w) => {
          const exercises = [...w.workout_exercises].sort((a, b) => a.position - b.position);
          const doneCount = exercises.filter((e) => e.done).length;
          return (
            <div key={w.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{w.title}</span>
                <span className="text-xs text-muted">
                  {doneCount}/{exercises.length}
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {exercises.map((e) => (
                  <label key={e.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={e.done}
                      onChange={(ev) => toggleDone(e.id, ev.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className={e.done ? "text-muted line-through" : ""}>
                      {e.name}
                      {e.sets ? ` — ${e.sets}×${e.reps || "?"}` : e.reps ? ` — ${e.reps}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {workouts.length === 0 && <p className="text-sm text-muted">Тренувань ще немає.</p>}
      </div>
    </div>
  );
}
