"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite") || "";

  const [tab, setTab] = useState<"login" | "signup">(invite ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      // Якщо людина прийшла за запрошенням і щойно повернулась від Google —
      // прив'язуємо інвайт тут (для email/пароль це вже робить afterAuth).
      if (invite) {
        await supabase.rpc("claim_invite", { code: invite }).catch(() => {});
      }
      router.replace("/dashboard");
    });
  }, [router, invite]);

  async function afterAuth() {
    if (invite) {
      const { error } = await supabase.rpc("claim_invite", { code: invite });
      if (error) {
        setErr("Це посилання-запрошення вже використано або недійсне. Попроси в тренера нове.");
        setBusy(false);
        return;
      }
    }
    router.replace("/dashboard");
  }

  async function onSignIn() {
    if (!email.trim() || !pass) { setErr("Вкажи email і пароль"); return; }
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) {
      setBusy(false);
      setErr(error.message === "Invalid login credentials" ? "Невірний email або пароль" : error.message);
      return;
    }
    await afterAuth();
  }

  async function onSignUp() {
    if (!email.trim() || pass.length < 8) { setErr("Вкажи email і пароль (мінімум 8 символів)"); return; }
    setErr(""); setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { full_name: name.trim() || email.trim() } },
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    if (!data.session) {
      setBusy(false);
      setErr("Перевір пошту і підтверди email, потім зайди ще раз.");
      return;
    }
    await afterAuth();
  }

  async function onGoogle() {
    setErr("");
    const redirectTo = `${window.location.origin}/login${invite ? `?invite=${invite}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setErr(error.message);
  }

  const isLogin = tab === "login";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
        <h1 className="mb-1 text-xl font-bold">SashaFit</h1>
        {invite && (
          <p className="mb-3 text-sm text-muted">
            Запрошення від тренера — після входу анкета відкриється сама.
          </p>
        )}

        <button
          type="button"
          onClick={onGoogle}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-paper py-2.5 text-sm font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16 4 9 8.5 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4c-2 1.5-4.6 2.5-7.6 2.5-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9 39.5 16 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.4C41.4 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Увійти через Google
        </button>

        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          або
          <div className="h-px flex-1 bg-line" />
        </div>

        <div className="mb-4 flex gap-1 rounded-lg border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`flex-1 rounded-md py-2 text-sm font-semibold ${isLogin ? "bg-accent text-paper" : "text-muted"}`}
          >
            Увійти
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={`flex-1 rounded-md py-2 text-sm font-semibold ${!isLogin ? "bg-accent text-paper" : "text-muted"}`}
          >
            Реєстрація
          </button>
        </div>

        {!isLogin && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я / назва студії"
            className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder="••••••••"
          className="mb-4 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none"
        />

        <button
          type="button"
          disabled={busy}
          onClick={isLogin ? onSignIn : onSignUp}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-paper disabled:opacity-50"
        >
          {busy ? "Зачекай…" : isLogin ? "Увійти" : "Почати"}
        </button>

        {err && <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm text-red-400">{err}</p>}
      </div>
    </main>
  );
}
