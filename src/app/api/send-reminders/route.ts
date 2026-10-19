import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Раз на день (Vercel Cron) перевіряє: у кого тренування сьогодні ще не
// відмічено виконаним, і у кого сьогодні неділя й чек-іну ще немає — і шле
// їм push-нагадування. Захищено CRON_SECRET, щоб маршрут не смикали ззовні.

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
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@sashafit.app",
    vapidPublic,
    vapidPrivate
  );

  const supabase = getSupabaseAdmin();
  const today = new Date();
  const todayKey = toKey(today);
  const isSunday = today.getDay() === 0;

  // Кому тренування сьогодні ще не відмічено виконаним.
  const { data: workouts } = await supabase
    .from("assigned_workouts")
    .select("client_id")
    .eq("date", todayKey)
    .is("completed_at", null);
  const workoutClientIds = new Set((workouts || []).map((w) => w.client_id as string));

  // У неділю — кому ще нема чек-іну сьогодні.
  const checkinClientIds = new Set<string>();
  if (isSunday) {
    const { data: allClients } = await supabase.from("clients").select("id").not("profile_id", "is", null);
    const { data: todaysCheckins } = await supabase
      .from("checkins")
      .select("client_id")
      .gte("created_at", `${todayKey}T00:00:00`)
      .lte("created_at", `${todayKey}T23:59:59`);
    const doneToday = new Set((todaysCheckins || []).map((c) => c.client_id as string));
    for (const c of allClients || []) {
      if (!doneToday.has(c.id as string)) checkinClientIds.add(c.id as string);
    }
  }

  const messagesByClient = new Map<string, { title: string; body: string }>();
  for (const id of workoutClientIds) {
    messagesByClient.set(id, { title: "Тренування сьогодні 🏋", body: "Не забудь сьогоднішнє тренування." });
  }
  for (const id of checkinClientIds) {
    if (!messagesByClient.has(id)) {
      messagesByClient.set(id, { title: "Час для чек-іну ⚖", body: "Сьогодні неділя — зроби щотижневий чек-ін." });
    }
  }

  if (messagesByClient.size === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, client_id, endpoint, p256dh, auth")
    .in("client_id", Array.from(messagesByClient.keys()));

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

  return NextResponse.json({ sent, candidates: messagesByClient.size, removedStale: staleIds.length });
}
