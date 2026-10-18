"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import CoachCheckins from "@/components/CoachCheckins";

type SubTab = "checkins" | "clients" | "workouts" | "food";
type Period = 7 | 30 | 90;

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
type NutritionTarget = {
  client_id: string;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

function daysAgoKey(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayKeyFn() {
  return new Date().toISOString().slice(0, 10);
}

// Ріжемо період на тижневі відрізки (від найстарішого до сьогодні) для графіків по тижнях.
function buildWeekBuckets(period: number) {
  const dates: string[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const buckets: { label: string; dates: string[] }[] = [];
  for (let i = 0; i < dates.length; i += 7) {
    const chunk = dates.slice(i, i + 7);
    const start = new Date(chunk[0]);
    buckets.push({ label: `${start.getDate()}.${start.getMonth() + 1}`, dates: chunk });
  }
  return buckets;
}

// Згруповані стовпчики «заплановано / виконано» по тижнях — чистий inline SVG, без зовнішніх бібліотек.
function WeeklyBarChart({ data }: { data: { label: string; planned: number; completed: number }[] }) {
  const w = 480;
  const h = 140;
  const padL = 10;
  const padB = 18;
  const chartW = w - padL - 10;
  const chartH = h - padB - 10;
  const max = Math.max(1, ...data.map((b) => Math.max(b.planned, b.completed)));
  const n = Math.max(1, data.length);
  const slot = chartW / n;
  const barW = Math.min(16, slot / 2.6);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Заплановано і виконано тренувань по тижнях" className="w-full">
      <line x1={padL} y1={chartH + 10} x2={w - 10} y2={chartH + 10} stroke="currentColor" className="text-line" strokeWidth={1} />
      {data.map((b, i) => {
        const x = padL + i * slot + slot / 2;
        const hPlanned = (b.planned / max) * chartH;
        const hDone = (b.completed / max) * chartH;
        return (
          <g key={i}>
            <rect x={x - barW - 1} y={chartH + 10 - hPlanned} width={barW} height={hPlanned} className="fill-line" rx={1.5} />
            <rect x={x + 1} y={chartH + 10 - hDone} width={barW} height={hDone} className="fill-accent" rx={1.5} />
            <text x={x} y={h - 4} textAnchor="middle" className="fill-muted" fontSize="7">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Лінійний графік тренду (наприклад, середні калорії по тижнях), з опційною пунктирною лінією-ціллю.
function TrendLineChart({ points, target }: { points: { label: string; value: number }[]; target?: number | null }) {
  const w = 480;
  const h = 140;
  const padL = 10;
  const padB = 18;
  const chartW = w - padL - 10;
  const chartH = h - padB - 10;
  const values = points.map((p) => p.value);
  const max = Math.max(1, target || 0, ...values);
  const n = points.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const toY = (v: number) => chartH + 10 - (v / max) * chartH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${padL + i * stepX} ${toY(p.value)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Динаміка середніх калорій по тижнях" className="w-full">
      <line x1={padL} y1={chartH + 10} x2={w - 10} y2={chartH + 10} stroke="currentColor" className="text-line" strokeWidth={1} />
      {target != null && target > 0 && (
        <line
          x1={padL}
          x2={w - 10}
          y1={toY(target)}
          y2={toY(target)}
          stroke="currentColor"
          className="text-muted"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      {n > 1 && <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />}
      {points.map((p, i) => (
        <circle key={i} cx={padL + i * stepX} cy={toY(p.value)} r={2.3} className="fill-accent" />
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={`t${i}`} x={padL + i * stepX} y={h - 4} textAnchor="middle" className="fill-muted" fontSize="7">
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-24 rounded-full bg-line">
      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function CoachAnalytics() {
  const [sub, setSub] = useState<SubTab>("checkins");
  const [period, setPeriod] = useState<Period>(30);
  const [clients, setClients] = useState<Client[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [targets, setTargets] = useState<NutritionTarget[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = daysAgoKey(period);

      const [{ data: cl }, { data: ci }, { data: wo }, { data: fe }, { data: nt }] = await Promise.all([
        supabase.from("clients").select("id, name, invite_code, profile_id"),
        supabase.from("checkins").select("client_id, weight, created_at").order("created_at", { ascending: true }),
        supabase.from("assigned_workouts").select("client_id, date, completed_at").gte("date", since),
        supabase.from("food_entries").select("client_id, date, calories, protein, fat, carbs").gte("date", since),
        supabase.from("nutrition_targets").select("client_id, calories, protein, fat, carbs"),
      ]);

      setClients((cl as Client[]) || []);
      setCheckins((ci as Checkin[]) || []);
      setWorkouts((wo as AssignedWorkout[]) || []);
      setFood((fe as FoodEntry[]) || []);
      setTargets((nt as NutritionTarget[]) || []);
      setLoading(false);
    })();
  }, [period]);

  useEffect(() => {
    if (!selectedClientId && clients.length > 0) setSelectedClientId(clients[0].id);
  }, [clients, selectedClientId]);

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const todayKey = todayKeyFn();
  const connected = clients.filter((c) => c.profile_id).length;

  const pastWorkouts = workouts.filter((w) => w.date <= todayKey);
  const doneCount = pastWorkouts.filter((w) => w.completed_at).length;
  const overallCompletion =
    pastWorkouts.length > 0 ? Math.round((doneCount / pastWorkouts.length) * 100) : null;

  const weekBuckets = buildWeekBuckets(period);
  const workoutChartData = weekBuckets.map((b) => {
    const inBucket = pastWorkouts.filter((w) => b.dates.includes(w.date));
    return {
      label: b.label,
      planned: inBucket.length,
      completed: inBucket.filter((w) => w.completed_at).length,
    };
  });

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

  const targetsWithCalories = targets.filter((t) => t.calories != null && t.calories > 0);
  const avgTargetCalories =
    targetsWithCalories.length > 0
      ? Math.round(targetsWithCalories.reduce((s, t) => s + (t.calories || 0), 0) / targetsWithCalories.length)
      : null;

  const calorieChartData = weekBuckets.map((b) => {
    const rows = food.filter((f) => b.dates.includes(f.date));
    const byDay: Record<string, number> = {};
    for (const f of rows) {
      const key = `${f.client_id}_${f.date}`;
      byDay[key] = (byDay[key] || 0) + (f.calories || 0);
    }
    const values = Object.values(byDay);
    const avgCal = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    return { label: b.label, value: avgCal };
  });

  const foodLoggedClientIds = new Set(food.map((f) => f.client_id));

  function clientStats(clientId: string) {
    const cw = pastWorkouts.filter((w) => w.client_id === clientId);
    const cDone = cw.filter((w) => w.completed_at).length;
    const rate = cw.length > 0 ? Math.round((cDone / cw.length) * 100) : null;

    const cCheckins = checkins.filter((c) => c.client_id === clientId && c.weight != null);
    const lastWeight = cCheckins.length > 0 ? cCheckins[cCheckins.length - 1].weight : null;
    const firstWeight = cCheckins.length > 0 ? cCheckins[0].weight : null;

    const cDaysLogged = new Set(food.filter((f) => f.client_id === clientId).map((f) => f.date)).size;
    const foodRate = Math.round((cDaysLogged / period) * 100);

    const cFoodByDay: Record<string, number> = {};
    for (const f of food.filter((f) => f.client_id === clientId)) {
      cFoodByDay[f.date] = (cFoodByDay[f.date] || 0) + (f.calories || 0);
    }
    const cDayValues = Object.values(cFoodByDay);
    const avgCal = cDayValues.length > 0 ? Math.round(cDayValues.reduce((s, v) => s + v, 0) / cDayValues.length) : null;

    const ownTarget = targets.find((t) => t.client_id === clientId)?.calories ?? null;

    return { rate, total: cw.length, lastWeight, firstWeight, foodRate, daysLogged: cDaysLogged, avgCal, ownTarget };
  }

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedWeightSeries = selectedClient
    ? checkins
        .filter((c) => c.client_id === selectedClient.id && c.weight != null)
        .map((c) => ({
          label: new Date(c.created_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
          value: c.weight as number,
        }))
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "checkins", label: "📋 Чек-іни" },
            { id: "clients", label: "👥 Клієнти" },
            { id: "workouts", label: "🏋 Тренування" },
            { id: "food", label: "🍽 Харчування" },
          ] as { id: SubTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              sub === t.id ? "border-accent bg-accent text-paper" : "border-line bg-paper text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {([7, 30, 90] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              period === p ? "border-accent bg-accent text-paper" : "border-line bg-paper text-muted hover:text-ink"
            }`}
          >
            {p} дн.
          </button>
        ))}
      </div>

      {sub === "checkins" && <CoachCheckins />}

      {sub === "clients" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Зведення</h2>
            <div className="grid grid-cols-2 gap-3">
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

          {clients.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Динаміка ваги</h2>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {clientLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedWeightSeries.length > 1 ? (
                <TrendLineChart points={selectedWeightSeries} />
              ) : (
                <p className="text-sm text-muted">Замало чек-інів з вагою для графіка.</p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — вага та статус</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => {
                const s = clientStats(c.id);
                const delta =
                  s.lastWeight != null && s.firstWeight != null ? Math.round((s.lastWeight - s.firstWeight) * 10) / 10 : null;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-line p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-medium">{clientLabel(c)}</span>
                      {!c.profile_id && <span className="stamp ml-2 text-accent">очікує</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-muted">
                      {delta != null && delta !== 0 && (
                        <span className={delta < 0 ? "text-green-400" : "text-red-400"}>
                          {delta > 0 ? `+${delta}` : delta} кг за {period} дн.
                        </span>
                      )}
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
            <h2 className="mb-3 text-sm font-semibold">Зведення ({period} дн.)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Виконання тренувань</p>
                <p className="font-display text-lg font-medium">
                  {overallCompletion != null ? `${overallCompletion}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Заплановано</p>
                <p className="font-display text-lg font-medium">{pastWorkouts.length}</p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Виконано</p>
                <p className="font-display text-lg font-medium">{doneCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Заплановано vs виконано по тижнях</h2>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-line" /> заплановано
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> виконано
                </span>
              </div>
            </div>
            {pastWorkouts.length > 0 ? (
              <WeeklyBarChart data={workoutChartData} />
            ) : (
              <p className="text-sm text-muted">За цей період тренувань ще не призначено.</p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — виконання</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => {
                const s = clientStats(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-line p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="truncate font-medium">{clientLabel(c)}</span>
                    <div className="flex items-center gap-3">
                      {s.rate != null && <ProgressBar pct={s.rate} />}
                      <span className="text-muted sm:w-20 sm:text-right">
                        {s.rate != null ? `${s.rate}% (${s.total})` : "—"}
                      </span>
                    </div>
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
            <h2 className="mb-3 text-sm font-semibold">Зведення ({period} дн.)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Середньо ккал/день</p>
                <p className="font-display text-lg font-medium">{avg("calories") ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Логує харчування</p>
                <p className="font-display text-lg font-medium">
                  {foodLoggedClientIds.size} / {clients.length}
                </p>
              </div>
              <div className="rounded-lg bg-paper p-3">
                <p className="text-xs text-muted">Середня ціль ккал</p>
                <p className="font-display text-lg font-medium">{avgTargetCalories ?? "—"}</p>
              </div>
            </div>
            {dailyTotals.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Білки {avg("protein")} / Жири {avg("fat")} / Вуглеводи {avg("carbs")} г в середньому за день
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Середні калорії по тижнях</h2>
              {avgTargetCalories != null && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <span className="inline-block h-0.5 w-3 bg-muted" /> середня ціль
                </span>
              )}
            </div>
            {food.length > 0 ? (
              <TrendLineChart points={calorieChartData} target={avgTargetCalories} />
            ) : (
              <p className="text-sm text-muted">За цей період записів харчування ще немає.</p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">По клієнтах — хто логує</h2>
            <div className="flex flex-col gap-2">
              {clients.map((c) => {
                const s = clientStats(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-line p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="truncate font-medium">{clientLabel(c)}</span>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      {s.avgCal != null && (
                        <span className="text-muted">
                          {s.avgCal} ккал/день
                          {s.ownTarget ? ` (ціль ${s.ownTarget})` : ""}
                        </span>
                      )}
                      <ProgressBar pct={s.foodRate} />
                      <span className="text-muted sm:w-24 sm:text-right">
                        {s.daysLogged} з {period} дн.
                      </span>
                    </div>
                  </div>
                );
              })}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
