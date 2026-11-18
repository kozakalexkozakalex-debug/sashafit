import { supabase } from "@/lib/supabaseClient";

// Непрочитані повідомлення тренера по клієнтах: скільки і коли було останнє.
// Рахуємо від coach_last_read_at конкретного клієнта (а не одну позначку на всіх),
// щоб черга на головній показувала саме тих, кому треба відповісти.
export type UnreadInfo = Record<string, { count: number; lastAt: string }>;

export async function fetchCoachUnread(): Promise<UnreadInfo> {
  // Дивимось лише 60 днів — для черги цього достатньо.
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: cl }, { data: ms }] = await Promise.all([
    supabase.from("clients").select("id, coach_last_read_at").not("profile_id", "is", null),
    supabase.from("messages").select("client_id, created_at").eq("sender", "client").gte("created_at", since),
  ]);
  const lastRead: Record<string, string | null> = {};
  for (const c of (cl as { id: string; coach_last_read_at: string | null }[]) || []) {
    lastRead[c.id] = c.coach_last_read_at;
  }
  const out: UnreadInfo = {};
  for (const m of (ms as { client_id: string; created_at: string }[]) || []) {
    if (!(m.client_id in lastRead)) continue;
    const lr = lastRead[m.client_id];
    if (lr != null && m.created_at <= lr) continue;
    const cur = out[m.client_id];
    if (!cur) out[m.client_id] = { count: 1, lastAt: m.created_at };
    else {
      cur.count += 1;
      if (m.created_at > cur.lastAt) cur.lastAt = m.created_at;
    }
  }
  return out;
}

export async function markCoachRead(clientId: string) {
  await supabase.from("clients").update({ coach_last_read_at: new Date().toISOString() }).eq("id", clientId);
}
