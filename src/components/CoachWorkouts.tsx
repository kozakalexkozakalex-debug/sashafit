"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Exercise = {
  id?: string;
  name: string;
  sets: string;
  reps: string;
};

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

export default function CoachWorkouts({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Exercise[]>([{ name: "", sets: "", reps: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
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

  function updateRow(i: number, field: keyof Exercise, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", sets: "", reps: "" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveWorkout() {
    const validRows = rows.filter((r) => r.name.trim());
    if (!title.trim() || validRows.length === 0) {
      setErr("Вкажи назву тренування і хоча б одну вправу");
      return;
    }
    setErr("");
    setBusy(true);

    const { data: workout, error } = await supabase
      .from("workouts")
      .insert({ client_id: clientId, title: title.trim() })
      .select()
      .single();

    if (error || !workout) {
      setBusy(false);
      setErr(error?.message || "Помилка збереження");
      return;
    }

    const { error: exErr } = await supabase.from("workout_exercises").insert(
      validRows.map((r, i) => ({
        workout_id: workout.id,
        name: r.name.trim(),
        sets: r.sets.trim() ? Number(r.sets) : null,
        reps: r.reps.trim() || null,
        position: i,
      }))
    );

    setBusy(false);
    if (exErr) {
      setErr(exErr.message);
      return;
    }

    setTitle("");
    setRows([{ name: "", sets: "", reps: "" }]);
    setShowForm(false);
    load();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Тренування</h3>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-paper px-2 py-1 text-xs text-accent"
        >
          {showForm ? "Скасувати" : "+ Нове тренування"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg bg-paper p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Назва тренування (напр. День 1 — ноги)"
            className="mb-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none"
          />
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                  placeholder="Вправа"
                  className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none"
                />
                <input
                  value={r.sets}
                  onChange={(e) => updateRow(i, "sets", e.target.value)}
                  placeholder="Підходи"
                  className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none"
                />
                <input
                  value={r.reps}
                  onChange={(e) => updateRow(i, "reps", e.target.value)}
                  placeholder="Повтори"
                  className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="px-1 text-muted"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="mt-2 text-xs text-accent">
            + додати вправу
          </button>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={saveWorkout}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              {busy ? "Зберігаю…" : "Зберегти тренування"}
            </button>
          </div>
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-2">
          {workouts.map((w) => {
            const exercises = [...w.workout_exercises].sort((a, b) => a.position - b.position);
            const doneCount = exercises.filter((e) => e.done).length;
            return (
              <div key={w.id} className="rounded-lg bg-paper p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{w.title}</span>
                  <span className="text-xs text-muted">
                    {doneCount}/{exercises.length} виконано
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {exercises.map((e) => (
                    <li key={e.id} className={`text-muted ${e.done ? "line-through" : ""}`}>
                      {e.name}
                      {e.sets ? ` — ${e.sets}×${e.reps || "?"}` : e.reps ? ` — ${e.reps}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {workouts.length === 0 && <p className="text-muted">Тренувань ще немає.</p>}
        </div>
      )}
    </div>
  );
}
