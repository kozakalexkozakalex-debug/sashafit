"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CoachDashboard from "@/components/CoachDashboard";
import ClientDashboard from "@/components/ClientDashboard";

type Role = "coach" | "client" | null;

export default function DashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [goHomeSignal, setGoHomeSignal] = useState(0);
  const [meetingSignal, setMeetingSignal] = useState(0);
  const [newClientSignal, setNewClientSignal] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      setRole((profile?.role as Role) ?? "client");
      setLoading(false);
    })();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <main className="p-8 text-center text-sm text-muted">Завантаження…</main>;
  }

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setGoHomeSignal((v) => v + 1)}
          className="flex items-center gap-2 text-lg font-bold"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-full" />
          <span className="hidden sm:inline">SashaFit</span>
        </button>
        <div className="flex items-center gap-2">
          {role === "coach" && (
            <>
              <button
                type="button"
                onClick={() => setMeetingSignal((v) => v + 1)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper shadow-sm shadow-accent/30 transition hover:brightness-110 sm:text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1.5" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M1.5 6.5H14.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M11 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M8 8.5V12.5M6 10.5H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">Нова зустріч</span>
                <span className="sm:hidden">Зустріч</span>
              </button>
              <button
                type="button"
                onClick={() => setNewClientSignal((v) => v + 1)}
                className="flex items-center gap-1.5 rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 sm:text-sm"
              >
                <span className="text-sm leading-none">+</span>
                <span className="hidden sm:inline">Новий клієнт</span>
                <span className="sm:hidden">Клієнт</span>
              </button>
            </>
          )}
          <button type="button" onClick={signOut} className="text-sm text-muted hover:text-accent">
            Вийти
          </button>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {role === "coach" ? (
          <CoachDashboard
            goHomeSignal={goHomeSignal}
            meetingSignal={meetingSignal}
            newClientSignal={newClientSignal}
          />
        ) : (
          <ClientDashboard />
        )}
      </div>
    </main>
  );
}
