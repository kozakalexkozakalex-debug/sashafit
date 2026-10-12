"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CoachWorkouts from "@/components/CoachWorkouts";

type Client = {
  id: string;
  name: string;
  goal: string | null;
  invite_code: string;
  profile_id: string | null;
};

type Checkin = {
  id: string;
  weight: number | null;
  photo_path: string | null;
  comment: string | null;
  created_at: string;
};

export default function CoachDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [checkinsByClient, setCheckinsByClient] = useState<Record<string, Checkin[]>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    setClients((data as Client[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleClient(clientId: string) {
    if (openId === clientId) {
      setOpenId(null);
      return;
    }
    setOpenId(clientId);
    if (!checkinsByClient[clientId]) {
      const { data } = await supabase
        .from("checkins")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      const rows = (data as Checkin[]) || [];
      setCheckinsByClient((prev) => ({ ...prev, [clientId]: rows }));

      const withPhotos = rows.filter((c) => c.photo_path);
      const urls: Record<string, string> = {};
      await Promise.all(
        withPhotos.map(async (c) => {
          const { data: signed } = await supabase.storage
            .from("checkins")
            .createSignedUrl(c.photo_path as string, 3600);
          if (signed?.signedUrl) urls[c.id] = signed.signedUrl;
        })
      );
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    }
  }

  async function addClient() {
    if (!name.trim()) {
      setErr("Вкажи ім'я клієнта");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase
      .from("clients")
      .insert({ name: name.trim(), goal: goal.trim() || null });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setGoal("");
    load();
  }

  function inviteUrl(code: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/login?invite=${code}`;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ігноруємо — просто немає буфера обміну */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">+ Новий клієнт</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ціль (необов'язково)"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addClient}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            Додати
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Клієнти ({clients.length})</h2>
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
              <button
                type="button"
                onClick={() => toggleClient(c.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="font-medium">{c.name}</span>
                <span className={c.profile_id ? "text-xs text-green-400" : "text-xs text-accent"}>
                  {c.profile_id ? "Підключено" : "Очікує"}
                </span>
              </button>
              {c.goal && <p className="mt-1 text-muted">{c.goal}</p>}
              {!c.profile_id && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="flex-1 break-all rounded bg-paper px-2 py-1 text-xs text-muted">
                    {inviteUrl(c.invite_code)}
                  </p>
                  <button
                    type="button"
                    onClick={() => copy(inviteUrl(c.invite_code))}
                    className="rounded bg-paper px-2 py-1 text-xs text-accent"
                  >
                    Копіювати
                  </button>
                </div>
              )}

              {openId === c.id && c.profile_id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  {(checkinsByClient[c.id] || []).map((ci) => (
                    <div key={ci.id} className="rounded-lg bg-paper p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{ci.weight} кг</span>
                        <span className="text-xs text-muted">
                          {new Date(ci.created_at).toLocaleDateString("uk-UA")}
                        </span>
                      </div>
                      {ci.comment && <p className="mt-1 text-muted">{ci.comment}</p>}
                      {ci.photo_path && photoUrls[ci.id] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrls[ci.id]}
                          alt="Фото чек-іну"
                          className="mt-2 max-h-40 rounded-lg object-cover"
                        />
                      )}
                    </div>
                  ))}
                  {(checkinsByClient[c.id] || []).length === 0 && (
                    <p className="text-muted">Чек-інів ще немає.</p>
                  )}

                  <div className="border-t border-line pt-3">
                    <CoachWorkouts clientId={c.id} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
        </div>
      </div>
    </div>
  );
}
