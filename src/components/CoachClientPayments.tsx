"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Payment = {
  id: string;
  amount: number | null;
  paid_at: string;
  note: string | null;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateKey: string, months: number) {
  const d = new Date(dateKey);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function CoachClientPayments({
  clientId,
  subscriptionUntil,
  onChanged,
}: {
  clientId: string;
  subscriptionUntil: string | null;
  onChanged: () => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [extendMonths, setExtendMonths] = useState("1");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("client_id", clientId)
      .order("paid_at", { ascending: false });
    setPayments((data as Payment[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const today = todayKey();
  const isActive = subscriptionUntil ? subscriptionUntil >= today : false;

  async function logPayment() {
    setBusy(true);
    const base = subscriptionUntil && subscriptionUntil > today ? subscriptionUntil : today;
    const newUntil = addMonths(base, Number(extendMonths) || 1);

    await supabase.from("payments").insert({
      client_id: clientId,
      amount: amount.trim() ? Number(amount) : null,
      note: note.trim() || null,
    });
    await supabase.from("clients").update({ subscription_until: newUntil }).eq("id", clientId);

    setBusy(false);
    setAmount("");
    setNote("");
    load();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Оплата</h3>

      <div className="rounded-lg bg-paper p-3 text-sm">
        <p className="mb-2">
          Підписка:{" "}
          {subscriptionUntil ? (
            <span className={isActive ? "text-green-400" : "text-red-400"}>
              {isActive ? "активна до" : "закінчилась"} {subscriptionUntil}
            </span>
          ) : (
            <span className="text-muted">не оформлена</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Сума, грн"
            className="w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
          />
          <select
            value={extendMonths}
            onChange={(e) => setExtendMonths(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
          >
            <option value="1">+1 місяць</option>
            <option value="3">+3 місяці</option>
            <option value="6">+6 місяців</option>
            <option value="12">+12 місяців</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Коментар (необов'язково)"
            className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={logPayment}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Зберігаю…" : "Записати оплату"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2">
            <span>
              {p.paid_at}
              {p.note ? ` — ${p.note}` : ""}
            </span>
            <span className="text-muted">{p.amount != null ? `${p.amount} грн` : "—"}</span>
          </div>
        ))}
        {payments.length === 0 && <p className="text-muted">Оплат ще немає.</p>}
      </div>
    </div>
  );
}
