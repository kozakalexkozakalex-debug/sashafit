"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import ClientActivityCalendar, { CheckinMarker } from "@/components/ClientActivityCalendar";
import ClientProfileCard from "@/components/ClientProfileCard";
import CheckinReviewSheet from "@/components/CheckinReviewSheet";
import { clientRisk, RISK_LABEL } from "@/lib/clientRisk";
import { clientLabel } from "@/lib/clientLabel";
import { useTelegramBack } from "@/lib/telegram";
import Avatar from "@/components/Avatar";
import { checkinWindow } from "@/lib/checkinWindow";
import { useAvatars } from "@/lib/useAvatars";
import { UnreadInfo } from "@/lib/coachUnread";

// Вкладка «Клієнти» тренера: список з пошуком, запрошення нового клієнта,
// а всередині клієнта — вкладки «Зведення / План / Чек-іни».

const WorkoutBuilder = dynamic(() => import("@/components/WorkoutBuilder"), { ssr: false });
const AssignProgram = dynamic(() => import("@/components/AssignProgram"), { ssr: false });
const AssignHabits = dynamic(() => import("@/components/AssignHabits"), { ssr: false });
const AssignRation = dynamic(() => import("@/components/AssignRation"), { ssr: false });

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
  photo_side_path: string | null;
  photo_back_path: string | null;
  comment: string | null;
  created_at: string;
  reviewed_at: string | null;
};
type AnswerRow = { checkin_id: string; value: string | null; checkin_questions: { label: string } | null };

type SubTab = "overview" | "profile" | "progress";
const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Огляд" },
  { id: "profile", label: "Профіль" },
  { id: "progress", label: "Прогрес" },
];

type AssignKind = "workout" | "program" | "ration" | "habits";

// Шторка для дій над клієнтом: на мобільному виїжджає знизу, на ПК — по центру.
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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

function daysAgoText(iso: string | undefined) {
  if (!iso) return "чек-іну ще не було";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "чек-ін сьогодні";
  if (d === 1) return "чек-ін вчора";
  return `чек-ін ${d} дн. тому`;
}

export default function CoachClients({
  openRequest,
  onOpenChat,
  suspendBack,
  unread,
}: {
  // Запит з «Головної»: відкрити конкретного клієнта.
  openRequest: { id: string; n: number } | null;
  onOpenChat: (clientId: string) => void;
  // Поки поверх відкрито чат, кнопка «Назад» Telegram має закривати його, а не клієнта.
  suspendBack?: boolean;
  // Непрочитані повідомлення по клієнтах (рахує CoachDashboard).
  unread?: UnreadInfo;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [lastCheckin, setLastCheckin] = useState<Record<string, string>>({});
  // Скільки нових (неперевірених) чек-інів у кожного клієнта.
  const [toReview, setToReview] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "action" | "risk">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  // Масовий вибір клієнтів (призначити програму / звички кільком одразу).
  const [selectMode, setSelectMode] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "program" | "habits">(null);

  // Відкритий клієнт.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [weekStats, setWeekStats] = useState<{ pct: number | null; done: number; planned: number; lastTitle: string | null; lastDate: string | null }>({
    pct: null,
    done: 0,
    planned: 0,
    lastTitle: null,
    lastDate: null,
  });
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, { label: string; value: string }[]>>({});
  const [assignMenu, setAssignMenu] = useState(false);
  const [assign, setAssign] = useState<AssignKind | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);

  useTelegramBack(detailId !== null && !reviewOpen && !suspendBack, () => setDetailId(null));

  async function load() {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setClients((data as Client[]) || []);

    const { data: ci } = await supabase
      .from("checkins")
      .select("client_id, created_at, reviewed_at")
      .order("created_at", { ascending: false });
    const last: Record<string, string> = {};
    const fresh: Record<string, number> = {};
    for (const row of (ci as { client_id: string; created_at: string; reviewed_at: string | null }[]) || []) {
      if (!last[row.client_id]) last[row.client_id] = row.created_at;
      if (!row.reviewed_at) fresh[row.client_id] = (fresh[row.client_id] || 0) + 1;
    }
    setLastCheckin(last);
    setToReview(fresh);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    setDetailId(openRequest.id);
    setSubTab("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.n]);

  async function loadDetail(clientId: string) {
    const { data } = await supabase
      .from("checkins")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const rows = (data as Checkin[]) || [];
    setCheckins(rows);

    // Виконання тренувань за останні 7 днів + остання виконана.
    const dk = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { data: wo } = await supabase
      .from("assigned_workouts")
      .select("title, date, completed_at")
      .eq("client_id", clientId)
      .gte("date", dk(new Date(Date.now() - 13 * 86400000)))
      .order("date", { ascending: false });
    const list = (wo as { title: string; date: string; completed_at: string | null }[]) || [];
    const weekAgo = dk(new Date(Date.now() - 6 * 86400000));
    const todayKey = dk(new Date());
    const inWeek = list.filter((w) => w.date >= weekAgo && w.date <= todayKey);
    const doneWeek = inWeek.filter((w) => w.completed_at).length;
    const lastDone = list.find((w) => w.completed_at);
    setWeekStats({
      pct: inWeek.length > 0 ? Math.round((doneWeek / inWeek.length) * 100) : null,
      done: doneWeek,
      planned: inWeek.length,
      lastTitle: lastDone?.title ?? null,
      lastDate: lastDone?.date ?? null,
    });

    // Ключі: «id» — фото спереду (для календаря), «id:side» і «id:back».
    const urls: Record<string, string> = {};
    await Promise.all(
      rows.flatMap((c) =>
        (
          [
            [c.id, c.photo_path],
            [`${c.id}:side`, c.photo_side_path],
            [`${c.id}:back`, c.photo_back_path],
          ] as [string, string | null][]
        )
          .filter(([, path]) => path)
          .map(async ([key, path]) => {
            const { data: signed } = await supabase.storage.from("checkins").createSignedUrl(path as string, 3600);
            if (signed?.signedUrl) urls[key] = signed.signedUrl;
          })
      )
    );
    setPhotoUrls(urls);

    if (rows.length > 0) {
      const { data: ans } = await supabase
        .from("checkin_answers")
        .select("checkin_id, value, checkin_questions(label)")
        .in("checkin_id", rows.map((r) => r.id));
      const byCheckin: Record<string, { label: string; value: string }[]> = {};
      for (const a of ((ans as unknown as AnswerRow[]) || [])) {
        (byCheckin[a.checkin_id] ||= []).push({ label: a.checkin_questions?.label || "Питання", value: a.value || "—" });
      }
      setAnswers(byCheckin);
    } else {
      setAnswers({});
    }
  }

  useEffect(() => {
    setCheckins([]);
    setPhotoUrls({});
    setAnswers({});
    setAssignMenu(false);
    setAssign(null);
    if (detailId) {
      loadDetail(detailId);
      window.scrollTo(0, 0);
    }
  }, [detailId]);

  function inviteUrl(code: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/login?invite=${code}`;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Посилання скопійовано");
    } catch {
      setNotice(text);
    }
  }

  async function addClient() {
    setBusy(true);
    setErr("");
    setNotice("");
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: null, goal: null })
      .select("invite_code")
      .single();
    setBusy(false);
    if (error || !data) {
      setErr(error?.message || "Не вдалося створити запрошення");
      return;
    }
    await copy(inviteUrl((data as { invite_code: string }).invite_code));
    load();
  }

  async function removeClient(id: string) {
    if (!window.confirm("Відключити цього клієнта? Усі його дані (чек-іни, тренування, харчування) будуть видалені.")) {
      return;
    }
    await supabase.from("clients").delete().eq("id", id);
    if (detailId === id) setDetailId(null);
    load();
  }

  function openClient(id: string) {
    setSubTab("overview");
    setDetailId(id);
  }

  function togglePicked(id: string) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pending = clients.filter((c) => !c.profile_id);
  const connected = clients.filter((c) => c.profile_id);
  const q = query.trim().toLowerCase();
  const needs = (id: string) => (toReview[id] || 0) + (unread?.[id]?.count || 0);
  const byQuery = q ? connected.filter((c) => clientLabel(c).toLowerCase().includes(q)) : connected;
  const riskOf = (c: Client) => clientRisk(c, lastCheckin[c.id]);
  const filtered = byQuery.filter((c) =>
    filter === "action" ? needs(c.id) > 0 : filter === "risk" ? riskOf(c) !== "ok" : true
  );
  const avatars = useAvatars(connected);
  // Тим, кому потрібна дія тренера, — нагорі.
  const shown = [...filtered].sort((a, b) => (needs(b.id) > 0 ? 1 : 0) - (needs(a.id) > 0 ? 1 : 0));
  const needAction = connected.filter((c) => needs(c.id) > 0).length;

  // ---------- Сторінка клієнта ----------
  const current = detailId ? clients.find((x) => x.id === detailId) : null;
  if (detailId && current) {
    const notFilled = !current.profile_id || current.start_weight == null;
    const markers: CheckinMarker[] = checkins.map((ci) => ({
      id: ci.id,
      date: ci.created_at.slice(0, 10),
      weight: ci.weight,
      waist: ci.waist,
      hips: ci.hips,
      chest: ci.chest,
      comment: ci.comment,
      photoUrl: photoUrls[ci.id] || null,
    }));
    const unreviewed = checkins.filter((c) => !c.reviewed_at).length;

    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDetailId(null)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted"
          >
            ← Клієнти
          </button>
          {current.profile_id && (
            <button
              type="button"
              onClick={() => onOpenChat(current.id)}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs font-bold text-ink"
            >
              💬 Чат
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
          <Avatar name={clientLabel(current)} url={avatars[current.id]} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold text-ink">{clientLabel(current)}</h2>
            {current.profile_id && (
              <span className="mt-1 inline-block rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand">
                {RISK_LABEL[clientRisk(current, lastCheckin[current.id])]}
              </span>
            )}
            <p className="mt-1 truncate text-xs text-muted">
              {current.goal ? `${current.goal} · ` : ""}з{" "}
              {new Date(current.created_at).toLocaleDateString("uk-UA", { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        {notFilled ? (
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">
              {clientLabel(current)} ще не заповнив(ла) анкету.
              {!current.profile_id && " Надішли посилання-запрошення зі списку клієнтів."}
            </p>
          </div>
        ) : (
          <>
            {(unreviewed > 0 || (unread?.[current.id]?.count || 0) > 0) && (
              <div className="flex flex-col gap-2 rounded-2xl border border-brand/40 bg-brand/10 p-3">
                <p className="text-sm font-semibold text-ink">Потрібна дія</p>
                {unreviewed > 0 && (
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className="rounded-xl bg-accent py-2.5 text-sm font-bold text-paper"
                  >
                    Перевірити чек-ін ({unreviewed})
                  </button>
                )}
                {(unread?.[current.id]?.count || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenChat(current.id)}
                    className="rounded-xl bg-danger py-2.5 text-sm font-bold text-white"
                  >
                    Відповісти ({unread?.[current.id]?.count})
                  </button>
                )}
              </div>
            )}

            <div className="flex border-b border-line">
              {SUBTABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`-mb-px flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                    subTab === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                  {t.id === "progress" && unreviewed > 0 ? ` · ${unreviewed}` : ""}
                </button>
              ))}
            </div>

            {subTab === "overview" && (
              <>
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold text-ink">Виконання тижня</p>
                    <p className="font-display text-2xl font-bold text-ink">
                      {weekStats.pct === null ? "—" : `${weekStats.pct}%`}
                    </p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-accent shadow-[0_0_12px_rgb(var(--c-accent)/0.7)]"
                      style={{ width: `${weekStats.pct ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {weekStats.planned > 0
                      ? `Виконано ${weekStats.done} з ${weekStats.planned} тренувань за 7 днів`
                      : "За останні 7 днів тренувань не було призначено"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-line bg-surface p-3.5">
                    <p className="text-xs text-muted">Наступний чек-ін</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {(() => {
                        const w = checkinWindow(
                          new Date(),
                          current.checkin_weekday ?? 0,
                          checkins.map((c) => c.created_at.slice(0, 10))
                        );
                        return w.open && !w.done
                          ? "Можна здавати зараз"
                          : `Через ${w.daysToNext} дн`;
                      })()}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5">
                    <p className="text-xs text-muted">Остання активність</p>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">
                      {weekStats.lastTitle ? `✅ ${weekStats.lastTitle}` : "—"}
                    </p>
                    {weekStats.lastDate && <p className="text-[11px] text-muted">{weekStats.lastDate}</p>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAssignMenu(true)}
                  className="rounded-xl bg-accent py-3 text-sm font-bold text-paper shadow-[0_12px_36px_-10px_rgb(var(--c-accent)/0.6)]"
                >
                  + Призначити тренування, раціон або звички
                </button>

                <ClientActivityCalendar
                  key={calendarKey}
                  clientId={current.id}
                  checkins={markers}
                  showHabits
                  habitsReadOnly
                  checkinWeekday={current.checkin_weekday ?? 0}
                />
              </>
            )}

            {subTab === "progress" && (

              <>
                {checkins.length === 0 ? (
                  <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
                    Чек-інів ще немає.
                  </p>
                ) : (
                  checkins.map((ci) => (
                    <div key={ci.id} className="rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink">
                          {new Date(ci.created_at).toLocaleDateString("uk-UA", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                        <span className={`text-[11px] ${ci.reviewed_at ? "text-success" : "text-brand"}`}>
                          {ci.reviewed_at ? "Перевірено" : "Нове"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink">
                        {[
                          ci.weight != null ? `Вага ${ci.weight} кг` : null,
                          ci.waist != null ? `талія ${ci.waist}` : null,
                          ci.hips != null ? `стегна ${ci.hips}` : null,
                          ci.chest != null ? `груди ${ci.chest}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {[ci.id, `${ci.id}:side`, `${ci.id}:back`].some((k) => photoUrls[k]) && (
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {(
                            [
                              [ci.id, "Спереду"],
                              [`${ci.id}:side`, "Збоку"],
                              [`${ci.id}:back`, "Ззаду"],
                            ] as [string, string][]
                          ).map(([key, label]) =>
                            photoUrls[key] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={key}
                                src={photoUrls[key]}
                                alt={`Фото ${label.toLowerCase()}`}
                                className="h-36 w-full rounded-lg object-cover"
                              />
                            ) : (
                              <div key={key} />
                            )
                          )}
                        </div>
                      )}
                      {ci.comment && <p className="mt-2 text-xs text-muted">{ci.comment}</p>}
                      {(answers[ci.id] || []).length > 0 && (
                        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                          {answers[ci.id].map((a, i) => (
                            <p key={i} className="text-xs text-muted">
                              <span className="text-ink">{a.label}:</span> {a.value}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            

            )}

            {subTab === "profile" && <ClientProfileCard client={current} checkins={checkins} readOnly />}

            <button
              type="button"
              onClick={() => removeClient(current.id)}
              className="mt-2 self-center text-xs text-muted underline"
            >
              Відключити клієнта
            </button>
          </>
        )}

        {assignMenu && (
          <Sheet onClose={() => setAssignMenu(false)}>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-sm font-semibold">Що призначити?</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["workout", "🏋 Тренування"],
                    ["program", "📋 Програму"],
                    ["ration", "🍽 Раціон"],
                    ["habits", "💧 Звички"],
                  ] as [AssignKind, string][]
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setAssignMenu(false);
                      setAssign(kind);
                    }}
                    className="rounded-xl border border-line bg-paper py-3.5 text-sm font-semibold text-ink"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Sheet>
        )}

        {assign === "workout" && (
          <Sheet onClose={() => setAssign(null)}>
            <WorkoutBuilder
              clientId={current.id}
              onClose={() => setAssign(null)}
              onSaved={() => setCalendarKey((k) => k + 1)}
            />
          </Sheet>
        )}
        {assign === "program" && (
          <Sheet onClose={() => setAssign(null)}>
            <AssignProgram
              clientIds={[current.id]}
              onClose={() => setAssign(null)}
              onSaved={() => setCalendarKey((k) => k + 1)}
            />
          </Sheet>
        )}
        {assign === "ration" && (
          <Sheet onClose={() => setAssign(null)}>
            <AssignRation
              clientId={current.id}
              onClose={() => setAssign(null)}
              onSaved={() => setCalendarKey((k) => k + 1)}
            />
          </Sheet>
        )}
        {assign === "habits" && (
          <Sheet onClose={() => setAssign(null)}>
            <AssignHabits clientIds={[current.id]} onClose={() => setAssign(null)} onSaved={() => setCalendarKey((k) => k + 1)} />
          </Sheet>
        )}

        {reviewOpen && (
          <CheckinReviewSheet
            clientId={current.id}
            clientName={clientLabel(current)}
            onClose={() => setReviewOpen(false)}
            onDone={() => {
              setReviewOpen(false);
              loadDetail(current.id);
              load();
            }}
          />
        )}
      </div>
    );
  }

  // ---------- Список клієнтів ----------
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук клієнта"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none"
        />
        <button
          type="button"
          disabled={busy}
          onClick={addClient}
          aria-label="Додати клієнта"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent text-2xl font-bold leading-none text-paper shadow-[0_10px_28px_-10px_rgb(var(--c-accent)/0.7)] disabled:opacity-50"
        >
          {busy ? "…" : "+"}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            ["all", `Усі (${connected.length})`],
            ["action", `Потрібна дія (${needAction})`],
            ["risk", `Ризик (${connected.filter((c) => riskOf(c) !== "ok").length})`],
          ] as ["all" | "action" | "risk", string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`flex-none rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              filter === id ? "bg-accent text-paper" : "border border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Клієнти</h2>
        {connected.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setPickedIds(new Set());
            }}
            className="text-xs text-brand"
          >
            {selectMode ? "Готово" : "Вибрати кількох"}
          </button>
        )}
      </div>

      {selectMode && pickedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs">
          <span className="font-medium text-brand">Вибрано: {pickedIds.size}</span>
          <button
            type="button"
            onClick={() => setBulk("program")}
            className="rounded-full bg-accent px-3 py-1 font-semibold text-paper"
          >
            Призначити програму
          </button>
          <button
            type="button"
            onClick={() => setBulk("habits")}
            className="rounded-full border border-brand px-3 py-1 font-semibold text-brand"
          >
            Призначити звички
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          {connected.length === 0
            ? "Клієнтів ще немає. Натисни «+ Клієнт» — посилання-запрошення скопіюється, надішли його клієнту."
            : "Нікого не знайдено."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-3">
              {selectMode && (
                <input
                  type="checkbox"
                  checked={pickedIds.has(c.id)}
                  onChange={() => togglePicked(c.id)}
                  className="h-5 w-5 flex-none accent-accent"
                />
              )}
              <button
                type="button"
                onClick={() => (selectMode ? togglePicked(c.id) : openClient(c.id))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar
                  name={clientLabel(c)}
                  url={avatars[c.id]}
                  size={44}
                  dot={riskOf(c) === "ok" ? "bg-success" : riskOf(c) === "risk" ? "bg-danger" : "bg-warn"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{clientLabel(c)}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.goal ? `${c.goal} · ` : ""}
                    {daysAgoText(lastCheckin[c.id])}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1 text-xs">
                  {(toReview[c.id] || 0) > 0 && (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-paper">Чек-ін</span>
                  )}
                  {(unread?.[c.id]?.count || 0) > 0 && (
                    <span className="rounded-full bg-danger px-2 py-0.5 font-semibold text-white">
                      💬 {unread?.[c.id]?.count}
                    </span>
                  )}
                  {needs(c.id) === 0 && <span className="text-muted">›</span>}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink">Очікують входу ({pending.length})</h2>
          {pending.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface p-3">
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{inviteUrl(c.invite_code)}</span>
              <button
                type="button"
                onClick={() => copy(inviteUrl(c.invite_code))}
                className="flex-none rounded-lg border border-line px-2.5 py-1 text-xs text-brand"
              >
                Копіювати
              </button>
              <button
                type="button"
                onClick={() => removeClient(c.id)}
                aria-label="Видалити запрошення"
                className="flex-none px-1 text-sm text-muted"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {bulk === "program" && (
        <Sheet onClose={() => setBulk(null)}>
          <AssignProgram
            clientIds={Array.from(pickedIds)}
            onClose={() => setBulk(null)}
            onSaved={() => setPickedIds(new Set())}
          />
        </Sheet>
      )}
      {bulk === "habits" && (
        <Sheet onClose={() => setBulk(null)}>
          <AssignHabits
            clientIds={Array.from(pickedIds)}
            onClose={() => setBulk(null)}
            onSaved={() => setPickedIds(new Set())}
          />
        </Sheet>
      )}
    </div>
  );
}
