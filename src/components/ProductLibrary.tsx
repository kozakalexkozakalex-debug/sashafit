"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Product = {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
};

export default function ProductLibrary() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("name", { ascending: true });
    setProducts((data as Product[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct() {
    if (!name.trim()) {
      setErr("Вкажи назву продукту");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("products").insert({
      name: name.trim(),
      calories_per_100: Number(calories) || 0,
      protein_per_100: Number(protein) || 0,
      fat_per_100: Number(fat) || 0,
      carbs_per_100: Number(carbs) || 0,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setCalories("");
    setProtein("");
    setFat("");
    setCarbs("");
    load();
  }

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-dashed border-line/80 p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Новий продукт</h2>
        <p className="mb-2 text-xs text-muted">
          Значення на 100 г — звідси система сама порахує на будь-яку вагу.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Назва (напр. Гречка варена)"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            inputMode="decimal"
            placeholder="Ккал/100г"
            className="w-24 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            inputMode="decimal"
            placeholder="Білки"
            className="w-20 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            inputMode="decimal"
            placeholder="Жири"
            className="w-20 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            inputMode="decimal"
            placeholder="Вуглеводи"
            className="w-24 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addProduct}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Зберігаю…" : "Додати"}
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Продукти ({products.length})</h2>
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        <div className="flex flex-col gap-2">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"
            >
              <div>
                <span className="font-medium">{p.name}</span>
                <p className="text-xs text-muted">
                  {Math.round(p.calories_per_100)} ккал, Б {p.protein_per_100} / Ж {p.fat_per_100} / В{" "}
                  {p.carbs_per_100} г на 100г
                </p>
              </div>
              <button type="button" onClick={() => deleteProduct(p.id)} className="text-xs text-muted">
                ✕
              </button>
            </div>
          ))}
          {!loading && products.length === 0 && (
            <p className="text-sm text-muted">Продуктів ще немає.</p>
          )}
        </div>
      </div>
    </div>
  );
}
