"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Calendar, { DayStatus } from "@/components/Calendar";

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

type RationItem = {
  id: string;
  name: string;
  grams: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};
type Ration = { id: string; title: string; ration_items: RationItem[] };

export default function CoachClientNutrition({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rations, setRations] = useState<Ration[]>([]);
  const [selectedRationId, setSelectedRationId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

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
    if (t) {
      setCalories(t.calories != null ? String(t.calories) : "");
      setProtein(t.protein != null ? String(t.protein) : "");
      setFat(t.fat != null ? String(t.fat) : "");
      setCarbs(t.carbs != null ? String(t.carbs) : "");
    }
  }

  async function loadRations() {
    const { data } = await supabase
      .from("rations")
      .select("*, ration_items(*)")
      .order("created_at", { ascending: false });
    setRations((data as unknown as Ration[]) || []);
  }

  useEffect(() => {
    load();
    loadRations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const statusByDate: Record<string, DayStatus> = {};
  const dates = Array.from(new Set(entries.map((e) => e.date)));
  for (const d of dates) statusByDate[d] = "done";

  const dayEntries = selected ? entries.filter((e) => e.date === selected) : [];

  async function saveTarget() {
    setBusy(true);
    setSaved(false);
    await supabase.from("nutrition_targets").upsert({
      client_id: clientId,
      calories: calories.trim() ? Number(calories) : null,
      protein: protein.trim() ? Number(protein) : null,
      fat: fat.trim() ? Number(fat) : null,
      carbs: carbs.trim() ? Number(carbs) : null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setSaved(true);
  }

  async function assignRation() {
    if (!selected || !selectedRationId) return;
    const ration = rations.find((r) => r.id === selectedRationId);
    if (!ration) return;
    setAssignBusy(true);
    await supabase.from("food_entries").insert(
      ration.ration_items.map((i) => ({
        client_id: clientId,
        date: selected,
        name: i.name,
        grams: i.grams,
        calories: i.calories,
        protein: i.protein,
        fat: i.fat,
        carbs: i.carbs,
      }))
    );
    setAssignBusy(false);
    setSelectedRationId("");
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Харчування</h3>

      <div className="rounded-lg bg-paper p-3 text-sm">
        <p className="mb-2 font-medium">Ціль на день</p>
        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            disabled={busy}
            onClick={saveTarget}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Зберігаю…" : "Зберегти ціль"}
          </button>
        </div>
        {saved && <p className="mt-1 text-xs text-green-400">Збережено</p>}
      </div>

      <Calendar statusByDate={statusByDate} selected={selected} onSelect={setSelected} />

      {selected && (
        <div className="rounded-lg bg-paper p-3 text-sm">
          <p className="mb-2 font-medium">{selected}</p>
          <div className="flex flex-col gap-1">
            {dayEntries.map((e) => (
              <div key={e.id} className="flex justify-between text-muted">
                <span>
                  {e.name}
                  {e.grams ? ` — ${e.grams} г` : ""}
                </span>
                <span>{Math.round(e.calories)} ккал</span>
              </div>
            ))}
            {dayEntries.length === 0 && <p className="text-muted">Записів немає.</p>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {rations.length === 0 ? (
              <p className="text-muted">Спочатку створи раціон у вкладці «Харчування».</p>
            ) : (
              <>
                <select
                  value={selectedRationId}
                  onChange={(e) => setSelectedRationId(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
                >
                  <option value="">Оберіть раціон</option>
                  {rations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedRationId || assignBusy}
                  onClick={assignRation}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
                >
                  {assignBusy ? "Призначаю…" : "Призначити на цю дату"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
