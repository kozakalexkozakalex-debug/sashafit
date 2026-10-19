"use client";

import { useState } from "react";
import ProductLibrary from "@/components/ProductLibrary";
import RationsLibrary from "@/components/RationsLibrary";

type SubTab = "products" | "rations";

export default function NutritionSection() {
  const [sub, setSub] = useState<SubTab>("products");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5 border-b border-line">
        <button
          type="button"
          onClick={() => setSub("products")}
          className={`-mb-px border-b-2 pb-2 font-display text-sm font-medium transition ${
            sub === "products" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          База продуктів
        </button>
        <button
          type="button"
          onClick={() => setSub("rations")}
          className={`-mb-px border-b-2 pb-2 font-display text-sm font-medium transition ${
            sub === "rations" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Раціони
        </button>
      </div>
      {sub === "products" ? <ProductLibrary /> : <RationsLibrary />}
    </div>
  );
}
