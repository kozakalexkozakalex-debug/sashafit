"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Calendar, { DayStatus } from "@/components/Calendar";
import { searchFood, FoodProduct } from "@/lib/foodApi";

type FoodEntry = {
  id: string;
  date: string;
  name: string;
  grams: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type Target = {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
} | null;

type BaseProduct = {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function ClientNutrition({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [target, setTarget] = useState<Target>(null);
  const [selected, setSelected] = useState<string>(todayKey());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [grams, setGrams] = useState("100");
  const [per100, setPer100] = useState<FoodProduct | null>(null);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([]);

  async function load() {
    const { data } = await supabase
      .from("food_entries")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setEntries((data as FoodEntry[]) || []);

    const { data: t } = await supabase
      .from("nutrition_targets")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    setTarget((t as Target) || null);
  }

  async function loadBaseProducts() {
    const { data } = await supabase
      .from("products")
      .select("id, name, calories_per_100, protein_per_100, fat_per_100, carbs_per_100")
      .order("name");
    setBaseProducts((data as BaseProduct[]) || []);
  }

  useEffect(() => {
    load();
    loadBaseProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const statusByDate: Record<string, DayStatus> = {};
  const dates = Array.from(new Set(entries.map((e) => e.date)));
  for (const d of dates) statusByDate[d] = "done";
  // позначаємо минулі дні без записів як пропущені, за останні 60 днів
  for (let i = 1; i <= 60; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (!statusByDate[key]) statusByDate[key] = "missed";
  }

  const dayEntries = entries.filter((e) => e.date === selected);
  const totals = dayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      fat: acc.fat + (e.fat || 0),
      carbs: acc.carbs + (e.carbs || 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const r = await searchFood(query);
    setResults(r);
    setSearching(false);
  }

  function pickProduct(p: FoodProduct) {
    setPer100(p);
    setQuery(p.name);
    setResults([]);
    setGrams("100");
    setCalories(String(p.caloriesPer100));
    setProtein(String(p.proteinPer100));
    setFat(String(p.fatPer100));
    setCarbs(String(p.carbsPer100));
  }

  function onGramsChange(value: string) {
    setGrams(value);
    if (per100) {
      const g = Number(value) || 0;
      setCalories(String(Math.round((per100.caloriesPer100 * g) / 100)));
      setProtein(String(Math.round((per100.proteinPer100 * g) / 10) / 10));
      setFat(String(Math.round((per100.fatPer100 * g) / 10) / 10));
      setCarbs(String(Math.round((per100.carbsPer100 * g) / 10) / 10));
    }
  }

  async function addEntry() {
    if (!query.trim()) {
      setErr("Вкажи назву продукту");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("food_entries").insert({
      client_id: clientId,
      date: selected,
      name: query.trim(),
      grams: grams.trim() ? Number(grams) : null,
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      fat: Number(fat) || 0,
      carbs: Number(carbs) || 0,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setQuery("");
    setPer100(null);
    setGrams("100");
    setCalories("");
    setProtein("");
    setFat("");
    setCarbs("");
    load();
  }

  async function removeEntry(id: string) {
    await supabase.from("food_entries").delete().eq("id", id);
    load();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Харчування</h2>
      <Calendar statusByDate={statusByDate} selected={selected} onSelect={setSelected} />

      <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
        <p className="mb-2 font-medium">{selected}</p>

        <div className="mb-3 flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Ккал</span>
            <span>
              {Math.round(totals.calories)}
              {target?.calories ? ` / ${target.calories}` : ""}
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Білки / Жири / Вуглеводи</span>
            <span>
              {Math.round(totals.protein)} / {Math.round(totals.fat)} / {Math.round(totals.carbs)} г
              {target?.protein ? ` (ціль ${target.protein}/${target.fat ?? "?"}/${target.carbs ?? "?"})` : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {dayEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded bg-surface px-2 py-1">
              <span>
                {e.name}
                {e.grams ? ` — ${e.grams} г` : ""} ({Math.round(e.calories)} ккал)
              </span>
              <button type="button" onClick={() => removeEntry(e.id)} className="text-muted">
                ✕
              </button>
            </div>
          ))}
          {dayEntries.length === 0 && <p className="text-muted">Записів ще немає.</p>}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <div className="relative flex gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPer100(null);
              }}
              placeholder="Пошук продукту (Open Food Facts)"
              className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={doSearch}
              disabled={searching}
              className="rounded-lg bg-surface px-3 py-1.5 text-xs text-accent"
            >
              {searching ? "…" : "Знайти"}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-1 flex max-h-40 flex-col overflow-y-auto rounded-lg border border-line bg-surface">
              {results.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="border-b border-line px-2 py-1.5 text-left text-xs last:border-b-0"
                >
                  {p.name} — {Math.round(p.caloriesPer100)} ккал/100г
                </button>
              ))}
            </div>
          )}

          {baseProducts.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const p = baseProducts.find((bp) => bp.id === e.target.value);
                if (p) {
                  pickProduct({
                    name: p.name,
                    caloriesPer100: p.calories_per_100,
                    proteinPer100: p.protein_per_100,
                    fatPer100: p.fat_per_100,
                    carbsPer100: p.carbs_per_100,
                  });
                }
              }}
              className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            >
              <option value="">Або зі своєї бази продуктів</option>
              {baseProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={grams}
              onChange={(e) => onGramsChange(e.target.value)}
              placeholder="Грам"
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="Ккал"
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="Білки"
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              placeholder="Жири"
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="Вуглеводи"
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={addEntry}
            className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Зберігаю…" : "Додати запис"}
          </button>
          {err && <p className="mt-1 text-red-400">{err}</p>}
        </div>
      </div>
    </div>
  );
}
