"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { openPrintWindow, escapeHtml } from "@/lib/printDoc";

type ProgramExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  position: number;
  exercise_id: string | null;
};

type BaseExercise = { id: string; name: string };

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
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const [newProgramTitle, setNewProgramTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [newDayTitle, setNewDayTitle] = useState<Record<string, string>>({});

  const [exRows, setExRows] = useState<
    Record<string, { exerciseId: string; sets: string; reps: string }>
  >({});
  const [baseExercises, setBaseExercises] = useState<BaseExercise[]>([]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("programs")
      .select("*, program_days(*, program_exercises(*))")
      .order("created_at", { ascending: false });
    setPrograms((data as unknown as Program[]) || []);
    setLoading(false);
  }

  async function loadBaseExercises() {
    const { data } = await supabase.from("exercises").select("id, name").order("name");
    setBaseExercises((data as BaseExercise[]) || []);
  }

  useEffect(() => {
    load();
    loadBaseExercises();
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
    if (!row || !row.exerciseId) return;
    const ex = baseExercises.find((e) => e.id === row.exerciseId);
    if (!ex) return;
    const { data: existing } = await supabase
      .from("program_exercises")
      .select("id")
      .eq("program_day_id", dayId);
    const position = existing?.length || 0;
    await supabase.from("program_exercises").insert({
      program_day_id: dayId,
      exercise_id: ex.id,
      name: ex.name,
      sets: row.sets.trim() ? Number(row.sets) : null,
      reps: row.reps.trim() || null,
      position,
    });
    setExRows((prev) => ({ ...prev, [dayId]: { exerciseId: "", sets: "", reps: "" } }));
    load();
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    load();
  }

  function printProgram(p: Program) {
    const days = [...p.program_days].sort((a, b) => a.position - b.position);
    const body = `
      <h1>${escapeHtml(p.title)}</h1>
      <p class="muted">Програма тренувань · SashaFit</p>
      ${days
        .map((d) => {
          const exercises = [...d.program_exercises].sort((a, b) => a.position - b.position);
          return `<h2>${escapeHtml(d.title)}</h2>
            <table>
              <tr><th>#</th><th>Вправа</th><th>Підходи × повтори</th></tr>
              ${exercises
                .map(
                  (e, i) =>
                    `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${
                      e.sets ? `${e.sets}×${escapeHtml(e.reps || "?")}` : escapeHtml(e.reps || "")
                    }</td></tr>`
                )
                .join("")}
            </table>`;
        })
        .join("")}
    `;
    openPrintWindow(p.title, body);
  }

  async function duplicateProgram(p: Program) {
    setCopyingId(p.id);
    const { data: newProgram } = await supabase
      .from("programs")
      .insert({ title: `${p.title} (копія)` })
      .select("id")
      .single();
    if (newProgram) {
      const days = [...p.program_days].sort((a, b) => a.position - b.position);
      for (const d of days) {
        const { data: newDay } = await supabase
          .from("program_days")
          .insert({ program_id: newProgram.id, title: d.title, position: d.position })
          .select("id")
          .single();
        if (!newDay) continue;
        const exercises = [...d.program_exercises].sort((a, b) => a.position - b.position);
        if (exercises.length > 0) {
          await supabase.from("program_exercises").insert(
            exercises.map((e) => ({
              program_day_id: newDay.id,
              exercise_id: e.exercise_id,
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              position: e.position,
            }))
          );
        }
      }
    }
    setCopyingId(null);
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {programs.map((p) => {
            const days = [...p.program_days].sort((a, b) => a.position - b.position);
            const isOpen = openId === p.id;
            const totalExercises = days.reduce((sum, d) => sum + d.program_exercises.length, 0);
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border-l-2 bg-paper text-sm shadow-sm transition ${
                  isOpen ? "border-accent" : "border-line"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  onKeyDown={(e) => e.key === "Enter" && setOpenId(isOpen ? null : p.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-base font-semibold">{p.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="stamp text-accent">{days.length} {days.length === 1 ? "день" : "дні"}</span>
                      <span className="stamp text-muted">{totalExercises} вправ</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        printProgram(p);
                      }}
                      title="Друк / PDF"
                      className="rounded-full border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                    >
                      🖨
                    </button>
                    <button
                      type="button"
                      disabled={copyingId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateProgram(p);
                      }}
                      title="Дублювати програму"
                      className="rounded-full border border-line px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {copyingId === p.id ? "…" : "⧉"}
                    </button>
                    <span className={`text-lg text-muted transition ${isOpen ? "rotate-180" : ""}`}>⌄</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-3 border-t border-line p-4 pt-3">
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
                          {baseExercises.length === 0 ? (
                            <p className="mt-2 text-xs text-muted">
                              Спочатку додай вправи у вкладці «База вправ».
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <select
                                value={exRows[d.id]?.exerciseId || ""}
                                onChange={(e) =>
                                  setExRows((prev) => ({
                                    ...prev,
                                    [d.id]: {
                                      ...(prev[d.id] || { sets: "", reps: "" }),
                                      exerciseId: e.target.value,
                                    },
                                  }))
                                }
                                className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                              >
                                <option value="">Оберіть вправу</option>
                                {baseExercises.map((ex) => (
                                  <option key={ex.id} value={ex.id}>
                                    {ex.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={exRows[d.id]?.sets || ""}
                                onChange={(e) =>
                                  setExRows((prev) => ({
                                    ...prev,
                                    [d.id]: {
                                      ...(prev[d.id] || { exerciseId: "", reps: "" }),
                                      sets: e.target.value,
                                    },
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
                                    [d.id]: {
                                      ...(prev[d.id] || { exerciseId: "", sets: "" }),
                                      reps: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Повтори"
                                className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                              />
                              <button
                                type="button"
                                disabled={!exRows[d.id]?.exerciseId}
                                onClick={() => addExercise(d.id)}
                                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
                              >
                                +
                              </button>
                            </div>
                          )}
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
