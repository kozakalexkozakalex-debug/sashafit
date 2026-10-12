"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Checkin = {
  id: string;
  client_id: string;
  weight: number | null;
  photo_path: string | null;
  comment: string | null;
  created_at: string;
  clients: { name: string } | null;
};

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("checkins")
      .select("*, clients(name)")
      .order("created_at", { ascending: false });
    const rows = (data as unknown as Checkin[]) || [];
    setCheckins(rows);
    setLoading(false);

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
    setPhotoUrls(urls);
  }

  useEffect(() => {
    load();
  }, []);

  const clientNames = Array.from(
    new Set(checkins.map((c) => c.clients?.name).filter(Boolean) as string[])
  ).sort();

  const filtered = clientFilter ? checkins.filter((c) => c.clients?.name === clientFilter) : checkins;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Чек-іни ({filtered.length})</h2>
        {clientNames.length > 0 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
          >
            <option value="">Усі клієнти</option>
            {clientNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <p className="text-sm text-muted">Завантаження…</p>}

      <div className="flex flex-col gap-2">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.clients?.name || "—"}</span>
              <span className="stamp text-muted">
                {new Date(c.created_at).toLocaleDateString("uk-UA")}
              </span>
            </div>
            <p className="mt-1 font-display text-base font-medium">
              {c.weight != null ? `${c.weight} кг` : "—"}
            </p>
            {c.comment && <p className="mt-1 text-muted">{c.comment}</p>}
            {c.photo_path && photoUrls[c.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrls[c.id]}
                alt="Фото чек-іну"
                className="mt-2 max-h-40 rounded-lg object-cover"
              />
            )}
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted">Чек-інів ще немає.</p>
        )}
      </div>
    </div>
  );
}
