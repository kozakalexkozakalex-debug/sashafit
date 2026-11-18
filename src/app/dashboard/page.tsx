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
          <img src="/logo-96.png" alt="" className="h-8 w-8 rounded-md" />
          <span className="hidden sm:inline">SashaFit</span>
        </button>
        <div className="flex items-center gap-2">
          {role !== "coach" && (
            <button type="button" onClick={signOut} className="text-sm text-muted hover:text-brand">
              Вийти
            </button>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {role === "coach" ? (
          <CoachDashboard
            goHomeSignal={goHomeSignal}
            onSignOut={signOut}
          />
        ) : (
          <ClientDashboard />
        )}
      </div>
    </main>
  );
}
