"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/compressImage";
import { haptic, useTelegramBack } from "@/lib/telegram";
import BodyMap, { Zone, ZONE_LABEL } from "@/components/BodyMap";

// Шторка тижневого чек-іна: вага, заміри через силует, фото, питання тренера.
// Відкривається з екрана «Сьогодні» і з вкладки «Прогрес».

type CheckinQuestion = { id: string; label: string; kind: "text" | "scale"; position: number };

function num(v: string): number | null {
  const n = Number(v.replace(",", ".").trim());
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
}

export default function CheckinSheet({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [vals, setVals] = useState<Record<Zone, string>>({ chest: "", waist: "", hips: "" });
  const [zone, setZone] = useState<Zone | null>(null);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useTelegramBack(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    supabase
      .from("checkin_questions")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => setQuestions((data as CheckinQuestion[]) || []));
  }, []);

  function bump(delta: number) {
    if (!zone) return;
    haptic("tap");
    const cur = num(vals[zone]) ?? 0;
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    setVals((v) => ({ ...v, [zone]: String(next) }));
  }

  async function save() {
    const w = num(weight);
    if (w == null) {
      setErr("Вкажи вагу");
      haptic("error");
      return;
    }
    setErr("");
    setBusy(true);

    let photoPath: string | null = null;
    if (file) {
      const photo = await compressImage(file);
      const path = `${clientId}/${Date.now()}-${photo.name}`;
      const { error: upErr } = await supabase.storage.from("checkins").upload(path, photo);
      if (upErr) {
        setBusy(false);
        setErr("Не вдалось завантажити фото: " + upErr.message);
        haptic("error");
        return;
      }
      photoPath = path;
    }

    const { data: inserted, error } = await supabase
      .from("checkins")
      .insert({
        client_id: clientId,
        weight: w,
        waist: num(vals.waist),
        hips: num(vals.hips),
        chest: num(vals.chest),
        photo_path: photoPath,
        comment: comment.trim() || null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      setBusy(false);
      setErr(error?.message || "Не вдалось зберегти чек-ін");
      haptic("error");
      return;
    }

    const rows = questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => ({ checkin_id: inserted.id, question_id: q.id, value: answers[q.id].trim() }));
    if (rows.length > 0) await supabase.from("checkin_answers").insert(rows);

    setBusy(false);
    haptic("success");
    onSaved();
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-2xl lg:border"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Чек-ін</h2>
          <button type="button" onClick={onClose} className="text-xs text-muted">
            Закрити
          </button>
        </div>

        <label className="block rounded-2xl border border-line bg-surface p-3">
          <span className="text-xs text-muted">Вага, кг</span>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="mt-1 w-full bg-transparent font-display text-3xl font-bold text-ink outline-none placeholder:text-muted/50"
          />
        </label>

        <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs text-muted">Заміри, см — торкнись зони (необов&apos;язково)</p>
          <BodyMap values={vals} selected={zone} onSelect={setZone} />
          {zone && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-paper p-2">
              <span className="w-16 flex-none pl-1 text-sm font-semibold text-ink">{ZONE_LABEL[zone]}</span>
              <button
                type="button"
                onClick={() => bump(-0.5)}
                className="h-10 w-10 flex-none rounded-lg border border-line text-lg text-ink"
                aria-label="Менше"
              >
                −
              </button>
              <input
                value={vals[zone]}
                onChange={(e) => setVals((v) => ({ ...v, [zone]: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-lg font-bold text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => bump(0.5)}
                className="h-10 w-10 flex-none rounded-lg border border-line text-lg text-ink"
                aria-label="Більше"
              >
                +
              </button>
            </div>
          )}
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-line bg-surface p-3">
          <span className="text-sm text-ink">{file ? `📷 ${file.name}` : "📷 Додати фото"}</span>
          <span className="text-xs text-brand">{file ? "Змінити" : "Вибрати"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {questions.length > 0 && (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
            {questions.map((q) => (
              <div key={q.id}>
                <p className="mb-1.5 text-sm text-ink">{q.label}</p>
                {q.kind === "scale" ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          haptic("select");
                          setAnswers((prev) => ({ ...prev, [q.id]: String(v) }));
                        }}
                        className={`flex h-10 flex-1 items-center justify-center rounded-xl border text-sm font-semibold ${
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
                    className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Коментар тренеру (необов'язково)"
          rows={2}
          className="mt-3 w-full rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
        />

        {err && <p className="mt-2 text-sm text-danger">{err}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="mt-3 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-paper disabled:opacity-50"
        >
          {busy ? "Зберігаю…" : "Зберегти чек-ін"}
        </button>
      </div>
    </div>,
    document.body
  );
}
