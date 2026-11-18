import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Раз на день (Vercel Cron) перевіряє: у кого тренування сьогодні ще не
// відмічено виконаним, і у кого сьогодні їхній особистий день чек-іна
// (checkin_weekday, задає тренер) й чек-іну ще немає — і шле їм
// нагадування: у Telegram від бота (основний канал) і web-push (запасний,
// якщо ключі VAPID задані). Захищено CRON_SECRET, щоб маршрут не смикали ззовні.

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const pushEnabled = !!(vapidPublic && vapidPrivate);
  if (pushEnabled) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@sashafit.app",
      vapidPublic as string,
      vapidPrivate as string
    );
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL; // напр. https://sashafit.vercel.app — для кнопки «Відкрити»
  if (!pushEnabled && !botToken) {
    return NextResponse.json({ error: "Ні Telegram-бот, ні VAPID не налаштовані" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date();
  const todayKey = toKey(today);
  const todayWeekday = today.getDay();

  // Кому тренування сьогодні ще не відмічено виконаним.
  const { data: workouts } = await supabase
    .from("assigned_workouts")
    .select("client_id")
    .eq("date", todayKey)
    .is("completed_at", null);
  const workoutClientIds = new Set((workouts || []).map((w) => w.client_id as string));

  // У свій день тижня (checkin_weekday, за замовчуванням неділя) — кому ще
  // нема чек-іну сьогодні.
  const checkinClientIds = new Set<string>();
  {
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, checkin_weekday")
      .not("profile_id", "is", null);
    const { data: todaysCheckins } = await supabase
      .from("checkins")
      .select("client_id")
      .gte("created_at", `${todayKey}T00:00:00`)
      .lte("created_at", `${todayKey}T23:59:59`);
    const doneToday = new Set((todaysCheckins || []).map((c) => c.client_id as string));
    for (const c of allClients || []) {
      const weekday = (c.checkin_weekday as number | null) ?? 0;
      if (weekday === todayWeekday && !doneToday.has(c.id as string)) checkinClientIds.add(c.id as string);
    }
  }

  const messagesByClient = new Map<string, { title: string; body: string }>();
  for (const id of workoutClientIds) {
    messagesByClient.set(id, { title: "Тренування сьогодні 🏋", body: "Не забудь сьогоднішнє тренування." });
  }
  for (const id of checkinClientIds) {
    if (!messagesByClient.has(id)) {
      messagesByClient.set(id, { title: "Час для чек-іну ⚖", body: "Сьогодні день твого щотижневого чек-іну." });
    }
  }

  if (messagesByClient.size === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const clientIds = Array.from(messagesByClient.keys());

  // Telegram: шлемо тим, хто увійшов через Telegram (profiles.telegram_id).
  let tgSent = 0;
  if (botToken) {
    const { data: clientRows } = await supabase.from("clients").select("id, profile_id").in("id", clientIds);
    const profileIds = (clientRows || []).map((c) => c.profile_id as string | null).filter(Boolean) as string[];
    const { data: profileRows } = profileIds.length
      ? await supabase.from("profiles").select("id, telegram_id").in("id", profileIds)
      : { data: [] as { id: string; telegram_id: number | null }[] };
    const tgByProfile = new Map((profileRows || []).map((p) => [p.id as string, p.telegram_id as number | null]));
    for (const c of clientRows || []) {
      const chatId = c.profile_id ? tgByProfile.get(c.profile_id as string) : null;
      const msg = messagesByClient.get(c.id as string);
      if (!chatId || !msg) continue;
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `${msg.title}\n${msg.body}`,
            ...(appUrl
              ? { reply_markup: { inline_keyboard: [[{ text: "Відкрити SashaFit", web_app: { url: appUrl } }]] } }
              : {}),
          }),
        });
        if (res.ok) tgSent++;
      } catch {
        // не вдалось одному — решті все одно шлемо
      }
    }
  }

  const { data: subs } = pushEnabled
    ? await supabase
        .from("push_subscriptions")
        .select("id, client_id, endpoint, p256dh, auth")
        .in("client_id", clientIds)
    : { data: [] as { id: string; client_id: string; endpoint: string; p256dh: string; auth: string }[] };

  let sent = 0;
  const staleIds: string[] = [];
  for (const sub of subs || []) {
    const msg = messagesByClient.get(sub.client_id as string);
    if (!msg) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
        },
        JSON.stringify({ title: msg.title, body: msg.body, url: "/dashboard" })
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id as string);
    }
  }

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({ telegramSent: tgSent, sent, candidates: messagesByClient.size, removedStale: staleIds.length });
}
