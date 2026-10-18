"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Призначення готового раціону (з бібліотеки «Харчування → Раціони») клієнту
// на конкретну дату й прийом їжі: кожен продукт раціону копіюється як
// окремий запис у food_entries.

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

const MEALS = ["Сніданок", "Обід", "Вечеря", "Перекус"];

export default function AssignRation({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rations, setRations] = useState<Ration[]>([]);
  const [rationId, setRationId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [meal, setMeal] = useState(MEALS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase
      .from("rations")
      .select("*, ration_items(*)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRations((data as unknown as Ration[]) || []));
  }, []);

  const ration = rations.find((r) => r.id === rationId);

  async function assign() {
    if (!ration) {
      setErr("Обери раціон");
      return;
    }
    if (ration.ration_items.length === 0) {
      setErr("У цьому раціоні ще немає продуктів");
      return;
    }
    setErr("");
    setBusy(true);
    setDone(false);
    const { error } = await supabase.from("food_entries").insert(
      ration.ration_items.map((i) => ({
        client_id: clientId,
        date,
        meal,
        name: i.name,
        grams: i.grams,
        calories: i.calories,
        protein: i.protein,
        fat: i.fat,
        carbs: i.carbs,
      }))
    );
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setDone(true);
    onSaved();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Призначити раціон</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted">
          Закрити
        </button>
      </div>

      {rations.length === 0 ? (
        <p className="text-sm text-muted">
          Спочатку створи раціон у вкладці «Харчування» → «Раціони».
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <select
            value={rationId}
            onChange={(e) => {
              setRationId(e.target.value);
              setDone(false);
            }}
            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm outline-none"
          >
            <option value="">Оберіть раціон</option>
            {rations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({r.ration_items.length} прод.)
              </option>
            ))}
          </select>

          {ration && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted">
              {ration.ration_items.map((i) => (
                <li key={i.id}>
                  {i.name}
                  {i.grams ? ` — ${i.grams} г` : ""} ({Math.round(i.calories)} ккал)
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted">Дата</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Прийом їжі</label>
              <div className="flex flex-wrap gap-1">
                {MEALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeal(m)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      meal === m ? "border-accent bg-accent text-paper" : "border-line text-muted"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !ration}
              onClick={assign}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              {busy ? "Призначаю…" : "Призначити"}
            </button>
          </div>

          {err && <p className="text-sm text-red-400">{err}</p>}
          {done && <p className="text-sm text-green-400">Раціон додано на {date}.</p>}
        </div>
      )}
    </div>
  );
}
