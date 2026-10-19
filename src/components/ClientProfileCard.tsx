"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PhotoCompare from "@/components/PhotoCompare";

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

type Checkin = {
  id: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  created_at: string;
};

type CheckinQuestion = { id: string; label: string; kind: "text" | "scale"; position: number };

type Metric = "weight" | "waist" | "hips" | "chest";
type Period = "7" | "30" | "90" | "all";

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "weight", label: "Вага", unit: "кг" },
  { id: "waist", label: "Талія", unit: "см" },
  { id: "hips", label: "Стегна", unit: "см" },
  { id: "chest", label: "Груди", unit: "см" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "7", label: "Тиждень" },
  { id: "30", label: "Місяць" },
  { id: "90", label: "3 місяці" },
  { id: "all", label: "Все" },
];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function TrendChart({ points, unit }: { points: { date: string; value: number }[]; unit: string }) {
  if (points.length < 2) {
    return <p className="text-xs text-muted">Потрібно щонайменше 2 чек-іни за цей період.</p>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300;
  const h = 110;
  const pad = 12;

  const coords = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * (w - pad * 2),
    y: pad + (1 - (p.value - min) / range) * (h - pad * 2),
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={path} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} className="fill-accent" />
      ))}
      <text x={pad} y={h - 2} className="fill-current text-[9px] text-muted">
        {points[0].value} {unit}
      </text>
      <text x={w - pad} y={h - 2} textAnchor="end" className="fill-current text-[9px] text-muted">
        {points[points.length - 1].value} {unit}
      </text>
    </svg>
  );
}

export default function ClientProfileCard({
  client,
  checkins,
  onEditAnketa,
  onAvatarUpdated,
  onCheckinAdded,
  readOnly = false,
}: {
  client: ClientRow;
  checkins: Checkin[];
  onEditAnketa?: () => void;
  onAvatarUpdated?: () => void;
  onCheckinAdded?: () => void;
  readOnly?: boolean;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (!client.avatar_path) {
      setAvatarUrl(null);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(client.avatar_path, 3600)
      .then(({ data }) => setAvatarUrl(data?.signedUrl || null));
  }, [client.avatar_path]);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    const path = `${client.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file);
    if (!upErr) {
      await supabase.from("clients").update({ avatar_path: path }).eq("id", client.id);
      onAvatarUpdated?.();
    }
    setAvatarBusy(false);
  }

  const [metric, setMetric] = useState<Metric>("weight");
  const [period, setPeriod] = useState<Period>("30");

  const metricMeta = METRICS.find((m) => m.id === metric)!;
  const now = new Date();
  const cutoff = period === "all" ? null : new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);

  const points = checkins
    .filter((c) => c[metric] != null)
    .filter((c) => !cutoff || new Date(c.created_at) >= cutoff)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => ({ date: c.created_at.slice(0, 10), value: c[metric] as number }));

  // ---- наступний чек-ін (щонеділі) ----
  const todayKey = toKey(now);
  const dow = now.getDay(); // 0 = неділя
  const didCheckinToday = checkins.some((c) => c.created_at.slice(0, 10) === todayKey);
  const isSundayNow = dow === 0;
  const daysToNextSunday = isSundayNow ? 7 : 7 - dow;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (isSundayNow ? 7 : daysToNextSunday));
  const nextSundayLabel = nextSunday.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

  // ---- макроси (ціль по харчуванню) — задає тільки тренер ----
  const [tCalories, setTCalories] = useState("");
  const [tProtein, setTProtein] = useState("");
  const [tFat, setTFat] = useState("");
  const [tCarbs, setTCarbs] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const [tSaved, setTSaved] = useState(false);

  useEffect(() => {
    if (!readOnly) return;
    supabase
      .from("nutrition_targets")
      .select("*")
      .eq("client_id", client.id)
      .maybeSingle()
      .then(({ data }) => {
        setTCalories(data?.calories != null ? String(data.calories) : "");
        setTProtein(data?.protein != null ? String(data.protein) : "");
        setTFat(data?.fat != null ? String(data.fat) : "");
        setTCarbs(data?.carbs != null ? String(data.carbs) : "");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, client.id]);

  async function saveTarget() {
    setTBusy(true);
    setTSaved(false);
    await supabase.from("nutrition_targets").upsert({
      client_id: client.id,
      calories: tCalories.trim() ? Number(tCalories) : null,
      protein: tProtein.trim() ? Number(tProtein) : null,
      fat: tFat.trim() ? Number(tFat) : null,
      carbs: tCarbs.trim() ? Number(tCarbs) : null,
      updated_at: new Date().toISOString(),
    });
    setTBusy(false);
    setTSaved(true);
  }

  const [ciOpen, setCiOpen] = useState(false);
  const [ciWeight, setCiWeight] = useState("");
  const [ciWaist, setCiWaist] = useState("");
  const [ciHips, setCiHips] = useState("");
  const [ciChest, setCiChest] = useState("");
  const [ciComment, setCiComment] = useState("");
  const [ciFile, setCiFile] = useState<File | null>(null);
  const [ciBusy, setCiBusy] = useState(false);
  const [ciErr, setCiErr] = useState("");

  // Кастомні питання чек-іна, налаштовані тренером — показуємо під
  // стандартними полями, відповіді зберігаємо окремо після створення чек-іна.
  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (readOnly) return;
    supabase
      .from("checkin_questions")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => setQuestions((data as CheckinQuestion[]) || []));
  }, [readOnly]);

  async function addCheckin() {
    if (!isSundayNow) {
      setCiErr("Чек-ін можна додати тільки в неділю");
      return;
    }
    if (!ciWeight.trim()) {
      setCiErr("Вкажи вагу");
      return;
    }
    setCiErr("");
    setCiBusy(true);

    let photoPath: string | null = null;
    if (ciFile) {
      const path = `${client.id}/${Date.now()}-${ciFile.name}`;
      const { error: upErr } = await supabase.storage.from("checkins").upload(path, ciFile);
      if (upErr) {
        setCiBusy(false);
        setCiErr("Не вдалось завантажити фото: " + upErr.message);
        return;
      }
      photoPath = path;
    }

    const { data: inserted, error } = await supabase
      .from("checkins")
      .insert({
        client_id: client.id,
        weight: Number(ciWeight),
        waist: ciWaist.trim() ? Number(ciWaist) : null,
        hips: ciHips.trim() ? Number(ciHips) : null,
        chest: ciChest.trim() ? Number(ciChest) : null,
        photo_path: photoPath,
        comment: ciComment.trim() || null,
      })
      .select("id")
      .single();
    setCiBusy(false);
    if (error) {
      setCiErr(error.message);
      return;
    }

    const answerRows = questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => ({ checkin_id: inserted.id, question_id: q.id, value: answers[q.id].trim() }));
    if (answerRows.length > 0) {
      await supabase.from("checkin_answers").insert(answerRows);
    }

    setCiWeight("");
    setCiWaist("");
    setCiHips("");
    setCiChest("");
    setCiComment("");
    setCiFile(null);
    setAnswers({});
    setCiOpen(false);
    onCheckinAdded?.();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        {readOnly ? (
          <div className="h-14 w-14 flex-none overflow-hidden rounded-full border border-line bg-paper">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Фото профілю" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg text-muted">
                {(client.name || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        ) : (
          <label className="group relative h-14 w-14 flex-none cursor-pointer overflow-hidden rounded-full border border-line bg-paper">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Фото профілю" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg text-muted">
                {(client.name || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[9px] text-paper opacity-0 group-hover:opacity-100">
              {avatarBusy ? "…" : "Змінити"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="truncate text-sm font-semibold">{client.name || "Моя анкета"}</h2>
            {!readOnly && onEditAnketa && (
              <button type="button" onClick={onEditAnketa} className="flex-none text-xs text-accent">
                Редагувати
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[
              `Зріст ${client.height ?? "—"} см`,
              `Вага ${client.start_weight ?? "—"} кг${
                client.target_weight != null ? ` → ${client.target_weight} кг` : ""
              }`,
            ].join(", ")}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-1 text-xs text-muted">
        {client.intake_goals && <p>Цілі: {client.intake_goals}</p>}
        <p>
          {[
            client.experience_level,
            client.training_location,
            client.training_days_per_week != null ? `${client.training_days_per_week} дн./тиждень` : null,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        {client.equipment && <p>Інвентар: {client.equipment}</p>}
        {client.health_restrictions && <p>Обмеження здоров&apos;я: {client.health_restrictions}</p>}
        {client.food_restrictions && <p>Харчові обмеження: {client.food_restrictions}</p>}
        {client.lifestyle && <p>Спосіб життя: {client.lifestyle}</p>}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="w-14 flex-none text-[10px] uppercase tracking-wide text-muted">Показник</span>
          <div className="flex flex-wrap gap-1">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  metric === m.id ? "border-accent bg-accent text-paper" : "border-line text-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-14 flex-none text-[10px] uppercase tracking-wide text-muted">Період</span>
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  period === p.id ? "border-ink/60 bg-paper text-ink" : "border-line text-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <TrendChart points={points} unit={metricMeta.unit} />
        <PhotoCompare clientId={client.id} />
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {readOnly ? (
          <p className="text-xs text-muted">
            {didCheckinToday
              ? `Чек-ін на цьому тижні вже зроблено. Наступний через ${daysToNextSunday === 0 ? 7 : daysToNextSunday} днів (${nextSundayLabel}).`
              : `Наступний чек-ін через ${daysToNextSunday} ${daysToNextSunday === 1 ? "день" : "днів"} (${nextSundayLabel}).`}
          </p>
        ) : isSundayNow && !didCheckinToday ? (
          <button
            type="button"
            onClick={() => setCiOpen((v) => !v)}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-bold text-paper"
          >
            {ciOpen ? "Згорнути" : "Зроби чек-ін сьогодні"}
          </button>
        ) : (
          <p className="text-xs text-muted">
            {didCheckinToday
              ? `Чек-ін на цьому тижні зроблено. Наступний через ${daysToNextSunday === 0 ? 7 : daysToNextSunday} днів (${nextSundayLabel}).`
              : `Наступний чек-ін через ${daysToNextSunday} ${daysToNextSunday === 1 ? "день" : "днів"} (${nextSundayLabel}).`}
          </p>
        )}

        {!readOnly && ciOpen && isSundayNow && !didCheckinToday && (
          <div className="mt-2.5 flex flex-col gap-2">
            <input
              value={ciWeight}
              onChange={(e) => setCiWeight(e.target.value)}
              inputMode="decimal"
              placeholder="Вага, кг"
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
            />
            <div className="flex gap-2">
              <input
                value={ciWaist}
                onChange={(e) => setCiWaist(e.target.value)}
                inputMode="decimal"
                placeholder="Талія, см"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
              />
              <input
                value={ciHips}
                onChange={(e) => setCiHips(e.target.value)}
                inputMode="decimal"
                placeholder="Стегна, см"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
              />
              <input
                value={ciChest}
                onChange={(e) => setCiChest(e.target.value)}
                inputMode="decimal"
                placeholder="Груди, см"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
              />
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCiFile(e.target.files?.[0] ?? null)}
              className="text-xs text-muted"
            />
            <textarea
              value={ciComment}
              onChange={(e) => setCiComment(e.target.value)}
              placeholder="Коментар (необов'язково)"
              rows={2}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
            />
            {questions.map((q) => (
              <div key={q.id}>
                <p className="mb-1 text-xs text-muted">{q.label}</p>
                {q.kind === "scale" ? (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(v) }))}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                          answers[q.id] === String(v)
                            ? "border-accent bg-accent text-paper"
                            : "border-line text-muted"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none"
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              disabled={ciBusy}
              onClick={addCheckin}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
            >
              {ciBusy ? "Зберігаю…" : "Зберегти чек-ін"}
            </button>
            {ciErr && <p className="text-sm text-red-400">{ciErr}</p>}
          </div>
        )}
      </div>

      {readOnly && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Макроси (ціль на день)</p>
          <div className="flex flex-wrap gap-1.5">
            <input
              value={tCalories}
              onChange={(e) => setTCalories(e.target.value)}
              inputMode="numeric"
              placeholder="Ккал"
              className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={tProtein}
              onChange={(e) => setTProtein(e.target.value)}
              inputMode="numeric"
              placeholder="Білки"
              className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={tFat}
              onChange={(e) => setTFat(e.target.value)}
              inputMode="numeric"
              placeholder="Жири"
              className="w-16 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
            />
            <input
              value={tCarbs}
              onChange={(e) => setTCarbs(e.target.value)}
              inputMode="numeric"
              placeholder="Вуглеводи"
              className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
            />
            <button
              type="button"
              disabled={tBusy}
              onClick={saveTarget}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
            >
              {tBusy ? "Зберігаю…" : "Зберегти ціль"}
            </button>
          </div>
          {tSaved && <p className="mt-1 text-xs text-green-400">Збережено</p>}
        </div>
      )}
    </div>
  );
}
