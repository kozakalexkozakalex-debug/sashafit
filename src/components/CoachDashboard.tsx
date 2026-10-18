"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ClientActivityCalendar, { CheckinMarker } from "@/components/ClientActivityCalendar";
import ClientProfileCard from "@/components/ClientProfileCard";
import WorkoutBuilder from "@/components/WorkoutBuilder";
import AssignProgram from "@/components/AssignProgram";
import AssignRation from "@/components/AssignRation";
import ProgramsSection from "@/components/ProgramsSection";
import NutritionSection from "@/components/NutritionSection";
import CoachAnalytics from "@/components/CoachAnalytics";
import CoachPayments from "@/components/CoachPayments";
import CoachCheckins from "@/components/CoachCheckins";
import CoachHome from "@/components/CoachHome";
import { clientRisk, RISK_LABEL } from "@/lib/clientRisk";
import { clientLabel } from "@/lib/clientLabel";

type Client = {
  id: string;
  name: string | null;
  goal: string | null;
  invite_code: string;
  profile_id: string | null;
  subscription_until: string | null;
  created_at: string;
  avatar_path: string | null;
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

export default function CoachDashboard({ goHomeSignal }: { goHomeSignal?: number }) {
  const [tab, setTab] = useState<TabId>("home");
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (goHomeSignal) setTab("home");
  }, [goHomeSignal]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showAssignProgram, setShowAssignProgram] = useState(false);
  const [showAssignRation, setShowAssignRation] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);
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

  async function selectClient(clientId: string) {
    setShowBuilder(false);
    setShowAssignProgram(false);
    setShowAssignRation(false);
    if (selectedId === clientId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(clientId);
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
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("clients").insert({ name: null, goal: null });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    load();
  }

  async function removeClient(id: string) {
    if (!window.confirm("Відключити цього клієнта? Усі його дані (чек-іни, тренування, харчування) будуть видалені.")) {
      return;
    }
    await supabase.from("clients").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
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

  function TabButton({ t }: { t: { id: TabId; label: string } }) {
    const active = tab === t.id;
    return (
      <button
        type="button"
        onClick={() => setTab(t.id)}
        className={`whitespace-nowrap rounded-full border px-4 py-1.5 font-display text-sm font-medium transition lg:w-full lg:rounded-md lg:border-0 lg:border-l-2 lg:px-3 lg:py-2 lg:text-left ${
          active
            ? "border-accent bg-accent text-paper lg:bg-accent/15 lg:text-ink"
            : "border-line bg-surface text-muted hover:border-accent/50 hover:text-ink lg:border-transparent lg:bg-transparent lg:hover:bg-line/30"
        }`}
      >
        {t.label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:w-56 lg:flex-none lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-xl lg:border lg:border-line lg:bg-sidebar lg:p-3 lg:pb-3">
        <TabButton t={TABS[0]} />
        <div className="hidden h-px bg-line lg:my-2 lg:block" />
        {TABS.slice(1, 6).map((t) => (
          <TabButton key={t.id} t={t} />
        ))}
        <div className="hidden h-px bg-line lg:my-2 lg:block" />
        <TabButton t={TABS[6]} />
      </nav>

      <div className="min-w-0 flex-1">
      {tab === "home" ? (
        <CoachHome onOpenClients={() => setTab("clients")} onNavigate={(t) => setTab(t)} />
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
            <p className="mb-2 text-xs text-muted">
              Нічого вказувати не треба — просто створи посилання. Клієнт сам впише своє ім&apos;я, коли зайде за ним
              і заповнить анкету.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={addClient}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
              >
                {busy ? "Створюю…" : "Створити посилання"}
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
                    onClick={() => selectClient(c.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <span className="font-medium">{clientLabel(c)}</span>
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
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeClient(c.id)}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted"
                    >
                      Відключити
                    </button>
                  </div>
                </div>
              ))}
              {clients.length === 0 && <p className="text-sm text-muted">Клієнтів ще немає.</p>}
            </div>
          </div>

          {selectedId &&
            (() => {
              const c = clients.find((x) => x.id === selectedId);
              if (!c) return null;

              if (!c.profile_id || c.start_weight == null) {
                return (
                  <div className="rounded-xl border border-line bg-surface p-4">
                    <p className="text-sm text-muted">
                      {clientLabel(c)} ще не заповнив(ла) анкету.
                      {!c.profile_id && " Надішли посилання-запрошення зі списку вище."}
                    </p>
                  </div>
                );
              }

              const checkins = checkinsByClient[c.id] || [];
              const markers: CheckinMarker[] = checkins.map((ci) => ({
                id: ci.id,
                date: ci.created_at.slice(0, 10),
                weight: ci.weight,
                waist: ci.waist,
                hips: ci.hips,
                chest: ci.chest,
                comment: ci.comment,
                photoUrl: ci.photo_path ? photoUrls[ci.id] || null : null,
              }));

              return (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="flex flex-col gap-3 lg:w-1/3 lg:flex-none">
                      <ClientProfileCard client={c} checkins={checkins} readOnly />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowBuilder((v) => !v);
                            setShowAssignProgram(false);
                            setShowAssignRation(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent"
                        >
                          {showBuilder ? "Сховати" : "Призначити тренування"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignProgram((v) => !v);
                            setShowBuilder(false);
                            setShowAssignRation(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent"
                        >
                          {showAssignProgram ? "Сховати" : "Призначити програму"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignRation((v) => !v);
                            setShowBuilder(false);
                            setShowAssignProgram(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent"
                        >
                          {showAssignRation ? "Сховати" : "Призначити раціон"}
                        </button>
                      </div>
                    </div>
                    <div className="lg:flex-1">
                      <ClientActivityCalendar key={calendarKey} clientId={c.id} checkins={markers} />
                    </div>
                  </div>

                  {showBuilder && (
                    <WorkoutBuilder
                      clientId={c.id}
                      onClose={() => setShowBuilder(false)}
                      onSaved={() => setCalendarKey((k) => k + 1)}
                    />
                  )}

                  {showAssignProgram && (
                    <AssignProgram
                      clientId={c.id}
                      onClose={() => setShowAssignProgram(false)}
                      onSaved={() => setCalendarKey((k) => k + 1)}
                    />
                  )}

                  {showAssignRation && (
                    <AssignRation
                      clientId={c.id}
                      onClose={() => setShowAssignRation(false)}
                      onSaved={() => setCalendarKey((k) => k + 1)}
                    />
                  )}
                </div>
              );
            })()}
        </>
      )}
      </div>
    </div>
  );
}
