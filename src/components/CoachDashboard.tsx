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
import CoachHome from "@/components/CoachHome";
import ChatLauncher from "@/components/ChatLauncher";
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

type TabId = "home" | "clients" | "library" | "analytics" | "payments";
type LibrarySubTab = "workouts" | "food";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Головна" },
  { id: "clients", label: "Клієнти" },
  { id: "library", label: "База" },
  { id: "analytics", label: "Аналітика" },
  { id: "payments", label: "Оплата" },
];

// Знизу на мобільному — 4 найважливіші вкладки + кнопка «Ще» з рештою.
// Чек-іни тепер всередині «Аналітики» (перша підвкладка), окремої кнопки нема.
const MOBILE_MAIN_IDS: TabId[] = ["home", "clients", "library", "analytics"];
const MOBILE_MORE_IDS: TabId[] = ["payments"];
const TAB_ICON: Record<TabId, string> = {
  home: "🏠",
  clients: "👥",
  library: "🗂",
  analytics: "📊",
  payments: "💳",
};

// Поп-ап для дій над клієнтом (призначити тренування/програму/раціон) —
// щоб вони не розпирали сторінку вниз, а виїжджали зверху (шторка на
// мобільному, модалка по центру на десктопі). Дочірній компонент сам малює
// свою картку й кнопку «Закрити» — ця обгортка лише позиціонує й затемнює фон.
function QuickActionSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:inset-0 lg:m-auto lg:h-fit lg:max-h-[85vh] lg:w-[520px]"
      >
        {children}
      </div>
    </div>
  );
}

export default function CoachDashboard({ goHomeSignal }: { goHomeSignal?: number }) {
  const [tab, setTab] = useState<TabId>("home");
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>("workouts");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (goHomeSignal) setTab("home");
  }, [goHomeSignal]);

  // При переключенні вкладки прокручуємо сторінку наверх — інакше лишається
  // позиція скролу з попередньої вкладки (напр. знизу списку клієнтів).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

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

  function TabButton({ t, onSelect }: { t: { id: TabId; label: string }; onSelect?: () => void }) {
    const active = tab === t.id;
    return (
      <button
        type="button"
        onClick={() => {
          setTab(t.id);
          onSelect?.();
        }}
        className={`w-full rounded-md border-l-2 px-3 py-2 text-left font-display text-sm font-medium transition ${
          active ? "border-accent bg-accent/15 text-ink" : "border-transparent text-muted hover:bg-line/30 hover:text-ink"
        }`}
      >
        {t.label}
      </button>
    );
  }

  const moreActive = MOBILE_MORE_IDS.includes(tab);

  return (
    <div className="flex flex-col gap-6 pb-20 lg:flex-row lg:items-start lg:gap-8 lg:pb-0">
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_MAIN_IDS.map((id) => {
          const t = TABS.find((x) => x.id === id)!;
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setMobileMoreOpen(false);
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-base leading-none">{TAB_ICON[id]}</span>
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          aria-expanded={mobileMoreOpen}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            moreActive || mobileMoreOpen ? "text-accent" : "text-muted"
          }`}
        >
          <span className="text-base leading-none">⋯</span>
          Ще
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-sidebar p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            {MOBILE_MORE_IDS.map((id) => (
              <TabButton key={id} t={TABS.find((x) => x.id === id)!} onSelect={() => setMobileMoreOpen(false)} />
            ))}
          </div>
        </div>
      )}

      <nav className="hidden lg:sticky lg:top-6 lg:flex lg:w-56 lg:flex-none lg:flex-col lg:gap-0.5 lg:rounded-xl lg:border lg:border-line lg:bg-sidebar lg:p-3 lg:pb-3">
        <TabButton t={TABS[0]} />
        <div className="my-2 h-px bg-line" />
        {TABS.slice(1, 4).map((t) => (
          <TabButton key={t.id} t={t} />
        ))}
        <div className="my-2 h-px bg-line" />
        <TabButton t={TABS[4]} />
      </nav>

      <div className="min-w-0 flex-1">
      {tab === "home" ? (
        <CoachHome onOpenClients={() => setTab("clients")} onNavigate={(t) => setTab(t)} />
      ) : tab === "library" ? (
        <div>
          <div className="mb-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setLibrarySubTab("workouts")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                librarySubTab === "workouts"
                  ? "border-accent bg-accent text-paper"
                  : "border-line bg-paper text-muted hover:text-ink"
              }`}
            >
              🏋 Тренування
            </button>
            <button
              type="button"
              onClick={() => setLibrarySubTab("food")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                librarySubTab === "food"
                  ? "border-accent bg-accent text-paper"
                  : "border-line bg-paper text-muted hover:text-ink"
              }`}
            >
              🍽 Харчування
            </button>
          </div>
          {librarySubTab === "workouts" ? <ProgramsSection /> : <NutritionSection />}
        </div>
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
                    <QuickActionSheet onClose={() => setShowBuilder(false)}>
                      <WorkoutBuilder
                        clientId={c.id}
                        onClose={() => setShowBuilder(false)}
                        onSaved={() => setCalendarKey((k) => k + 1)}
                      />
                    </QuickActionSheet>
                  )}

                  {showAssignProgram && (
                    <QuickActionSheet onClose={() => setShowAssignProgram(false)}>
                      <AssignProgram
                        clientId={c.id}
                        onClose={() => setShowAssignProgram(false)}
                        onSaved={() => setCalendarKey((k) => k + 1)}
                      />
                    </QuickActionSheet>
                  )}

                  {showAssignRation && (
                    <QuickActionSheet onClose={() => setShowAssignRation(false)}>
                      <AssignRation
                        clientId={c.id}
                        onClose={() => setShowAssignRation(false)}
                        onSaved={() => setCalendarKey((k) => k + 1)}
                      />
                    </QuickActionSheet>
                  )}
                </div>
              );
            })()}
        </>
      )}
      </div>

      <ChatLauncher mode="coach" />
    </div>
  );
}
