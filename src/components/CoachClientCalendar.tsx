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

type ProgramExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  position: number;
  exercise_id: string | null;
};
type ProgramDay = { id: string; title: string; position: number; program_exercises: ProgramExercise[] };
type Program = { id: string; title: string; program_days: ProgramDay[] };

export default function CoachClientCalendar({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const { data } = await supabase
      .from("assigned_workouts")
      .select("*, assigned_workout_exercises(*)")
      .eq("client_id", clientId);
    setWorkouts((data as unknown as AssignedWorkout[]) || []);
  }

  async function loadPrograms() {
    const { data } = await supabase
      .from("programs")
      .select("*, program_days(*, program_exercises(*))")
      .order("created_at", { ascending: false });
    setPrograms((data as unknown as Program[]) || []);
  }

  useEffect(() => {
    load();
    loadPrograms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const statusByDate: Record<string, DayStatus> = {};
  const todayKey = new Date().toISOString().slice(0, 10);
  for (const w of workouts) {
    statusByDate[w.date] = w.completed_at ? "done" : w.date < todayKey ? "missed" : "planned";
  }

  const workoutForSelected = selected ? workouts.find((w) => w.date === selected) : null;
  const program = programs.find((p) => p.id === selectedProgramId);
  const days = program ? [...program.program_days].sort((a, b) => a.position - b.position) : [];

  async function assign() {
    if (!selected || !selectedDayId) return;
    const day = days.find((d) => d.id === selectedDayId);
    if (!day) return;
    setErr("");
    setBusy(true);

    const { data: aw, error } = await supabase
      .from("assigned_workouts")
      .insert({ client_id: clientId, title: day.title, date: selected })
      .select()
      .single();

    if (error || !aw) {
      setBusy(false);
      setErr(error?.message || "Помилка призначення");
      return;
    }

    const exercises = [...day.program_exercises].sort((a, b) => a.position - b.position);
    if (exercises.length > 0) {
      await supabase.from("assigned_workout_exercises").insert(
        exercises.map((e, i) => ({
          assigned_workout_id: aw.id,
          exercise_id: e.exercise_id,
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          position: i,
        }))
      );
    }

    setBusy(false);
    setSelectedProgramId("");
    setSelectedDayId("");
    load();
  }

  async function unassign(id: string) {
    await supabase.from("assigned_workouts").delete().eq("id", id);
    setSelected(null);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Календар тренувань</h3>
      <Calendar statusByDate={statusByDate} selected={selected} onSelect={setSelected} />

      {selected && (
        <div className="rounded-lg bg-paper p-3 text-sm">
          <p className="mb-2 font-medium">{selected}</p>

          {workoutForSelected ? (
            <div>
              <p>
                {workoutForSelected.title} —{" "}
                {workoutForSelected.completed_at ? "виконано" : "заплановано"}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted">
                {[...workoutForSelected.assigned_workout_exercises]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((e) => (
                    <li key={e.id}>
                      {e.name}
                      {e.sets ? ` — ${e.sets}×${e.reps || "?"}` : e.reps ? ` — ${e.reps}` : ""}
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                onClick={() => unassign(workoutForSelected.id)}
                className="mt-2 text-xs text-red-400"
              >
                Скасувати призначення
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {programs.length === 0 ? (
                <p className="text-muted">Спочатку створи програму у вкладці «Програми».</p>
              ) : (
                <>
                  <select
                    value={selectedProgramId}
                    onChange={(e) => {
                      setSelectedProgramId(e.target.value);
                      setSelectedDayId("");
                    }}
                    className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="">Оберіть програму</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  {program && (
                    <select
                      value={selectedDayId}
                      onChange={(e) => setSelectedDayId(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                    >
                      <option value="">Оберіть день</option>
                      {days.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={!selectedDayId || busy}
                    onClick={assign}
                    className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
                  >
                    {busy ? "Призначаю…" : "Призначити на цю дату"}
                  </button>
                </>
              )}
              {err && <p className="text-red-400">{err}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
