"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { searchFood, FoodProduct } from "@/lib/foodApi";

// Один календар для тренувань, харчування і чек-інів клієнта.
// Фільтр зверху перемикає, що саме показувати в клітинках і в деталях дня.

type AWExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  actual_weight: number | null;
  actual_reps: string | null;
  done: boolean;
  exercises: { photo_path: string | null; video_url: string | null } | null;
};
type AssignedWorkout = {
  id: string;
  title: string;
  date: string;
  completed_at: string | null;
  assigned_workout_exercises: AWExercise[];
};
type Draft = { weight: string; reps: string; done: boolean };

type FoodEntry = {
  id: string;
  date: string;
  name: string;
  grams: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  meal: string | null;
};

const MEALS = ["Сніданок", "Обід", "Вечеря", "Перекус"];
type Target = { calories: number | null; protein: number | null; fat: number | null; carbs: number | null } | null;
type BaseProduct = {
  id: string;
  name: string;
  calories_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
};

export type CheckinMarker = {
  id: string;
  date: string; // YYYY-MM-DD, з created_at
  weight: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  comment: string | null;
  photoUrl: string | null;
};

type Filter = "all" | "workout" | "food" | "checkin";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "workout", label: "🏋 Тренування" },
  { id: "food", label: "🍽 Харчування" },
  { id: "checkin", label: "⚖ Чек-іни" },
];

export default function ClientActivityCalendar({
  clientId,
  checkins,
}: {
  clientId: string;
  checkins: CheckinMarker[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // Одразу вибираємо сьогодні, щоб щоденники (тренування/харчування) були
  // відкриті з самого початку — не треба тапати по сьогоднішній клітинці.
  const [selected, setSelected] = useState<string | null>(() => toKey(new Date()));

  // ---- тренування ----
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [wBusy, setWBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  // Дневники тренування і харчування відкриваються поп-апом з іконки під
  // календарем — не займають місця, поки їх не відкрили.
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [foodModalOpen, setFoodModalOpen] = useState(false);

  async function loadWorkouts() {
    const { data } = await supabase
      .from("assigned_workouts")
      .select("*, assigned_workout_exercises(*, exercises(photo_path, video_url))")
      .eq("client_id", clientId);
    setWorkouts((data as unknown as AssignedWorkout[]) || []);
  }

  function exercisePhotoUrl(path: string) {
    return supabase.storage.from("exercises").getPublicUrl(path).data.publicUrl;
  }

  // ---- харчування ----
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [target, setTarget] = useState<Target>(null);
  const [baseProducts, setBaseProducts] = useState<BaseProduct[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [grams, setGrams] = useState("100");
  const [per100, setPer100] = useState<FoodProduct | null>(null);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fBusy, setFBusy] = useState(false);
  const [fErr, setFErr] = useState("");
  const [addingMeal, setAddingMeal] = useState<string | null>(null);

  async function loadFood() {
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
    loadWorkouts();
    loadFood();
    loadBaseProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const workout = selected ? workouts.find((w) => w.date === selected) : null;

  // При перемиканні дня закриваємо поп-апи — інакше можна лишитись дивитись
  // дневник вчорашнього дня, гадаючи, що це сьогоднішній.
  useEffect(() => {
    setWorkoutModalOpen(false);
    setFoodModalOpen(false);
  }, [selected]);

  useEffect(() => {
    if (!workout) return;
    const next: Record<string, Draft> = {};
    for (const e of workout.assigned_workout_exercises) {
      next[e.id] = {
        weight: e.actual_weight != null ? String(e.actual_weight) : "",
        reps: e.actual_reps || "",
        done: e.done,
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  async function saveExercise(exerciseId: string, patch: Partial<Draft>) {
    const draft = { ...drafts[exerciseId], ...patch };
    setDrafts((prev) => ({ ...prev, [exerciseId]: draft }));
    setSavingId(exerciseId);
    await supabase
      .from("assigned_workout_exercises")
      .update({
        actual_weight: draft.weight.trim() ? Number(draft.weight) : null,
        actual_reps: draft.reps.trim() || null,
        done: draft.done,
      })
      .eq("id", exerciseId);
    setSavingId(null);
    loadWorkouts();
  }

  async function markDone() {
    if (!workout) return;
    setWBusy(true);
    await supabase.from("assigned_workouts").update({ completed_at: new Date().toISOString() }).eq("id", workout.id);
    setWBusy(false);
    loadWorkouts();
  }

  function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    searchFood(query)
      .then(setResults)
      .finally(() => setSearching(false));
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

  async function addFoodEntry() {
    if (!selected) return;
    if (!query.trim()) {
      setFErr("Вкажи назву продукту");
      return;
    }
    setFErr("");
    setFBusy(true);
    const { error } = await supabase.from("food_entries").insert({
      client_id: clientId,
      date: selected,
      name: query.trim(),
      grams: grams.trim() ? Number(grams) : null,
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      fat: Number(fat) || 0,
      carbs: Number(carbs) || 0,
      meal: addingMeal,
    });
    setFBusy(false);
    if (error) {
      setFErr(error.message);
      return;
    }
    setQuery("");
    setPer100(null);
    setGrams("100");
    setCalories("");
    setProtein("");
    setFat("");
    setCarbs("");
    setAddingMeal(null);
    loadFood();
  }

  async function removeFoodEntry(id: string) {
    await supabase.from("food_entries").delete().eq("id", id);
    loadFood();
  }

  // ---- побудова сітки місяця ----
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const workoutByDate: Record<string, AssignedWorkout> = {};
  for (const w of workouts) workoutByDate[w.date] = w;
  const foodDates = new Set(entries.map((e) => e.date));
  const checkinByDate: Record<string, CheckinMarker> = {};
  for (const c of checkins) checkinByDate[c.date] = c;

  function workoutStatus(key: string): "planned" | "done" | "missed" | null {
    const w = workoutByDate[key];
    if (!w) return null;
    return w.completed_at ? "done" : key < todayKey ? "missed" : "planned";
  }

  const dayEntries = selected ? entries.filter((e) => e.date === selected) : [];
  const totals = dayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      fat: acc.fat + (e.fat || 0),
      carbs: acc.carbs + (e.carbs || 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const mealGroups: Record<string, FoodEntry[]> = {};
  for (const m of MEALS) mealGroups[m] = [];
  const otherEntries: FoodEntry[] = [];
  for (const e of dayEntries) {
    if (e.meal && MEALS.includes(e.meal)) mealGroups[e.meal].push(e);
    else otherEntries.push(e);
  }
  const caloriesTarget = target?.calories || 0;
  const ringPct = caloriesTarget > 0 ? Math.min(100, Math.round((totals.calories / caloriesTarget) * 100)) : 0;
  const ringR = 26;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc - (ringPct / 100) * ringCirc;

  const selectedCheckin = selected ? checkinByDate[selected] : null;
  const showWorkout = filter === "all" || filter === "workout";
  const showFood = filter === "all" || filter === "food";
  const showCheckin = filter === "all" || filter === "checkin";

  // ---- перемикання вибраного дня стрілками ----
  // Дозволяє "перелистувати" день вперед/назад без тапу по календарю.
  // Коли день переходить в інший місяць — підтягуємо календар за ним.
  function shiftSelectedDay(deltaDays: number) {
    const base = selected ? new Date(selected + "T00:00:00") : new Date();
    base.setDate(base.getDate() + deltaDays);
    setSelected(toKey(base));
  }

  useEffect(() => {
    if (!selected) return;
    const d = new Date(selected + "T00:00:00");
    setCursor((prev) =>
      prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth()
        ? prev
        : new Date(d.getFullYear(), d.getMonth(), 1)
    );
  }, [selected]);

  // ---- наступне тренування (для підказки в заголовку) ----
  const tomorrowKey = toKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const nextWorkout =
    [...workouts]
      .filter((w) => w.date >= todayKey && !w.completed_at)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const FULL_WEEKDAYS = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];

  function nextWorkoutLabel(dateKey: string) {
    const d = new Date(dateKey + "T00:00:00");
    const dm = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (dateKey === todayKey) return `Сьогодні (${dm})`;
    if (dateKey === tomorrowKey) return `Завтра (${dm})`;
    return `${FULL_WEEKDAYS[d.getDay()]} (${dm})`;
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Календар</h2>
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-xl border border-accent/30 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-3 py-2.5">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/20 text-xl">
          🏋
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted">Наступне тренування</p>
          <p className="truncate font-display text-xl font-bold leading-tight text-ink">
            {nextWorkout ? nextWorkoutLabel(nextWorkout.date) : "Не заплановано"}
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              filter === f.id ? "border-accent bg-accent text-paper" : "border-line text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filter === "checkin" && (
        <p className="mb-2 text-[11px] text-muted">Чек-ін вноситься лише в неділю — інші дні неактивні.</p>
      )}

      {/* Компактний календар — завжди зверху, не частина каруселі. Вибір дня тапом
          по клітинці або стрілками "день назад/вперед" нижче. */}
      <div className="mx-auto mb-3 w-full max-w-[220px]">
        <div className="mb-1.5 flex items-center justify-between">
          <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="rounded bg-paper px-2 py-1 text-xs">
            ‹
          </button>
          <span className="text-xs font-medium">
            {MONTHS[month]} {year}
          </span>
          <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="rounded bg-paper px-2 py-1 text-xs">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-0.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = toKey(d);
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const wStatus = showWorkout ? workoutStatus(key) : null;
            const hasFood = showFood && foodDates.has(key);
            const hasCheckin = showCheckin && !!checkinByDate[key];
            const isSunday = d.getDay() === 0;
            const checkinOnlyMode = filter === "checkin";
            const disabledForCheckin = checkinOnlyMode && !isSunday;
            const wColor =
              wStatus === "done"
                ? "bg-green-500/20"
                : wStatus === "missed"
                ? "bg-red-500/15"
                : wStatus === "planned"
                ? "bg-yellow-500/15"
                : "";
            return (
              <button
                key={key}
                type="button"
                disabled={disabledForCheckin}
                onClick={() => setSelected(key)}
                className={`flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] ${
                  wColor || "border-line bg-paper text-muted"
                } ${wColor ? "border-transparent" : ""} ${isToday ? "ring-1 ring-accent" : ""} ${
                  isSelected ? "outline outline-2 outline-accent" : ""
                } ${disabledForCheckin ? "cursor-not-allowed opacity-25" : ""} ${
                  checkinOnlyMode && isSunday ? "border-blue-400/50" : ""
                }`}
              >
                <span className="flex items-center gap-0.5">
                  {d.getDate()}
                  {wStatus && <span className="text-[9px] leading-none">🏋</span>}
                </span>
                <span className="flex gap-0.5">
                  {hasFood && <span className="h-1 w-1 rounded-full bg-accent" />}
                  {hasCheckin && <span className="h-1 w-1 rounded-full bg-blue-400" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mb-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => shiftSelectedDay(-1)}
            aria-label="Попередній день"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm text-muted"
          >
            ‹
          </button>
          <p className="text-xs font-medium text-ink">{selected}</p>
          <button
            type="button"
            onClick={() => shiftSelectedDay(1)}
            aria-label="Наступний день"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-sm text-muted"
          >
            ›
          </button>
        </div>
      )}

      {/* Під календарем — дві іконки замість завжди відкритих дневників: тап
          відкриває поп-ап знизу з тренуванням або харчуванням за вибраний день.
          Колір іконки одразу підказує стан, не відкриваючи поп-ап. */}
      {selected && (
        <div className="mb-1 flex items-center justify-center gap-4">
          {showWorkout && (
            <button
              type="button"
              onClick={() => setWorkoutModalOpen(true)}
              aria-label="Тренування"
              className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
                !workout
                  ? "bg-red-500/15 text-red-400"
                  : workout.completed_at
                  ? "bg-green-500/15 text-green-400"
                  : "bg-accent/15 text-accent"
              }`}
            >
              🏋
            </button>
          )}
          {showFood && (
            <button
              type="button"
              onClick={() => setFoodModalOpen(true)}
              aria-label="Харчування"
              className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
                dayEntries.length > 0 ? "bg-accent/15 text-accent" : "bg-line/30 text-muted"
              }`}
            >
              🍽
            </button>
          )}
        </div>
      )}

      {workoutModalOpen && selected && showWorkout && (
        <div className="fixed inset-0 z-40" onClick={() => setWorkoutModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-xl lg:border"
          >
            <div className="relative rounded-lg bg-paper p-3 text-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-medium text-ink">🏋 {workout ? workout.title : "Тренування"}</p>
              <button type="button" onClick={() => setWorkoutModalOpen(false)} className="text-xs text-muted">
                Закрити
              </button>
            </div>
            {!workout && <p className="mt-1.5 text-muted">На цей день тренування не призначено.</p>}
            {workout && (
            <>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {[...workout.assigned_workout_exercises]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((e) => {
                  const draft = drafts[e.id] || { weight: "", reps: "", done: false };
                  return (
                    <div key={e.id} className="rounded-lg bg-surface p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ink">{e.name}</span>
                        <span className="text-[11px] text-muted">
                          {e.sets ? `план: ${e.sets}×${e.reps || "?"}` : e.reps ? `план: ${e.reps}` : ""}
                        </span>
                      </div>
                      {e.exercises?.photo_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={exercisePhotoUrl(e.exercises.photo_path)}
                          alt={`Фото вправи: ${e.name}`}
                          className="mt-1 max-h-28 rounded-lg object-cover"
                        />
                      )}
                      {e.exercises?.video_url && (
                        <a href={e.exercises.video_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-accent underline">
                          Відео техніки
                        </a>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <input
                          value={draft.weight}
                          onChange={(ev) => setDrafts((prev) => ({ ...prev, [e.id]: { ...draft, weight: ev.target.value } }))}
                          onBlur={() => saveExercise(e.id, { weight: draft.weight })}
                          disabled={!!workout.completed_at}
                          inputMode="decimal"
                          placeholder="Вага, кг"
                          className="w-16 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] outline-none disabled:opacity-60"
                        />
                        <input
                          value={draft.reps}
                          onChange={(ev) => setDrafts((prev) => ({ ...prev, [e.id]: { ...draft, reps: ev.target.value } }))}
                          onBlur={() => saveExercise(e.id, { reps: draft.reps })}
                          disabled={!!workout.completed_at}
                          placeholder="Повтори"
                          className="w-20 rounded-lg border border-line bg-paper px-2 py-1 text-[11px] outline-none disabled:opacity-60"
                        />
                        <label className="flex items-center gap-1 text-[11px] text-muted">
                          <input
                            type="checkbox"
                            checked={draft.done}
                            onChange={(ev) => saveExercise(e.id, { done: ev.target.checked })}
                            disabled={!!workout.completed_at}
                          />
                          Виконано
                        </label>
                        {savingId === e.id && <span className="text-[11px] text-muted">Зберігаю…</span>}
                      </div>
                    </div>
                  );
                })}
            </div>
            {!workout.completed_at && (
              <button
                type="button"
                disabled={wBusy}
                onClick={markDone}
                className="mt-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
              >
                {wBusy ? "Зберігаю…" : "Відмітити виконаним"}
              </button>
            )}
            {workout.completed_at && (
              <span className="absolute right-2 top-2 rounded-full border border-green-400 bg-paper px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-green-400">
                Виконано ✓
              </span>
            )}
            </>
            )}
            </div>
          </div>
        </div>
      )}

      {foodModalOpen && selected && showFood && (
        <div className="fixed inset-0 z-40" onClick={() => setFoodModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-xl lg:border"
          >
          <div className="rounded-lg bg-paper p-3 text-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-medium text-ink">🍽 Харчування</p>
              <button type="button" onClick={() => setFoodModalOpen(false)} className="text-xs text-muted">
                Закрити
              </button>
            </div>
            <div className="mb-3 flex items-center gap-3">
              <svg width="64" height="64" viewBox="0 0 64 64" className="flex-none -rotate-90">
                <circle cx="32" cy="32" r={ringR} fill="none" stroke="currentColor" className="text-line" strokeWidth="6" />
                <circle
                  cx="32"
                  cy="32"
                  r={ringR}
                  fill="none"
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                />
                <text x="32" y="34" textAnchor="middle" transform="rotate(90 32 32)" className="fill-ink" style={{ font: "700 13px var(--font-sans, sans-serif)" }}>
                  {Math.round(totals.calories)}
                </text>
              </svg>
              <div className="flex flex-1 flex-col gap-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">🍽 Ккал</span>
                  <span className="font-medium">
                    {Math.round(totals.calories)}
                    {target?.calories ? ` з ${target.calories}` : ""}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Білки</span>
                  <span>
                    {Math.round(totals.protein)} г{target?.protein ? ` з ${target.protein}` : ""}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Жири</span>
                  <span>
                    {Math.round(totals.fat)} г{target?.fat ? ` з ${target.fat}` : ""}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Вуглеводи</span>
                  <span>
                    {Math.round(totals.carbs)} г{target?.carbs ? ` з ${target.carbs}` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {[...MEALS, ...(otherEntries.length > 0 ? ["Інше"] : [])].map((meal) => {
                const list = meal === "Інше" ? otherEntries : mealGroups[meal];
                const isAdding = addingMeal === meal;
                return (
                  <div key={meal} className="rounded-lg bg-surface px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{meal}</span>
                      {meal !== "Інше" && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingMeal(isAdding ? null : meal);
                            setFErr("");
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent"
                        >
                          +
                        </button>
                      )}
                    </div>

                    {list.length > 0 && (
                      <div className="mt-1 flex flex-col gap-1">
                        {list.map((e) => (
                          <div key={e.id} className="flex items-center justify-between rounded bg-paper px-2 py-1 text-xs">
                            <span>
                              {e.name}
                              {e.grams ? ` — ${e.grams} г` : ""} ({Math.round(e.calories)} ккал)
                            </span>
                            <button type="button" onClick={() => removeFoodEntry(e.id)} className="text-muted">
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {isAdding && (
                      <div className="mt-2 border-t border-line pt-2">
                        <div className="relative flex gap-1.5">
                          <input
                            value={query}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setPer100(null);
                            }}
                            placeholder="Пошук продукту"
                            className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
                          />
                          <button type="button" onClick={doSearch} disabled={searching} className="rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-accent">
                            {searching ? "…" : "Знайти"}
                          </button>
                        </div>

                        {results.length > 0 && (
                          <div className="mt-1 flex max-h-32 flex-col overflow-y-auto rounded-lg border border-line bg-paper">
                            {results.map((p, i) => (
                              <button key={i} type="button" onClick={() => pickProduct(p)} className="border-b border-line px-2 py-1.5 text-left text-[11px] last:border-b-0">
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
                            className="mt-1.5 w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none"
                          >
                            <option value="">Або зі своєї бази продуктів</option>
                            {baseProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}

                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <input value={grams} onChange={(e) => onGramsChange(e.target.value)} placeholder="Грам" className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none" />
                          <input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Ккал" className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none" />
                          <input value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Білки" className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none" />
                          <input value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Жири" className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none" />
                          <input value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="Вуглеводи" className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-[11px] outline-none" />
                        </div>
                        <button
                          type="button"
                          disabled={fBusy}
                          onClick={addFoodEntry}
                          className="mt-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
                        >
                          {fBusy ? "Зберігаю…" : "Додати запис"}
                        </button>
                        {fErr && <p className="mt-1 text-xs text-red-400">{fErr}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {selected && showCheckin && selectedCheckin && (
        <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
          <p className="font-medium text-ink">⚖ Чек-ін: {selectedCheckin.weight} кг</p>
          {(selectedCheckin.waist != null || selectedCheckin.hips != null || selectedCheckin.chest != null) && (
            <p className="text-xs text-muted">
              {[
                selectedCheckin.waist != null ? `Талія ${selectedCheckin.waist} см` : null,
                selectedCheckin.hips != null ? `Стегна ${selectedCheckin.hips} см` : null,
                selectedCheckin.chest != null ? `Груди ${selectedCheckin.chest} см` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {selectedCheckin.comment && <p className="text-xs text-muted">{selectedCheckin.comment}</p>}
          {selectedCheckin.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedCheckin.photoUrl} alt="Фото чек-іну" className="mt-1.5 max-h-40 rounded-lg object-cover" />
          )}
        </div>
      )}
    </div>
  );
}
