"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

type Checkin = {
  id: string;
  created_at: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  photo_path: string | null;
  comment: string | null;
  reviewed_at: string | null;
};
type Answer = { value: string | null; checkin_questions: { label: string } | null };

function diffText(cur: number | null, prev: number | null, unit: string) {
  if (cur == null) return null;
  if (prev == null) return `${cur} ${unit}`;
  const d = Math.round((cur - prev) * 10) / 10;
  return `${cur} ${unit}${d !== 0 ? ` (${d > 0 ? "+" : "−"}${Math.abs(d)})` : ""}`;
}

// Екран перевірки чек-іна: цифри в порівнянні з попереднім, фото, відповіді,
// поле відповіді клієнту і кнопка "Перевірено" (закриває всі неперевірені
// чек-іни цього клієнта).
export default function CheckinReviewSheet({
  clientId,
  clientName,
  onClose,
  onDone,
  onOpenClient,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onDone: () => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const [cur, setCur] = useState<Checkin | null>(null);
  const [prev, setPrev] = useState<Checkin | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("checkins")
        .select("id, created_at, weight, waist, hips, chest, photo_path, comment, reviewed_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(6);
      const rows = (data as Checkin[]) || [];
      // Показуємо найновіший неперевірений (або просто найновіший) і попередній до нього.
      const target = rows.find((r) => !r.reviewed_at) || rows[0] || null;
      const idx = target ? rows.indexOf(target) : -1;
      setCur(target);
      setPrev(idx >= 0 ? rows[idx + 1] || null : null);
      if (target) {
        const [{ data: ans }, signed] = await Promise.all([
          supabase
            .from("checkin_answers")
            .select("value, checkin_questions(label)")
            .eq("checkin_id", target.id),
          target.photo_path
            ? supabase.storage.from("checkins").createSignedUrl(target.photo_path, 3600)
            : Promise.resolve({ data: null }),
        ]);
        setAnswers((ans as unknown as Answer[]) || []);
        setPhotoUrl(signed.data?.signedUrl ?? null);
      }
      setLoading(false);
    })();
  }, [clientId]);

  async function finish() {
    setBusy(true);
    setErr("");
    if (reply.trim()) {
      const { error } = await supabase
        .from("messages")
        .insert({ client_id: clientId, sender: "coach", body: reply.trim() });
      if (error) {
        setBusy(false);
        setErr("Не вдалося надіслати відповідь. Спробуй ще раз.");
        return;
      }
    }
    const { error } = await supabase
      .from("checkins")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .is("reviewed_at", null);
    setBusy(false);
    if (error) {
      setErr("Не вдалося позначити перевіреним. Спробуй ще раз.");
      return;
    }
    onDone();
  }

  const rows: [string, string | null][] = cur
    ? [
        ["Вага", diffText(cur.weight, prev?.weight ?? null, "кг")],
        ["Талія", diffText(cur.waist, prev?.waist ?? null, "см")],
        ["Стегна", diffText(cur.hips, prev?.hips ?? null, "см")],
        ["Груди", diffText(cur.chest, prev?.chest ?? null, "см")],
      ]
    : [];

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-xl lg:border"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Чек-ін · {clientName}</h2>
            {cur && (
              <p className="text-xs text-muted">
                {new Date(cur.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-xs text-muted">
            Закрити
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Завантаження…</p>
        ) : !cur ? (
          <p className="text-sm text-muted">Чек-інів ще немає.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {rows
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="rounded-lg bg-surface p-2.5">
                    <p className="text-[11px] text-muted">{label}</p>
                    <p className="text-sm font-medium">{v}</p>
                  </div>
                ))}
            </div>

            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Фото чек-іна" className="max-h-72 w-full rounded-lg object-cover" />
            )}

            {cur.comment && (
              <div className="rounded-lg bg-surface p-2.5 text-sm">
                <p className="mb-0.5 text-[11px] text-muted">Коментар клієнта</p>
                {cur.comment}
              </div>
            )}

            {answers.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-surface p-2.5 text-sm">
                {answers.map((a, i) => (
                  <div key={i}>
                    <p className="text-[11px] text-muted">{a.checkin_questions?.label || "Питання"}</p>
                    <p>{a.value || "—"}</p>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Відповідь клієнту (необов'язково)"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
            />
            {err && <p className="text-sm text-red-400">{err}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={finish}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-paper disabled:opacity-50"
              >
                {busy ? "Зберігаю…" : reply.trim() ? "Надіслати і закрити" : "Перевірено"}
              </button>
              {onOpenClient && (
                <button
                  type="button"
                  onClick={() => onOpenClient(clientId)}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm text-muted"
                >
                  Клієнт
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
