"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabaseClient";

// Конструктор тренування: тягнеш вправи з бібліотеки (зліва) у список
// тренування на обрану дату (справа), одразу вказуєш підходи/повтори.

type Exercise = { id: string; name: string; muscle_group: string | null; equipment: string | null };

type WorkoutItem = {
  uid: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
};

const MUSCLE_GROUPS = ["Ноги", "Спина", "Груди", "Плечі", "Руки", "Прес", "Кардіо", "Все тіло", "Інше"];

function LibraryExercise({ ex }: { ex: Exercise }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib-${ex.id}`,
    data: { type: "library", exercise: ex },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab touch-none rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {ex.name}
      {ex.equipment && <span className="ml-1 text-muted">· {ex.equipment}</span>}
    </div>
  );
}

function WorkoutRow({
  item,
  onChange,
  onRemove,
}: {
  item: WorkoutItem;
  onChange: (patch: Partial<WorkoutItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border border-line bg-surface p-2 text-sm ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none select-none text-muted active:cursor-grabbing"
      >
        ⠿
      </span>
      <span className="flex-1 truncate">{item.name}</span>
      <input
        value={item.sets}
        onChange={(e) => onChange({ sets: e.target.value })}
        inputMode="numeric"
        placeholder="Підх."
        className="w-14 rounded border border-line bg-paper px-1.5 py-1 text-xs outline-none"
      />
      <input
        value={item.reps}
        onChange={(e) => onChange({ reps: e.target.value })}
        placeholder="Повт."
        className="w-16 rounded border border-line bg-paper px-1.5 py-1 text-xs outline-none"
      />
      <button type="button" onClick={onRemove} className="text-muted">
        ✕
      </button>
    </div>
  );
}

export default function WorkoutBuilder({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase
      .from("exercises")
      .select("id, name, muscle_group, equipment")
      .order("name")
      .then(({ data }) => setExercises((data as Exercise[]) || []));
  }, []);

  const byGroup = useMemo(() => {
    const map: Record<string, Exercise[]> = {};
    for (const ex of exercises) {
      const g = ex.muscle_group || "Інше";
      (map[g] = map[g] || []).push(ex);
    }
    return map;
  }, [exercises]);

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "workout-dropzone" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  function addItem(ex: Exercise, atIndex?: number) {
    const item: WorkoutItem = {
      uid: `${ex.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      exerciseId: ex.id,
      name: ex.name,
      sets: "",
      reps: "",
    };
    setItems((prev) => {
      if (atIndex == null) return [...prev, item];
      const next = [...prev];
      next.splice(atIndex, 0, item);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeData = active.data.current as { type?: string; exercise?: Exercise } | undefined;

    if (activeData?.type === "library" && activeData.exercise) {
      if (over.id === "workout-dropzone") {
        addItem(activeData.exercise);
        return;
      }
      const overIndex = items.findIndex((i) => i.uid === over.id);
      addItem(activeData.exercise, overIndex !== -1 ? overIndex : undefined);
      return;
    }

    if (active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.uid === active.id);
        const newIndex = prev.findIndex((i) => i.uid === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function updateItem(uid: string, patch: Partial<WorkoutItem>) {
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  async function save() {
    if (items.length === 0) {
      setErr("Додай хоча б одну вправу");
      return;
    }
    setErr("");
    setBusy(true);

    const { data: aw, error } = await supabase
      .from("assigned_workouts")
      .insert({ client_id: clientId, title: `Тренування ${date}`, date })
      .select()
      .single();

    if (error || !aw) {
      setBusy(false);
      setErr(error?.message || "Помилка збереження");
      return;
    }

    const { error: exErr } = await supabase.from("assigned_workout_exercises").insert(
      items.map((it, i) => ({
        assigned_workout_id: aw.id,
        exercise_id: it.exerciseId,
        name: it.name,
        sets: it.sets.trim() ? Number(it.sets) : null,
        reps: it.reps.trim() || null,
        position: i,
      }))
    );

    setBusy(false);
    if (exErr) {
      setErr(exErr.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Призначити тренування</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted">
          Закрити
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-muted">Дата:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none"
        />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 rounded-lg border border-line bg-paper p-2">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">База вправ</p>
            {exercises.length === 0 && (
              <p className="text-xs text-muted">Спочатку додай вправи у вкладці «Програми → База вправ».</p>
            )}
            <div className="flex flex-col gap-1.5">
              {MUSCLE_GROUPS.filter((g) => byGroup[g]?.length).map((g) => (
                <div key={g}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup((prev) => (prev === g ? null : g))}
                    className="flex w-full items-center justify-between py-1 text-left text-xs font-medium"
                  >
                    <span>
                      {g} ({byGroup[g].length})
                    </span>
                    <span className="text-muted">{openGroup === g ? "–" : "+"}</span>
                  </button>
                  {openGroup === g && (
                    <div className="mb-1 flex flex-col gap-1 pl-1">
                      {byGroup[g].map((ex) => (
                        <LibraryExercise key={ex.id} ex={ex} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            ref={setDropRef}
            className={`flex-1 rounded-lg border p-2 ${
              isOver ? "border-accent bg-accent/5" : "border-line bg-paper"
            }`}
          >
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Тренування на {date}</p>
            <SortableContext items={items.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1.5">
                {items.map((item) => (
                  <WorkoutRow
                    key={item.uid}
                    item={item}
                    onChange={(patch) => updateItem(item.uid, patch)}
                    onRemove={() => removeItem(item.uid)}
                  />
                ))}
              </div>
            </SortableContext>
            {items.length === 0 && (
              <p className="py-4 text-center text-xs text-muted">Перетягни вправи сюди зліва</p>
            )}
          </div>
        </div>
      </DndContext>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {busy ? "Зберігаю…" : "Зберегти тренування"}
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
}
