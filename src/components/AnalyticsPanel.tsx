"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

type Checkin = { weight: number | null; created_at: string };
type AssignedWorkout = { date: string; completed_at: string | null };
type FoodEntry = { date: string; calories: number; protein: number; fat: number; carbs: number };
type NutritionTarget = { calories: number | null; protein: number | null } | null;

function daysAgoKey(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function WeightChart({ points }: { points: { date: string; weight: number }[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">Потрібно щонайменше 2 чек-іни, щоб побудувати графік.</p>;
  }
  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const w = 300;
  const h = 100;
  const pad = 10;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.weight - min) / range) * (h - pad * 2);
    return { x, y };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} className="fill-accent" />
      ))}
      <text x={pad} y={h - 2} className="fill-current text-[8px] text-muted">
        {points[0].weight} кг
      </text>
      <text x={w - pad} y={h - 2} textAnchor="end" className="fill-current text-[8px] text-muted">
        {points[points.length - 1].weight} кг
      </text>
    </svg>
  );
}

function MetricChart({
  points,
  target,
  unit,
}: {
  points: { date: string; value: number }[];
  target?: number | null;
  unit: string;
}) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">Потрібно щонайменше 2 дні з записами, щоб побудувати графік.</p>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values, target ?? values[0]);
  const max = Math.max(...values, target ?? values[0]);
  const range = max - min || 1;
  const w = 300;
  const h = 100;
  const pad = 10;

  const toY = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const coords = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * (w - pad * 2),
    y: toY(p.value),
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {target != null && (
        <line x1={pad} y1={toY(target)} x2={w - pad} y2={toY(target)} className="text-muted" stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" />
      )}
      <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} className="fill-accent" />
      ))}
      <text x={pad} y={h - 2} className="fill-current text-[8px] text-muted">
        {Math.round(points[0].value)} {unit}
      </text>
      <text x={w - pad} y={h - 2} textAnchor="end" className="fill-current text-[8px] text-muted">
        {Math.round(points[points.length - 1].value)} {unit}
      </text>
    </svg>
  );
}

export default function AnalyticsPanel({ clientId }: { clientId: string }) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [target, setTarget] = useState<NutritionTarget>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = daysAgoKey(30);

      const [{ data: ci }, { data: wo }, { data: fe }, { data: nt }] = await Promise.all([
        supabase
          .from("checkins")
          .select("weight, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true }),
        supabase
          .from("assigned_workouts")
          .select("date, completed_at")
          .eq("client_id", clientId)
          .gte("date", since),
        supabase
          .from("food_entries")
          .select("date, calories, protein, fat, carbs")
          .eq("client_id", clientId)
          .gte("date", since),
        supabase.from("nutrition_targets").select("calories, protein").eq("client_id", clientId).maybeSingle(),
      ]);

      setCheckins((ci as Checkin[]) || []);
      setWorkouts((wo as AssignedWorkout[]) || []);
      setFood((fe as FoodEntry[]) || []);
      setTarget((nt as NutritionTarget) || null);
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const weightPoints = checkins
    .filter((c) => c.weight != null)
    .map((c) => ({ date: c.created_at.slice(0, 10), weight: c.weight as number }));

  const todayKey = new Date().toISOString().slice(0, 10);
  const pastWorkouts = workouts.filter((w) => w.date <= todayKey);
  const doneCount = pastWorkouts.filter((w) => w.completed_at).length;
  const completionRate = pastWorkouts.length > 0 ? Math.round((doneCount / pastWorkouts.length) * 100) : null;

  const foodByDate: Record<string, FoodEntry[]> = {};
  for (const f of food) {
    (foodByDate[f.date] = foodByDate[f.date] || []).push(f);
  }
  const loggedDays = Object.keys(foodByDate).sort();
  const totalsByDate: Record<string, { calories: number; protein: number; fat: number; carbs: number }> = {};
  for (const d of loggedDays) {
    totalsByDate[d] = foodByDate[d].reduce(
      (acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
        fat: acc.fat + (e.fat || 0),
        carbs: acc.carbs + (e.carbs || 0),
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
  }
  const dailyTotals = loggedDays.map((d) => totalsByDate[d]);
  const avg = (key: "calories" | "protein" | "fat" | "carbs") =>
    dailyTotals.length > 0
      ? Math.round(dailyTotals.reduce((s, d) => s + d[key], 0) / dailyTotals.length)
      : null;

  const caloriePoints = loggedDays.map((d) => ({ date: d, value: totalsByDate[d].calories }));
  const proteinPoints = loggedDays.map((d) => ({ date: d, value: totalsByDate[d].protein }));

  const lastWeight = weightPoints.length > 0 ? weightPoints[weightPoints.length - 1].weight : null;

  return <StatTiles weightPoints={weightPoints} lastWeight={lastWeight} pastWorkouts={pastWorkouts.length} doneCount={doneCount} completionRate={completionRate} loggedDays={loggedDays.length} avgCalories={avg("calories")} target={target} caloriePoints={caloriePoints} proteinPoints={proteinPoints} avgProtein={avg("protein")} avgFat={avg("fat")} avgCarbs={avg("carbs")} />;
}

function StatTiles({
  weightPoints,
  lastWeight,
  pastWorkouts,
  doneCount,
  completionRate,
  loggedDays,
  avgCalories,
  avgProtein,
  avgFat,
  avgCarbs,
  target,
  caloriePoints,
  proteinPoints,
}: {
  weightPoints: { date: string; weight: number }[];
  lastWeight: number | null;
  pastWorkouts: number;
  doneCount: number;
  completionRate: number | null;
  loggedDays: number;
  avgCalories: number | null;
  avgProtein: number | null;
  avgFat: number | null;
  avgCarbs: number | null;
  target: NutritionTarget;
  caloriePoints: { date: string; value: number }[];
  proteinPoints: { date: string; value: number }[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile
        id="weight"
        label="Вага"
        value={lastWeight != null ? `${lastWeight} кг` : "—"}
        open={!!open.weight}
        onToggle={() => toggle("weight")}
      >
        <p className="mb-2 text-xs text-muted">Динаміка ваги</p>
        <WeightChart points={weightPoints} />
      </Tile>

      <Tile
        id="workouts"
        label="Тренування"
        value={completionRate != null ? `${completionRate}%` : "—"}
        open={!!open.workouts}
        onToggle={() => toggle("workouts")}
      >
        {pastWorkouts > 0 ? (
          <p className="text-sm text-muted">
            Виконано {doneCount} з {pastWorkouts} за останні 30 днів ({completionRate}%)
          </p>
        ) : (
          <p className="text-sm text-muted">Ще немає призначених тренувань за останні 30 днів.</p>
        )}
      </Tile>

      <Tile
        id="food"
        label="Харчування"
        value={avgCalories != null ? `${avgCalories} ккал` : "—"}
        open={!!open.food}
        onToggle={() => toggle("food")}
      >
        {loggedDays > 0 ? (
          <>
            <p className="text-sm text-muted">
              {[
                `${avgCalories} ккал`,
                `Б ${avgProtein} / Ж ${avgFat} / В ${avgCarbs} г`,
                `середнє за ${loggedDays} ${loggedDays === 1 ? "день" : "днів"} з записами, останні 30 днів`,
              ].join(", ")}
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="mb-1 text-xs text-muted">
                  Калорії по днях{target?.calories ? ` (пунктир — ціль ${target.calories} ккал)` : ""}
                </p>
                <MetricChart points={caloriePoints} target={target?.calories ?? null} unit="ккал" />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted">
                  Білки по днях{target?.protein ? ` (пунктир — ціль ${target.protein} г)` : ""}
                </p>
                <MetricChart points={proteinPoints} target={target?.protein ?? null} unit="г" />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Ще немає записів харчування за останні 30 днів.</p>
        )}
      </Tile>
    </div>
  );
}

function Tile({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${open ? "col-span-3" : ""}`}>
      <button type="button" onClick={onToggle} className="flex w-full flex-col gap-0.5 p-2.5 text-left sm:flex-row sm:items-end sm:justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-display text-lg font-semibold text-ink">{value}</span>
      </button>
      {open && <div className="border-t border-line p-3">{children}</div>}
    </div>
  );
}
