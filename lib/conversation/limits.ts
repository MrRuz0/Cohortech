import { admin } from "./db";

/** Tope diario de mensajes salientes por número, con calentamiento progresivo según la antigüedad del número. */
const WARMUP_STEPS: [number, number][] = [
  [3, 30],
  [7, 60],
  [14, 100],
];
const MATURE_DAILY_CAP = 150;

export function dailyCapFor(firstOutboundAt: Date | null, now = new Date(), override?: unknown): number {
  if (typeof override === "number" && override > 0) return Math.floor(override);
  if (!firstOutboundAt) return WARMUP_STEPS[0][1];
  const ageDays = (now.getTime() - firstOutboundAt.getTime()) / 86_400_000;
  for (const [days, cap] of WARMUP_STEPS) if (ageDays < days) return cap;
  return MATURE_DAILY_CAP;
}

/** Cuántos mensajes automáticos más puede enviar la clínica hoy (últimas 24 h). */
export async function remainingToday(clinicId: string, settings: Record<string, unknown> = {}): Promise<number> {
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
  const cap = dailyCapFor(first?.sent_at ? new Date(first.sent_at) : null, new Date(), settings.daily_send_cap);
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
