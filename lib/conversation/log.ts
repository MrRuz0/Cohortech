import { admin } from "./db";

export type EventLevel = "error" | "warn" | "info";

export type SystemEvent = {
  level: EventLevel;
  source: string;
  message: string;
  detail?: Record<string, unknown>;
  clinicId?: string | null;
  patientId?: string | null;
};

/** Convierte cualquier cosa lanzada en un objeto serializable y corto. */
export function errorDetail(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, error: err.message.slice(0, 600), stack: (err.stack ?? "").split("\n").slice(0, 6).join("\n") };
  }
  if (typeof err === "string") return { error: err.slice(0, 600) };
  try {
    return { error: JSON.stringify(err).slice(0, 600) };
  } catch {
    return { error: String(err).slice(0, 600) };
  }
}

/**
 * Registra un evento para la auditoría diaria. NUNCA lanza ni bloquea: si la tabla
 * aún no existe o la base falla, solo queda en la consola de Vercel.
 */
export async function logEvent(ev: SystemEvent): Promise<void> {
  const line = `[${ev.source}] ${ev.message}`;
  if (ev.level === "error") console.error(line, ev.detail ?? "");
  else if (ev.level === "warn") console.warn(line, ev.detail ?? "");

  try {
    const { error } = await admin()
      .from("system_events")
      .insert({
        level: ev.level,
        source: ev.source,
        message: ev.message.slice(0, 300),
        detail: ev.detail ?? {},
        clinic_id: ev.clinicId ?? null,
        patient_id: ev.patientId ?? null,
      });
    if (error && !/system_events/.test(error.message)) console.error("[logEvent]", error.message);
  } catch {
    /* el registro nunca debe romper el flujo */
  }
}

export const logError = (source: string, message: string, err: unknown, ctx: Partial<SystemEvent> = {}) =>
  logEvent({ level: "error", source, message, detail: { ...errorDetail(err), ...(ctx.detail ?? {}) }, clinicId: ctx.clinicId, patientId: ctx.patientId });

export const logWarn = (source: string, message: string, detail: Record<string, unknown> = {}, ctx: Partial<SystemEvent> = {}) =>
  logEvent({ level: "warn", source, message, detail, clinicId: ctx.clinicId, patientId: ctx.patientId });
