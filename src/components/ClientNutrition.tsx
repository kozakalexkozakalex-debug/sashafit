"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Entry = { id: string; name: string; grams: number | null; calories: number; protein: number; fat: number; carbs: number };
type Target = { calories: number | null; protein: number | null; fat: number | null; carbs: number | null };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Bar({ label, value, target, unit, color }: { label: string; value: number; target: number | null; unit: string; color: string }) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">
        {Math.round(value)}
        <span className="text-xs font-normal text-muted"> {target ? `/ ${Math.round(target)} ` : ""}{unit}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{target ? `${pct}%` : "ціль не задана"}</p>
    </div>
  );
}

// Вкладка «Харчування»: калорії і БЖУ за сьогодні проти цілі + список страв.
export default function ClientNutrition({ clientId, onAddFood }: { clientId: string; onAddFood: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [fe, nt] = await Promise.all([
        supabase
          .from("food_entries")
          .select("id, name, grams, calories, protein, fat, carbs")
          .eq("client_id", clientId)
          .eq("date", todayKey())
          .order("created_at", { ascending: true }),
        supabase.from("nutrition_targets").select("calories, protein, fat, carbs").eq("client_id", clientId).maybeSingle(),
      ]);
      setEntries((fe.data as Entry[]) || []);
      setTarget((nt.data as Target | null) ?? null);
      setLoading(false);
    })();
  }, [clientId]);

  const sum = (k: "calories" | "protein" | "fat" | "carbs") => entries.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  const kcal = sum("calories");
  const kcalPct = target?.calories ? Math.min(100, Math.round((kcal / target.calories) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold text-ink">Харчування</h2>

      <div className="rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted">Калорії</p>
          <p className="font-display text-2xl font-bold text-ink">{kcalPct}%</p>
        </div>
        <p className="font-display text-lg font-bold text-ink">
          {Math.round(kcal)}
          <span className="text-sm font-normal text-muted"> {target?.calories ? `/ ${Math.round(target.calories)} ` : ""}ккал</span>
        </p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper">
          <div
            className="h-full rounded-full bg-accent shadow-[0_0_12px_rgb(var(--c-accent)/0.7)]"
            style={{ width: `${kcalPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Bar label="Білки" value={sum("protein")} target={target?.protein ?? null} unit="г" color="bg-info" />
        <Bar label="Вуглеводи" value={sum("carbs")} target={target?.carbs ?? null} unit="г" color="bg-success" />
        <Bar label="Жири" value={sum("fat")} target={target?.fat ?? null} unit="г" color="bg-warn" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Сьогодні з&apos;їдено</p>
      </div>
      {loading ? (
        <div className="h-20 animate-pulse rounded-2xl bg-surface" />
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Поки нічого не записано.</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-paper text-lg">🍽</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{e.name}</span>
              <span className="block truncate text-xs text-muted">
                {e.grams ? `${e.grams} г · ` : ""}Б {Math.round(e.protein)} · В {Math.round(e.carbs)} · Ж {Math.round(e.fat)}
              </span>
            </span>
            <span className="flex-none text-sm font-semibold text-ink">{Math.round(e.calories)} ккал</span>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={onAddFood}
        className="rounded-2xl bg-accent py-3.5 text-sm font-bold text-paper shadow-[0_12px_36px_-10px_rgb(var(--c-accent)/0.6)]"
      >
        + Додати їжу
      </button>
    </div>
  );
}
