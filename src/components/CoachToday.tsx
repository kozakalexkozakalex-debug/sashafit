"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import { UnreadInfo } from "@/lib/coachUnread";
import CheckinReviewSheet from "@/components/CheckinReviewSheet";
import Avatar from "@/components/Avatar";
import NavIcon from "@/components/NavIcon";
import { useAvatars } from "@/lib/useAvatars";

type Client = {
  id: string;
  name: string | null;
  invite_code: string;
  profile_id: string | null;
  created_at: string;
  avatar_path: string | null;
};
type Task = {
  key: string;
  clientId: string;
  kind: "checkin" | "message" | "silent";
  title: string;
  hint: string;
  button: string;
};

// Скільки днів без жодної активності клієнта вважаємо «пропав».
const SILENT_DAYS = 4;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Екран «Сьогодні»: список того, що потребує тренера просто зараз. Кожна задача — одна кнопка.
export default function CoachToday({
  unread,
  onOpenChat,
  onOpenClient,
  onQuick,
}: {
  onQuick?: (kind: "meeting" | "clients" | "library" | "chat") => void;
  unread: UnreadInfo;
  onOpenChat: (clientId: string) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [toReview, setToReview] = useState<Record<string, number>>({});
  const [lastActive, setLastActive] = useState<Record<string, string>>({});
  const [adherence, setAdherence] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [coachName, setCoachName] = useState("");

  async function load() {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceKey = dayKey(since);
    const [{ data: cl }, { data: ci }, { data: wo }, { data: fo }] = await Promise.all([
      supabase.from("clients").select("id, name, invite_code, profile_id, created_at, avatar_path"),
      supabase.from("checkins").select("client_id, created_at, reviewed_at").gte("created_at", since.toISOString()),
      supabase.from("assigned_workouts").select("client_id, date, completed_at").gte("date", sinceKey),
      supabase.from("food_entries").select("client_id, date").gte("date", sinceKey),
    ]);
    setClients(((cl as Client[]) || []).filter((c) => c.profile_id));

    const fresh: Record<string, number> = {};
    const last: Record<string, string> = {};
    const touch = (id: string, day: string) => {
      if (!last[id] || day > last[id]) last[id] = day;
    };
    for (const r of (ci as { client_id: string; created_at: string; reviewed_at: string | null }[]) || []) {
      if (!r.reviewed_at) fresh[r.client_id] = (fresh[r.client_id] || 0) + 1;
      touch(r.client_id, r.created_at.slice(0, 10));
    }
    const weekAgoKey = dayKey(new Date(Date.now() - 6 * 86400000));
    const todayKey = dayKey(new Date());
    let planned = 0;
    let done = 0;
    for (const r of (wo as { client_id: string; date: string; completed_at: string | null }[]) || []) {
      if (r.completed_at) touch(r.client_id, r.date);
      if (r.date >= weekAgoKey && r.date <= todayKey) {
        planned++;
        if (r.completed_at) done++;
      }
    }
    setAdherence(planned > 0 ? Math.round((done / planned) * 100) : null);
    for (const r of (fo as { client_id: string; date: string }[]) || []) touch(r.client_id, r.date);
    setToReview(fresh);
    setLastActive(last);
    setLoading(false);
  }

  useEffect(() => {
    load();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const n = (data as { full_name: string | null } | null)?.full_name;
      if (n) setCoachName(n.split(" ")[0]);
    })();
  }, []);

  const todayMs = new Date(dayKey(new Date())).getTime();
  const tasks: Task[] = [];

  for (const c of clients) {
    const n = toReview[c.id] || 0;
    if (n > 0) {
      tasks.push({
        key: `ci-${c.id}`,
        clientId: c.id,
        kind: "checkin",
        title: `Чек-ін — ${clientLabel(c)}`,
        hint: n > 1 ? `Нових: ${n}` : "Чекає перевірки",
        button: "Перевірити",
      });
    }
  }
  for (const c of clients) {
    const n = unread[c.id]?.count || 0;
    if (n > 0) {
      tasks.push({
        key: `msg-${c.id}`,
        clientId: c.id,
        kind: "message",
        title: `Повідомлення — ${clientLabel(c)}`,
        hint: n > 1 ? `Без відповіді: ${n}` : "Без відповіді",
        button: "Відповісти",
      });
    }
  }
  for (const c of clients) {
    // Новим клієнтам даємо час освоїтись.
    const joinedDays = Math.floor((todayMs - new Date(c.created_at.slice(0, 10)).getTime()) / 86400000);
    if (joinedDays < SILENT_DAYS) continue;
    const last = lastActive[c.id];
    const quietDays = last ? Math.floor((todayMs - new Date(last).getTime()) / 86400000) : null;
    if (quietDays === null || quietDays >= SILENT_DAYS) {
      tasks.push({
        key: `silent-${c.id}`,
        clientId: c.id,
        kind: "silent",
        title: `Давно не заходив(ла) — ${clientLabel(c)}`,
        hint: quietDays === null ? "Жодної активності за 2 тижні" : `Без активності ${quietDays} дн`,
        button: "Написати",
      });
    }
  }

  const reviewClient = reviewId ? clients.find((c) => c.id === reviewId) : null;
  const avatars = useAvatars(clients);
  const attention = tasks.filter((t) => t.kind === "silent");
  const checkinTasks = tasks.filter((t) => t.kind === "checkin");
  const messageTasks = tasks.filter((t) => t.kind === "message");
  const todo = [...checkinTasks, ...messageTasks];
  const activeCount = clients.filter((c) => {
    const last = lastActive[c.id];
    return last && Math.floor((todayMs - new Date(last).getTime()) / 86400000) < 7;
  }).length;
  const newThisWeek = clients.filter((c) => todayMs - new Date(c.created_at.slice(0, 10)).getTime() < 7 * 86400000).length;
  const nameOf = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientLabel(c) : "";
  };
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Доброї ночі" : hour < 12 ? "Доброго ранку" : hour < 18 ? "Доброго дня" : "Доброго вечора";
  const pct = adherence ?? 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  const tileBase = "rounded-[22px] border border-line bg-gradient-to-br from-surface to-paper p-4";
  const tileTop = `flex h-[112px] flex-col justify-between ${tileBase}`;
  const tileBottom = `flex h-[92px] items-center gap-3 ${tileBase}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={coachName || "Т"} url={null} size={60} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{greeting},</p>
          <p className="truncate font-display text-2xl font-bold text-ink">{coachName || "тренер"} <span className="text-base text-muted">⌄</span></p>
        </div>
        <button
          type="button"
          onClick={() => onQuick?.("chat")}
          aria-label="Повідомлення"
          className="relative flex h-11 w-11 flex-none items-center justify-center text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          {todo.length > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-danger" />}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Завантаження…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={tileTop}>
              <span className="text-info"><NavIcon name="clients" className="h-6 w-6" /></span>
              <div>
                <p className="text-sm text-muted">Усього клієнтів</p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold leading-none text-ink">{clients.length}</span>
                  {newThisWeek > 0 && <span className="text-sm font-semibold text-success">↑ +{newThisWeek}</span>}
                </p>
              </div>
            </div>
            <div className={tileTop}>
              <span className="flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-success" />Активні</span>
              <div>
                <p className="text-sm text-muted">За 7 днів</p>
                <p className="mt-0.5 font-display text-3xl font-bold leading-none text-ink">{activeCount}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[1.35fr_1fr] gap-3">
            <div className={tileBottom}>
              <svg viewBox="0 0 64 64" className="h-16 w-16 flex-none -rotate-90" aria-hidden="true">
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="8" style={{ stroke: "rgb(var(--c-line))" }} />
                <circle
                  cx="32"
                  cy="32"
                  r={R}
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - pct / 100)}
                  style={{ stroke: "rgb(var(--c-accent))", filter: "drop-shadow(0 0 4px rgb(var(--c-accent) / 0.6))" }}
                />
              </svg>
              <div>
                <p className="font-display text-2xl font-bold leading-none text-ink">{adherence === null ? "—" : `${adherence}%`}</p>
                <p className="mt-1 text-sm text-muted">Виконання</p>
              </div>
            </div>
            <div className={tileBottom + " flex-col !items-start !justify-center !gap-1"}>
              <div className="flex items-center gap-2">
                <span style={{ color: "rgb(160 110 255)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
                </span>
                <span className="font-display text-2xl font-bold leading-none text-ink">{todo.length}</span>
              </div>
              <p className="text-sm text-muted">Очікують</p>
            </div>
          </div>

          {attention.length > 0 && (
            <div className="rounded-3xl border border-warn/60 bg-gradient-to-br from-warn/15 to-transparent p-4 shadow-[0_0_28px_-14px_rgb(var(--c-warn)/0.7)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold text-warn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v5M12 17.5v.5" /></svg> Потрібна увага</p>
                <button type="button" onClick={() => onQuick?.("clients")} className="text-xs text-ink">
                  Усі →
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {attention.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onOpenChat(t.clientId)}
                    className="flex items-center gap-3 text-left"
                  >
                    <Avatar name={nameOf(t.clientId)} url={avatars[t.clientId]} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{nameOf(t.clientId)}</span>
                      <span className="block truncate text-xs text-muted">{t.hint}</span>
                    </span>
                    <span className="h-2.5 w-2.5 flex-none rounded-full bg-warn" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-ink">Завдання на сьогодні</p>
              <button type="button" onClick={() => onQuick?.("clients")} className="text-xs text-ink">
                Усі →
              </button>
            </div>
            {todo.length === 0 ? (
              <p className="py-2 text-sm text-muted">✅ На сьогодні все: нових чек-інів і повідомлень немає.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {checkinTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReviewId(checkinTasks[0].clientId)}
                    className="flex items-center gap-3 rounded-xl py-2 text-left"
                  >
                    <span className="h-5 w-5 flex-none rounded-md border border-line" />
                    <span className="flex-1 text-sm text-ink">Перевірити чек-іни</span>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink">{checkinTasks.length} ›</span>
                  </button>
                )}
                {messageTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenChat(messageTasks[0].clientId)}
                    className="flex items-center gap-3 rounded-xl py-2 text-left"
                  >
                    <span className="h-5 w-5 flex-none rounded-md border border-line" />
                    <span className="flex-1 text-sm text-ink">Відповісти на повідомлення</span>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink">{messageTasks.length} ›</span>
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold text-paper shadow-[0_12px_36px_-10px_rgb(var(--c-accent)/0.6)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
              Швидкі дії
            </button>
          </div>
        </>
      )}

      {quickOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 lg:items-center" onClick={() => setQuickOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-line bg-sidebar p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:rounded-3xl"
          >
            <p className="mb-3 text-sm font-semibold text-ink">Швидкі дії</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["clients", "👥 Клієнти і запрошення"],
                  ["meeting", "📅 Нова зустріч"],
                  ["library", "🏋 База вправ і програм"],
                  ["chat", "💬 Повідомлення"],
                ] as ["clients" | "meeting" | "library" | "chat", string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setQuickOpen(false);
                    onQuick?.(k);
                  }}
                  className="rounded-2xl border border-line bg-surface py-4 text-sm font-semibold text-ink"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {reviewClient && (
        <CheckinReviewSheet
          clientId={reviewClient.id}
          clientName={clientLabel(reviewClient)}
          onClose={() => setReviewId(null)}
          onDone={() => {
            setReviewId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
