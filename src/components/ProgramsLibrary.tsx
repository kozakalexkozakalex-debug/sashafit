"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProgramExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  position: number;
};

type ProgramDay = {
  id: string;
  title: string;
  position: number;
  program_exercises: ProgramExercise[];
};

type Program = {
  id: string;
  title: string;
  created_at: string;
  program_days: ProgramDay[];
};

export default function ProgramsLibrary() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const [newProgramTitle, setNewProgramTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [newDayTitle, setNewDayTitle] = useState<Record<string, string>>({});

  const [exRows, setExRows] = useState<
    Record<string, { name: string; sets: string; reps: string }>
  >({});

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("programs")
      .select("*, program_days(*, program_exercises(*))")
      .order("created_at", { ascending: false });
    setPrograms((data as unknown as Program[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addProgram() {
    if (!newProgramTitle.trim()) {
      setErr("Вкажи назву програми");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("programs").insert({ title: newProgramTitle.trim() });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setNewProgramTitle("");
    load();
  }

  async function addDay(programId: string) {
    const title = (newDayTitle[programId] || "").trim();
    if (!title) return;
    const { data: existing } = await supabase
      .from("program_days")
      .select("id")
      .eq("program_id", programId);
    const position = existing?.length || 0;
    await supabase.from("program_days").insert({ program_id: programId, title, position });
    setNewDayTitle((prev) => ({ ...prev, [programId]: "" }));
    load();
  }

  async function addExercise(dayId: string) {
    const row = exRows[dayId];
    if (!row || !row.name.trim()) return;
    const { data: existing } = await supabase
      .from("program_exercises")
      .select("id")
      .eq("program_day_id", dayId);
    const position = existing?.length || 0;
    await supabase.from("program_exercises").insert({
      program_day_id: dayId,
      name: row.name.trim(),
      sets: row.sets.trim() ? Number(row.sets) : null,
      reps: row.reps.trim() || null,
      position,
    });
    setExRows((prev) => ({ ...prev, [dayId]: { name: "", sets: "", reps: "" } }));
    load();
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-dashed border-line/80 p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Нова програма</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newProgramTitle}
            onChange={(e) => setNewProgramTitle(e.target.value)}
            placeholder="Назва програми (напр. Силова база)"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addProgram}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            Додати
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Програми ({programs.length})</h2>
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        <div className="flex flex-col gap-2">
          {programs.map((p) => {
            const days = [...p.program_days].sort((a, b) => a.position - b.position);
            const isOpen = openId === p.id;
            return (
              <div key={p.id} className="rounded-lg border border-line p-3 text-sm">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="stamp text-muted">{days.length} дн.</span>
                </button>

                {isOpen && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                    {days.map((d) => {
                      const exercises = [...d.program_exercises].sort(
                        (a, b) => a.position - b.position
                      );
                      return (
                        <div key={d.id} className="border-l-2 border-line bg-paper p-3">
                          <p className="font-display text-sm font-medium">{d.title}</p>
                          <div className="mt-2 flex flex-col">
                            {exercises.map((e, i) => (
                              <div
                                key={e.id}
                                className="flex items-center gap-3 border-b border-line/60 py-1.5 last:border-0"
                              >
                                <span className="font-display text-xs text-accent">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="flex-1">{e.name}</span>
                                <span className="text-xs text-muted">
                                  {e.sets ? `${e.sets}×${e.reps || "?"}` : e.reps || ""}
                                </span>
                              </div>
                            ))}
                            {exercises.length === 0 && (
                              <p className="text-muted">Вправ ще немає.</p>
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              value={exRows[d.id]?.name || ""}
                              onChange={(e) =>
                                setExRows((prev) => ({
                                  ...prev,
                                  [d.id]: { ...(prev[d.id] || { sets: "", reps: "" }), name: e.target.value },
                                }))
                              }
                              placeholder="Вправа"
                              className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                            />
                            <input
                              value={exRows[d.id]?.sets || ""}
                              onChange={(e) =>
                                setExRows((prev) => ({
                                  ...prev,
                                  [d.id]: { ...(prev[d.id] || { name: "", reps: "" }), sets: e.target.value },
                                }))
                              }
                              placeholder="Підходи"
                              className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                            />
                            <input
                              value={exRows[d.id]?.reps || ""}
                              onChange={(e) =>
                                setExRows((prev) => ({
                                  ...prev,
                                  [d.id]: { ...(prev[d.id] || { name: "", sets: "" }), reps: e.target.value },
                                }))
                              }
                              placeholder="Повтори"
                              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => addExercise(d.id)}
                              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex gap-2">
                      <input
                        value={newDayTitle[p.id] || ""}
                        onChange={(e) =>
                          setNewDayTitle((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        placeholder="Назва дня (напр. День 1 — ноги)"
                        className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addDay(p.id)}
                        className="rounded-lg bg-paper px-3 py-1.5 text-xs font-semibold text-accent"
                      >
                        + день
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteProgram(p.id)}
                      className="self-start text-xs text-red-400"
                    >
                      Видалити програму
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && programs.length === 0 && (
            <p className="text-sm text-muted">Програм ще немає.</p>
          )}
        </div>
      </div>
    </div>
  );
}
