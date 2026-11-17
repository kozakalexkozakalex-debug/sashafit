import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Вхід через Telegram Mini App.
// 1) Браузер надсилає initData (рядок, який підписав Telegram).
// 2) Тут, на сервері, перевіряємо підпис токеном бота — підробити його
//    неможливо без токена. Токен бота лишається ТІЛЬКИ в змінній
//    TELEGRAM_BOT_TOKEN на сервері.
// 3) Знаходимо (або створюємо) користувача Supabase за Telegram ID і
//    віддаємо браузеру сесію.

const MAX_AGE_SECONDS = 24 * 60 * 60;

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };

function verifyInitData(initData: string, botToken: string): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get("user") || "null") as TgUser | null;
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!botToken || !supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Telegram-вхід ще не налаштовано на сервері" }, { status: 500 });
  }

  let initData = "";
  try {
    const body = await req.json();
    initData = typeof body.initData === "string" ? body.initData : "";
  } catch {
    /* порожнє тіло — впаде нижче на перевірці */
  }

  const tgUser = initData ? verifyInitData(initData, botToken) : null;
  if (!tgUser) {
    return NextResponse.json({ error: "Не вдалося підтвердити Telegram-акаунт" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Telegram";

  // 1. Профіль уже прив'язаний до цього Telegram ID?
  let userId: string | null = null;
  {
    const { data } = await admin.from("profiles").select("id").eq("telegram_id", tgUser.id).maybeSingle();
    userId = (data?.id as string) || null;
  }

  // 2. Це тренерка (її Telegram ID задано в TELEGRAM_COACH_ID)? Тоді
  //    прив'язуємо Telegram до її наявного акаунта тренера.
  if (!userId && process.env.TELEGRAM_COACH_ID && String(tgUser.id) === process.env.TELEGRAM_COACH_ID.trim()) {
    const { data: coach } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "coach")
      .is("telegram_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (coach?.id) {
      userId = coach.id as string;
      await admin.from("profiles").update({ telegram_id: tgUser.id }).eq("id", userId);
    }
  }

  // 3. Новий користувач — створюємо акаунт (профіль клієнта створить тригер).
  if (!userId) {
    const email = `tg_${tgUser.id}@telegram.sashafit.invalid`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) {
      return NextResponse.json({ error: "Не вдалося створити акаунт" }, { status: 500 });
    }
    userId = created.user.id;
    await admin.from("profiles").update({ telegram_id: tgUser.id }).eq("id", userId);
  }

  // 4. Видаємо сесію: одноразове magic-посилання, яке одразу ж обмінюємо
  //    на токени. Пароль не потрібен.
  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (userErr || !email) {
    return NextResponse.json({ error: "Не вдалося увійти" }, { status: 500 });
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: "Не вдалося увійти" }, { status: 500 });
  }

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: session, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpErr || !session.session) {
    return NextResponse.json({ error: "Не вдалося увійти" }, { status: 500 });
  }

  return NextResponse.json({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
}
