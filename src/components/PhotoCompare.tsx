"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Порівняння фото "до/після" — клієнт чи тренер обирають два чек-іни з
// фото, бачать їх поруч з датою і вагою. Дані тягнемо напряму тут, бо
// photo_path/підписані URL ніде вище по дереву компонентів не прокидуються.

type PhotoCheckin = { id: string; created_at: string; weight: number | null; photo_path: string };

function fmt(d: string) {
  return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PhotoCompare({ clientId }: { clientId: string }) {
  const [checkins, setCheckins] = useState<PhotoCheckin[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("checkins")
        .select("id, created_at, weight, photo_path")
        .eq("client_id", clientId)
        .not("photo_path", "is", null)
        .order("created_at", { ascending: true });
      const rows = (data as PhotoCheckin[]) || [];
      setCheckins(rows);
      if (rows.length >= 2) {
        setBeforeId(rows[0].id);
        setAfterId(rows[rows.length - 1].id);
      }
      const entries: Record<string, string> = {};
      await Promise.all(
        rows.map(async (c) => {
          const { data: signed } = await supabase.storage.from("checkins").createSignedUrl(c.photo_path, 3600);
          if (signed?.signedUrl) entries[c.id] = signed.signedUrl;
        })
      );
      setUrls(entries);
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) return null;
  if (checkins.length < 2) return null;

  const before = checkins.find((c) => c.id === beforeId);
  const after = checkins.find((c) => c.id === afterId);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">До / Після</h3>
      <div className="mb-2 flex gap-2">
        <select
          value={beforeId}
          onChange={(e) => setBeforeId(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
        >
          {checkins.map((c) => (
            <option key={c.id} value={c.id}>
              {fmt(c.created_at)}
              {c.weight ? ` · ${c.weight} кг` : ""}
            </option>
          ))}
        </select>
        <select
          value={afterId}
          onChange={(e) => setAfterId(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none"
        >
          {checkins.map((c) => (
            <option key={c.id} value={c.id}>
              {fmt(c.created_at)}
              {c.weight ? ` · ${c.weight} кг` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[before, after].map((c, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line">
            {c && urls[c.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[c.id]} alt={i === 0 ? "До" : "Після"} className="h-48 w-full object-cover" />
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-muted">Немає фото</div>
            )}
            <div className="bg-paper px-2 py-1 text-center text-[11px] text-muted">
              {c ? `${fmt(c.created_at)}${c.weight ? ` · ${c.weight} кг` : ""}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
