import { admin } from "./db";

/**
 * Tope diario de mensajes AUTOMÁTICOS (recuperación y seguimientos) por número. Las respuestas a pacientes que
 * escriben NO cuentan para este tope. Se controla por clínica desde el panel admin:
 *   settings.daily_cap_enabled  false → sin tope
 *   settings.plan_tier          starter | pro | scale  (tope según plan)
 *   settings.daily_send_cap     número fijo que pisa al plan
 *   settings.warmup_enabled     false → sin calentamiento (por defecto activo en números nuevos)
 */
export const TIER_CAPS: Record<string, number> = { starter: 80, pro: 150, scale: 300 };
export const DEFAULT_TIER = "pro";
const WARMUP_STEPS: [number, number][] = [
  [3, 30],
  [7, 60],
  [14, 100],
];

export function dailyCapFor(firstOutboundAt: Date | null, now = new Date(), settings: Record<string, unknown> = {}): number {
  if (settings.daily_cap_enabled === false) return Number.MAX_SAFE_INTEGER;
  const tier = typeof settings.plan_tier === "string" && TIER_CAPS[settings.plan_tier] ? settings.plan_tier : DEFAULT_TIER;
  const custom = typeof settings.daily_send_cap === "number" && settings.daily_send_cap > 0 ? Math.floor(settings.daily_send_cap) : null;
  const planCap = custom ?? TIER_CAPS[tier];
  if (settings.warmup_enabled === false) return planCap;
  if (!firstOutboundAt) return Math.min(planCap, WARMUP_STEPS[0][1]);
  const ageDays = (now.getTime() - firstOutboundAt.getTime()) / 86_400_000;
  for (const [days, cap] of WARMUP_STEPS) if (ageDays < days) return Math.min(planCap, cap);
  return planCap;
}

/** Cuántos mensajes automáticos más puede enviar la clínica hoy (últimas 24 h). */
export async function remainingToday(clinicId: string, settings: Record<string, unknown> = {}): Promise<number> {
  if (settings.daily_cap_enabled === false) return Number.MAX_SAFE_INTEGER;
  const db = admin();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ count }, { data: first }] = await Promise.all([
    db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("direction", "outbound")
      .gte("sent_at", since),
    db
      .from("messages")
      .select("sent_at")
      .eq("clinic_id", clinicId)
      .eq("direction", "outbound")
      .order("sent_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const cap = dailyCapFor(first?.sent_at ? new Date(first.sent_at) : null, new Date(), settings);
  return Math.max(0, cap - (count ?? 0));
}

/** Mensajes de IA del mes (tope por plan para controlar el costo de OpenAI). */
export async function aiUsedThisMonth(clinicId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("response_source", "ai")
    .gte("sent_at", start.toISOString());
  return count ?? 0;
}

export const DEFAULT_AI_MONTHLY_CAP = 1500;
