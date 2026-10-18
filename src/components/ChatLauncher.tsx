"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatPanel from "@/components/ChatPanel";

type Props = { mode: "client"; clientId: string } | { mode: "coach" };

// Плаваюча кнопка чату над нижньою панеллю (не займає місце серед вкладок) +
// бейдж з кількістю непрочитаних + шторка, що виїжджає знизу при натисканні.
export default function ChatLauncher(props: Props) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  async function refreshUnread() {
    if (props.mode === "coach") {
      const { data: cl } = await supabase
        .from("clients")
        .select("id, coach_last_read_at")
        .not("profile_id", "is", null);
      const clientsList = (cl as { id: string; coach_last_read_at: string | null }[]) || [];
      if (clientsList.length === 0) {
        setUnreadCount(0);
        return;
      }
      const { data: msgs } = await supabase.from("messages").select("client_id, created_at").eq("sender", "client");
      const lastReadByClient: Record<string, string | null> = {};
      for (const c of clientsList) lastReadByClient[c.id] = c.coach_last_read_at;
      const count = ((msgs as { client_id: string; created_at: string }[]) || []).filter((m) => {
        const lastRead = lastReadByClient[m.client_id];
        return lastRead == null ? true : m.created_at > lastRead;
      }).length;
      setUnreadCount(count);
    } else {
      const { data: c } = await supabase
        .from("clients")
        .select("client_last_read_at")
        .eq("id", props.clientId)
        .maybeSingle();
      const lastRead = (c as { client_last_read_at: string | null } | null)?.client_last_read_at ?? null;
      const { data: msgs } = await supabase
        .from("messages")
        .select("created_at")
        .eq("client_id", props.clientId)
        .eq("sender", "coach");
      const count = ((msgs as { created_at: string }[]) || []).filter((m) =>
        lastRead == null ? true : m.created_at > lastRead
      ).length;
      setUnreadCount(count);
    }
  }

  useEffect(() => {
    refreshUnread();

    const channel = supabase
      .channel(props.mode === "coach" ? "chat-unread-coach" : `chat-unread-client-${props.clientId}`)
      .on(
        "postgres_changes",
        props.mode === "coach"
          ? { event: "INSERT", schema: "public", table: "messages", filter: "sender=eq.client" }
          : { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${props.clientId}` },
        () => refreshUnread()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.mode === "client" ? props.clientId : null]);

  async function handleOpen() {
    setOpen(true);
    setUnreadCount(0);
    if (props.mode === "coach") {
      await supabase.from("clients").update({ coach_last_read_at: new Date().toISOString() }).not("id", "is", null);
    } else {
      await supabase
        .from("clients")
        .update({ client_last_read_at: new Date().toISOString() })
        .eq("id", props.clientId);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label="Чат"
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-paper shadow-lg transition hover:brightness-110 lg:bottom-6"
      >
        💬
        {unreadCount > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-2xl border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:bottom-6 lg:right-4 lg:h-[28rem] lg:w-96 lg:rounded-xl lg:border"
          >
            <div className="flex items-center justify-between border-b border-line p-3">
              <h2 className="text-sm font-semibold">Повідомлення</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
                Закрити
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <ChatPanel {...props} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
