"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORY_ICONS } from "@/lib/exerciseIcons";

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

const ALL_GROUPS = "Всі";

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [addOpen, setAddOpen] = useState(false);
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);
  const [fillingIcons, setFillingIcons] = useState(false);

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
    setAddOpen(false);
    load();
  }

  async function deleteExercise(id: string) {
    await supabase.from("exercises").delete().eq("id", id);
    load();
  }

  // Додати/замінити картинку вже існуючій вправі — не треба видаляти й
  // створювати заново. Можна завантажити хоч схематичну картинку, якщо нема фото.
  async function uploadPhotoForExisting(id: string, file: File) {
    setPhotoUploadingId(id);
    const path = `${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("exercises").upload(path, file);
    if (!upErr) {
      await supabase.from("exercises").update({ photo_path: path }).eq("id", id);
      load();
    }
    setPhotoUploadingId(null);
  }

  const visibleExercises = groupFilter === ALL_GROUPS ? exercises : exercises.filter((ex) => ex.muscle_group === groupFilter);
  const missingPhotoCount = exercises.filter((ex) => !ex.photo_path).length;

  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Одним натисканням заповнює фото всім вправам без фото — однотипна
  // схематична іконка за групою м'язів (одна й та сама картинка на групу,
  // завантажується в сховище один раз і перевикористовується).
  async function fillMissingPhotosWithIcons() {
    setFillingIcons(true);
    for (const group of MUSCLE_GROUPS) {
      const icon = CATEGORY_ICONS[group];
      if (!icon) continue;
      const idsWithoutPhoto = exercises
        .filter((ex) => !ex.photo_path && (ex.muscle_group || "Інше") === group)
        .map((ex) => ex.id);
      if (idsWithoutPhoto.length === 0) continue;

      const path = `category-icons/${group}.png`;
      await supabase.storage.from("exercises").upload(path, dataUrlToBlob(icon), {
        upsert: true,
        contentType: "image/png",
      });
      await supabase.from("exercises").update({ photo_path: path }).in("id", idsWithoutPhoto);
    }
    setFillingIcons(false);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Вправи ({visibleExercises.length})</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-paper"
        >
          <span className="text-base leading-none">+</span> Нова вправа
        </button>
      </div>

      {missingPhotoCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <p className="text-xs text-muted">
            Вправ без фото: {missingPhotoCount}. Можна поставити однотипні схематичні іконки за групою м&apos;язів.
          </p>
          <button
            type="button"
            disabled={fillingIcons}
            onClick={fillMissingPhotosWithIcons}
            className="flex-none rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
          >
            {fillingIcons ? "Заповнюю…" : "🖼 Заповнити іконками"}
          </button>
        </div>
      )}

      {/* Плашки категорій — фільтрують список нижче, не відкриваючи кожну вправу. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setGroupFilter(ALL_GROUPS)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            groupFilter === ALL_GROUPS ? "border-accent bg-accent text-paper" : "border-line bg-paper text-muted hover:text-ink"
          }`}
        >
          {ALL_GROUPS}
        </button>
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroupFilter(g)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              groupFilter === g ? "border-accent bg-accent text-paper" : "border-line bg-paper text-muted hover:text-ink"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-xl lg:border"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">+ Нова вправа</h2>
              <button type="button" onClick={() => setAddOpen(false)} className="text-xs text-muted">
                Закрити
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Назва (напр. Присідання зі штангою)"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
              />
              <div className="flex flex-wrap gap-2">
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
                  className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Техніка виконання (необов'язково)"
                rows={2}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
              />
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
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={addExercise}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
              >
                {busy ? "Зберігаю…" : "Додати"}
              </button>
              {err && <p className="text-sm text-red-400">{err}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-4">
        {loading && <p className="text-sm text-muted">Завантаження…</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleExercises.map((ex) => {
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
                  <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1 bg-paper text-xs text-muted hover:text-accent">
                    {photoUploadingId === ex.id ? (
                      "Завантажую…"
                    ) : (
                      <>
                        <span className="text-lg leading-none">🖼</span>
                        Додати картинку
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadPhotoForExisting(ex.id, f);
                      }}
                    />
                  </label>
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
          {!loading && visibleExercises.length === 0 && (
            <p className="text-sm text-muted">
              {exercises.length === 0 ? "Вправ ще немає." : "У цій категорії вправ немає."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
