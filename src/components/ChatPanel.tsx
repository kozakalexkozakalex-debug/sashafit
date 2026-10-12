"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Message = {
  id: string;
  client_id: string;
  sender: "coach" | "client";
  body: string;
  created_at: string;
};

type ClientOption = { id: string; name: string };

type Props = { mode: "client"; clientId: string } | { mode: "coach" };

export default function ChatPanel(props: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(
    props.mode === "client" ? props.clientId : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.mode !== "coach") return;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .not("profile_id", "is", null)
        .order("name");
      const rows = (data as ClientOption[]) || [];
      setClients(rows);
      setActiveClientId((prev) => prev || rows[0]?.id || null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode]);

  async function loadMessages(clientId: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  }

  useEffect(() => {
    if (!activeClientId) return;
    loadMessages(activeClientId);

    const channel = supabase
      .channel(`messages-${activeClientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${activeClientId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || !activeClientId) return;
    setBusy(true);
    const { error } = await supabase.from("messages").insert({
      client_id: activeClientId,
      sender: props.mode,
      body: text.trim(),
    });
    setBusy(false);
    if (!error) setText("");
  }

  return (
    <div className="flex h-fit flex-col rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between p-4 text-left"
      >
        <h2 className="text-sm font-semibold">Повідомлення</h2>
        <span className="text-xs text-muted">{collapsed ? "розгорнути" : "згорнути"}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-3 border-t border-line p-4">
          {props.mode === "coach" && (
            <select
              value={activeClientId || ""}
              onChange={(e) => setActiveClientId(e.target.value || null)}
              className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
            >
              {clients.length === 0 && <option value="">Немає підключених клієнтів</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex h-72 flex-col gap-2 overflow-y-auto rounded-lg bg-paper p-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                  m.sender === props.mode
                    ? "self-end bg-accent text-paper"
                    : "self-start border border-line text-ink"
                }`}
              >
                {m.body}
              </div>
            ))}
            {messages.length === 0 && <p className="text-xs text-muted">Повідомлень ще немає.</p>}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Написати..."
              disabled={!activeClientId}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || !activeClientId}
              onClick={send}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              Надіслати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
