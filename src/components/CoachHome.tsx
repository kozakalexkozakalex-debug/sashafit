"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatPanel from "@/components/ChatPanel";
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

type NavTab = "clients" | "checkins" | "programs" | "rations" | "analytics" | "payments";

export default function CoachHome({
  onOpenClients,
  onNavigate,
}: {
  onOpenClients?: () => void;
  onNavigate?: (tab: NavTab) => void;
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
  const [heatWeeks, setHeatWeeks] = useState(12);

  const [mTitle, setMTitle] = useState("");
  const [mClientId, setMClientId] = useState("");
  const [mDateTime, setMDateTime] = useState("");
  const [mLink, setMLink] = useState("");
  const [mNote, setMNote] = useState("");
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [aBusy, setABusy] = useState(false);
  const [aErr, setAErr] = useState("");
  const [aInviteCode, setAInviteCode] = useState<string | null>(null);
  const [aCopied, setACopied] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

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

  async function addClientQuick() {
    setAErr("");
    setABusy(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: null, goal: null })
      .select("invite_code")
      .single();
    setABusy(false);
    if (error) {
      setAErr(error.message);
      return;
    }
    setAInviteCode(data?.invite_code || null);
    load();
  }

  async function cancelClient(id: string) {
    if (!window.confirm("Відключити цього клієнта? Усі його дані (чек-іни, тренування, харчування) будуть видалені.")) {
      return;
    }
    await supabase.from("clients").delete().eq("id", id);
    load();
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setACopied(true);
      setTimeout(() => setACopied(false), 1500);
    } catch {
      /* ігноруємо — просто немає буфера обміну */
    }
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

  function closeAdd() {
    setAddOpen(false);
    setAInviteCode(null);
    setAErr("");
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

  // ---- Потребують уваги: ризик-статус кожного клієнта з причиною ----
  type RiskRow = { client: Client; level: RiskLevel; reason: string };
  const riskRows: RiskRow[] = clients
    .map((c) => {
      const level = clientRisk(c, lastCheckinByClient[c.id]);
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

  // ---- Heatmap активності: виконані тренування по днях, діапазон тижнів обирає коуч ----
  const HEAT_WEEK_OPTIONS = [4, 8, 12, 24];
  const HEATMAP_DAYS = heatWeeks * 7;
  const heatmapCells: { key: string; count: number }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toKey(d);
    const count = (workoutsByDate[key] || []).filter((w) => w.completed_at).length;
    heatmapCells.push({ key, count });
  }
  function heatLevel(count: number) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    return 3;
  }
  const HEAT_SHADES = ["bg-line/30", "bg-accent/35", "bg-accent/65", "bg-accent"];

  // ---- Heatmap активності харчування: останні 12 тижнів, скільки клієнтів логували їжу по днях ----
  const foodHeatmapCells: { key: string; count: number }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toKey(d);
    const count = new Set((foodByDate[key] || []).map((f) => f.client_id)).size;
    foodHeatmapCells.push({ key, count });
  }

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
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => (addOpen ? closeAdd() : setAddOpen(true))}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-paper"
        >
          <span className="text-base leading-none">+</span> Додати клієнта
        </button>
      </div>

      {addOpen && (
        <div className="rounded-xl border border-line bg-surface p-4">
          {aInviteCode ? (
            <div className="text-sm">
              <p className="mb-2 font-medium text-green-400">Клієнта додано!</p>
              <p className="mb-2 text-muted">Надішли цю посилання клієнту — за нею він зайде і підключиться:</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 break-all rounded bg-paper px-2 py-1 text-xs text-muted">
                  {inviteUrl(aInviteCode)}
                </p>
                <button
                  type="button"
                  onClick={() => copyInvite(aInviteCode)}
                  className="whitespace-nowrap rounded bg-paper px-2 py-1 text-xs text-accent"
                >
                  {aCopied ? "Скопійовано" : "Копіювати"}
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAInviteCode(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs"
                >
                  Додати ще одного
                </button>
                <button type="button" onClick={closeAdd} className="rounded-lg border border-line px-3 py-1.5 text-xs">
                  Закрити
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">
                Нічого вказувати не треба — просто створи посилання. Клієнт сам впише своє ім&apos;я, коли зайде за
                ним і заповнить анкету.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={aBusy}
                  onClick={addClientQuick}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
                >
                  {aBusy ? "Створюю…" : "Створити посилання"}
                </button>
                <button type="button" onClick={closeAdd} className="rounded-lg border border-line px-3 py-2 text-sm">
                  Скасувати
                </button>
              </div>
              {aErr && <p className="text-sm text-red-400">{aErr}</p>}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-3 text-left transition hover:bg-line/20"
        >
          <p className="text-xs text-muted">Клієнтів</p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-display text-2xl font-semibold text-ink">{clients.length}</p>
            {newClientsThisWeek > 0 && (
              <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[11px] text-green-400">
                +{newClientsThisWeek} за тиждень
              </span>
            )}
          </div>
          <Sparkline values={newClientsPerDay} color="#4ADE80" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-3 text-left transition hover:bg-line/20"
        >
          <p className="text-xs text-muted">Активні підписки</p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-display text-2xl font-semibold text-green-400">{activeCount}</p>
            {expiringSoon > 0 && (
              <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-[11px] text-yellow-400">
                {expiringSoon} закінчуються
              </span>
            )}
          </div>
          <Sparkline values={workoutsPerDay} color="#F2615B" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-3 text-left transition hover:bg-line/20"
        >
          <p className="text-xs text-muted">Тренувань сьогодні</p>
          <p className="font-display text-2xl font-semibold text-ink">{todayCount}</p>
          <Sparkline values={workoutsPerDay} color="#E8622C" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("clients")}
          className="rounded-lg border-l-2 border-accent bg-surface p-3 text-left transition hover:bg-line/20"
        >
          <p className="text-xs text-muted">Харчування сьогодні</p>
          <p className="font-display text-2xl font-semibold text-ink">{foodTodayCount}</p>
          <Sparkline values={workoutsPerDay} color="#60A5FA" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("payments")}
          className="rounded-lg border-l-2 border-accent bg-surface p-3 text-left transition hover:bg-line/20"
        >
          <p className="text-xs text-muted">Оплата цього місяця</p>
          <p className="font-display text-2xl font-semibold text-ink">{monthTotal.toLocaleString("uk-UA")} ₴</p>
          <Sparkline values={paymentsAmountPerDay} color="#4ADE80" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Активність</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted">Період:</span>
                {HEAT_WEEK_OPTIONS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setHeatWeeks(w)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      heatWeeks === w ? "border-accent bg-accent text-paper" : "border-line text-muted"
                    }`}
                  >
                    {w} тижн.
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="mb-1.5 text-[11px] text-muted">Тренування (виконано)</p>
                <div className="grid grid-cols-7 gap-[2px]">
                  {heatmapCells.map((c) => (
                    <div
                      key={c.key}
                      title={`${c.key}: ${c.count} виконано`}
                      className={`flex h-4 w-4 items-center justify-center rounded-sm text-[7px] leading-none font-medium ${
                        HEAT_SHADES[heatLevel(c.count)]
                      } ${c.count > 0 ? "text-paper" : "text-muted"}`}
                    >
                      {c.count}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-muted">Харчування (клієнтів залогувало)</p>
                <div className="grid grid-cols-7 gap-[2px]">
                  {foodHeatmapCells.map((c) => (
                    <div
                      key={c.key}
                      title={`${c.key}: ${c.count} клієнт(ів) залогували їжу`}
                      className={`flex h-4 w-4 items-center justify-center rounded-sm text-[7px] leading-none font-medium ${
                        HEAT_SHADES[heatLevel(c.count)]
                      } ${c.count > 0 ? "text-paper" : "text-muted"}`}
                    >
                      {c.count}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
              менше
              {HEAT_SHADES.map((s, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-sm ${s}`} />
              ))}
              більше
            </div>
          </div>

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
                    className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0"
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${RISK_DOT[r.level]}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{clientLabel(r.client)}</span>
                    <span className="whitespace-nowrap text-xs text-muted">{r.reason}</span>
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
                  const count = workoutsByDate[key]?.length || 0;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      className={`flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] ${
                        count > 0 ? "border-accent/40 bg-accent/10" : "border-line bg-paper text-muted"
                      } ${isToday ? "ring-1 ring-accent" : ""} ${isSelected ? "outline outline-2 outline-accent" : ""}`}
                    >
                      <span>{d.getDate()}</span>
                      {count > 0 && <span className="text-[8px] text-accent">🏋{count}</span>}
                    </button>
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

          <div className="border border-dashed border-line/80 p-4">
            <h2 className="mb-3 text-sm font-semibold">+ Нова зустріч</h2>
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
          <ChatPanel mode="coach" />
        </div>
      </div>
    </div>
  );
}
