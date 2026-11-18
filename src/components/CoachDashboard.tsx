"use client";

import { useTelegramBack } from "@/lib/telegram";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import ClientActivityCalendar, { CheckinMarker } from "@/components/ClientActivityCalendar";
import ClientProfileCard from "@/components/ClientProfileCard";
import CoachHome from "@/components/CoachHome";
import CoachChats from "@/components/CoachChats";
import ThemeSettings from "@/components/ThemeSettings";
import CheckinQuestionsSettings from "@/components/CheckinQuestionsSettings";
import { fetchCoachUnread, UnreadInfo } from "@/lib/coachUnread";
import { clientRisk, RISK_LABEL } from "@/lib/clientRisk";
import { clientLabel } from "@/lib/clientLabel";
import NavIcon, { NavIconName } from "@/components/NavIcon";

// Важкі екрани вантажимо лише коли вони справді відкриваються — так перший
// вхід тренера швидший.
const WorkoutBuilder = dynamic(() => import("@/components/WorkoutBuilder"), { ssr: false });
const AssignProgram = dynamic(() => import("@/components/AssignProgram"), { ssr: false });
const AssignHabits = dynamic(() => import("@/components/AssignHabits"), { ssr: false });
const HabitTemplatesLibrary = dynamic(() => import("@/components/HabitTemplatesLibrary"), { ssr: false });
const AssignRation = dynamic(() => import("@/components/AssignRation"), { ssr: false });
const ProgramsSection = dynamic(() => import("@/components/ProgramsSection"), { ssr: false });
const NutritionSection = dynamic(() => import("@/components/NutritionSection"), { ssr: false });
const CoachAnalytics = dynamic(() => import("@/components/CoachAnalytics"), { ssr: false });

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
  checkin_weekday: number | null;
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

type TabId = "home" | "clients" | "newClient" | "library" | "analytics" | "appearance";
type LibrarySubTab = "workouts" | "food" | "habits";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Головна" },
  { id: "clients", label: "Клієнти" },
  { id: "newClient", label: "Заявки" },
  { id: "library", label: "База" },
  { id: "analytics", label: "Аналітика" },
  { id: "appearance", label: "Налаштування" },
];

// Розділи-кружки на вкладці «База». Щоб додати новий розділ у майбутньому
// (наприклад, «Звички» чи щось інше) — достатньо додати ще один елемент сюди
// і завести відповідний компонент.
const LIBRARY_SECTIONS: { id: LibrarySubTab; label: string; icon: string }[] = [
  { id: "workouts", label: "Тренування", icon: "🏋" },
  { id: "food", label: "Харчування", icon: "🍽" },
  { id: "habits", label: "Звички", icon: "💧" },
];

// Знизу на мобільному — 4 вкладки. «Заявки» — кнопка в хедері та вкладка
// «Клієнти»; «Налаштування» — шестірня в хедері; чат — плаваюча кнопка.
const MOBILE_MAIN_IDS: TabId[] = ["home", "clients", "library", "analytics"];
const TAB_ICON: Record<TabId, NavIconName> = {
  home: "home",
  clients: "clients",
  newClient: "clients",
  library: "library",
  analytics: "analytics",
  appearance: "profile",
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

export default function CoachDashboard({
  goHomeSignal,
  meetingSignal,
  newClientSignal,
  settingsSignal,
}: {
  goHomeSignal?: number;
  meetingSignal?: number;
  newClientSignal?: number;
  settingsSignal?: number;
}) {
  const [tab, setTab] = useState<TabId>("home");
  // Непрочитані повідомлення клієнтів: для бейджа на вкладці «Чати» і черги на головній.
  const [unread, setUnread] = useState<UnreadInfo>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatClientId, setChatClientId] = useState<string | null>(null);
  useTelegramBack(chatOpen, () => setChatOpen(false));
  async function refreshUnread() {
    setUnread(await fetchCoachUnread());
  }
  useEffect(() => {
    refreshUnread();
    const channel = supabase
      .channel("coach-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "sender=eq.client" },
        () => refreshUnread()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  const unreadTotal = Object.values(unread).reduce((s, u) => s + u.count, 0);
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>("workouts");
  // Сигнал для CoachHome: відкрити форму "Нова зустріч" (кнопка в хедері),
  // навіть якщо зараз відкрита інша вкладка.
  const [homeAction, setHomeAction] = useState<{ ts: number } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (goHomeSignal) setTab("home");
  }, [goHomeSignal]);

  useEffect(() => {
    if (meetingSignal) {
      setTab("home");
      setHomeAction({ ts: Date.now() });
    }
  }, [meetingSignal]);

  // Кнопка "Заявки" у хедері — перемикає на окрему вкладку "Заявки"
  // (створення посилання для нового клієнта).
  useEffect(() => {
    if (newClientSignal) setTab("newClient");
  }, [newClientSignal]);

  // Кнопка-шестірня в хедері — відкриває "Налаштування" (тема, питання чек-іна).
  useEffect(() => {
    if (settingsSignal) setTab("appearance");
  }, [settingsSignal]);

  // При переключенні вкладки прокручуємо сторінку наверх — інакше лишається
  // позиція скролу з попередньої вкладки (напр. знизу списку клієнтів).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Вигляд списку клієнтів — картки (за замовчуванням) або список/таблиця.
  // Список рахуємо як основу для майбутнього масового вибору клієнтів.
  const [clientsView, setClientsView] = useState<"cards" | "list">("cards");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkAssignHabits, setShowBulkAssignHabits] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sf_clients_view");
      if (saved === "cards" || saved === "list") setClientsView(saved);
    } catch {
      /* ігноруємо — немає доступу до localStorage */
    }
  }, []);
  function changeClientsView(v: "cards" | "list") {
    setClientsView(v);
    try {
      localStorage.setItem("sf_clients_view", v);
    } catch {
      /* ігноруємо — немає доступу до localStorage */
    }
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showAssignProgram, setShowAssignProgram] = useState(false);
  const [showAssignRation, setShowAssignRation] = useState(false);
  const [showAssignHabits, setShowAssignHabits] = useState(false);
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

  function toggleClientSelected(clientId: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  async function selectClient(clientId: string) {
    setShowBuilder(false);
    setShowAssignProgram(false);
    setShowAssignRation(false);
    setShowAssignHabits(false);
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

  // Розділяємо список клієнтів на "Заявки" (запросив, але ще не підключився)
  // і "Клієнти" (вже підключені) — щоб не змішувались в одному списку.
  const pendingClients = clients.filter((c) => !c.profile_id);
  const connectedClients = clients.filter((c) => c.profile_id);

  function ClientCard({ c }: { c: Client }) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border-l-2 border-brand bg-paper p-3 text-sm">
        <button type="button" onClick={() => selectClient(c.id)} className="flex items-start justify-between gap-2 text-left">
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{clientLabel(c)}</span>
            {c.goal && <span className="mt-0.5 block truncate text-xs text-muted">{c.goal}</span>}
          </span>
          <span className={`flex-none stamp ${c.profile_id ? "text-success" : "text-brand"}`}>
            {c.profile_id ? "Підключено" : "Очікує"}
          </span>
        </button>

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            Приєднався{" "}
            {new Date(c.created_at).toLocaleDateString("uk-UA", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </span>
          {c.profile_id && <span>{RISK_LABEL[clientRisk(c, lastCheckinByClient[c.id])]}</span>}
        </div>

        {!c.profile_id && (
          <div className="flex items-center gap-2">
            <p className="flex-1 break-all rounded bg-surface px-2 py-1 text-xs text-muted">{inviteUrl(c.invite_code)}</p>
            <button
              type="button"
              onClick={() => copy(inviteUrl(c.invite_code))}
              className="whitespace-nowrap rounded bg-surface px-2 py-1 text-xs text-brand"
            >
              Копіювати
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => removeClient(c.id)}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted"
          >
            Відключити
          </button>
        </div>
      </div>
    );
  }

  function ClientRow({ c }: { c: Client }) {
    return (
      <div
        onClick={() => selectClient(c.id)}
        className="grid cursor-pointer grid-cols-[28px_1.6fr_1fr_1fr_1fr_160px] items-center gap-2 border-b border-line px-2 py-2.5 text-sm last:border-b-0 hover:bg-line/10"
      >
        <span onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            disabled={!c.profile_id}
            checked={selectedClientIds.has(c.id)}
            onChange={() => toggleClientSelected(c.id)}
            title={c.profile_id ? "Вибрати для масової дії" : "Клієнт ще не підключений"}
            className="h-4 w-4 accent-accent disabled:opacity-30"
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{clientLabel(c)}</span>
          {c.goal && <span className="block truncate text-xs text-muted">{c.goal}</span>}
        </span>
        <span className={`w-fit stamp ${c.profile_id ? "text-success" : "text-brand"}`}>
          {c.profile_id ? "Підключено" : "Очікує"}
        </span>
        <span className="text-xs text-muted">
          {new Date(c.created_at).toLocaleDateString("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
        <span className="text-xs text-muted">
          {c.profile_id ? RISK_LABEL[clientRisk(c, lastCheckinByClient[c.id])] : "—"}
        </span>
        <span className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!c.profile_id && (
            <button
              type="button"
              onClick={() => copy(inviteUrl(c.invite_code))}
              className="whitespace-nowrap rounded border border-line px-2 py-1 text-[11px] text-brand"
            >
              Копіювати
            </button>
          )}
          <button
            type="button"
            onClick={() => removeClient(c.id)}
            className="whitespace-nowrap rounded border border-line px-2 py-1 text-[11px] text-muted"
          >
            Відключити
          </button>
        </span>
      </div>
    );
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
          active ? "border-brand bg-brand/15 text-ink" : "border-transparent text-muted hover:bg-line/30 hover:text-ink"
        }`}
      >
        {t.label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:flex-row lg:items-start lg:gap-8 lg:pb-0">
      {typeof document !== "undefined" &&
        createPortal(
          <nav className="fixed inset-x-0 bottom-0 z-[60] flex items-stretch border-t border-line bg-sidebar/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
            {MOBILE_MAIN_IDS.map((id) => {
              const t = TABS.find((x) => x.id === id)!;
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                  }}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                    active ? "text-brand" : "text-muted"
                  }`}
                >
                  <NavIcon name={TAB_ICON[id]} className="h-5 w-5" />
                  {t.label}
                </button>
              );
            })}
          </nav>,
          document.body
        )}

      <nav className="hidden lg:sticky lg:top-6 lg:flex lg:w-56 lg:flex-none lg:flex-col lg:gap-0.5 lg:rounded-xl lg:border lg:border-line lg:bg-sidebar lg:p-3 lg:pb-3">
        <TabButton t={TABS.find((x) => x.id === "home")!} />
        <div className="my-2 h-px bg-line" />
        {(["clients", "newClient", "library", "analytics", "appearance"] as TabId[]).map((id) => (
          <TabButton key={id} t={TABS.find((x) => x.id === id)!} />
        ))}
      </nav>

      <div className="min-w-0 flex-1">
      {tab === "home" ? (
        <CoachHome
          onOpenClient={(id) => {
            setTab("clients");
            if (selectedId !== id) selectClient(id);
          }}
          onOpenChat={(id) => {
            setChatClientId(id);
            setChatOpen(true);
          }}
          unread={unread}
          actionSignal={homeAction}
        />
      ) : tab === "appearance" ? (
        <div className="flex flex-col gap-4">
          <ThemeSettings />
          <CheckinQuestionsSettings />
        </div>
      ) : tab === "library" ? (
        <div>
          <div className="mb-5 flex gap-4">
            {LIBRARY_SECTIONS.map((s) => {
              const active = librarySubTab === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setLibrarySubTab(s.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl transition ${
                      active
                        ? "border-brand bg-brand/15 shadow-sm shadow-accent/20"
                        : "border-line bg-paper text-muted hover:border-brand/50"
                    }`}
                  >
                    {s.icon}
                  </span>
                  <span className={`text-xs font-medium ${active ? "text-brand" : "text-muted"}`}>{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            {librarySubTab === "workouts" ? (
              <ProgramsSection />
            ) : librarySubTab === "food" ? (
              <NutritionSection />
            ) : (
              <HabitTemplatesLibrary />
            )}
          </div>
        </div>
      ) : tab === "analytics" ? (
        <CoachAnalytics />
      ) : tab === "newClient" ? (
        <div>
          <div className="mb-4 flex gap-1 rounded-full border border-line bg-sidebar p-1">
            <button
              type="button"
              onClick={() => setTab("clients")}
              className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
            >
              Клієнти
            </button>
            <button
              type="button"
              onClick={() => setTab("newClient")}
              className="flex-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper"
            >
              Заявки
            </button>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Заявки ({pendingClients.length})</h2>
              <button
                type="button"
                disabled={busy}
                onClick={addClient}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
              >
                {busy ? "Створюю…" : "+ Нове посилання"}
              </button>
            </div>
            {err && <p className="mb-2 text-sm text-danger">{err}</p>}
            {pendingClients.length === 0 ? (
              <p className="text-sm text-muted">
                Заявок ще немає. Натисни «+ Нове посилання», щоб створити посилання для нового клієнта — воно зʼявиться
                тут, поки клієнт не зайде за ним.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pendingClients.map((c) => (
                  <ClientCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 flex gap-1 rounded-full border border-line bg-sidebar p-1">
            <button
              type="button"
              onClick={() => setTab("clients")}
              className="flex-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper"
            >
              Клієнти
            </button>
            <button
              type="button"
              onClick={() => setTab("newClient")}
              className="flex-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
            >
              Заявки
            </button>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Клієнти ({connectedClients.length})</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => changeClientsView("cards")}
                  aria-label="Картками"
                  title="Картками"
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    clientsView === "cards" ? "border-accent bg-accent text-paper" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  ⊞
                </button>
                <button
                  type="button"
                  onClick={() => changeClientsView("list")}
                  aria-label="Списком"
                  title="Списком"
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    clientsView === "list" ? "border-accent bg-accent text-paper" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  ☰
                </button>
              </div>
            </div>

            {connectedClients.length === 0 ? (
              <p className="text-sm text-muted">Клієнтів ще немає.</p>
            ) : clientsView === "cards" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {connectedClients.map((c) => (
                  <ClientCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <div>
                {selectedClientIds.size > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-xs">
                    <span className="font-medium text-brand">Вибрано: {selectedClientIds.size}</span>
                    <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowBulkAssign(true)}
                        className="whitespace-nowrap rounded-full bg-accent px-3 py-1 font-semibold text-paper"
                      >
                        Призначити програму
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBulkAssignHabits(true)}
                        className="whitespace-nowrap rounded-full border border-brand px-3 py-1 font-semibold text-brand"
                      >
                        Призначити звички
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedClientIds(new Set())}
                        className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-muted"
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    {connectedClients.length > 0 && (
                      <>
                        <div className="grid grid-cols-[28px_1.6fr_1fr_1fr_1fr_160px] gap-2 border-b border-line px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted">
                          <span></span>
                          <span>Клієнт</span>
                          <span>Статус</span>
                          <span>Приєднався</span>
                          <span>Ризик</span>
                          <span></span>
                        </div>
                        {connectedClients.map((c) => (
                          <ClientRow key={c.id} c={c} />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {showBulkAssign && (
            <QuickActionSheet onClose={() => setShowBulkAssign(false)}>
              <AssignProgram
                clientIds={Array.from(selectedClientIds)}
                onClose={() => setShowBulkAssign(false)}
                onSaved={() => {
                  setSelectedClientIds(new Set());
                }}
              />
            </QuickActionSheet>
          )}

          {showBulkAssignHabits && (
            <QuickActionSheet onClose={() => setShowBulkAssignHabits(false)}>
              <AssignHabits
                clientIds={Array.from(selectedClientIds)}
                onClose={() => setShowBulkAssignHabits(false)}
                onSaved={() => {
                  setSelectedClientIds(new Set());
                }}
              />
            </QuickActionSheet>
          )}

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
                            setShowAssignHabits(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand"
                        >
                          {showBuilder ? "Сховати" : "Призначити тренування"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignProgram((v) => !v);
                            setShowBuilder(false);
                            setShowAssignRation(false);
                            setShowAssignHabits(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand"
                        >
                          {showAssignProgram ? "Сховати" : "Призначити програму"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignRation((v) => !v);
                            setShowBuilder(false);
                            setShowAssignProgram(false);
                            setShowAssignHabits(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand"
                        >
                          {showAssignRation ? "Сховати" : "Призначити раціон"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignHabits((v) => !v);
                            setShowBuilder(false);
                            setShowAssignProgram(false);
                            setShowAssignRation(false);
                          }}
                          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand"
                        >
                          {showAssignHabits ? "Сховати" : "Призначити звички"}
                        </button>
                      </div>
                    </div>
                    <div className="lg:flex-1">
                      <ClientActivityCalendar
                        key={calendarKey}
                        clientId={c.id}
                        checkins={markers}
                        showHabits
                        habitsReadOnly
                        checkinWeekday={c.checkin_weekday ?? 0}
                      />
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
                        clientIds={[c.id]}
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

                  {showAssignHabits && (
                    <QuickActionSheet onClose={() => setShowAssignHabits(false)}>
                      <AssignHabits
                        clientIds={[c.id]}
                        onClose={() => setShowAssignHabits(false)}
                        onSaved={() => setShowAssignHabits(false)}
                      />
                    </QuickActionSheet>
                  )}
                </div>
              );
            })()}
        </>
      )}
      </div>


      <button
        type="button"
        onClick={() => {
          setChatClientId(null);
          setChatOpen(true);
        }}
        aria-label="Чат"
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-paper shadow-lg transition hover:brightness-110 lg:bottom-6"
      >
        <NavIcon name="chat" className="h-6 w-6" />
        {unreadTotal > 0 && !chatOpen && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
            {unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        )}
      </button>

      {chatOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[65]" onClick={() => setChatOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 flex h-[80dvh] flex-col rounded-t-2xl border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:bottom-6 lg:right-4 lg:h-[30rem] lg:w-96 lg:rounded-xl lg:border"
            >
              <div className="flex items-center justify-between border-b border-line p-3">
                <h2 className="text-sm font-semibold">Повідомлення</h2>
                <button type="button" onClick={() => setChatOpen(false)} className="text-xs text-muted">
                  Закрити
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <CoachChats
                  key={chatClientId ?? "list"}
                  embedded
                  unread={unread}
                  onRead={refreshUnread}
                  openClientId={chatClientId}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
