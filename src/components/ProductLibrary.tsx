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

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("name", { ascending: true });
    setProducts((data as Product[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
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
