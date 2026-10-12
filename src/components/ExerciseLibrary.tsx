"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  description: string | null;
  photo_path: string | null;
  video_url: string | null;
};

const MUSCLE_GROUPS = [
  "Ноги",
  "Спина",
  "Груди",
  "Плечі",
  "Руки",
  "Прес",
  "Кардіо",
  "Все тіло",
  "Інше",
];

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("exercises").select("*").order("name", { ascending: true });
    setExercises((data as Exercise[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function photoUrl(path: string | null) {
    if (!path) return null;
    return supabase.storage.from("exercises").getPublicUrl(path).data.publicUrl;
  }

  async function addExercise() {
    if (!name.trim()) {
      setErr("Вкажи назву вправи");
      return;
    }
    setErr("");
    setBusy(true);

    let photoPath: string | null = null;
    if (photoFile) {
      const path = `${Date.now()}-${photoFile.name}`;
      const { error: upErr } = await supabase.storage.from("exercises").upload(path, photoFile);
      if (upErr) {
        setBusy(false);
        setErr("Не вдалось завантажити фото: " + upErr.message);
        return;
      }
      photoPath = path;
    }

    const { error } = await supabase.from("exercises").insert({
      name: name.trim(),
      muscle_group: muscleGroup || null,
      equipment: equipment.trim() || null,
      description: description.trim() || null,
      photo_path: photoPath,
      video_url: videoUrl.trim() || null,
    });

    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setEquipment("");
    setDescription("");
    setVideoUrl("");
    setPhotoFile(null);
    load();
  }

  async function deleteExercise(id: string) {
    await supabase.from("exercises").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-dashed border-line/80 p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Нова вправа</h2>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Назва (напр. Присідання зі штангою)"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <select
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="Інвентар (необов'язково)"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Техніка виконання (необов'язково)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-muted"
            />
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Посилання на відео (YouTube, Reels тощо)"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={addExercise}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              {busy ? "Зберігаю…" : "Додати"}
            </button>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Вправи ({exercises.length})</h2>
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => {
            const url = photoUrl(ex.photo_path);
            return (
              <div
                key={ex.id}
                className="flex flex-col overflow-hidden rounded-lg border border-line text-sm"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={ex.name} className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-paper text-xs text-muted">
                    Без фото
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{ex.name}</span>
                    <button
                      type="button"
                      onClick={() => deleteExercise(ex.id)}
                      className="text-xs text-muted"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ex.muscle_group && <span className="stamp text-accent">{ex.muscle_group}</span>}
                    {ex.equipment && <span className="stamp text-muted">{ex.equipment}</span>}
                  </div>
                  {ex.description && <p className="text-muted">{ex.description}</p>}
                  {ex.video_url && (
                    <a
                      href={ex.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      Відео
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {!loading && exercises.length === 0 && (
            <p className="text-sm text-muted">Вправ ще немає.</p>
          )}
        </div>
      </div>
    </div>
  );
}
