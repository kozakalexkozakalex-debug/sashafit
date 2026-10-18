"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";

type SubTab = "clients" | "workouts" | "food";

type Client = { id: string; name: string | null; invite_code: string; profile_id: string | null };
type Checkin = { client_id: string; weight: number | null; created_at: string };
type AssignedWorkout = { client_id: string; date: string; completed_at: string | null };
type FoodEntry = {
  client_id: string;
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

function daysAgoKey(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function CoachAnalytics() {
  const [sub, setSub] = useState<SubTab>("clients");
  const [clients, setClients] = useState<Client[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = daysAgoKey(30);

      const [{ data: cl }, { data: ci }, { data: wo }, { data: fe }] = await Promise.all([
        supabase.from("clients").select("id, name, invite_code, profile_id"),
        supabase.from("checkins").select("client_id, weight, created_at").order("created_at", { ascending: true }),
        supabase.from("assigned_workouts").select("client_id, date, completed_at").gte("date", since),
        supabase.from("food_entries").select("client_id, date, calories, protein, fat, carbs").gte("date", since),
      ]);

      setClients((cl as Client[]) || []);
      setCheckins((ci as Checkin[]) || []);
      setWorkouts((wo as AssignedWorkout[]) || []);
      setFood((fe as FoodEntry[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const connected = clients.filter((c) => c.profile_id).length;

  const pastWorkouts = workouts.filter((w) => w.date <= todayKey);
  const doneCount = pastWorkouts.filter((w) => w.completed_at).length;
  const overallCompletion =
    pastWorkouts.length > 0 ? Math.round((doneCount / pastWorkouts.length) * 100) : null;

  const foodByDate: Record<string, FoodEntry[]> = {};
  for (const f of food) (foodByDate[`${f.client_id}_${f.date}`] = foodByDate[`${f.client_id}_${f.date}`] || []).push(f);
  const dailyTotals = Object.values(foodByDate).map((rows) =>
    rows.reduce(
      (acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
        fat: acc.fat + (e.fat || 0),
        carbs: acc.carbs + (e.carbs || 0),
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    )
  );
  const avg = (key: "calories" | "protein" | "fat" | "carbs") =>
    dailyTotals.length > 0
      ? Math.round(dailyTotals.reduce((s, d) => s + d[key], 0) / dailyTotals.length)
      : null;

  function clientStats(clientId: string) {
    const cw = pastWorkouts.filter((w) => w.client_id === clientId);
    const cDone = cw.filter((w) => w.completed_at).length;
    const rate = cw.length > 0 ? Math.round((cDone / cw.length) * 100) : null;

    const cCheckins = checkins.filter((c) => c.client_id === clientId && c.weight != null);
    const lastWeight = cCheckins.length > 0 ? cCheckins[cCheckins.length - 1].weight : null;

    return { rate, total: cw.length, lastWeight };
  }

  const foodLoggedClientIds = new Set(food.map((f) => f.client_id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5">
        <button
          type="button"
          onClick={() => setSub("clients")}
          className={`font-display text-sm font-medium ${
            sub === "clients" ? "text-accent" : "text-muted"
          }`}
        >
          Клієнти
        </button>
        <button
          type="button"
          onClick={() => setSub("workouts")}
          className={`font-display text-sm font-medium ${
            sub === "workouts" ? "text-accent" : "text-muted"
          }`}
        >
          Тренування
        </button>
        <button
          type="button"
          onClick={() => setSub("food")}
          className={`font-display text-sm font-medium ${
            sub === "food" ? "text-accent" : "text-muted"
          }`}
        >
          Харчування
        </button>
      </div>

      {sub === "clients" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Зведення</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Клієнтів</p>
                <p className="font-display text-lg font-medium">{clients.length}</p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Підключено</p>
                <p className="font-display text-lg font-medium">{connected}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — вага та статус</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => {
                const s = clientStats(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">{clientLabel(c)}</span>
                      {!c.profile_id && <span className="stamp ml-2 text-accent">очікує</span>}
                    </div>
                    <div className="flex gap-4 text-muted">
                      <span>{s.lastWeight != null ? `${s.lastWeight} кг` : "—"}</span>
                    </div>
                  </div>
                );
              })}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>
        </div>
      )}

      {sub === "workouts" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Зведення (30 дн.)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Виконання тренувань</p>
                <p className="font-display text-lg font-medium">
                  {overallCompletion != null ? `${overallCompletion}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Призначено тренувань</p>
                <p className="font-display text-lg font-medium">{pastWorkouts.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — виконання</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => {
                const s = clientStats(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"
                  >
                    <span className="font-medium">{clientLabel(c)}</span>
                    <span className="text-muted">{s.rate != null ? `${s.rate}% (${s.total})` : "—"}</span>
                  </div>
                );
              })}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>
        </div>
      )}

      {sub === "food" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Зведення (30 дн.)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Середньо ккал/день</p>
                <p className="font-display text-lg font-medium">{avg("calories") ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Логує харчування</p>
                <p className="font-display text-lg font-medium">{foodLoggedClientIds.size}</p>
              </div>
            </div>
            {dailyTotals.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Білки {avg("protein")} / Жири {avg("fat")} / Вуглеводи {avg("carbs")} г в середньому за день
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — хто логує</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"
                >
                  <span className="font-medium">{clientLabel(c)}</span>
                  <span className="text-muted">
                    {foodLoggedClientIds.has(c.id) ? "логує" : "не логує"}
                  </span>
                </div>
              ))}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
