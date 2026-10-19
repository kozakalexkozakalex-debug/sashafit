"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Призначення збереженої програми (з кількома днями) клієнту на кілька
// тижнів наперед: кожному дню програми обираємо день тижня, вказуємо
// дату початку і скільки тижнів генерувати.

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

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOfWeek(d: Date) {
  const day = d.getDay(); // 0..6, 0 = неділя
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const res = new Date(d);
  res.setDate(d.getDate() + diffToMonday);
  return res;
}

export default function AssignProgram({
  clientIds,
  onClose,
  onSaved,
}: {
  clientIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState("");
  const [dayWeekday, setDayWeekday] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weeks, setWeeks] = useState("4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    supabase
      .from("programs")
      .select("*, program_days(*, program_exercises(*))")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPrograms((data as unknown as Program[]) || []));
  }, []);

  const program = programs.find((p) => p.id === programId);
  const days = program ? [...program.program_days].sort((a, b) => a.position - b.position) : [];
  const allMapped = days.length > 0 && days.every((d) => dayWeekday[d.id] != null);

  function setDay(dayId: string, idx: number) {
    setDayWeekday((prev) => ({ ...prev, [dayId]: idx }));
    setResult(null);
  }

  async function assign() {
    if (!program || !allMapped) {
      setErr("Обери програму і день тижня для кожного дня");
      return;
    }
    const weeksNum = Number(weeks);
    if (!weeksNum || weeksNum < 1) {
      setErr("Вкажи кількість тижнів");
      return;
    }
    setErr("");
    setBusy(true);
    setResult(null);

    const start = new Date(startDate + "T00:00:00");
    const startKey = toKey(start);
    const monday = mondayOfWeek(start);

    let created = 0;
    let skipped = 0;

    for (const clientId of clientIds) {
      for (let w = 0; w < weeksNum; w++) {
        for (const d of days) {
          const idx = dayWeekday[d.id];
          const weekMonday = new Date(monday);
          weekMonday.setDate(monday.getDate() + w * 7);
          const target = new Date(weekMonday);
          target.setDate(weekMonday.getDate() + idx);
          const key = toKey(target);
          if (key < startKey) continue;

          const { data: existing } = await supabase
            .from("assigned_workouts")
            .select("id")
            .eq("client_id", clientId)
            .eq("date", key)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }

          const { data: aw, error } = await supabase
            .from("assigned_workouts")
            .insert({ client_id: clientId, title: d.title, date: key })
            .select()
            .single();
          if (error || !aw) continue;

          const exercises = [...d.program_exercises].sort((a, b) => a.position - b.position);
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
          created++;
        }
      }
    }

    setBusy(false);
    setResult({ created, skipped });
    onSaved();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Призначити програму{clientIds.length > 1 ? ` (${clientIds.length} клієнтам)` : ""}
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-muted">
          Закрити
        </button>
      </div>

      {programs.length === 0 ? (
        <p className="text-sm text-muted">Спочатку створи програму у вкладці «Програми».</p>
      ) : (
        <div className="flex flex-col gap-3">
          <select
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value);
              setDayWeekday({});
              setResult(null);
            }}
            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm outline-none"
          >
            <option value="">Оберіть програму</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          {program && days.length === 0 && (
            <p className="text-xs text-muted">У цій програмі ще немає днів — додай їх у вкладці «Програми».</p>
          )}

          {days.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-paper p-2">
              <span className="w-28 flex-none text-xs font-medium">{d.title}</span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDay(d.id, idx)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      dayWeekday[d.id] === idx ? "border-accent bg-accent text-paper" : "border-line text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {days.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Дата початку</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Скільки тижнів</label>
                <input
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
                />
              </div>
              <button
                type="button"
                disabled={busy || !allMapped}
                onClick={assign}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
              >
                {busy ? "Призначаю…" : "Призначити"}
              </button>
            </div>
          )}

          {err && <p className="text-sm text-red-400">{err}</p>}
          {result && (
            <p className="text-sm text-green-400">
              Створено {result.created} тренувань
              {result.skipped ? `, пропущено ${result.skipped} (на ці дати вже було тренування)` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
