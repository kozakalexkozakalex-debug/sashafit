"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CoachClientPayments from "@/components/CoachClientPayments";

type Client = {
  id: string;
  name: string;
  profile_id: string | null;
  subscription_until: string | null;
};

type Payment = { amount: number | null; paid_at: string };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

export default function CoachPayments() {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: cl }, { data: pay }] = await Promise.all([
      supabase.from("clients").select("id, name, profile_id, subscription_until"),
      supabase.from("payments").select("amount, paid_at"),
    ]);
    setClients((cl as Client[]) || []);
    setPayments((pay as Payment[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  const today = todayKey();
  const mKey = monthKey();

  const active = clients.filter((c) => c.subscription_until && c.subscription_until >= today);
  const expired = clients.filter((c) => c.subscription_until && c.subscription_until < today);
  const noSub = clients.filter((c) => !c.subscription_until);

  const monthRevenue = payments
    .filter((p) => p.paid_at.slice(0, 7) === mKey)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const sorted = [...clients].sort((a, b) => {
    const rank = (c: Client) =>
      !c.subscription_until ? 2 : c.subscription_until < today ? 0 : 1;
    return rank(a) - rank(b);
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Зведення</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Дохід цього місяця</p>
            <p className="font-display text-lg font-medium">{Math.round(monthRevenue)} грн</p>
          </div>
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Активні підписки</p>
            <p className="font-display text-lg font-medium text-green-400">{active.length}</p>
          </div>
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Прострочені</p>
            <p className="font-display text-lg font-medium text-red-400">{expired.length}</p>
          </div>
          <div className="rounded-lg bg-paper p-3">
            <p className="text-xs text-muted">Без підписки</p>
            <p className="font-display text-lg font-medium">{noSub.length}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Клієнти ({sorted.length})</h2>
        <div className="flex flex-col gap-2">
          {sorted.map((c) => {
            const isActive = c.subscription_until ? c.subscription_until >= today : false;
            return (
              <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.subscription_until ? (
                    <span className={`stamp ${isActive ? "text-green-400" : "text-red-400"}`}>
                      {isActive ? "активна до" : "закінчилась"} {c.subscription_until}
                    </span>
                  ) : (
                    <span className="stamp text-muted">без підписки</span>
                  )}
                </button>

                {openId === c.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    <CoachClientPayments
                      clientId={c.id}
                      subscriptionUntil={c.subscription_until}
                      onChanged={load}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
        </div>
      </div>
    </div>
  );
}
