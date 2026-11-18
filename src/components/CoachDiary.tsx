"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import Avatar from "@/components/Avatar";
import { useAvatars } from "@/lib/useAvatars";

type Client = { id: string; name: string | null; invite_code: string; avatar_path: string | null; profile_id: string | null };
type Tab = "training" | "nutrition" | "habits" | "checkins";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const TABS: { id: Tab; label: string }[] = [
  { id: "training", label: "Тренування" },
  { id: "nutrition", label: "Харчування" },
  { id: "habits", label: "Звички" },
  { id: "checkins", label: "Чек-іни" },
];

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

type Workout = { id: string; title: string; client_id: string; completed_at: string | null };
type Checkin = { id: string; client_id: string; weight: number | null; reviewed_at: string | null };

// «Щоденник» тренера: що відбувається в обраний день у всіх клієнтів —
// тренування, харчування, звички, чек-іни.
export default function CoachDiary({ onOpenClient }: { onOpenClient: (clientId: string) => void }) {
  const todayKey = toKey(new Date());
  const [day, setDay] = useState(todayKey);
  const [tab, setTab] = useState<Tab>("training");
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [kcal, setKcal] = useState<Record<string, number>>({});
  const [habitDone, setHabitDone] = useState<Record<string, number>>({});
  const [habitTotal, setHabitTotal] = useState<Record<string, number>>({});
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);

  const avatars = useAvatars(clients);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, invite_code, avatar_path, profile_id")
      .then(({ data }) => setClients(((data as Client[]) || []).filter((c) => c.profile_id)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const [wo, fo, hb, hl, ci] = await Promise.all([
        supabase.from("assigned_workouts").select("id, title, client_id, completed_at").eq("date", day),
        supabase.from("food_entries").select("client_id, calories").eq("date", day),
        supabase.from("habits").select("id, client_id"),
        supabase.from("habit_logs").select("habit_id, done").eq("date", day),
        supabase
          .from("checkins")
          .select("id, client_id, weight, reviewed_at")
          .gte("created_at", day)
          .lt("created_at", toKey(next)),
      ]);
      if (cancelled) return;
      setWorkouts((wo.data as Workout[]) || []);
      const k: Record<string, number> = {};
      for (const r of (fo.data as { client_id: string; calories: number | null }[]) || [])
        k[r.client_id] = (k[r.client_id] || 0) + (r.calories || 0);
      setKcal(k);
      const owner: Record<string, string> = {};
      const total: Record<string, number> = {};
      for (const h of (hb.data as { id: string; client_id: string }[]) || []) {
        owner[h.id] = h.client_id;
        total[h.client_id] = (total[h.client_id] || 0) + 1;
      }
      const done: Record<string, number> = {};
      for (const l of (hl.data as { habit_id: string; done: boolean }[]) || []) {
        if (l.done && owner[l.habit_id]) done[owner[l.habit_id]] = (done[owner[l.habit_id]] || 0) + 1;
      }
      setHabitDone(done);
      setHabitTotal(total);
      setCheckins((ci.data as Checkin[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [day]);

  const monday = mondayOf(new Date(day));
  const days = WEEKDAYS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label, key: toKey(d), num: d.getDate() };
  });
  function shiftWeek(dir: number) {
    const d = new Date(day);
    d.setDate(d.getDate() + dir * 7);
    setDay(toKey(d));
  }

  const byId = (id: string) => clients.find((c) => c.id === id);
  const nameOf = (id: string) => (byId(id) ? clientLabel(byId(id)!) : "Клієнт");

  function Row({ clientId, title, sub, right }: { clientId: string; title: string; sub?: string; right?: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={() => onOpenClient(clientId)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
      >
        <Avatar name={nameOf(clientId)} url={avatars[clientId]} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        {right}
      </button>
    );
  }

  const nutritionIds = Object.keys(kcal);
  const habitIds = Object.keys(habitTotal);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-ink">Щоденник</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Минулий тиждень" className="h-8 w-8 rounded-full border border-line text-muted">
            ‹
          </button>
          <button type="button" onClick={() => setDay(todayKey)} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
            Сьогодні
          </button>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Наступний тиждень" className="h-8 w-8 rounded-full border border-line text-muted">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDay(d.key)}
            className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 ${
              d.key === day ? "bg-accent text-paper shadow-[0_10px_28px_-10px_rgb(var(--c-accent)/0.7)]" : "text-ink"
            }`}
          >
            <span className={`text-[10px] ${d.key === day ? "text-paper/80" : "text-muted"}`}>{d.label}</span>
            <span className="text-sm font-bold">{d.num}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-none rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              tab === t.id ? "bg-accent text-paper" : "border border-line text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Завантаження…</p>
      ) : tab === "training" ? (
        workouts.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">У цей день тренувань не призначено.</p>
        ) : (
          workouts.map((w) => (
            <Row
              key={w.id}
              clientId={w.client_id}
              title={w.title}
              sub={nameOf(w.client_id)}
              right={
                <span className={`flex-none text-xs font-semibold ${w.completed_at ? "text-success" : "text-muted"}`}>
                  {w.completed_at ? "✓ Виконано" : "Заплановано"}
                </span>
              }
            />
          ))
        )
      ) : tab === "nutrition" ? (
        nutritionIds.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Ніхто не записав їжу в цей день.</p>
        ) : (
          nutritionIds.map((id) => (
            <Row key={id} clientId={id} title={nameOf(id)} sub="Харчування" right={<span className="flex-none text-sm font-semibold text-ink">{Math.round(kcal[id])} ккал</span>} />
          ))
        )
      ) : tab === "habits" ? (
        habitIds.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Звичок поки не призначено.</p>
        ) : (
          habitIds.map((id) => (
            <Row
              key={id}
              clientId={id}
              title={nameOf(id)}
              sub="Звички"
              right={
                <span className={`flex-none text-sm font-semibold ${(habitDone[id] || 0) >= habitTotal[id] ? "text-success" : "text-ink"}`}>
                  {habitDone[id] || 0} з {habitTotal[id]}
                </span>
              }
            />
          ))
        )
      ) : checkins.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">У цей день чек-інів немає.</p>
      ) : (
        checkins.map((c) => (
          <Row
            key={c.id}
            clientId={c.client_id}
            title={nameOf(c.client_id)}
            sub={c.weight != null ? `Вага ${c.weight} кг` : "Чек-ін"}
            right={<span className={`flex-none text-xs font-semibold ${c.reviewed_at ? "text-success" : "text-brand"}`}>{c.reviewed_at ? "Перевірено" : "Нове"}</span>}
          />
        ))
      )}
    </div>
  );
}
