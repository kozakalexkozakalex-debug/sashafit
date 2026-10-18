"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ClientActivityCalendar, { CheckinMarker } from "@/components/ClientActivityCalendar";
import ClientProfileCard from "@/components/ClientProfileCard";
import ChatLauncher from "@/components/ChatLauncher";

type ClientRow = {
  id: string;
  name: string | null;
  avatar_path: string | null;
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

  const [name, setName] = useState("");
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
    setName(c.name || "");
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
    if (!name.trim()) {
      setErr("Вкажи своє ім'я");
      return;
    }
    if (!startWeight.trim()) {
      setErr("Вкажи поточну вагу");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({
        name: name.trim(),
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
      <div className="rounded-xl border border-line bg-surface p-3">
        <h2 className="mb-2.5 text-sm font-semibold">Анкета</h2>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Твоє ім'я"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />

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

  const checkinMarkers: CheckinMarker[] = checkins.map((c) => ({
    id: c.id,
    date: c.created_at.slice(0, 10),
    weight: c.weight,
    waist: c.waist,
    hips: c.hips,
    chest: c.chest,
    comment: c.comment,
    photoUrl: c.photo_path ? photoUrls[c.id] || null : null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-3 lg:w-1/3 lg:flex-none">
        <ClientProfileCard
          client={client}
          checkins={checkins}
          onEditAnketa={() => {
            prefillFromClient(client);
            setEditMode(true);
          }}
          onAvatarUpdated={load}
          onCheckinAdded={() => loadCheckins(client.id)}
        />
      </div>

      <div className="lg:flex-1">
        <ClientActivityCalendar clientId={client.id} checkins={checkinMarkers} />
      </div>
      </div>

      <ChatLauncher mode="client" clientId={client.id} />
    </div>
  );
}
