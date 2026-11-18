"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { OpenRequest } from "@/components/ClientActivityCalendar";
import { haptic } from "@/lib/telegram";
import { checkinWindow } from "@/lib/checkinWindow";

// Екран «Сьогодні» — перше, що бачить клієнт. Одна головна дія дня
// (чек-ін або тренування), кільця прогресу, звички одним тапом і кнопка «+ Їжа».
// Порожні блоки (нема звичок, нема цілі по калоріях) просто не показуємо.

type WeekWorkout = {
  id: string;
  title: string;
  date: string;
  completed_at: string | null;
  assigned_workout_exercises: { id: string }[];
};
type Habit = { id: string; label: string; icon: string | null; position: number };

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Понеділок поточного тижня (тиждень у нас Пн–Нд).
function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function Ring({ pct, value, label }: { pct: number; value: string; label: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" style={{ stroke: "rgb(var(--c-line))" }} />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              stroke: "rgb(var(--c-accent))",
              transition: "stroke-dashoffset .6s ease",
              filter: "drop-shadow(0 0 4px rgb(var(--c-accent) / 0.55))",
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-ink">
          {value}
        </span>
      </div>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

export default function ClientToday({
  clientId,
  name,
  checkinWeekday,
  onOpen,
}: {
  clientId: string;
  name: string | null;
  checkinWeekday: number;
  onOpen: (kind: OpenRequest["kind"]) => void;
}) {
  const now = new Date();
  const todayKey = toKey(now);

  const [loaded, setLoaded] = useState(false);
  const [week, setWeek] = useState<WeekWorkout[]>([]);
  const [checkinDates, setCheckinDates] = useState<string[]>([]);
  const [kcal, setKcal] = useState(0);
  const [kcalTarget, setKcalTarget] = useState<number | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [doneHabitIds, setDoneHabitIds] = useState<string[]>([]);
  const [coachMsg, setCoachMsg] = useState<{ body: string; has_attachment: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const monday = mondayOf(new Date());
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const [wk, ci, fd, nt, hb] = await Promise.all([
        supabase
          .from("assigned_workouts")
          .select("id, title, date, completed_at, assigned_workout_exercises(id)")
          .eq("client_id", clientId)
          .gte("date", toKey(monday))
          .lte("date", toKey(sunday)),
        supabase
          .from("checkins")
          .select("created_at")
          .eq("client_id", clientId)
          .gte("created_at", toKey(new Date(Date.now() - 8 * 86400000))),
        supabase.from("food_entries").select("calories").eq("client_id", clientId).eq("date", todayKey),
        supabase.from("nutrition_targets").select("calories").eq("client_id", clientId).maybeSingle(),
        supabase
          .from("habits")
          .select("id, label, icon, position")
          .eq("client_id", clientId)
          .order("position", { ascending: true }),
      ]);
      if (cancelled) return;

      setWeek((wk.data as unknown as WeekWorkout[]) || []);
      setCheckinDates(((ci.data as { created_at: string }[]) || []).map((c) => c.created_at.slice(0, 10)));
      setKcal(((fd.data as { calories: number | null }[]) || []).reduce((s, e) => s + (e.calories || 0), 0));
      setKcalTarget((nt.data as { calories: number | null } | null)?.calories ?? null);

      const habitRows = (hb.data as Habit[]) || [];
      setHabits(habitRows);
      if (habitRows.length > 0) {
        const { data: logs } = await supabase
          .from("habit_logs")
          .select("habit_id, done")
          .in("habit_id", habitRows.map((h) => h.id))
          .eq("date", todayKey);
        if (cancelled) return;
        setDoneHabitIds(
          ((logs as { habit_id: string; done: boolean }[]) || []).filter((l) => l.done).map((l) => l.habit_id)
        );
      }
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("body, attachment_kind")
        .eq("client_id", clientId)
        .eq("sender", "coach")
        .order("created_at", { ascending: false })
        .limit(1);
      const m = (lastMsg as { body: string; attachment_kind: string | null }[] | null)?.[0];
      if (!cancelled) setCoachMsg(m ? { body: m.body, has_attachment: !!m.attachment_kind } : null);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function toggleHabit(habitId: string) {
    const wasDone = doneHabitIds.includes(habitId);
    haptic(wasDone ? "tap" : "success");
    // Одразу міняємо на екрані, а в базу пишемо у фоні.
    setDoneHabitIds((ids) => (wasDone ? ids.filter((i) => i !== habitId) : [...ids, habitId]));
    if (wasDone) {
      await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("date", todayKey);
    } else {
      await supabase.from("habit_logs").insert({ habit_id: habitId, date: todayKey, done: true });
    }
  }

  const monday = mondayOf(now);
  const days = WEEKDAYS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = toKey(d);
    return { label, key, num: d.getDate(), workout: week.find((w) => w.date === key) || null };
  });

  const todayWorkout = week.find((w) => w.date === todayKey) || null;
  // Чек-ін можна зробити в свій день і ще 2 дні після нього.
  const win = checkinWindow(now, checkinWeekday, checkinDates);
  const needCheckin = win.open && !win.done;
  const workoutPending = !!todayWorkout && !todayWorkout.completed_at;

  const weekTotal = week.length;
  const weekDone = week.filter((w) => w.completed_at).length;
  const kcalPct = kcalTarget && kcalTarget > 0 ? (kcal / kcalTarget) * 100 : 0;

  const dateLabel = `${WEEKDAYS[(now.getDay() + 6) % 7]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()]}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-muted">{dateLabel}</p>
        <h2 className="font-display text-2xl font-bold text-ink">Привіт, {name || "друже"}!</h2>
      </div>

      {/* Стрічка тижня: крапка — є тренування (заповнена — виконано) */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d.key === todayKey;
          return (
            <div key={d.key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted">{d.label}</span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-accent text-paper" : "text-ink"
                }`}
              >
                {d.num}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  !d.workout
                    ? "bg-transparent"
                    : d.workout.completed_at
                    ? "bg-success"
                    : "border border-brand"
                }`}
              />
            </div>
          );
        })}
      </div>

      {loaded && coachMsg && (
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent/15 text-lg">💬</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">Твій тренер</span>
            <span className="block truncate text-sm font-semibold text-ink">
              {coachMsg.body || (coachMsg.has_attachment ? "Надіслав(ла) фото або відео" : "")}
            </span>
          </span>
        </div>
      )}

      {loaded && (
        <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-4">
          <div className="relative h-24 w-24 flex-none">
            <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90" aria-hidden="true">
              <circle cx="48" cy="48" r="40" fill="none" strokeWidth="9" style={{ stroke: "rgb(var(--c-line))" }} />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - (weekTotal > 0 ? weekDone / weekTotal : 0))}
                style={{
                  stroke: "rgb(var(--c-accent))",
                  transition: "stroke-dashoffset .6s ease",
                  filter: "drop-shadow(0 0 6px rgb(var(--c-accent) / 0.6))",
                }}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-bold text-ink">
                {weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0}%
              </span>
              <span className="text-[10px] text-muted">тиждень</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Прогрес тижня</p>
            <p className="mt-1 text-xs text-muted">
              {weekTotal > 0 ? `Тренувань: ${weekDone} з ${weekTotal}` : "Тренувань на цей тиждень ще немає"}
            </p>
            {kcalTarget ? (
              <p className="text-xs text-muted">
                Калорії сьогодні: {Math.round(kcal)} / {kcalTarget}
              </p>
            ) : null}
            {habits.length > 0 && (
              <p className="text-xs text-muted">
                Звички: {doneHabitIds.length} з {habits.length}
              </p>
            )}
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="h-36 animate-pulse rounded-3xl bg-surface" />
      ) : needCheckin ? (
        <>
          <div className="rounded-3xl bg-accent p-5 text-paper shadow-[0_12px_36px_-10px_rgb(var(--c-accent)/0.6)]">
            <p className="text-xs font-medium text-paper/80">
              {win.late ? "Чек-ін цього тижня ще не зроблено" : "Сьогодні день чек-іна"}
            </p>
            <p className="mt-1 font-display text-2xl font-bold leading-tight">Час зважитись і сфоткатись</p>
            <p className="mt-1 text-sm text-paper/80">Вага, заміри, фото і пара питань — 2 хвилини.</p>
            <button
              type="button"
              onClick={() => onOpen("checkin")}
              className="mt-4 w-full rounded-xl bg-paper py-3 text-sm font-bold text-ink"
            >
              Пройти чек-ін
            </button>
          </div>
          {workoutPending && todayWorkout && (
            <button
              type="button"
              onClick={() => onOpen("workout")}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left"
            >
              <span>
                <span className="block text-xs text-muted">Ще сьогодні</span>
                <span className="block text-sm font-semibold text-ink">🏋 {todayWorkout.title}</span>
              </span>
              <span className="text-sm font-semibold text-brand">Відкрити</span>
            </button>
          )}
        </>
      ) : workoutPending && todayWorkout ? (
        <button
          type="button"
          onClick={() => onOpen("workout")}
          className="flex items-center gap-4 rounded-3xl border border-brand/50 bg-gradient-to-br from-surface to-paper p-5 text-left shadow-[0_12px_36px_-14px_rgb(var(--c-accent)/0.6)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">Тренування сьогодні</span>
            <span className="mt-0.5 block font-display text-xl font-bold leading-tight text-ink">{todayWorkout.title}</span>
            <span className="mt-1 block text-sm text-muted">{todayWorkout.assigned_workout_exercises.length} вправ</span>
          </span>
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-accent text-2xl text-paper shadow-[0_0_24px_rgb(var(--c-accent)/0.6)]">
            ▶
          </span>
        </button>
      ) : todayWorkout ? (
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-display text-xl font-bold text-success">Тренування виконано ✓</p>
          <p className="mt-1 text-sm text-muted">{todayWorkout.title}. Гарна робота, відпочивай.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-display text-xl font-bold text-ink">День відновлення</p>
          <p className="mt-1 text-sm text-muted">
            Сьогодні без тренування. Прогуляйся, випий води, виспись — це теж частина плану.
          </p>
        </div>
      )}

      {loaded && (weekTotal > 0 || kcalTarget || habits.length > 0) && (
        <div className="flex gap-2">
          {weekTotal > 0 && (
            <Ring pct={(weekDone / weekTotal) * 100} value={`${weekDone}/${weekTotal}`} label="Тренування" />
          )}
          {habits.length > 0 && (
            <Ring
              pct={(doneHabitIds.length / habits.length) * 100}
              value={`${doneHabitIds.length}/${habits.length}`}
              label="Звички"
            />
          )}
          {kcalTarget ? (
            <Ring pct={kcalPct} value={`${Math.round(kcalPct)}%`} label="Калорії" />
          ) : null}
        </div>
      )}

      {loaded && habits.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 text-sm font-semibold text-ink">Звички на сьогодні</p>
          <div className="flex flex-col gap-1.5">
            {habits.map((h) => {
              const done = doneHabitIds.includes(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => toggleHabit(h.id)}
                  className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2.5 text-left"
                >
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-sm ${
                      done ? "border-accent bg-accent text-paper" : "border-line text-muted"
                    }`}
                  >
                    {done ? "✓" : h.icon || ""}
                  </span>
                  <span className={`flex-1 text-sm ${done ? "text-muted line-through" : "text-ink"}`}>{h.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loaded && (
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-3">
          <div>
            <p className="text-sm font-semibold text-ink">Харчування</p>
            <p className="text-xs text-muted">
              {Math.round(kcal)}
              {kcalTarget ? ` з ${kcalTarget}` : ""} ккал сьогодні
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpen("food")}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-paper"
          >
            + Їжа
          </button>
        </div>
      )}
    </div>
  );
}
