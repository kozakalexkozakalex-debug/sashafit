"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import CoachHome from "@/components/CoachHome";
import CoachClients from "@/components/CoachClients";
import CoachChats from "@/components/CoachChats";
import ThemeSettings from "@/components/ThemeSettings";
import CheckinQuestionsSettings from "@/components/CheckinQuestionsSettings";
import { fetchCoachUnread, UnreadInfo } from "@/lib/coachUnread";
import { useTelegramBack } from "@/lib/telegram";
import NavIcon, { NavIconName } from "@/components/NavIcon";

// Важкі екрани вантажимо лише коли вони справді відкриваються — так перший
// вхід тренера швидший.
const HabitTemplatesLibrary = dynamic(() => import("@/components/HabitTemplatesLibrary"), { ssr: false });
const ProgramsSection = dynamic(() => import("@/components/ProgramsSection"), { ssr: false });
const NutritionSection = dynamic(() => import("@/components/NutritionSection"), { ssr: false });
const CoachAnalytics = dynamic(() => import("@/components/CoachAnalytics"), { ssr: false });

// «more» — екран-меню «Ще» (аналітика, налаштування); сам по собі нічого не показує.
type TabId = "home" | "clients" | "library" | "more" | "analytics" | "appearance";
type LibrarySubTab = "workouts" | "food" | "habits";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Зустрічі й огляд" },
  { id: "clients", label: "Клієнти" },
  { id: "library", label: "База" },
  { id: "more", label: "Ще" },
  { id: "analytics", label: "Аналітика" },
  { id: "appearance", label: "Налаштування" },
];

// Розділи-кружки на вкладці «База». Щоб додати новий розділ у майбутньому —
// достатньо додати ще один елемент сюди і завести відповідний компонент.
const LIBRARY_SECTIONS: { id: LibrarySubTab; label: string; icon: string }[] = [
  { id: "workouts", label: "Тренування", icon: "🏋" },
  { id: "food", label: "Харчування", icon: "🍽" },
  { id: "habits", label: "Звички", icon: "💧" },
];

// Знизу на мобільному — 3 пункти. Усе рідкісне (зустрічі, аналітика, налаштування,
// вихід) живе в «Ще»; чат — плаваюча кнопка.
const MOBILE_MAIN_IDS: TabId[] = ["clients", "library", "more"];
const MORE_GROUP: TabId[] = ["more", "home", "analytics", "appearance"];
const TAB_ICON: Record<TabId, NavIconName> = {
  home: "home",
  clients: "clients",
  library: "library",
  more: "more",
  analytics: "analytics",
  appearance: "profile",
};

export default function CoachDashboard({
  goHomeSignal,
  onSignOut,
}: {
  goHomeSignal?: number;
  onSignOut?: () => void;
}) {
  const [tab, setTab] = useState<TabId>("clients");
  // Запит «відкрити клієнта» (з Головної) — скидаємо при ручному переході між вкладками,
  // інакше повернення на «Клієнти» знову відкрило б старого клієнта.
  const [clientReq, setClientReq] = useState<{ id: string; n: number } | null>(null);
  function go(t: TabId) {
    setClientReq(null);
    setTab(t);
  }

  // Непрочитані повідомлення клієнтів: для бейджа на чаті і черги на головній.
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

  useEffect(() => {
    if (goHomeSignal) go("clients");
  }, [goHomeSignal]);

  // При переключенні вкладки прокручуємо сторінку наверх.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  function TabButton({ t }: { t: { id: TabId; label: string } }) {
    const active = tab === t.id;
    return (
      <button
        type="button"
        onClick={() => go(t.id)}
        className={`w-full rounded-md border-l-2 px-3 py-2 text-left font-display text-sm font-medium transition ${
          active ? "border-brand bg-brand/15 text-ink" : "border-transparent text-muted hover:bg-line/30 hover:text-ink"
        }`}
      >
        {t.label}
      </button>
    );
  }

  // Кнопка «← Ще» над екранами, до яких дійшли через меню «Ще» (лише на мобільному).
  const backToMore = (
    <button
      type="button"
      onClick={() => go("more")}
      className="mb-3 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted lg:hidden"
    >
      ← Ще
    </button>
  );

  return (
    <div className="flex flex-col gap-6 pb-28 lg:flex-row lg:items-start lg:gap-8 lg:pb-0">
      {typeof document !== "undefined" &&
        createPortal(
          <nav className="fixed inset-x-0 bottom-0 z-[60] flex items-stretch border-t border-line bg-sidebar/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
            {MOBILE_MAIN_IDS.map((id) => {
              const t = TABS.find((x) => x.id === id)!;
              const active = id === "more" ? MORE_GROUP.includes(tab) : tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
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
        {(["clients", "library", "home", "analytics", "appearance"] as TabId[]).map((id) => (
          <TabButton key={id} t={TABS.find((x) => x.id === id)!} />
        ))}
        <div className="my-2 h-px bg-line" />
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md px-3 py-2 text-left font-display text-sm font-medium text-muted hover:text-ink"
        >
          Вийти
        </button>
      </nav>

      <div className="min-w-0 flex-1">
        {tab === "home" ? (
          <div>
            {backToMore}
            <CoachHome
            onOpenClient={(id) => {
              setClientReq({ id, n: Date.now() });
              setTab("clients");
            }}
            onOpenChat={(id) => {
              setChatClientId(id);
              setChatOpen(true);
            }}
            unread={unread}
            actionSignal={homeAction}
            />
          </div>
        ) : tab === "clients" ? (
          <CoachClients
            unread={unread}
            openRequest={clientReq}
            onOpenChat={(id) => {
              setChatClientId(id);
              setChatOpen(true);
            }}
            suspendBack={chatOpen}
          />
        ) : tab === "more" ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {(
              [
                ["home", "Зустрічі й огляд", "Найближчі зустрічі, тренування, активність"],
                ["analytics", "Аналітика", "Графіки по клієнтах, харчування, чек-іни"],
                ["appearance", "Налаштування", "Тема, питання чек-іна"],
              ] as [TabId, string, string][]
            ).map(([id, title, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left"
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand/15 text-brand">
                  <NavIcon name={TAB_ICON[id]} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{title}</span>
                  <span className="block truncate text-xs text-muted">{hint}</span>
                </span>
                <span className="text-muted">›</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                go("home");
                setHomeAction({ ts: Date.now() });
              }}
              className="rounded-2xl border border-line bg-surface p-4 text-left text-sm font-semibold text-ink"
            >
              + Нова зустріч
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-2xl border border-line bg-surface p-4 text-left text-sm text-muted"
            >
              Вийти
            </button>
          </div>
        ) : tab === "appearance" ? (
          <div className="flex flex-col gap-4">
            {backToMore}
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
        ) : (
          <div>
            {backToMore}
            <CoachAnalytics />
          </div>
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
