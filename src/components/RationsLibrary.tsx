"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { searchFood, FoodProduct } from "@/lib/foodApi";

type RationItem = {
  id: string;
  name: string;
  grams: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  position: number;
};

type Ration = {
  id: string;
  title: string;
  created_at: string;
  ration_items: RationItem[];
};

type BaseProduct = {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
};

export default function RationsLibrary() {
  const [rations, setRations] = useState<Ration[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, FoodProduct[]>>({});
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [calories, setCalories] = useState<Record<string, string>>({});
  const [protein, setProtein] = useState<Record<string, string>>({});
  const [fat, setFat] = useState<Record<string, string>>({});
  const [carbs, setCarbs] = useState<Record<string, string>>({});
  const [per100ByRation, setPer100ByRation] = useState<Record<string, FoodProduct | null>>({});
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("rations")
      .select("*, ration_items(*)")
      .order("created_at", { ascending: false });
    setRations((data as unknown as Ration[]) || []);
    setLoading(false);
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
  }, []);

  async function addRation() {
    if (!newTitle.trim()) {
      setErr("Вкажи назву раціону");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("rations").insert({ title: newTitle.trim() });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setNewTitle("");
    load();
  }

  async function deleteRation(id: string) {
    await supabase.from("rations").delete().eq("id", id);
    load();
  }

  async function doSearch(rationId: string) {
    const q = query[rationId] || "";
    if (!q.trim()) return;
    setSearching((prev) => ({ ...prev, [rationId]: true }));
    const r = await searchFood(q);
    setResults((prev) => ({ ...prev, [rationId]: r }));
    setSearching((prev) => ({ ...prev, [rationId]: false }));
  }

  function pickProduct(rationId: string, p: FoodProduct) {
    setPer100ByRation((prev) => ({ ...prev, [rationId]: p }));
    setQuery((prev) => ({ ...prev, [rationId]: p.name }));
    setResults((prev) => ({ ...prev, [rationId]: [] }));
    setGrams((prev) => ({ ...prev, [rationId]: "100" }));
    setCalories((prev) => ({ ...prev, [rationId]: String(p.caloriesPer100) }));
    setProtein((prev) => ({ ...prev, [rationId]: String(p.proteinPer100) }));
    setFat((prev) => ({ ...prev, [rationId]: String(p.fatPer100) }));
    setCarbs((prev) => ({ ...prev, [rationId]: String(p.carbsPer100) }));
  }

  function onGramsChange(rationId: string, value: string) {
    setGrams((prev) => ({ ...prev, [rationId]: value }));
    const per100 = per100ByRation[rationId];
    if (per100) {
      const g = Number(value) || 0;
      setCalories((prev) => ({ ...prev, [rationId]: String(Math.round((per100.caloriesPer100 * g) / 100)) }));
      setProtein((prev) => ({ ...prev, [rationId]: String(Math.round((per100.proteinPer100 * g) / 10) / 10) }));
      setFat((prev) => ({ ...prev, [rationId]: String(Math.round((per100.fatPer100 * g) / 10) / 10) }));
      setCarbs((prev) => ({ ...prev, [rationId]: String(Math.round((per100.carbsPer100 * g) / 10) / 10) }));
    }
  }

  async function addItem(rationId: string) {
    const name = query[rationId];
    if (!name?.trim()) return;
    const { data: existing } = await supabase
      .from("ration_items")
      .select("id")
      .eq("ration_id", rationId);
    const position = existing?.length || 0;
    await supabase.from("ration_items").insert({
      ration_id: rationId,
      name: name.trim(),
      grams: grams[rationId]?.trim() ? Number(grams[rationId]) : null,
      calories: Number(calories[rationId]) || 0,
      protein: Number(protein[rationId]) || 0,
      fat: Number(fat[rationId]) || 0,
      carbs: Number(carbs[rationId]) || 0,
      position,
    });
    setQuery((prev) => ({ ...prev, [rationId]: "" }));
    setGrams((prev) => ({ ...prev, [rationId]: "" }));
    setCalories((prev) => ({ ...prev, [rationId]: "" }));
    setProtein((prev) => ({ ...prev, [rationId]: "" }));
    setFat((prev) => ({ ...prev, [rationId]: "" }));
    setCarbs((prev) => ({ ...prev, [rationId]: "" }));
    setPer100ByRation((prev) => ({ ...prev, [rationId]: null }));
    load();
  }

  async function removeItem(id: string) {
    await supabase.from("ration_items").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-dashed border-line/80 p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Новий раціон</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Назва раціону (напр. Базовий на схуднення)"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addRation}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            Додати
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Раціони ({rations.length})</h2>
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        <div className="flex flex-col gap-2">
          {rations.map((r) => {
            const items = [...r.ration_items].sort((a, b) => a.position - b.position);
            const isOpen = openId === r.id;
            const totalCal = items.reduce((s, i) => s + (i.calories || 0), 0);
            return (
              <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="text-xs text-muted">
                    {items.length} прод. · {Math.round(totalCal)} ккал
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                    <ul className="flex flex-col gap-0.5 text-muted">
                      {items.map((i) => (
                        <li key={i.id} className="flex items-center justify-between">
                          <span>
                            {i.name}
                            {i.grams ? ` — ${i.grams} г` : ""} ({Math.round(i.calories)} ккал)
                          </span>
                          <button type="button" onClick={() => removeItem(i.id)} className="text-muted">
                            ✕
                          </button>
                        </li>
                      ))}
                      {items.length === 0 && <li>Продуктів ще немає.</li>}
                    </ul>

                    <div className="relative flex gap-2">
                      <input
                        value={query[r.id] || ""}
                        onChange={(e) => {
                          setQuery((prev) => ({ ...prev, [r.id]: e.target.value }));
                          setPer100ByRation((prev) => ({ ...prev, [r.id]: null }));
                        }}
                        placeholder="Пошук продукту (Open Food Facts)"
                        className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => doSearch(r.id)}
                        disabled={searching[r.id]}
                        className="rounded-lg bg-paper px-3 py-1.5 text-xs text-accent"
                      >
                        {searching[r.id] ? "…" : "Знайти"}
                      </button>
                    </div>

                    {(results[r.id]?.length || 0) > 0 && (
                      <div className="flex max-h-40 flex-col overflow-y-auto rounded-lg border border-line bg-paper">
                        {results[r.id].map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => pickProduct(r.id, p)}
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
                            pickProduct(r.id, {
                              name: p.name,
                              caloriesPer100: p.calories_per_100,
                              proteinPer100: p.protein_per_100,
                              fatPer100: p.fat_per_100,
                              carbsPer100: p.carbs_per_100,
                            });
                          }
                        }}
                        className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      >
                        <option value="">Або зі своєї бази продуктів</option>
                        {baseProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <input
                        value={grams[r.id] || ""}
                        onChange={(e) => onGramsChange(r.id, e.target.value)}
                        placeholder="Грам"
                        className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <input
                        value={calories[r.id] || ""}
                        onChange={(e) => setCalories((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Ккал"
                        className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <input
                        value={protein[r.id] || ""}
                        onChange={(e) => setProtein((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Білки"
                        className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <input
                        value={fat[r.id] || ""}
                        onChange={(e) => setFat((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Жири"
                        className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <input
                        value={carbs[r.id] || ""}
                        onChange={(e) => setCarbs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Вуглеводи"
                        className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addItem(r.id)}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper"
                      >
                        + додати
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteRation(r.id)}
                      className="self-start text-xs text-red-400"
                    >
                      Видалити раціон
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && rations.length === 0 && (
            <p className="text-sm text-muted">Раціонів ще немає.</p>
          )}
        </div>
      </div>
    </div>
  );
}
