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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
    });
  }, [router]);

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
