"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CheckinQuestion = { id: string; label: string; kind: "text" | "scale"; position: number };

// Кастомні питання чек-іна — тренер сам налаштовує, що додатково питати
// в щотижневому чек-іні (сон/стрес/самопочуття/довільне).
export default function CheckinQuestionsSettings() {
  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"text" | "scale">("text");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("checkin_questions").select("*").order("position", { ascending: true });
    setQuestions((data as CheckinQuestion[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    await supabase.from("checkin_questions").insert({ label: label.trim(), kind, position: questions.length });
    setLabel("");
    setBusy(false);
    load();
  }

  async function remove(id: string) {
    await supabase.from("checkin_questions").delete().eq("id", id);
    load();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-1 text-sm font-semibold">Питання чек-іна</h2>
      <p className="mb-2 text-xs text-muted">
        Додаткові питання, які клієнт побачить і заповнить під час щотижневого чек-іна.
      </p>
      <div className="flex flex-col gap-1.5">
        {questions.map((q) => (
          <div key={q.id} className="flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs">
            <span>
              {q.label}
              {q.kind === "scale" && <span className="text-muted"> (шкала 1–5)</span>}
            </span>
            <button type="button" onClick={() => remove(q.id)} className="text-danger">
              Видалити
            </button>
          </div>
        ))}
        {questions.length === 0 && <p className="text-xs text-muted">Питань ще немає.</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Напр. Як спалось?"
          className="flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs outline-none"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "text" | "scale")}
          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
        >
          <option value="text">Текст</option>
          <option value="scale">Шкала 1–5</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
        >
          Додати
        </button>
      </div>
    </div>
  );
}
