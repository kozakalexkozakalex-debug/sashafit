"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import { markCoachRead, UnreadInfo } from "@/lib/coachUnread";
import ChatPanel from "@/components/ChatPanel";

type Row = { id: string; name: string | null; invite_code: string };
type LastMsg = { body: string; created_at: string; sender: "coach" | "client" };

function shortTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

// Вкладка "Чати": список клієнтів з останнім повідомленням і крапкою
// непрочитаного; натискання відкриває розмову на весь екран.
export default function CoachChats({
  unread,
  onRead,
  openClientId,
  embedded,
}: {
  unread: UnreadInfo;
  onRead: () => void;
  // Якщо задано (кнопка "Відповісти" з головної) — одразу відкрити цю розмову.
  openClientId?: string | null;
  // У попапі: без власної рамки, на всю висоту контейнера.
  embedded?: boolean;
}) {
  const [clients, setClients] = useState<Row[]>([]);
  const [last, setLast] = useState<Record<string, LastMsg>>({});
  const [activeId, setActiveId] = useState<string | null>(openClientId ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: cl }, { data: ms }] = await Promise.all([
        supabase.from("clients").select("id, name, invite_code").not("profile_id", "is", null),
        supabase
          .from("messages")
          .select("client_id, body, created_at, sender")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      setClients((cl as Row[]) || []);
      const map: Record<string, LastMsg> = {};
      for (const m of (ms as (LastMsg & { client_id: string })[]) || []) {
        if (!map[m.client_id]) map[m.client_id] = m;
      }
      setLast(map);
      setLoading(false);
    })();
  }, []);

  // Поки розмова відкрита — позначаємо прочитаним і нові повідомлення клієнта.
  useEffect(() => {
    if (!activeId) return;
    markCoachRead(activeId).then(onRead);
    const channel = supabase
      .channel(`coach-chat-open-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${activeId}` },
        (payload) => {
          const m = payload.new as LastMsg & { client_id: string };
          setLast((prev) => ({ ...prev, [m.client_id]: m }));
          if (m.sender === "client") markCoachRead(activeId).then(onRead);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  if (loading) return <p className="text-sm text-muted">Завантаження…</p>;

  const active = clients.find((c) => c.id === activeId);
  if (activeId && active) {
    return (
      <div
        className={
          embedded
            ? "flex h-[calc(80dvh-6.5rem)] min-h-0 flex-col lg:h-[calc(30rem-6.5rem)]"
            : "flex h-[calc(100dvh-9rem)] flex-col rounded-xl border border-line bg-surface p-3 lg:h-[34rem]"
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <button type="button" onClick={() => setActiveId(null)} className="rounded-lg px-2 py-1 text-lg text-muted">
            ‹
          </button>
          <h2 className="truncate text-sm font-semibold">{clientLabel(active)}</h2>
        </div>
        <ChatPanel key={activeId} mode="coach" fixedClientId={activeId} />
      </div>
    );
  }

  const sorted = [...clients].sort((a, b) => {
    const ua = unread[a.id] ? 1 : 0;
    const ub = unread[b.id] ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (last[b.id]?.created_at || "").localeCompare(last[a.id]?.created_at || "");
  });

  return (
    <div className={embedded ? "" : "rounded-xl border border-line bg-surface p-4"}>
      {!embedded && <h2 className="mb-1 text-sm font-semibold">Чати</h2>}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Підключених клієнтів ще немає.</p>
      ) : (
        <div className="flex flex-col">
          {sorted.map((c) => {
            const lm = last[c.id];
            const un = unread[c.id];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className="flex items-center gap-3 border-t border-line py-3 text-left first:border-t-0"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand/15 font-display text-sm font-semibold text-brand">
                  {clientLabel(c).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${un ? "font-semibold" : "font-medium"}`}>
                    {clientLabel(c)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {lm ? `${lm.sender === "coach" ? "Ви: " : ""}${lm.body}` : "Повідомлень ще немає"}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1">
                  {lm && <span className="text-[11px] text-muted">{shortTime(lm.created_at)}</span>}
                  {un && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-paper">
                      {un.count > 9 ? "9+" : un.count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
