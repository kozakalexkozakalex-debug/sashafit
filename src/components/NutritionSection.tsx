"use client";

import { useState } from "react";
import ProductLibrary from "@/components/ProductLibrary";
import RationsLibrary from "@/components/RationsLibrary";

type SubTab = "products" | "rations";

export default function NutritionSection() {
  const [sub, setSub] = useState<SubTab>("products");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-5">
        <button
          type="button"
          onClick={() => setSub("products")}
          className={`font-display text-sm font-medium ${
            sub === "products" ? "text-accent" : "text-muted"
          }`}
        >
          База продуктів
        </button>
        <button
          type="button"
          onClick={() => setSub("rations")}
          className={`font-display text-sm font-medium ${
            sub === "rations" ? "text-accent" : "text-muted"
          }`}
        >
          Раціони
        </button>
      </div>
      {sub === "products" ? <ProductLibrary /> : <RationsLibrary />}
    </div>
  );
}
