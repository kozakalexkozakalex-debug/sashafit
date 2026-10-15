"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatPanel from "@/components/ChatPanel";

type Client = {
  id: string;
  name: string;
  profile_id: string | null;
  subscription_until: string | null;
  created_at: string;
};
type AssignedWorkout = {
  id: string;
  date: string;
  title: string;
  client_id: string;
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

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export default function CoachHome() {
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function load() {
    setLoading(true);
    const [{ data: cl }, { data: wo }, { data: ci }, { data: mt }, { data: ms }, { data: pm }] = await Promise.all([
      supabase.from("clients").select("id, name, profile_id, subscription_until, created_at"),
      supabase.from("assigned_workouts").select("id, date, title, client_id, clients(name)"),
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
    ]);
    setClients((cl as Client[]) || []);
    setWorkouts((wo as unknown as AssignedWorkout[]) || []);
    setCheckins((ci as unknown as Checkin[]) || []);
    setMeetings((mt as unknown as Meeting[]) || []);
    setMessages((ms as unknown as Message[]) || []);
    setPayments((pm as unknown as Payment[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
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
    load();
  }

  async function deleteMeeting(id: string) {
    await supabase.from("meetings").delete().eq("id", id);
    load();
  }

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const today = new Date();
  const todayKey = toKey(today);

  const expiredClients = clients.filter((c) => c.subscription_until && c.subscription_until < todayKey);

  const lastCheckinByClient: Record<string, string> = {};
  for (const ci of checkins) {
    if (!lastCheckinByClient[ci.client_id]) lastCheckinByClient[ci.client_id] = ci.created_at;
  }
  const staleCheckinClients = clients.filter((c) => {
    if (!c.profile_id) return false;
    const last = lastCheckinByClient[c.id];
    if (!last) return true;
    const days = (today.getTime() - new Date(last).getTime()) / 86400000;
    return days > 7;
  });
  const pendingClients = clients.filter((c) => {
    if (c.profile_id) return false;
    const days = (today.getTime() - new Date(c.created_at).getTime()) / 86400000;
    return days > 3;
  });

  const warnings: string[] = [
    ...expiredClients.map((c) => `Прострочена підписка: ${c.name}`),
    ...staleCheckinClients.map((c) => `Немає чек-іну 7+ днів: ${c.name}`),
    ...pendingClients.map((c) => `Досі не підключився (3+ дні): ${c.name}`),
  ];

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

  const connectedCount = clients.filter((c) => c.profile_id).length;
  const activeCount = clients.filter((c) => c.subscription_until && c.subscription_until >= todayKey).length;
  const todayCount = (workoutsByDate[todayKey] || []).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
    <div className="flex flex-col gap-6">
      {warnings.length > 0 && (
        <div className="border-l-2 border-accent bg-surface p-3 text-sm">
          <p className="mb-1 font-display text-sm font-medium text-accent">Варто перевірити</p>
          <ul className="flex flex-col gap-0.5 text-muted">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="text-xs text-muted">Клієнтів</p>
          <p className="font-display text-lg font-medium">{clients.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="text-xs text-muted">Підключено</p>
          <p className="font-display text-lg font-medium">{connectedCount}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="text-xs text-muted">Активні підписки</p>
          <p className="font-display text-lg font-medium text-green-400">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="text-xs text-muted">Тренувань сьогодні</p>
          <p className="font-display text-lg font-medium">{todayCount}</p>
        </div>
      </div>

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
                  {c.name}
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
        <h2 className="mb-3 text-sm font-semibold">Останні події</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-muted">Подій ще немає.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {feed.map((f) => (
              <li key={f.key} className="flex items-baseline justify-between gap-2">
                <span>{f.text}</span>
                <span className="whitespace-nowrap text-xs text-muted">{relTime(f.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ChatPanel mode="coach" />
    </div>
    </div>
  );
}
