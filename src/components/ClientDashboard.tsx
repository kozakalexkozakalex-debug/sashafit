"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ClientWorkouts from "@/components/ClientWorkouts";

type ClientRow = {
  id: string;
  name: string;
  height: number | null;
  start_weight: number | null;
  target_weight: number | null;
  intake_notes: string | null;
};

type Checkin = {
  id: string;
  weight: number | null;
  photo_path: string | null;
  comment: string | null;
  created_at: string;
};

export default function ClientDashboard() {
  const [client, setClient] = useState<ClientRow | null | "none">(null);
  const [height, setHeight] = useState("");
  const [startWeight, setStartWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [ciWeight, setCiWeight] = useState("");
  const [ciComment, setCiComment] = useState("");
  const [ciFile, setCiFile] = useState<File | null>(null);
  const [ciBusy, setCiBusy] = useState(false);
  const [ciErr, setCiErr] = useState("");

  async function load() {
    const { data } = await supabase.from("clients").select("*").maybeSingle();
    setClient((data as ClientRow) ?? "none");
  }

  async function loadCheckins(clientId: string) {
    const { data } = await supabase
      .from("checkins")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const rows = (data as Checkin[]) || [];
    setCheckins(rows);

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

  useEffect(() => {
    if (client && client !== "none" && client.start_weight !== null) {
      loadCheckins(client.id);
    }
  }, [client]);

  async function saveIntake() {
    if (!startWeight.trim()) {
      setErr("Вкажи поточну вагу");
      return;
    }
    setErr("");
    setBusy(true);
    const { error } = await supabase
      .from("clients")
      .update({
        height: height.trim() ? Number(height) : null,
        start_weight: Number(startWeight),
        target_weight: targetWeight.trim() ? Number(targetWeight) : null,
        intake_notes: notes.trim() || null,
      })
      .eq("id", (client as ClientRow).id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    load();
  }

  async function addCheckin() {
    if (!ciWeight.trim()) {
      setCiErr("Вкажи вагу");
      return;
    }
    setCiErr("");
    setCiBusy(true);
    const c = client as ClientRow;

    let photoPath: string | null = null;
    if (ciFile) {
      const path = `${c.id}/${Date.now()}-${ciFile.name}`;
      const { error: upErr } = await supabase.storage.from("checkins").upload(path, ciFile);
      if (upErr) {
        setCiBusy(false);
        setCiErr("Не вдалось завантажити фото: " + upErr.message);
        return;
      }
      photoPath = path;
    }

    const { error } = await supabase.from("checkins").insert({
      client_id: c.id,
      weight: Number(ciWeight),
      photo_path: photoPath,
      comment: ciComment.trim() || null,
    });
    setCiBusy(false);
    if (error) {
      setCiErr(error.message);
      return;
    }
    setCiWeight("");
    setCiComment("");
    setCiFile(null);
    loadCheckins(c.id);
  }

  if (client === null) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  if (client === "none") {
    return (
      <p className="text-sm text-muted">
        Твою картку клієнта ще не знайдено. Напиши тренеру.
      </p>
    );
  }

  if (client.start_weight === null) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Коротка анкета</h2>
        <div className="flex flex-col gap-3">
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            inputMode="decimal"
            placeholder="Зріст, см"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={startWeight}
            onChange={(e) => setStartWeight(e.target.value)}
            inputMode="decimal"
            placeholder="Поточна вага, кг"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            inputMode="decimal"
            placeholder="Бажана вага, кг (необов'язково)"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Коротко про себе: травми, побажання тощо (необов'язково)"
            rows={3}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={saveIntake}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-50"
          >
            {busy ? "Зберігаю…" : "Зберегти"}
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Новий чек-ін</h2>
        <div className="flex flex-col gap-3">
          <input
            value={ciWeight}
            onChange={(e) => setCiWeight(e.target.value)}
            inputMode="decimal"
            placeholder="Вага, кг"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCiFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted"
          />
          <textarea
            value={ciComment}
            onChange={(e) => setCiComment(e.target.value)}
            placeholder="Коментар (необов'язково)"
            rows={2}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={ciBusy}
            onClick={addCheckin}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-50"
          >
            {ciBusy ? "Зберігаю…" : "Зберегти чек-ін"}
          </button>
          {ciErr && <p className="text-sm text-red-400">{ciErr}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Історія чек-інів ({checkins.length})</h2>
        <div className="flex flex-col gap-2">
          {checkins.map((c) => (
            <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.weight} кг</span>
                <span className="text-xs text-muted">
                  {new Date(c.created_at).toLocaleDateString("uk-UA")}
                </span>
              </div>
              {c.comment && <p className="mt-1 text-muted">{c.comment}</p>}
              {c.photo_path && photoUrls[c.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[c.id]}
                  alt="Фото чек-іну"
                  className="mt-2 max-h-48 rounded-lg object-cover"
                />
              )}
            </div>
          ))}
          {checkins.length === 0 && <p className="text-sm text-muted">Чек-інів ще немає.</p>}
        </div>
      </div>

      <ClientWorkouts clientId={client.id} />
    </div>
  );
}
