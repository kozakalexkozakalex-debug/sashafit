"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { clientRisk, RiskLevel } from "@/lib/clientRisk";
import { clientLabel } from "@/lib/clientLabel";

type Client = {
  id: string;
  name: string | null;
  invite_code: string;
  profile_id: string | null;
  subscription_until: string | null;
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
type Checkin = { client_id: string; created_at: string; clients?: { name: string } | null };
type Message = {
  sender: "coach" | "client";
  created_at: string;
  clients: { name: string } | null;
};
type Payment = {
  amount: number | null;
  created_at: string;
  clients: { name: string } | null;
};
type FeedItem = { key: string; text: string; at: string };
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

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mt-2 flex h-6 items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color }}
        />
      ))}
    </div>
  );
}

const RISK_DOT: Record<RiskLevel, string> = {
  risk: "bg-red-400",
  watch: "bg-yellow-400",
  pending: "bg-muted",
  ok: "bg-green-400",
};

type NavTab = "clients" | "library" | "analytics" | "payments";

export default function CoachHome({
  onOpenClients,
  onNavigate,
  actionSignal,
}: {
  onOpenClients?: () => void;
  onNavigate?: (tab: NavTab) => void;
  // Дозволяє відкрити форму "Нова зустріч" ззовні — з кнопки в хедері
  // (сторінка dashboard), а не тільки з кнопки на цій сторінці.
  actionSignal?: { ts: number } | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [monthPayments, setMonthPayments] = useState<{ amount: number | null; created_at: string }[]>([]);
  const [foodEntries, setFoodEntries] = useState<{ client_id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedSeenAt, setFeedSeenAt] = useState<string | null>(null);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  // Поки попап зустрічі відкритий — блокуємо скрол фону, щоб палець/колесо
  // не "йшов" по сторінці позаду замість форми в попапі (саме через це
  // раніше здавалось, що треба листати вниз, щоб дістатись до форми).
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
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: cl }, { data: wo }, { data: ci }, { data: mt }, { data: ms }, { data: pm }, { data: mp }, { data: fo }] =
      await Promise.all([
        supabase.from("clients").select("id, name, invite_code, profile_id, subscription_until, created_at"),
        supabase.from("assigned_workouts").select("id, date, title, client_id, completed_at, clients(name)"),
        supabase
          .from("checkins")
          .select("client_id, created_at, clients(name)")
          .order("created_at", { ascending: false }),
        supabase.from("meetings").select("*, clients(name)").order("scheduled_at", { ascending: true }),
        supabase
          .from("messages")
          .select("sender, created_at, clients(name)")
          .eq("sender", "client")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("payments")
          .select("amount, created_at, clients(name)")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("payments")
          .select("amount, created_at")
          .gte("created_at", monthStart.toISOString()),
        supabase.from("food_entries").select("client_id, date"),
      ]);
    setClients((cl as Client[]) || []);
    setWorkouts((wo as unknown as AssignedWorkout[]) || []);
    setCheckins((ci as unknown as Checkin[]) || []);
    setMeetings((mt as unknown as Meeting[]) || []);
    setMessages((ms as unknown as Message[]) || []);
    setPayments((pm as unknown as Payment[]) || []);
    setMonthPayments(mp || []);
    setFoodEntries((fo as { client_id: string; date: string }[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    loadQuestions();
    try {
      setFeedSeenAt(localStorage.getItem("sashafit_feed_seen_at"));
    } catch {
      /* ігноруємо — немає доступу до localStorage */
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem("sashafit_feed_seen_at", new Date().toISOString());
    } catch {
      /* ігноруємо — немає доступу до localStorage */
    }
  }, [loading]);

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

  const lastCheckinByClient: Record<string, string> = {};
  for (const ci of checkins) {
    if (!lastCheckinByClient[ci.client_id]) lastCheckinByClient[ci.client_id] = ci.created_at;
  }

  // ---- Пропущені тренування поспіль (з дня призначення, рахуючи до сьогодні) ----
  // Беремо всі минулі призначені тренування клієнта, від найновішого до найстарішого,
  // і рахуємо, скільки підряд не позначені виконаними — зупиняємось на першому виконаному.
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

  // ---- Потребують уваги: ризик-статус кожного клієнта з причиною ----
  type RiskRow = { client: Client; level: RiskLevel; reason: string };
  const riskRows: RiskRow[] = clients
    .map((c) => {
      let level = clientRisk(c, lastCheckinByClient[c.id]);
      let reason = "";
      if (level === "risk") {
        reason = "прострочена підписка";
      } else if (level === "pending") {
        const d = daysBetween(today, new Date(c.created_at));
        reason = `запрошено ${d} ${d === 1 ? "день" : "дні"} тому, ще не підключився`;
      } else if (level === "watch") {
        if (!c.profile_id) {
          const d = daysBetween(today, new Date(c.created_at));
          reason = `не підключився ${d} днів`;
        } else {
          const last = lastCheckinByClient[c.id];
          reason = last
            ? `немає чек-іну ${daysBetween(today, new Date(last))} днів`
            : "ще жодного чек-іну";
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

      return { client: c, level, reason };
    })
    .filter((r) => r.level === "risk" || r.level === "watch" || r.level === "pending")
    .sort((a, b) => {
      const order: Record<RiskLevel, number> = { risk: 0, watch: 1, pending: 2, ok: 3 };
      return order[a.level] - order[b.level];
    })
    .slice(0, 6);

  const upcomingMeetings = meetings.filter((m) => new Date(m.scheduled_at).getTime() >= Date.now());
  const nextMeeting = upcomingMeetings[0];

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const workoutsByDate: Record<string, AssignedWorkout[]> = {};
  for (const w of workouts) {
    (workoutsByDate[w.date] = workoutsByDate[w.date] || []).push(w);
  }

  const foodByDate: Record<string, { client_id: string; date: string }[]> = {};
  for (const f of foodEntries) {
    (foodByDate[f.date] = foodByDate[f.date] || []).push(f);
  }

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const dayWorkouts = selectedDay ? workoutsByDate[selectedDay] || [] : [];

  function relTime(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "щойно";
    if (mins < 60) return `${mins} хв тому`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} год тому`;
    const days = Math.floor(hours / 24);
    return `${days} дн тому`;
  }

  const feed: FeedItem[] = [
    ...checkins.map((c, i) => ({
      key: `ci-${i}`,
      text: `${c.clients?.name || "Клієнт"} надіслав(ла) чек-ін`,
      at: c.created_at,
    })),
    ...messages.map((m, i) => ({
      key: `msg-${i}`,
      text: `${m.clients?.name || "Клієнт"} написав(ла) у чат`,
      at: m.created_at,
    })),
    ...payments.map((p, i) => ({
      key: `pay-${i}`,
      text: `Оплата від ${p.clients?.name || "клієнта"}${p.amount ? `: ${p.amount}` : ""}`,
      at: p.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  const activeCount = clients.filter((c) => c.subscription_until && c.subscription_until >= todayKey).length;
  const todayWorkouts = workoutsByDate[todayKey] || [];
  const todayCount = todayWorkouts.length;
  const foodTodayCount = new Set((foodByDate[todayKey] || []).map((f) => f.client_id)).size;

  // ---- Спарклайни для карток статистики (останні 7 днів) ----
  const last7Keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7Keys.push(toKey(d));
  }
  const newClientsPerDay = last7Keys.map(
    (k) => clients.filter((c) => toKey(new Date(c.created_at)) === k).length
  );
  const workoutsPerDay = last7Keys.map((k) => (workoutsByDate[k] || []).length);
  const paymentsAmountPerDay = last7Keys.map((k) =>
    monthPayments
      .filter((p) => toKey(new Date(p.created_at)) === k)
      .reduce((s, p) => s + (p.amount || 0), 0)
  );

  const newClientsThisWeek = newClientsPerDay.reduce((s, v) => s + v, 0);
  const expiringSoon = clients.filter((c) => {
    if (!c.subscription_until) return false;
    const d = daysBetween(new Date(c.subscription_until), today);
    return d >= 0 && d <= 7;
  }).length;

  // ---- Прогрес клієнтів: % виконання за 30 днів, найслабші першими ----
  const since30 = new Date(today);
  since30.setDate(since30.getDate() - 30);
  const since30Key = toKey(since30);
  type ProgressRow = { name: string; rate: number };
  const progressRows: ProgressRow[] = clients
    .filter((c) => c.profile_id)
    .map((c) => {
      const past = workouts.filter(
        (w) => w.client_id === c.id && w.date >= since30Key && w.date <= todayKey
      );
      if (past.length === 0) return null;
      const done = past.filter((w) => w.completed_at).length;
      return { name: clientLabel(c), rate: Math.round((done / past.length) * 100) };
    })
    .filter((r): r is ProgressRow => r !== null)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5);

  const monthTotal = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-1.5 text-left transition hover:bg-line/20 sm:p-3"
        >
          <p className="truncate text-[9px] text-muted sm:text-xs">👥 Клієнти</p>
          <div className="flex items-end justify-between gap-2">
            <p className="truncate font-display text-sm font-semibold text-ink sm:text-2xl">{clients.length}</p>
            {newClientsThisWeek > 0 && (
              <span className="hidden rounded bg-green-400/10 px-1.5 py-0.5 text-[11px] text-green-400 sm:inline">
                +{newClientsThisWeek} за тиждень
              </span>
            )}
          </div>
          <div className="hidden sm:block">
            <Sparkline values={newClientsPerDay} color="#4ADE80" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-1.5 text-left transition hover:bg-line/20 sm:p-3"
        >
          <p className="truncate text-[9px] text-muted sm:text-xs">✅ Підписки</p>
          <div className="flex items-end justify-between gap-2">
            <p className="truncate font-display text-sm font-semibold text-green-400 sm:text-2xl">{activeCount}</p>
            {expiringSoon > 0 && (
              <span className="hidden rounded bg-yellow-400/10 px-1.5 py-0.5 text-[11px] text-yellow-400 sm:inline">
                {expiringSoon} закінчуються
              </span>
            )}
          </div>
          <div className="hidden sm:block">
            <Sparkline values={workoutsPerDay} color="#F2615B" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-1.5 text-left transition hover:bg-line/20 sm:p-3"
        >
          <p className="truncate text-[9px] text-muted sm:text-xs">🏋 Сьогодні</p>
          <p className="truncate font-display text-sm font-semibold text-ink sm:text-2xl">{todayCount}</p>
          <div className="hidden sm:block">
            <Sparkline values={workoutsPerDay} color="#E8622C" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-1.5 text-left transition hover:bg-line/20 sm:p-3"
        >
          <p className="truncate text-[9px] text-muted sm:text-xs">🍽 Сьогодні</p>
          <p className="truncate font-display text-sm font-semibold text-ink sm:text-2xl">{foodTodayCount}</p>
          <div className="hidden sm:block">
            <Sparkline values={workoutsPerDay} color="#60A5FA" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("payments")}
          className="rounded-lg border-l-2 border-accent bg-surface p-1.5 text-left transition hover:bg-line/20 sm:p-3"
        >
          <p className="truncate text-[9px] text-muted sm:text-xs">💳 Оплата</p>
          <p className="truncate font-display text-sm font-semibold text-ink sm:text-2xl">{monthTotal.toLocaleString("uk-UA")} ₴</p>
          <div className="hidden sm:block">
            <Sparkline values={paymentsAmountPerDay} color="#4ADE80" />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-5">
          {riskRows.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-1 flex items-baseline justify-between text-sm font-semibold">
                <span>Потребують уваги</span>
                <span className="text-xs font-normal text-muted">{riskRows.length}</span>
              </h2>
              <div className="flex flex-col">
                {riskRows.map((r) => (
                  <div
                    key={r.client.id}
                    className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 first:border-t-0"
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${RISK_DOT[r.level]}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{clientLabel(r.client)}</span>
                    <span className="whitespace-nowrap text-xs text-muted">{r.reason}</span>
                    <div className="ml-auto flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                      {!r.client.profile_id && (
                        <button
                          type="button"
                          onClick={() => copyRowInvite(r.client.id, r.client.invite_code)}
                          className="whitespace-nowrap rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent"
                        >
                          {copiedRowId === r.client.id ? "Скопійовано" : "Копіювати посилання"}
                        </button>
                      )}
                      {onOpenClients && (
                        <button
                          type="button"
                          onClick={onOpenClients}
                          className="whitespace-nowrap rounded-full border border-accent/40 px-2.5 py-1 text-xs text-accent"
                        >
                          Відкрити
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => cancelClient(r.client.id)}
                        className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs text-muted"
                      >
                        Відключити
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {nextMeeting && (
            <div className="border-l-2 border-accent bg-surface p-3 text-sm">
              <p className="font-display text-sm font-medium text-accent">Найближча зустріч</p>
              <p className="mt-1">
                {nextMeeting.title}
                {nextMeeting.clients?.name ? ` — ${nextMeeting.clients.name}` : ""}
              </p>
              <p className="text-muted">
                {new Date(nextMeeting.scheduled_at).toLocaleString("uk-UA", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {nextMeeting.link && (
                <a href={nextMeeting.link} target="_blank" rel="noreferrer" className="text-accent underline">
                  Посилання на дзвінок
                </a>
              )}
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mx-auto w-full max-w-[280px]">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCursor(new Date(year, month - 1, 1))}
                  className="rounded bg-paper px-2 py-1 text-xs"
                >
                  ‹
                </button>
                <span className="font-display text-xs font-medium">
                  {MONTHS[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={() => setCursor(new Date(year, month + 1, 1))}
                  className="rounded bg-paper px-2 py-1 text-xs"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-0.5">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const key = toKey(d);
                  const workoutCount = workoutsByDate[key]?.length || 0;
                  const foodCount = new Set((foodByDate[key] || []).map((f) => f.client_id)).size;
                  const hasAny = workoutCount > 0 || foodCount > 0;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  return (
                    <div key={key} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className={`flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] ${
                          hasAny ? "border-accent/40 bg-accent/10" : "border-line bg-paper text-muted"
                        } ${isToday ? "ring-1 ring-accent" : ""} ${isSelected ? "outline outline-2 outline-accent" : ""}`}
                      >
                        <span>{d.getDate()}</span>
                        {hasAny && (
                          <span className="flex items-center gap-1 text-[7px] leading-none">
                            {workoutCount > 0 && <span className="text-accent">🏋{workoutCount}</span>}
                            {foodCount > 0 && <span className="text-blue-400">🍽{foodCount}</span>}
                          </span>
                        )}
                      </button>
                      {hasAny && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
                          <p className="font-medium">
                            {d.getDate()} {MONTHS[month].toLowerCase()} {year}
                          </p>
                          {workoutCount > 0 && <p className="text-neutral-300">🏋 Тренувань: {workoutCount}</p>}
                          {foodCount > 0 && <p className="text-neutral-300">🍽 Залогували їжу: {foodCount}</p>}
                          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedDay && (
              <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
                <p className="mb-2 font-medium">{selectedDay}</p>
                {dayWorkouts.length === 0 ? (
                  <p className="text-muted">Тренувань не призначено.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-muted">
                    {dayWorkouts.map((w) => (
                      <li key={w.id}>
                        {w.clients?.name || "—"} — {w.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Кнопку "Нова зустріч" прибрано звідси — тепер вона в хедері
              (сторінка dashboard), доступна з будь-якої вкладки. Створення
              клієнта — тільки через вкладку "Клієнти", щоб не дублювати
              цю дію в двох місцях. */}

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
                  {mErr && <p className="text-sm text-red-400">{mErr}</p>}
                </div>
              </div>
              </div>,
              document.body
            )}

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Усі зустрічі ({meetings.length})</h2>
            <div className="flex flex-col gap-2">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {m.title}
                      {m.clients?.name ? ` — ${m.clients.name}` : ""}
                    </p>
                    <p className="text-muted">
                      {new Date(m.scheduled_at).toLocaleString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button type="button" onClick={() => deleteMeeting(m.id)} className="text-xs text-red-400">
                    Видалити
                  </button>
                </div>
              ))}
              {meetings.length === 0 && <p className="text-sm text-muted">Зустрічей ще немає.</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Сьогодні</h2>
            {upcomingMeetings.filter((m) => toKey(new Date(m.scheduled_at)) === todayKey).length === 0 &&
            todayWorkouts.length === 0 ? (
              <p className="text-sm text-muted">На сьогодні нічого не запланованo.</p>
            ) : (
              <div className="flex flex-col gap-2.5 text-sm">
                {upcomingMeetings
                  .filter((m) => toKey(new Date(m.scheduled_at)) === todayKey)
                  .map((m) => (
                    <div key={m.id} className="flex gap-2.5">
                      <span className="w-11 flex-shrink-0 text-xs text-muted">
                        {new Date(m.scheduled_at).toLocaleTimeString("uk-UA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>
                        <span className="font-medium">{m.clients?.name || "Без клієнта"}</span>
                        <br />
                        <span className="text-xs text-muted">{m.title}</span>
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

          {progressRows.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold">
                <span>Прогрес клієнтів</span>
                <span className="text-xs font-normal text-muted">30 днів</span>
              </h2>
              <div className="flex flex-col gap-3">
                {progressRows.map((r) => (
                  <div key={r.name}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{r.name}</span>
                      <span className="text-muted">{r.rate}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.rate}%`,
                          background: r.rate < 50 ? "#F2615B" : r.rate < 75 ? "#facc15" : "#E8622C",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">Оплата</h2>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-muted">Цей місяць</span>
              <span className="font-display text-xl font-semibold">{monthTotal.toLocaleString("uk-UA")} ₴</span>
            </div>
            <p className="text-xs text-muted">
              {activeCount} активних підписок{expiringSoon > 0 ? ` · ${expiringSoon} закінчуються протягом тижня` : ""}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold">Питання чек-іна</h2>
            <p className="mb-2 text-xs text-muted">
              Додаткові питання, які клієнт побачить і заповнить під час щотижневого чек-іна.
            </p>
            <div className="flex flex-col gap-1.5">
              {checkinQuestions.map((q) => (
                <div key={q.id} className="flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs">
                  <span>
                    {q.label}
                    {q.kind === "scale" && <span className="text-muted"> (шкала 1–5)</span>}
                  </span>
                  <button type="button" onClick={() => deleteQuestion(q.id)} className="text-red-400">
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
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Останні події</h2>
            {feed.length === 0 ? (
              <p className="text-sm text-muted">Подій ще немає.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {feed.map((f) => {
                  const isNew = feedSeenAt != null && new Date(f.at).getTime() > new Date(feedSeenAt).getTime();
                  return (
                    <li key={f.key} className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {isNew && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                        {f.text}
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted">{relTime(f.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
