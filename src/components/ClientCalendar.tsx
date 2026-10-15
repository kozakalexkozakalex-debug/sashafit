"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Calendar, { DayStatus } from "@/components/Calendar";

type AWExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  actual_weight: number | null;
  actual_reps: string | null;
  done: boolean;
  exercises: { photo_path: string | null; video_url: string | null } | null;
};
type AssignedWorkout = {
  id: string;
  title: string;
  date: string;
  completed_at: string | null;
  assigned_workout_exercises: AWExercise[];
};

type Draft = { weight: string; reps: string; done: boolean };

export default function ClientCalendar({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("assigned_workouts")
      .select("*, assigned_workout_exercises(*, exercises(photo_path, video_url))")
      .eq("client_id", clientId);
    setWorkouts((data as unknown as AssignedWorkout[]) || []);
  }

  function exercisePhotoUrl(path: string) {
    return supabase.storage.from("exercises").getPublicUrl(path).data.publicUrl;
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

  useEffect(() => {
    if (!workout) return;
    const next: Record<string, Draft> = {};
    for (const e of workout.assigned_workout_exercises) {
      next[e.id] = {
        weight: e.actual_weight != null ? String(e.actual_weight) : "",
        reps: e.actual_reps || "",
        done: e.done,
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  async function saveExercise(exerciseId: string, patch: Partial<Draft>) {
    const draft = { ...drafts[exerciseId], ...patch };
    setDrafts((prev) => ({ ...prev, [exerciseId]: draft }));
    setSavingId(exerciseId);
    await supabase
      .from("assigned_workout_exercises")
      .update({
        actual_weight: draft.weight.trim() ? Number(draft.weight) : null,
        actual_reps: draft.reps.trim() || null,
        done: draft.done,
      })
      .eq("id", exerciseId);
    setSavingId(null);
    load();
  }

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
              <div className="mt-2 flex flex-col gap-2">
                {[...workout.assigned_workout_exercises]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((e) => {
                    const draft = drafts[e.id] || { weight: "", reps: "", done: false };
                    return (
                      <div key={e.id} className="rounded-lg bg-surface p-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink">{e.name}</span>
                          <span className="text-xs text-muted">
                            {e.sets ? `план: ${e.sets}×${e.reps || "?"}` : e.reps ? `план: ${e.reps}` : ""}
                          </span>
                        </div>
                        {e.exercises?.photo_path && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={exercisePhotoUrl(e.exercises.photo_path)}
                            alt={`Фото вправи: ${e.name}`}
                            className="mt-1.5 max-h-32 rounded-lg object-cover"
                          />
                        )}
                        {e.exercises?.video_url && (
                          <a
                            href={e.exercises.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs text-accent underline"
                          >
                            Відео техніки
                          </a>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <input
                            value={draft.weight}
                            onChange={(ev) => setDrafts((prev) => ({ ...prev, [e.id]: { ...draft, weight: ev.target.value } }))}
                            onBlur={() => saveExercise(e.id, { weight: draft.weight })}
                            inputMode="decimal"
                            placeholder="Вага, кг"
                            className="w-20 rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
                          />
                          <input
                            value={draft.reps}
                            onChange={(ev) => setDrafts((prev) => ({ ...prev, [e.id]: { ...draft, reps: ev.target.value } }))}
                            onBlur={() => saveExercise(e.id, { reps: draft.reps })}
                            placeholder="Повтори"
                            className="w-24 rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={draft.done}
                              onChange={(ev) => saveExercise(e.id, { done: ev.target.checked })}
                            />
                            Виконано
                          </label>
                          {savingId === e.id && <span className="text-xs text-muted">Зберігаю…</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
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
