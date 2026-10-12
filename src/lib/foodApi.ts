// Пошук продуктів через Open Food Facts — безкоштовна відкрита база, без ключа.
export type FoodProduct = {
  name: string;
  caloriesPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
};

export async function searchFood(query: string): Promise<FoodProduct[]> {
  if (!query.trim()) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const products = (data?.products as unknown[]) || [];

  return products
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
