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
function agoShort(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "щойно";
  if (mins < 60) return `${mins} хв`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} год`;
  return `${Math.floor(hours / 24)} дн`;
}

const RISK_DOT: Record<RiskLevel, string> = {
  risk: "bg-danger",
  watch: "bg-warn",
  pending: "bg-muted",
  ok: "bg-success",
};

type Action = "checkin" | "message" | "write" | null;
type Row = {
  client: Client;
  level: RiskLevel;
  tags: string[];
  action: Action;
  hasCheckin: boolean;
  hasMessage: boolean;
  meta: string;
  weightText: string;
};
type Filter = "all" | "checkin" | "message" | "risk";

export default function CoachHome({
  onOpenClient,
  onOpenChat,
  unread,
  actionSignal,
}: {
  // Відкриває вкладку "Клієнти" одразу з карткою цього клієнта.
  onOpenClient?: (clientId: string) => void;
  // Відкриває попап чату з цим клієнтом.
  onOpenChat?: (clientId: string) => void;
  // Непрочитані повідомлення по клієнтах (рахує CoachDashboard).
  unread?: UnreadInfo;
  // Дозволяє відкрити форму "Нова зустріч" ззовні — з кнопки в хедері.
  actionSignal?: { ts: number } | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [foodEntries, setFoodEntries] = useState<{ client_id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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

  async function load() {
    setLoading(true);
    // Тренування та їжу тягнемо лише за останні 30 днів — для головної цього
    // достатньо, і вона лишається швидкою.
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
    if (!window.confirm("Видалити це запрошення? Усі дані клієнта (чек-іни, тренування, харчування) будуть видалені.")) {
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

  // Чек-іни вже від нових до старих.
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

  const connected = clients.filter((c) => c.profile_id);
  const pendingInvites = clients.filter((c) => !c.profile_id);

  // Один рядок на клієнта: що від тебе потрібно (теги + кнопка) або,
  // якщо все гаразд, короткі цифри.
  const rows: Row[] = connected.map((c) => {
    const list = checkinsByClient[c.id] || [];
    const last = list[0];
    let level = clientRisk(c, last?.created_at);
    const tags: string[] = [];

    // Чек-ін чекає на перевірку
    const idx = list.findIndex((x) => !x.reviewed_at);
    const hasCheckin = idx >= 0;
    if (hasCheckin) {
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
      tags.push(`Чек-ін надіслано${wText}`);
    }

    // Непрочитане повідомлення
    const u = unread?.[c.id];
    const hasMessage = !!u;
    if (u) tags.push(`Нове повідомлення${u.count > 1 ? ` · ${u.count}` : ""} · ${agoShort(u.lastAt)} тому`);

    // Ризик: немає чек-іну, пропущені тренування
    const streak = missedStreak(c.id);
    if (level === "watch") {
      tags.push(last ? `Немає чек-іну ${daysBetween(today, new Date(last.created_at))} дн` : "Ще жодного чек-іну");
    }
    if (streak >= 2) {
      tags.push(`${streak} тренувань поспіль пропущено`);
      if (level === "ok") level = "watch";
    }

    const week = workouts.filter((w) => w.client_id === c.id && w.date > weekAgoKey && w.date <= todayKey);
    const weekDone = week.filter((w) => w.completed_at).length;
    const meta = [
      `Чек-ін: ${last ? agoText(daysBetween(today, new Date(last.created_at))) : "—"}`,
      `Тренування: ${week.length > 0 ? `${weekDone}/${week.length}` : "—"}`,
    ].join(" · ");

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

    const action: Action = hasCheckin ? "checkin" : hasMessage ? "message" : level !== "ok" ? "write" : null;
    return { client: c, level, tags, action, hasCheckin, hasMessage, meta, weightText };
  });

  const actionRank: Record<string, number> = { checkin: 0, message: 1, write: 2 };
  const levelOrder: Record<RiskLevel, number> = { risk: 0, watch: 1, pending: 2, ok: 3 };
  const checkinCount = rows.filter((r) => r.hasCheckin).length;
  const messageCount = rows.filter((r) => r.hasMessage).length;
  const riskCount = rows.filter((r) => r.level !== "ok").length;

  const q = search.trim().toLowerCase();
  const visibleRows = rows
    .filter((r) => !q || clientLabel(r.client).toLowerCase().includes(q))
    .filter(
      (r) =>
        filter === "all" ||
        (filter === "checkin" && r.hasCheckin) ||
        (filter === "message" && r.hasMessage) ||
        (filter === "risk" && r.level !== "ok")
    )
    .sort(
      (a, b) =>
        (a.action ? actionRank[a.action] : 3) - (b.action ? actionRank[b.action] : 3) ||
        levelOrder[a.level] - levelOrder[b.level] ||
        clientLabel(a.client).localeCompare(clientLabel(b.client), "uk")
    );

  const upcomingMeetings = meetings.filter((m) => new Date(m.scheduled_at).getTime() >= Date.now());
  const todayMeetings = upcomingMeetings.filter((m) => toKey(new Date(m.scheduled_at)) === todayKey);
  const laterMeetings = upcomingMeetings.filter((m) => toKey(new Date(m.scheduled_at)) !== todayKey).slice(0, 5);
  const todayWorkouts = workouts.filter((w) => w.date === todayKey);
  const hasSchedule = todayMeetings.length > 0 || todayWorkouts.length > 0 || laterMeetings.length > 0;

  const todayLabel = today.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-display text-lg font-semibold capitalize">{todayLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["checkin", "Чек-іни", checkinCount],
              ["message", "Повідомлення", messageCount],
              ["risk", "Увага", riskCount],
            ] as [Filter, string, number][]
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(filter === id ? "all" : id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === id ? "border-brand bg-brand/10 text-ink" : "border-line text-muted"
              }`}
            >
              {label} <span className={n > 0 ? "font-semibold text-brand" : ""}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Клієнти</h2>
          {connected.length > 6 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук"
              className="w-36 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none"
            />
          )}
        </div>

        {connected.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            Підключених клієнтів ще немає. Створи запрошення кнопкою «Заявки» зверху і надішли клієнту посилання.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="py-4 text-sm text-muted">{filter === "all" ? "Нікого не знайдено." : "Тут усе розібрано ✓"}</p>
        ) : (
          <div className="rounded-xl bg-surface px-3">
            {visibleRows.map((r) => {
              const c = r.client;
              return (
                <div key={c.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => onOpenClient?.(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand/15 font-display text-sm font-semibold text-brand">
                      {clientLabel(c).charAt(0).toUpperCase()}
                      <span
                        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${RISK_DOT[r.level]}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{clientLabel(c)}</span>
                      {r.tags.length > 0 ? (
                        <span className="block text-xs text-ink/80">{r.tags.join(" · ")}</span>
                      ) : (
                        <span className="block text-xs text-muted">
                          {r.meta}
                          {foodTodayByClient.has(c.id) ? " · 🍽" : ""}
                        </span>
                      )}
                    </span>
                  </button>
                  {r.action ? (
                    <button
                      type="button"
                      onClick={() => (r.action === "checkin" ? setReviewClientId(c.id) : onOpenChat?.(c.id))}
                      className={`flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                        r.action === "checkin" ? "bg-accent text-paper" : "border border-brand/40 text-brand"
                      }`}
                    >
                      {r.action === "checkin" ? "Перевірити" : r.action === "message" ? "Відповісти" : "Написати"}
                    </button>
                  ) : (
                    <span className="flex flex-none items-center gap-2 text-xs text-muted">
                      {r.weightText}
                      <span>›</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {pendingInvites.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Очікують входу</h2>
          <div className="rounded-xl bg-surface px-3">
            {pendingInvites.map((c) => {
              const d = daysBetween(today, new Date(c.created_at));
              return (
                <div key={c.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{clientLabel(c)}</span>
                    <span className="block text-xs text-muted">запрошено {agoText(d)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyRowInvite(c.id, c.invite_code)}
                    className="flex-none whitespace-nowrap rounded-full border border-brand/40 px-3 py-1.5 text-xs text-brand"
                  >
                    {copiedRowId === c.id ? "Скопійовано" : "Посилання"}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelClient(c.id)}
                    className="flex-none text-xs text-muted"
                    aria-label="Видалити запрошення"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hasSchedule && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Розклад</h2>
          <div className="rounded-xl bg-surface px-3">
            {todayMeetings.map((m) => (
              <div key={m.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                <span className="w-12 flex-none text-xs text-muted">
                  {new Date(m.scheduled_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{m.title}</span>
                  {m.clients?.name ? <span className="text-muted"> · {m.clients.name}</span> : null}
                  {m.link && (
                    <>
                      {" "}
                      <a href={m.link} target="_blank" rel="noreferrer" className="text-xs text-brand underline">
                        дзвінок
                      </a>
                    </>
                  )}
                </span>
                <button type="button" onClick={() => deleteMeeting(m.id)} className="flex-none text-xs text-muted" aria-label="Видалити зустріч">
                  ✕
                </button>
              </div>
            ))}
            {todayWorkouts.length > 0 && (
              <div className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                <span className="w-12 flex-none text-xs text-muted">Сьогодні</span>
                <span className="text-sm">
                  Тренуються {new Set(todayWorkouts.map((w) => w.client_id)).size} · виконано{" "}
                  {todayWorkouts.filter((w) => w.completed_at).length} з {todayWorkouts.length}
                </span>
              </div>
            )}
            {laterMeetings.map((m) => (
              <div key={m.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                <span className="w-12 flex-none text-xs text-muted">
                  {new Date(m.scheduled_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{m.title}</span>
                  {m.clients?.name ? <span className="text-muted"> · {m.clients.name}</span> : null}
                </span>
                <button type="button" onClick={() => deleteMeeting(m.id)} className="flex-none text-xs text-muted" aria-label="Видалити зустріч">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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
