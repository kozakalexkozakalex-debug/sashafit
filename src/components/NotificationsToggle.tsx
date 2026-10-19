"use client";

import { useEffect, useState } from "react";
import { pushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export default function NotificationsToggle({ clientId }: { clientId: string }) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      return;
    }
    isSubscribed().then(setSubscribed);
  }, []);

  async function toggle() {
    setErr("");
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush(clientId);
        setSubscribed(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалось");
    }
    setBusy(false);
  }

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm">
      <div>
        <p className="font-medium text-ink">🔔 Нагадування</p>
        <p className="text-xs text-muted">
          {subscribed ? "Увімкнено — надсилатимемо, якщо забудеш потренуватись чи зробити чек-ін." : "Отримуй push, якщо забудеш потренуватись чи зробити чек-ін."}
        </p>
        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          subscribed ? "border border-line text-muted" : "bg-accent text-paper"
        }`}
      >
        {busy ? "…" : subscribed ? "Вимкнути" : "Увімкнути"}
      </button>
    </div>
  );
}
