"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { clientRisk, RiskLevel } from "@/lib/clientRisk";
import { clientLabel } from "@/lib/clientLabel";
import { UnreadInfo } from "@/lib/coachUnread";
import CheckinReviewSheet from "@/components/CheckinReviewSheet";

type Client = {
  id: string;
  name: string | null;
  invite_code: string;
  profile_id: string | null;
  created_at: string;
};
type AssignedWorkout = {
  id: string;
  date: string;
  title: string;
  client_id: string;
  completed_at: string | null;
  clients: { name: string } | null;
};
type Checkin = {
  id: string;
  client_id: string;
  created_at: string;
  weight: number | null;
  reviewed_at: string | null;
};
type CheckinQuestion = { id: string; label: string; kind: "text" | "scale"; position: number };
type Meeting = {
  id: string;
  title: string;
  scheduled_at: string;
  link: string | null;
  note: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}
function agoText(days: number) {
  if (days <= 0) return "сьогодні";
  if (days === 1) return "вчора";
  return `${days} дн тому`;
}

const RISK_DOT: Record<RiskLevel, string> = {
  risk: "bg-danger",
  watch: "bg-warn",
  pending: "bg-muted",
  ok: "bg-success",
};

function agoShort(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "щойно";
  if (mins < 60) return `${mins} хв`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} год`;
  return `${Math.floor(hours / 24)} дн`;
}

type QItem = {
  key: string;
  kind: "message" | "checkin" | "risk" | "invite";
  clientId: string;
  name: string;
  text: string;
  level?: RiskLevel;
};
type QFilter = "all" | "checkin" | "message" | "risk";

export default function CoachHome({
  onOpenClient,
  onOpenChat,
  unread,
  actionSignal,
}: {
  // Відкриває розмову з клієнтом (вкладка "Чати").
  onOpenChat?: (clientId: string) => void;
  // Непрочитані повідомлення по клієнтах (рахує CoachDashboard).
  unread?: UnreadInfo;
  // Відкриває вкладку "Клієнти" одразу з карткою цього клієнта.
  onOpenClient?: (clientId: string) => void;
  // Дозволяє відкрити форму "Нова зустріч" ззовні — з кнопки в хедері
  // (сторінка dashboard), а не тільки з кнопки на цій сторінці.
  actionSignal?: { ts: number } | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [foodEntries, setFoodEntries] = useState<{ client_id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QFilter>("all");
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [reviewClientId, setReviewClientId] = useState<string | null>(null);

  const [mTitle, setMTitle] = useState("");
  const [mClientId, setMClientId] = useState("");
  const [mDateTime, setMDateTime] = useState("");
  const [mLink, setMLink] = useState("");
  const [mNote, setMNote] = useState("");
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState("");
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);

  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  // Відкриття форми "Нова зустріч" за сигналом ззовні (кнопка в хедері).
  useEffect(() => {
    if (!actionSignal) return;
    setMeetingModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal?.ts]);

  // Поки попап зустрічі відкритий — блокуємо скрол фону.
  useEffect(() => {
    if (!meetingModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [meetingModalOpen]);

  // Кастомні питання чек-іна — тренер сам налаштовує, що додатково питати
  // в щотижневому чек-іні (сон/стрес/самопочуття/довільне).
  const [checkinQuestions, setCheckinQuestions] = useState<CheckinQuestion[]>([]);
  const [newQLabel, setNewQLabel] = useState("");
  const [newQKind, setNewQKind] = useState<"text" | "scale">("text");
  const [qBusy, setQBusy] = useState(false);

  async function loadQuestions() {
    const { data } = await supabase.from("checkin_questions").select("*").order("position", { ascending: true });
    setCheckinQuestions((data as CheckinQuestion[]) || []);
  }

  async function addQuestion() {
    if (!newQLabel.trim()) return;
    setQBusy(true);
    await supabase.from("checkin_questions").insert({
      label: newQLabel.trim(),
      kind: newQKind,
      position: checkinQuestions.length,
    });
    setNewQLabel("");
    setQBusy(false);
    loadQuestions();
  }

  async function deleteQuestion(id: string) {
    await supabase.from("checkin_questions").delete().eq("id", id);
    loadQuestions();
  }

  async function load() {
    setLoading(true);
    // Тренування та їжу тягнемо лише за останні 30 днів (і майбутні
    // тренування) — для головної цього достатньо, і вона лишається швидкою.
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 30);
    const sinceKey = toKey(sinceDate);

    const [{ data: cl }, { data: wo }, { data: ci }, { data: mt }, { data: fo }] = await Promise.all([
      supabase.from("clients").select("id, name, invite_code, profile_id, created_at"),
      supabase
        .from("assigned_workouts")
        .select("id, date, title, client_id, completed_at, clients(name)")
        .gte("date", sinceKey),
      supabase
        .from("checkins")
        .select("id, client_id, created_at, weight, reviewed_at")
        .order("created_at", { ascending: false }),
      supabase.from("meetings").select("*, clients(name)").order("scheduled_at", { ascending: true }),
      supabase.from("food_entries").select("client_id, date").gte("date", sinceKey),
    ]);
    setClients((cl as Client[]) || []);
    setWorkouts((wo as unknown as AssignedWorkout[]) || []);
    setCheckins((ci as Checkin[]) || []);
    setMeetings((mt as unknown as Meeting[]) || []);
    setFoodEntries((fo as { client_id: string; date: string }[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    loadQuestions();
  }, []);

  async function addMeeting() {
    if (!mTitle.trim() || !mDateTime) {
      setMErr("Вкажи назву і дату/час");
      return;
    }
    setMErr("");
    setMBusy(true);
    const { error } = await supabase.from("meetings").insert({
      title: mTitle.trim(),
      client_id: mClientId || null,
      scheduled_at: new Date(mDateTime).toISOString(),
      link: mLink.trim() || null,
      note: mNote.trim() || null,
    });
    setMBusy(false);
    if (error) {
      setMErr(error.message);
      return;
    }
    setMTitle("");
    setMClientId("");
    setMDateTime("");
    setMLink("");
    setMNote("");
    setMeetingModalOpen(false);
    load();
  }

  async function deleteMeeting(id: string) {
    await supabase.from("meetings").delete().eq("id", id);
    load();
  }

  function inviteUrl(code: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/login?invite=${code}`;
  }

  async function cancelClient(id: string) {
    if (!window.confirm("Відключити цього клієнта? Усі його дані (чек-іни, тренування, харчування) будуть видалені.")) {
      return;
    }
    await supabase.from("clients").delete().eq("id", id);
    load();
  }

  async function copyRowInvite(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopiedRowId(id);
      setTimeout(() => setCopiedRowId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* ігноруємо — просто немає буфера обміну */
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const today = new Date();
  const todayKey = toKey(today);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoKey = toKey(weekAgo);

  // Чек-іни вже відсортовані від нових до старих: перший — останній,
  // другий — попередній (для різниці ваги).
  const checkinsByClient: Record<string, Checkin[]> = {};
  for (const ci of checkins) (checkinsByClient[ci.client_id] = checkinsByClient[ci.client_id] || []).push(ci);

  // Пропущені тренування поспіль (від найновішого минулого до першого виконаного).
  function missedStreak(clientId: string): number {
    const past = workouts
      .filter((w) => w.client_id === clientId && w.date < todayKey)
      .sort((a, b) => b.date.localeCompare(a.date));
    let n = 0;
    for (const w of past) {
      if (w.completed_at) break;
      n++;
    }
    return n;
  }

  const foodTodayByClient = new Set(foodEntries.filter((f) => f.date === todayKey).map((f) => f.client_id));

  type Row = {
    client: Client;
    level: RiskLevel;
    reason: string;
    lastCheckinDays: number | null;
    weightText: string;
    weekDone: number;
    weekTotal: number;
  };

  const rows: Row[] = clients.map((c) => {
    const list = checkinsByClient[c.id] || [];
    const last = list[0];
    let level = clientRisk(c, last?.created_at);
    let reason = "";
    if (level === "risk") {
      reason = "прострочена підписка";
    } else if (level === "pending") {
      const d = daysBetween(today, new Date(c.created_at));
      reason = `запрошено ${agoText(d)}, ще не зайшов(ла)`;
    } else if (level === "watch") {
      if (!c.profile_id) {
        reason = `не зайшов(ла) вже ${daysBetween(today, new Date(c.created_at))} дн`;
      } else {
        reason = last ? `немає чек-іну ${daysBetween(today, new Date(last.created_at))} дн` : "ще жодного чек-іну";
      }
    }
    if (c.profile_id) {
      const streak = missedStreak(c.id);
      if (streak >= 2) {
        const streakReason = `${streak} тренувань поспіль пропущено`;
        if (level === "ok") {
          level = "watch";
          reason = streakReason;
        } else {
          reason = `${reason} · ${streakReason}`;
        }
      }
    }

    // Вага: остання + різниця з попереднім чек-іном, де вага була вказана.
    const withWeight = list.filter((x) => x.weight != null);
    let weightText = "";
    if (withWeight.length > 0) {
      const w = withWeight[0].weight as number;
      weightText = `${w} кг`;
      if (withWeight.length > 1) {
        const diff = Math.round((w - (withWeight[1].weight as number)) * 10) / 10;
        if (diff !== 0) weightText += ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)})`;
      }
    }

    const week = workouts.filter((w) => w.client_id === c.id && w.date > weekAgoKey && w.date <= todayKey);

    return {
      client: c,
      level,
      reason,
      lastCheckinDays: last ? daysBetween(today, new Date(last.created_at)) : null,
      weightText,
      weekDone: week.filter((w) => w.completed_at).length,
      weekTotal: week.length,
    };
  });

  const levelOrder: Record<RiskLevel, number> = { risk: 0, watch: 1, pending: 2, ok: 3 };

  // Список клієнтів: лише підключені; ті, кому потрібна увага — першими.
  const q = search.trim().toLowerCase();
  const clientRows = rows
    .filter((r) => r.client.profile_id)
    .filter((r) => !q || clientLabel(r.client).toLowerCase().includes(q))
    .sort(
      (a, b) =>
        levelOrder[a.level] - levelOrder[b.level] ||
        clientLabel(a.client).localeCompare(clientLabel(b.client), "uk")
    );
  const connectedCount = rows.filter((r) => r.client.profile_id).length;

  // ---- Черга "Потрібно зробити" ----
  const queue: QItem[] = [];
  for (const [cid, u] of Object.entries(unread || {})) {
    const c = clients.find((x) => x.id === cid);
    if (!c) continue;
    queue.push({
      key: `m-${cid}`,
      kind: "message",
      clientId: cid,
      name: clientLabel(c),
      text: `Нове повідомлення${u.count > 1 ? ` · ${u.count}` : ""} · ${agoShort(u.lastAt)} тому`,
    });
  }
  for (const c of clients) {
    const list = checkinsByClient[c.id] || [];
    const idx = list.findIndex((x) => !x.reviewed_at);
    if (idx < 0) continue;
    const cur = list[idx];
    const prevW = list.slice(idx + 1).find((x) => x.weight != null)?.weight ?? null;
    let wText = "";
    if (cur.weight != null) {
      wText = ` · ${cur.weight} кг`;
      if (prevW != null) {
        const d = Math.round((cur.weight - prevW) * 10) / 10;
        if (d !== 0) wText += ` (${d > 0 ? "+" : "−"}${Math.abs(d)})`;
      }
    }
    queue.push({ key: `c-${c.id}`, kind: "checkin", clientId: c.id, name: clientLabel(c), text: `Чек-ін надіслано${wText}` });
  }
  const riskOrder: Record<RiskLevel, number> = { risk: 0, watch: 1, pending: 2, ok: 3 };
  for (const r of rows.filter((x) => x.level !== "ok").sort((a, b) => riskOrder[a.level] - riskOrder[b.level])) {
    queue.push({
      key: `r-${r.client.id}`,
      kind: r.client.profile_id ? "risk" : "invite",
      clientId: r.client.id,
      name: clientLabel(r.client),
      text: r.reason,
      level: r.level,
    });
  }
  const checkinCount = queue.filter((q) => q.kind === "checkin").length;
  const messageCount = queue.filter((q) => q.kind === "message").length;
  const riskCount = queue.filter((q) => q.kind === "risk" || q.kind === "invite").length;
  const filteredQueue = queue.filter(
    (q) =>
      filter === "all" ||
      q.kind === filter ||
      (filter === "risk" && q.kind === "invite")
  );
  const visibleQueue = showAllQueue ? filteredQueue : filteredQueue.slice(0, 7);

  const upcomingMeetings = meetings.filter((m) => new Date(m.scheduled_at).getTime() >= Date.now());
  const todayMeetings = upcomingMeetings.filter((m) => toKey(new Date(m.scheduled_at)) === todayKey);
  const laterMeetings = upcomingMeetings.filter((m) => toKey(new Date(m.scheduled_at)) !== todayKey).slice(0, 5);
  const todayWorkouts = workouts.filter((w) => w.date === todayKey);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex gap-2">
              {(
                [
                  ["checkin", "Чек-іни", checkinCount],
                  ["message", "Чати", messageCount],
                  ["risk", "Увага", riskCount],
                ] as [QFilter, string, number][]
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(filter === id ? "all" : id)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-xs ${
                    filter === id ? "border-brand bg-brand/10" : "border-line bg-paper"
                  } ${n === 0 ? "text-muted" : "text-ink"}`}
                >
                  <span className={`block font-display text-base font-semibold ${n === 0 ? "text-muted" : "text-brand"}`}>
                    {n}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            <h2 className="mb-1 text-sm font-semibold">Потрібно зробити</h2>
            {filteredQueue.length === 0 ? (
              <p className="py-3 text-sm text-muted">Все розібрано ✓</p>
            ) : (
              <div className="flex flex-col">
                {visibleQueue.map((q) => (
                  <div key={q.key} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                    <span
                      className={`h-2 w-2 flex-none rounded-full ${
                        q.kind === "risk" || q.kind === "invite" ? RISK_DOT[q.level || "watch"] : "bg-accent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{q.name}</span>
                      <span className="block text-xs text-muted">{q.text}</span>
                    </span>
                    {q.kind === "invite" ? (
                      <span className="flex flex-none gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const c = clients.find((x) => x.id === q.clientId);
                            if (c) copyRowInvite(c.id, c.invite_code);
                          }}
                          className="whitespace-nowrap rounded-full border border-brand/40 px-2.5 py-1 text-xs text-brand"
                        >
                          {copiedRowId === q.clientId ? "Скопійовано" : "Посилання"}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelClient(q.clientId)}
                          className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs text-muted"
                        >
                          Видалити
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => (q.kind === "checkin" ? setReviewClientId(q.clientId) : onOpenChat?.(q.clientId))}
                        className={`flex-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                          q.kind === "checkin" ? "bg-accent text-paper" : "border border-accent/40 text-brand"
                        }`}
                      >
                        {q.kind === "checkin" ? "Перевірити" : q.kind === "message" ? "Відповісти" : "Написати"}
                      </button>
                    )}
                  </div>
                ))}
                {filteredQueue.length > 7 && (
                  <button
                    type="button"
                    onClick={() => setShowAllQueue((v) => !v)}
                    className="mt-1 self-center text-xs text-muted"
                  >
                    {showAllQueue ? "Згорнути" : `Показати все (${filteredQueue.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Клієнти ({connectedCount})</h2>
              {connectedCount > 6 && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Пошук"
                  className="w-40 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs outline-none"
                />
              )}
            </div>

            {connectedCount === 0 ? (
              <p className="text-sm text-muted">
                Підключених клієнтів ще немає. Створи запрошення у вкладці «Заявки» і надішли клієнту посилання.
              </p>
            ) : clientRows.length === 0 ? (
              <p className="text-sm text-muted">Нікого не знайдено.</p>
            ) : (
              <div className="flex flex-col">
                {clientRows.map((r) => {
                  const c = r.client;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpenClient?.(c.id)}
                      className="flex items-center gap-3 border-t border-line py-3 text-left first:border-t-0 hover:bg-line/10"
                    >
                      <span className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand/15 font-display text-sm font-semibold text-brand">
                        {clientLabel(c).charAt(0).toUpperCase()}
                        <span
                          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${RISK_DOT[r.level]}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{clientLabel(c)}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span>
                            Чек-ін: {r.lastCheckinDays == null ? "—" : agoText(r.lastCheckinDays)}
                          </span>
                          <span>
                            Тренування: {r.weekTotal > 0 ? `${r.weekDone}/${r.weekTotal} за тиждень` : "—"}
                          </span>
                          {foodTodayByClient.has(c.id) && <span className="text-info">🍽 їжа сьогодні</span>}
                        </span>
                      </span>
                      {r.weightText && (
                        <span className="flex-none text-right text-xs text-muted">{r.weightText}</span>
                      )}
                      <span className="flex-none text-muted">›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <details className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold">Питання чек-іна ({checkinQuestions.length})</summary>
            <p className="mb-2 mt-2 text-xs text-muted">
              Додаткові питання, які клієнт побачить і заповнить під час щотижневого чек-іна.
            </p>
            <div className="flex flex-col gap-1.5">
              {checkinQuestions.map((qu) => (
                <div
                  key={qu.id}
                  className="flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs"
                >
                  <span>
                    {qu.label}
                    {qu.kind === "scale" && <span className="text-muted"> (шкала 1–5)</span>}
                  </span>
                  <button type="button" onClick={() => deleteQuestion(qu.id)} className="text-danger">
                    Видалити
                  </button>
                </div>
              ))}
              {checkinQuestions.length === 0 && <p className="text-xs text-muted">Питань ще немає.</p>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <input
                value={newQLabel}
                onChange={(e) => setNewQLabel(e.target.value)}
                placeholder="Напр. Як спалось?"
                className="flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs outline-none"
              />
              <select
                value={newQKind}
                onChange={(e) => setNewQKind(e.target.value as "text" | "scale")}
                className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
              >
                <option value="text">Текст</option>
                <option value="scale">Шкала 1–5</option>
              </select>
              <button
                type="button"
                disabled={qBusy}
                onClick={addQuestion}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
              >
                Додати
              </button>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Сьогодні</h2>
            {todayMeetings.length === 0 && todayWorkouts.length === 0 ? (
              <p className="text-sm text-muted">На сьогодні нічого не заплановано.</p>
            ) : (
              <div className="flex flex-col gap-2.5 text-sm">
                {todayMeetings.map((m) => (
                  <div key={m.id} className="flex gap-2.5">
                    <span className="w-11 flex-shrink-0 text-xs text-muted">
                      {new Date(m.scheduled_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>
                      <span className="font-medium">{m.clients?.name || "Без клієнта"}</span>
                      <br />
                      <span className="text-xs text-muted">{m.title}</span>
                      {m.link && (
                        <>
                          {" · "}
                          <a href={m.link} target="_blank" rel="noreferrer" className="text-xs text-brand underline">
                            дзвінок
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                ))}
                {todayWorkouts.map((w) => (
                  <div key={w.id} className="flex gap-2.5">
                    <span className="w-11 flex-shrink-0 text-xs text-muted">🏋</span>
                    <span>
                      <span className="font-medium">{w.clients?.name || "—"}</span>
                      <br />
                      <span className="text-xs text-muted">
                        {w.title}
                        {w.completed_at ? " · виконано" : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Найближчі зустрічі</h2>
              <button type="button" onClick={() => setMeetingModalOpen(true)} className="text-xs text-brand">
                + Додати
              </button>
            </div>
            {laterMeetings.length === 0 ? (
              <p className="text-sm text-muted">Зустрічей немає.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {laterMeetings.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {m.title}
                        {m.clients?.name ? ` — ${m.clients.name}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(m.scheduled_at).toLocaleString("uk-UA", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button type="button" onClick={() => deleteMeeting(m.id)} className="flex-none text-xs text-danger">
                      Видалити
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {reviewClientId && (
        <CheckinReviewSheet
          clientId={reviewClientId}
          clientName={clientLabel(clients.find((c) => c.id === reviewClientId) || { name: null, invite_code: "" })}
          onClose={() => setReviewClientId(null)}
          onDone={() => {
            setReviewClientId(null);
            load();
          }}
          onOpenClient={(id) => {
            setReviewClientId(null);
            onOpenClient?.(id);
          }}
        />
      )}

      {meetingModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onClick={() => setMeetingModalOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:w-[460px] lg:rounded-xl lg:border"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">+ Нова зустріч</h2>
                <button type="button" onClick={() => setMeetingModalOpen(false)} className="text-xs text-muted">
                  Закрити
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={mTitle}
                    onChange={(e) => setMTitle(e.target.value)}
                    placeholder="Назва (напр. Дзвінок з клієнтом)"
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={mClientId}
                    onChange={(e) => setMClientId(e.target.value)}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                  >
                    <option value="">Без клієнта</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {clientLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="datetime-local"
                    value={mDateTime}
                    onChange={(e) => setMDateTime(e.target.value)}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={mLink}
                    onChange={(e) => setMLink(e.target.value)}
                    placeholder="Посилання на дзвінок (необов'язково)"
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                  />
                </div>
                <input
                  value={mNote}
                  onChange={(e) => setMNote(e.target.value)}
                  placeholder="Нотатка (необов'язково)"
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={mBusy}
                  onClick={addMeeting}
                  className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
                >
                  {mBusy ? "Зберігаю…" : "Додати"}
                </button>
                {mErr && <p className="text-sm text-danger">{mErr}</p>}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
