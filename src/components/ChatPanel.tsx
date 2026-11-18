"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { clientLabel } from "@/lib/clientLabel";
import { compressImage } from "@/lib/compressImage";

type Message = {
  id: string;
  client_id: string;
  sender: "coach" | "client";
  body: string;
  created_at: string;
  attachment_path: string | null;
  attachment_kind: "image" | "video" | null;
};

// Відео більше цього розміру не вантажимо — на телефоні воно довго йде й з'їдає трафік.
const MAX_VIDEO_MB = 45;

type ClientOption = { id: string; name: string | null; invite_code: string };

type Props = { mode: "client"; clientId: string } | { mode: "coach"; fixedClientId?: string };

export default function ChatPanel(props: Props) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(
    props.mode === "client" ? props.clientId : props.fixedClientId ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  // Підписані посилання на вкладення (приватний бакет "chat"), за id повідомлення.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  const fixedClient = props.mode === "coach" ? props.fixedClientId : undefined;

  useEffect(() => {
    if (props.mode !== "coach" || fixedClient) return;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, invite_code")
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
    const missing = messages.filter((m) => m.attachment_path && !mediaUrls[m.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      await Promise.all(
        missing.map(async (m) => {
          const { data } = await supabase.storage.from("chat").createSignedUrl(m.attachment_path as string, 3600);
          if (data?.signedUrl) entries[m.id] = data.signedUrl;
        })
      );
      if (!cancelled) setMediaUrls((prev) => ({ ...prev, ...entries }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    // Прокручуємо тільки саме віконце чату до останнього повідомлення —
    // НЕ scrollIntoView, бо він тягне за собою всю сторінку (ламає Головну).
    const box = scrollBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
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

  async function sendAttachment(picked: File) {
    if (!activeClientId) return;
    setUploadErr("");
    const isVideo = picked.type.startsWith("video/");
    const isImage = picked.type.startsWith("image/");
    if (!isVideo && !isImage) {
      setUploadErr("Можна надсилати лише фото або відео");
      return;
    }
    if (isVideo && picked.size > MAX_VIDEO_MB * 1024 * 1024) {
      setUploadErr(`Відео завелике (максимум ${MAX_VIDEO_MB} МБ). Скороти його або зніми коротше.`);
      return;
    }
    setBusy(true);
    const file = isImage ? await compressImage(picked) : picked;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${activeClientId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("chat").upload(path, file);
    if (upErr) {
      setBusy(false);
      setUploadErr("Не вдалось завантажити файл: " + upErr.message);
      return;
    }
    const { error } = await supabase.from("messages").insert({
      client_id: activeClientId,
      sender: props.mode,
      body: text.trim(),
      attachment_path: path,
      attachment_kind: isVideo ? "video" : "image",
    });
    setBusy(false);
    if (error) setUploadErr("Не вдалось надіслати: " + error.message);
    else setText("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {props.mode === "coach" && !fixedClient && (
        <select
          value={activeClientId || ""}
          onChange={(e) => setActiveClientId(e.target.value || null)}
          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
        >
          {clients.length === 0 && <option value="">Немає підключених клієнтів</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {clientLabel(c)}
            </option>
          ))}
        </select>
      )}

      <div ref={scrollBoxRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-paper p-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
              m.sender === props.mode ? "self-end bg-accent text-paper" : "self-start border border-line text-ink"
            }`}
          >
            {m.attachment_path &&
              (mediaUrls[m.id] ? (
                m.attachment_kind === "video" ? (
                  <video src={mediaUrls[m.id]} controls playsInline className="mb-1 max-h-64 w-full rounded-md" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrls[m.id]} alt="Вкладення" className="mb-1 max-h-64 w-full rounded-md object-cover" />
                )
              ) : (
                <p className="mb-1 text-xs opacity-70">{m.attachment_kind === "video" ? "🎥 Відео…" : "📷 Фото…"}</p>
              ))}
            {m.body}
          </div>
        ))}
        {messages.length === 0 && <p className="text-xs text-muted">Повідомлень ще немає.</p>}
      </div>

      {uploadErr && <p className="text-xs text-danger">{uploadErr}</p>}
      <div className="flex gap-2">
        <label
          aria-label="Додати фото або відео"
          className={`flex w-10 flex-none cursor-pointer items-center justify-center rounded-lg border border-line bg-paper text-lg ${
            !activeClientId || busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          📎
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) sendAttachment(f);
            }}
          />
        </label>
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
  );
}
