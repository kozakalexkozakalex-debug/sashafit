"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import { UnreadInfo } from "@/lib/coachUnread";
import CheckinReviewSheet from "@/components/CheckinReviewSheet";
import Avatar from "@/components/Avatar";
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
}: {
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
  const todo = tasks.filter((t) => t.kind !== "silent");
  const activeCount = clients.filter((c) => {
    const last = lastActive[c.id];
    return last && Math.floor((todayMs - new Date(last).getTime()) / 86400000) < 7;
  }).length;
  const nameOf = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientLabel(c) : "";
  };
  const dateText = new Date().toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });

  function TaskRow({ t }: { t: Task }) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-paper/60 p-2.5">
        <Avatar name={nameOf(t.clientId)} url={avatars[t.clientId]} size={40} />
        <button type="button" onClick={() => onOpenClient(t.clientId)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-ink">{nameOf(t.clientId)}</span>
          <span className="block truncate text-xs text-muted">
            {t.kind === "checkin" ? "📋 " : t.kind === "message" ? "💬 " : ""}
            {t.hint}
          </span>
        </button>
        <button
          type="button"
          onClick={() => (t.kind === "checkin" ? setReviewId(t.clientId) : onOpenChat(t.clientId))}
          className={`flex-none rounded-full px-3.5 py-2 text-xs font-bold ${
            t.kind === "silent" ? "border border-warn/60 text-warn" : "bg-accent text-paper"
          }`}
        >
          {t.button}
        </button>
      </div>
    );
  }

  const tiles: { value: string; label: string; icon: string; hot?: boolean }[] = [
    { value: String(clients.length), label: "Клієнтів", icon: "👥" },
    { value: String(activeCount), label: "Активні (7 дн)", icon: "⚡" },
    { value: adherence === null ? "—" : `${adherence}%`, label: "Виконання тижня", icon: "🎯" },
    { value: String(todo.length), label: "Чекають тебе", icon: "🔔", hot: todo.length > 0 },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <p className="text-xs capitalize text-muted">{dateText}</p>
        <h2 className="font-display text-2xl font-bold text-ink">Сьогодні</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Завантаження…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {tiles.map((t) => (
              <div
                key={t.label}
                className={`rounded-2xl border bg-surface p-3.5 ${t.hot ? "border-brand/60 shadow-[0_10px_30px_-12px_rgb(var(--c-accent)/0.55)]" : "border-line"}`}
              >
                <p className="text-lg leading-none">{t.icon}</p>
                <p className="mt-2 font-display text-2xl font-bold text-ink">{t.value}</p>
                <p className="text-xs text-muted">{t.label}</p>
              </div>
            ))}
          </div>

          {attention.length > 0 && (
            <div className="rounded-2xl border border-warn/50 bg-warn/10 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-warn">⚠ Потрібна увага</p>
              <div className="flex flex-col gap-2">
                {attention.map((t) => (
                  <TaskRow key={t.key} t={t} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Завдання на сьогодні</p>
            {todo.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-6 text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-1 text-sm font-semibold text-ink">На сьогодні все</p>
                <p className="mt-1 text-xs text-muted">Нових чек-інів і повідомлень немає.</p>
              </div>
            ) : (
              todo.map((t) => (
                <div key={t.key} className="rounded-2xl border border-line bg-surface p-1.5">
                  <TaskRow t={t} />
                </div>
              ))
            )}
          </div>
        </>
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
