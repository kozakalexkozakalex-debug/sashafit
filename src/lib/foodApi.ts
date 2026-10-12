// Пошук продуктів через Open Food Facts — безкоштовна відкрита база, без ключа.
// Основний метод — новий пошук search-a-licious (актуальний, стабільніший),
// зі старим cgi/search.pl як резервом, якщо новий раптом не відповість.
export type FoodProduct = {
  name: string;
  caloriesPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
};

function toProducts(rawItems: unknown[]): FoodProduct[] {
  return rawItems
    .map((p) => {
      const item = p as {
        product_name?: string;
        nutriments?: Record<string, number>;
      };
      const n = item.nutriments || {};
      return {
        name: item.product_name || "",
        caloriesPer100: n["energy-kcal_100g"] ?? 0,
        proteinPer100: n["proteins_100g"] ?? 0,
        fatPer100: n["fat_100g"] ?? 0,
        carbsPer100: n["carbohydrates_100g"] ?? 0,
      };
    })
    .filter((p) => p.name.trim());
}

async function searchNew(query: string): Promise<FoodProduct[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(
    query
  )}&page_size=15&fields=product_name,nutriments`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("search-a-licious недоступний");
  const data = await res.json();
  return toProducts((data?.hits as unknown[]) || []);
}

async function searchLegacy(query: string): Promise<FoodProduct[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=15&fields=product_name,nutriments`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return toProducts((data?.products as unknown[]) || []);
}

export async function searchFood(query: string): Promise<FoodProduct[]> {
  if (!query.trim()) return [];
  try {
    const results = await searchNew(query);
    if (results.length > 0) return results;
  } catch {
    /* пробуємо резервний метод нижче */
  }
  return searchLegacy(query);
}
