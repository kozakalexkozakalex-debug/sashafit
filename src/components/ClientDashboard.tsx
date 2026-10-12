"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ClientCalendar from "@/components/ClientCalendar";
import ClientNutrition from "@/components/ClientNutrition";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import ChatPanel from "@/components/ChatPanel";

type ClientRow = {
  id: string;
  name: string;
  height: number | null;
  start_weight: number | null;
  target_weight: number | null;
  intake_notes: string | null;
  intake_goals: string | null;
  experience_level: string | null;
  health_restrictions: string | null;
  training_location: string | null;
  equipment: string | null;
  training_days_per_week: number | null;
  food_restrictions: string | null;
  lifestyle: string | null;
};

const EXPERIENCE_LEVELS = ["Новачок", "Є досвід", "Просунутий"];
const TRAINING_LOCATIONS = ["Зал", "Вдома", "Зал і вдома"];
const LIFESTYLES = ["Сидячий", "Помірно активний", "Активний"];

type Checkin = {
  id: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  photo_path: string | null;
  comment: string | null;
  created_at: string;
};

export default function ClientDashboard() {
  const [client, setClient] = useState<ClientRow | null | "none">(null);
  const [editMode, setEditMode] = useState(false);

  const [height, setHeight] = useState("");
  const [startWeight, setStartWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [intakeGoals, setIntakeGoals] = useState("");
  const [experienceLevel, setExperienceLevel] = useState(EXPERIENCE_LEVELS[0]);
  const [healthRestrictions, setHealthRestrictions] = useState("");
  const [trainingLocation, setTrainingLocation] = useState(TRAINING_LOCATIONS[0]);
  const [equipment, setEquipment] = useState("");
  const [trainingDays, setTrainingDays] = useState("");
  const [foodRestrictions, setFoodRestrictions] = useState("");
  const [lifestyle, setLifestyle] = useState(LIFESTYLES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function prefillFromClient(c: ClientRow) {
    setHeight(c.height != null ? String(c.height) : "");
    setStartWeight(c.start_weight != null ? String(c.start_weight) : "");
    setTargetWeight(c.target_weight != null ? String(c.target_weight) : "");
    setNotes(c.intake_notes || "");
    setIntakeGoals(c.intake_goals || "");
    setExperienceLevel(c.experience_level || EXPERIENCE_LEVELS[0]);
    setHealthRestrictions(c.health_restrictions || "");
    setTrainingLocation(c.training_location || TRAINING_LOCATIONS[0]);
    setEquipment(c.equipment || "");
    setTrainingDays(c.training_days_per_week != null ? String(c.training_days_per_week) : "");
    setFoodRestrictions(c.food_restrictions || "");
    setLifestyle(c.lifestyle || LIFESTYLES[0]);
  }

  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [ciWeight, setCiWeight] = useState("");
  const [ciWaist, setCiWaist] = useState("");
  const [ciHips, setCiHips] = useState("");
  const [ciChest, setCiChest] = useState("");
  const [ciComment, setCiComment] = useState("");
  const [ciFile, setCiFile] = useState<File | null>(null);
  const [ciBusy, setCiBusy] = useState(false);
  const [ciErr, setCiErr] = useState("");

  async function load() {
    const { data } = await supabase.from("clients").select("*").maybeSingle();
    setClient((data as ClientRow) ?? "none");
  }

  async function loadCheckins(clientId: string) {
    const { data } = await supabase
      .from("checkins")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const rows = (data as Checkin[]) || [];
    setCheckins(rows);

    const withPhotos = rows.filter((c) => c.photo_path);
    const urls: Record<string, string> = {};
    await Promise.all(
      withPhotos.map(async (c) => {
        const { data: signed } = await supabase.storage
          .from("checkins")
          .createSignedUrl(c.photo_path as string, 3600);
        if (signed?.signedUrl) urls[c.id] = signed.signedUrl;
      })
    );
    setPhotoUrls(urls);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (client && client !== "none" && client.start_weight !== null) {
      loadCheckins(client.id);
    }
  }, [client]);

  async function saveIntake() {
    if (!startWeight.trim()) {
      setErr("Вкажи поточну вагу");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({
        height: height.trim() ? Number(height) : null,
        start_weight: Number(startWeight),
        target_weight: targetWeight.trim() ? Number(targetWeight) : null,
        intake_notes: notes.trim() || null,
        intake_goals: intakeGoals.trim() || null,
        experience_level: experienceLevel || null,
        health_restrictions: healthRestrictions.trim() || null,
        training_location: trainingLocation || null,
        equipment: equipment.trim() || null,
        training_days_per_week: trainingDays.trim() ? Number(trainingDays) : null,
        food_restrictions: foodRestrictions.trim() || null,
        lifestyle: lifestyle || null,
      })
      .eq("id", (client as ClientRow).id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setEditMode(false);
    load();
  }

  async function addCheckin() {
    if (!ciWeight.trim()) {
      setCiErr("Вкажи вагу");
      return;
    }
    setCiErr("");
    setCiBusy(true);
    const c = client as ClientRow;

    let photoPath: string | null = null;
    if (ciFile) {
      const path = `${c.id}/${Date.now()}-${ciFile.name}`;
      const { error: upErr } = await supabase.storage.from("checkins").upload(path, ciFile);
      if (upErr) {
        setCiBusy(false);
        setCiErr("Не вдалось завантажити фото: " + upErr.message);
        return;
      }
      photoPath = path;
    }

    const { error } = await supabase.from("checkins").insert({
      client_id: c.id,
      weight: Number(ciWeight),
      waist: ciWaist.trim() ? Number(ciWaist) : null,
      hips: ciHips.trim() ? Number(ciHips) : null,
      chest: ciChest.trim() ? Number(ciChest) : null,
      photo_path: photoPath,
      comment: ciComment.trim() || null,
    });
    setCiBusy(false);
    if (error) {
      setCiErr(error.message);
      return;
    }
    setCiWeight("");
    setCiWaist("");
    setCiHips("");
    setCiChest("");
    setCiComment("");
    setCiFile(null);
    loadCheckins(c.id);
  }

  if (client === null) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  if (client === "none") {
    return (
      <p className="text-sm text-muted">
        Твою картку клієнта ще не знайдено. Напиши тренеру.
      </p>
    );
  }

  const isFirstFill = client.start_weight === null;

  if (isFirstFill || editMode) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Анкета</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="Зріст, см"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <input
              value={startWeight}
              onChange={(e) => setStartWeight(e.target.value)}
              inputMode="decimal"
              placeholder="Поточна вага, кг"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <input
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              inputMode="decimal"
              placeholder="Бажана вага, кг (необов'язково)"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
          </div>

          <textarea
            value={intakeGoals}
            onChange={(e) => setIntakeGoals(e.target.value)}
            placeholder="Цілі (напр. схуднення, набір маси, витривалість)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />

          <div className="flex flex-wrap gap-2">
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            >
              {EXPERIENCE_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={trainingLocation}
              onChange={(e) => setTrainingLocation(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            >
              {TRAINING_LOCATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={trainingDays}
              onChange={(e) => setTrainingDays(e.target.value)}
              inputMode="numeric"
              placeholder="Днів/тиждень"
              className="w-32 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
          </div>

          <input
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="Інвентар, що є (необов'язково)"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />

          <textarea
            value={healthRestrictions}
            onChange={(e) => setHealthRestrictions(e.target.value)}
            placeholder="Травми та обмеження здоров'я (необов'язково)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />

          <div className="flex flex-wrap gap-2">
            <input
              value={foodRestrictions}
              onChange={(e) => setFoodRestrictions(e.target.value)}
              placeholder="Харчові обмеження / алергії (необов'язково)"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <select
              value={lifestyle}
              onChange={(e) => setLifestyle(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            >
              {LIFESTYLES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Очікування від співпраці / коментар (необов'язково)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={saveIntake}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-50"
            >
              {busy ? "Зберігаю…" : "Зберегти"}
            </button>
            {!isFirstFill && (
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted"
              >
                Скасувати
              </button>
            )}
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Моя анкета</h2>
          <button
            type="button"
            onClick={() => {
              prefillFromClient(client);
              setEditMode(true);
            }}
            className="text-xs text-accent"
          >
            Редагувати
          </button>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <p>
            {[
              `Зріст ${client.height ?? "—"} см`,
              `Вага ${client.start_weight ?? "—"} кг${
                client.target_weight != null ? ` → ${client.target_weight} кг` : ""
              }`,
            ].join(", ")}
          </p>
          {client.intake_goals && <p className="text-muted">Цілі: {client.intake_goals}</p>}
          <p className="text-muted">
            {[
              client.experience_level,
              client.training_location,
              client.training_days_per_week != null ? `${client.training_days_per_week} дн./тиждень` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          {client.equipment && <p className="text-muted">Інвентар: {client.equipment}</p>}
          {client.health_restrictions && (
            <p className="text-muted">Обмеження здоров&apos;я: {client.health_restrictions}</p>
          )}
          {client.food_restrictions && (
            <p className="text-muted">Харчові обмеження: {client.food_restrictions}</p>
          )}
          {client.lifestyle && <p className="text-muted">Спосіб життя: {client.lifestyle}</p>}
          {client.intake_notes && <p className="text-muted">{client.intake_notes}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Новий чек-ін</h2>
        <div className="flex flex-col gap-3">
          <input
            value={ciWeight}
            onChange={(e) => setCiWeight(e.target.value)}
            inputMode="decimal"
            placeholder="Вага, кг"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <div className="flex gap-2">
            <input
              value={ciWaist}
              onChange={(e) => setCiWaist(e.target.value)}
              inputMode="decimal"
              placeholder="Талія, см"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <input
              value={ciHips}
              onChange={(e) => setCiHips(e.target.value)}
              inputMode="decimal"
              placeholder="Стегна, см"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            <input
              value={ciChest}
              onChange={(e) => setCiChest(e.target.value)}
              inputMode="decimal"
              placeholder="Груди, см"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCiFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted"
          />
          <textarea
            value={ciComment}
            onChange={(e) => setCiComment(e.target.value)}
            placeholder="Коментар (необов'язково)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={ciBusy}
            onClick={addCheckin}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-50"
          >
            {ciBusy ? "Зберігаю…" : "Зберегти чек-ін"}
          </button>
          {ciErr && <p className="text-sm text-red-400">{ciErr}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Історія чек-інів ({checkins.length})</h2>
        <div className="flex flex-col gap-2">
          {checkins.map((c) => (
            <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.weight} кг</span>
                <span className="text-xs text-muted">
                  {new Date(c.created_at).toLocaleDateString("uk-UA")}
                </span>
              </div>
              {(c.waist != null || c.hips != null || c.chest != null) && (
                <p className="mt-1 text-xs text-muted">
                  {[
                    c.waist != null ? `Талія ${c.waist} см` : null,
                    c.hips != null ? `Стегна ${c.hips} см` : null,
                    c.chest != null ? `Груди ${c.chest} см` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {c.comment && <p className="mt-1 text-muted">{c.comment}</p>}
              {c.photo_path && photoUrls[c.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[c.id]}
                  alt="Фото чек-іну"
                  className="mt-2 max-h-48 rounded-lg object-cover"
                />
              )}
            </div>
          ))}
          {checkins.length === 0 && <p className="text-sm text-muted">Чек-інів ще немає.</p>}
        </div>
      </div>

      <ChatPanel mode="client" clientId={client.id} />
      <ClientCalendar clientId={client.id} />
      <ClientNutrition clientId={client.id} />
      <AnalyticsPanel clientId={client.id} />
    </div>
  );
}
