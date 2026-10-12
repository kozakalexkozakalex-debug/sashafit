"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Checkin = { weight: number | null; created_at: string };
type AssignedWorkout = { date: string; completed_at: string | null };
type FoodEntry = { date: string; calories: number; protein: number; fat: number; carbs: number };

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

export default function AnalyticsPanel({ clientId }: { clientId: string }) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = daysAgoKey(30);

      const [{ data: ci }, { data: wo }, { data: fe }] = await Promise.all([
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
      ]);

      setCheckins((ci as Checkin[]) || []);
      setWorkouts((wo as AssignedWorkout[]) || []);
      setFood((fe as FoodEntry[]) || []);
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
  const loggedDays = Object.keys(foodByDate);
  const dailyTotals = loggedDays.map((d) =>
    foodByDate[d].reduce(
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

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Аналітика</h2>

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs text-muted">Динаміка ваги</p>
          <WeightChart points={weightPoints} />
        </div>

        <div className="rounded-lg bg-paper p-3 text-sm">
          <p className="mb-1 font-medium">Тренування (останні 30 днів)</p>
          {pastWorkouts.length > 0 ? (
            <p className="text-muted">
              Виконано {doneCount} з {pastWorkouts.length} ({completionRate}%)
            </p>
          ) : (
            <p className="text-muted">Ще немає призначених тренувань у цьому періоді.</p>
          )}
        </div>

        <div className="rounded-lg bg-paper p-3 text-sm">
          <p className="mb-1 font-medium">Харчування (середнє за дні з записами, останні 30 днів)</p>
          {loggedDays.length > 0 ? (
            <p className="text-muted">
              {avg("calories")} ккал · Б {avg("protein")} / Ж {avg("fat")} / В {avg("carbs")} г · за{" "}
              {loggedDays.length} {loggedDays.length === 1 ? "день" : "днів"}
            </p>
          ) : (
            <p className="text-muted">Ще немає записів харчування у цьому періоді.</p>
          )}
        </div>
      </div>
    </div>
  );
}
