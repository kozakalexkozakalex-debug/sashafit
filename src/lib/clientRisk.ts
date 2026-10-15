// Риск-статус клієнта — рахуємо на фронтенді з тих самих даних,
// якими вже користується блок попереджень на "Головна".
export type RiskLevel = "ok" | "watch" | "risk" | "pending";

export function clientRisk(
  client: { profile_id: string | null; subscription_until: string | null; created_at: string },
  lastCheckinAt: string | undefined,
  now: Date = new Date()
): RiskLevel {
  if (!client.profile_id) {
    const daysSinceInvite = (now.getTime() - new Date(client.created_at).getTime()) / 86400000;
    return daysSinceInvite > 3 ? "watch" : "pending";
  }

  const todayKey = now.toISOString().slice(0, 10);
  if (client.subscription_until && client.subscription_until < todayKey) {
    return "risk";
  }

  if (!lastCheckinAt) return "watch";
  const daysSinceCheckin = (now.getTime() - new Date(lastCheckinAt).getTime()) / 86400000;
  if (daysSinceCheckin > 7) return "watch";

  return "ok";
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  ok: "🟢 Все добре",
  watch: "🟡 Варто перевірити",
  risk: "🔴 В ризику",
  pending: "⚪ Очікує",
};
