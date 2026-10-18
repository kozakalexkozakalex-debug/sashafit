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
    <main className="min-h-screen p-6">
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setGoHomeSignal((v) => v + 1)}
          className="text-lg font-bold"
        >
          SashaFit
        </button>
        <button type="button" onClick={signOut} className="text-sm text-muted hover:text-accent">
          Вийти
        </button>
      </div>
      {role === "coach" ? <CoachDashboard goHomeSignal={goHomeSignal} /> : <ClientDashboard />}
    </main>
  );
}
