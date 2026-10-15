"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CoachClientCalendar from "@/components/CoachClientCalendar";
import CoachClientNutrition from "@/components/CoachClientNutrition";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import ProgramsSection from "@/components/ProgramsSection";
import NutritionSection from "@/components/NutritionSection";
import CoachAnalytics from "@/components/CoachAnalytics";
import CoachPayments from "@/components/CoachPayments";
import CoachCheckins from "@/components/CoachCheckins";
import CoachHome from "@/components/CoachHome";
import { clientRisk, RISK_LABEL } from "@/lib/clientRisk";

type Client = {
  id: string;
  name: string;
  goal: string | null;
  invite_code: string;
  profile_id: string | null;
  subscription_until: string | null;
  created_at: string;
  height: number | null;
  start_weight: number | null;
  target_weight: number | null;
  intake_notes: string | null;
  intake_goals: string | null;
  experience_level: string | null;
  health_restrictions: string | null;
  training_location: string | null;
  equipment: string | null;
  training_days_per_week: number | null;
  food_restrictions: string | null;
  lifestyle: string | null;
};

type Checkin = {
  id: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  photo_path: string | null;
  comment: string | null;
  created_at: string;
};

type TabId = "home" | "clients" | "checkins" | "programs" | "rations" | "analytics" | "payments";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Головна" },
  { id: "clients", label: "Клієнти" },
  { id: "checkins", label: "Чек-іни" },
  { id: "programs", label: "Програми" },
  { id: "rations", label: "Харчування" },
  { id: "analytics", label: "Аналітика" },
  { id: "payments", label: "Оплата" },
];

export default function CoachDashboard() {
  const [tab, setTab] = useState<TabId>("home");
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [checkinsByClient, setCheckinsByClient] = useState<Record<string, Checkin[]>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [lastCheckinByClient, setLastCheckinByClient] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    setClients((data as Client[]) || []);

    const { data: ci } = await supabase
      .from("checkins")
      .select("client_id, created_at")
      .order("created_at", { ascending: false });
    const last: Record<string, string> = {};
    for (const row of (ci as { client_id: string; created_at: string }[]) || []) {
      if (!last[row.client_id]) last[row.client_id] = row.created_at;
    }
    setLastCheckinByClient(last);
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav className="flex gap-2 overflow-x-auto pb-1 lg:w-44 lg:flex-none lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 font-display text-sm font-medium transition lg:w-full lg:rounded-lg lg:border-2 lg:px-3 lg:py-2 lg:text-left ${
              tab === t.id
                ? "border-accent bg-accent text-paper"
                : "border-line bg-surface text-muted hover:border-accent/50 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
      {tab === "home" ? (
        <CoachHome />
      ) : tab === "checkins" ? (
        <CoachCheckins />
      ) : tab === "programs" ? (
        <ProgramsSection />
      ) : tab === "rations" ? (
        <NutritionSection />
      ) : tab === "analytics" ? (
        <CoachAnalytics />
      ) : tab === "payments" ? (
        <CoachPayments />
      ) : (
        <>
          <div className="border border-dashed border-line/80 p-4">
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
                    <span className="flex items-center gap-2">
                      {c.profile_id && (
                        <span className="text-xs">
                          {RISK_LABEL[clientRisk(c, lastCheckinByClient[c.id])]}
                        </span>
                      )}
                      <span className={`stamp ${c.profile_id ? "text-green-400" : "text-accent"}`}>
                        {c.profile_id ? "Підключено" : "Очікує"}
                      </span>
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

                  {openId === c.id && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                      {c.start_weight != null && (
                        <section className="rounded-lg border border-line bg-paper p-3">
                          <h3 className="mb-2.5 font-display text-xs font-semibold">Анкета</h3>
                          <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-3">
                            <div>
                              <p className="text-[11px] text-muted">Зріст / Вага</p>
                              <p className="mt-0.5 text-sm">
                                {c.height ?? "—"} см, {c.start_weight ?? "—"} кг
                                {c.target_weight != null ? ` → ${c.target_weight} кг` : ""}
                              </p>
                            </div>
                            {(c.experience_level || c.training_days_per_week != null) && (
                              <div>
                                <p className="text-[11px] text-muted">Досвід</p>
                                <p className="mt-0.5 text-sm">
                                  {[
                                    c.experience_level,
                                    c.training_days_per_week != null
                                      ? `${c.training_days_per_week} дн./тиждень`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                              </div>
                            )}
                            {c.training_location && (
                              <div>
                                <p className="text-[11px] text-muted">Місце тренувань</p>
                                <p className="mt-0.5 text-sm">{c.training_location}</p>
                              </div>
                            )}
                            {c.intake_goals && (
                              <div>
                                <p className="text-[11px] text-muted">Цілі</p>
                                <p className="mt-0.5 text-sm">{c.intake_goals}</p>
                              </div>
                            )}
                            {c.equipment && (
                              <div>
                                <p className="text-[11px] text-muted">Інвентар</p>
                                <p className="mt-0.5 text-sm">{c.equipment}</p>
                              </div>
                            )}
                            {c.lifestyle && (
                              <div>
                                <p className="text-[11px] text-muted">Спосіб життя</p>
                                <p className="mt-0.5 text-sm">{c.lifestyle}</p>
                              </div>
                            )}
                            {c.health_restrictions && (
                              <div>
                                <p className="text-[11px] text-muted">Обмеження здоров&apos;я</p>
                                <p className="mt-0.5 text-sm">{c.health_restrictions}</p>
                              </div>
                            )}
                            {c.food_restrictions && (
                              <div>
                                <p className="text-[11px] text-muted">Харчові обмеження</p>
                                <p className="mt-0.5 text-sm">{c.food_restrictions}</p>
                              </div>
                            )}
                            {c.intake_notes && (
                              <div>
                                <p className="text-[11px] text-muted">Нотатка тренера</p>
                                <p className="mt-0.5 text-sm">{c.intake_notes}</p>
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      <section className="rounded-lg border border-line bg-paper p-3">
                        <h3 className="mb-2.5 font-display text-xs font-semibold">Чек-іни</h3>
                        <div className="flex flex-col gap-2">
                          {(checkinsByClient[c.id] || []).map((ci) => (
                            <div key={ci.id} className="flex items-start gap-3 rounded-md bg-surface p-2.5">
                              {ci.photo_path ? (
                                photoUrls[ci.id] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={photoUrls[ci.id]}
                                    alt="Фото чек-іну"
                                    className="h-12 w-12 flex-shrink-0 rounded-md object-cover"
                                  />
                                ) : (
                                  <div className="h-12 w-12 flex-shrink-0 rounded-md bg-line" />
                                )
                              ) : (
                                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-line text-[10px] text-muted">
                                  фото
                                </div>
                              )}
                              <div className="min-w-0 flex-grow">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                  <span className="font-medium">{ci.weight} кг</span>
                                  <span className="whitespace-nowrap text-xs text-muted">
                                    {new Date(ci.created_at).toLocaleDateString("uk-UA")}
                                  </span>
                                </div>
                                {(ci.waist != null || ci.hips != null || ci.chest != null) && (
                                  <p className="mt-0.5 text-xs text-muted">
                                    {[
                                      ci.waist != null ? `Талія ${ci.waist} см` : null,
                                      ci.hips != null ? `Стегна ${ci.hips} см` : null,
                                      ci.chest != null ? `Груди ${ci.chest} см` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </p>
                                )}
                                {ci.comment && <p className="mt-1 text-sm">{ci.comment}</p>}
                              </div>
                            </div>
                          ))}
                          {(checkinsByClient[c.id] || []).length === 0 && (
                            <p className="text-sm text-muted">Чек-інів ще немає.</p>
                          )}
                        </div>
                      </section>

                      <section className="rounded-lg border border-line bg-paper p-3">
                        <CoachClientCalendar clientId={c.id} />
                      </section>

                      <section className="rounded-lg border border-line bg-paper p-3">
                        <CoachClientNutrition clientId={c.id} />
                      </section>

                      <AnalyticsPanel clientId={c.id} />
                    </div>
                  )}
                </div>
              ))}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
