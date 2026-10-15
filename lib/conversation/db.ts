import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Channel,
  ClinicContext,
  HistoryMessage,
  PatientProfile,
  PatientState,
  Promotion,
  Service,
} from "./types";

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    _admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return _admin;
}

export const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Número listo para Evolution API: solo dígitos y con 51 si viene un móvil peruano de 9 dígitos. */
export function toWaNumber(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d;
}

export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = onlyDigits(a);
  const y = onlyDigits(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

// ── Verificación de esquema ─────────────────────────────────────────
// Si una migración no está aplicada, el sistema NO se rompe: desactiva solo
// esa función y lo deja registrado, en vez de fallar en silencio.
export type SchemaFlags = {
  patientsExtended: boolean;
  messagesExtended: boolean;
  promotions: boolean;
};

let schemaCache: { at: number; flags: SchemaFlags } | null = null;

export async function getSchemaFlags(force = false): Promise<SchemaFlags> {
  if (!force && schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.flags;
  const db = admin();
  const [p, m, pr] = await Promise.all([
    db
      .from("patients")
      .select(
        "is_blocked, blocked_reason, blocked_at, bot_paused_until, last_template_key, ai_fallback_streak, negotiation_stage, last_discount_offered, negotiation_updated_at"
      )
      .limit(1),
    db.from("messages").select("channel, response_source").limit(1),
    db.from("promotions").select("id").limit(1),
  ]);
  const flags: SchemaFlags = {
    patientsExtended: !p.error,
    messagesExtended: !m.error,
    promotions: !pr.error,
  };
  if (!flags.patientsExtended || !flags.messagesExtended || !flags.promotions) {
    console.error(
      "[schema] Migración 0010 incompleta — funciones desactivadas:",
      JSON.stringify({ patients: p.error?.message, messages: m.error?.message, promotions: pr.error?.message })
    );
  }
  schemaCache = { at: Date.now(), flags };
  return flags;
}

// ── Clínica ─────────────────────────────────────────────────────────
const clinicCache = new Map<string, { at: number; value: ClinicContext }>();
const CLINIC_TTL_MS = 45_000;

function mapServices(raw: unknown): Service[] {
  if (!Array.isArray(raw)) return [];
  const out: Service[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    const dur = Number(r.duration_min);
    out.push({
      name,
      price: r.price === undefined || r.price === null ? "" : String(r.price).trim(),
      ...(Number.isFinite(dur) && dur > 0 && dur <= 1440 ? { durationMin: Math.round(dur) } : {}),
    });
  }
  return out;
}

export function mapClinic(row: Record<string, any>): ClinicContext {
  const s = (row.settings ?? {}) as Record<string, any>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    id: row.id,
    name: str(row.name) ?? "la clínica",
    services: mapServices(s.services),
    hours: str(s.hours),
    address: str(s.address),
    bookingPhone: str(s.booking_phone),
    bookingLink: str(s.booking_link),
    paymentMethods: str(s.payment_methods),
    maxDiscountPercent: typeof row.max_discount_percent === "number" ? row.max_discount_percent : 10,
    receptionistPhone: str(row.receptionist_phone) ?? null,
    ownPhone: str(row.wa_phone_number) ?? null,
    waSessionId: str(row.wa_session_id) ?? null,
    timezone: str(s.timezone) ?? "America/Lima",
    botPaused: s.bot_paused === true,
    // Por defecto ambos activos: el comportamiento actual no cambia hasta que se configure.
    modules: {
      reception: (s.modules as Record<string, unknown> | undefined)?.reception !== false,
      recovery: (s.modules as Record<string, unknown> | undefined)?.recovery !== false,
      multichannel: (s.modules as Record<string, unknown> | undefined)?.multichannel !== false,
    },
    plan: (() => {
      const status = row.plan_status === "suspended" || row.plan_status === "trial" ? row.plan_status : "active";
      const expiresAt: string | null = row.plan_expires_at ?? null;
      const expired = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
      return { status, expiresAt, active: status !== "suspended" && !expired } as const;
    })(),
    settings: s,
  };
}

export async function getClinic(clinicId: string, fresh = false): Promise<ClinicContext | null> {
  const hit = clinicCache.get(clinicId);
  if (!fresh && hit && Date.now() - hit.at < CLINIC_TTL_MS) return hit.value;
  const { data, error } = await admin().from("clinics").select("*").eq("id", clinicId).maybeSingle();
  if (error) throw new Error(`getClinic: ${error.message}`);
  if (!data) return null;
  const value = mapClinic(data);
  clinicCache.set(clinicId, { at: Date.now(), value });
  return value;
}

export function invalidateClinic(clinicId: string) {
  clinicCache.delete(clinicId);
}

export async function getPromotions(clinicId: string): Promise<Promotion[]> {
  const flags = await getSchemaFlags();
  if (!flags.promotions) return [];
  const { data, error } = await admin()
    .from("promotions")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("is_active", true);
  if (error) {
    console.error("[promotions]", error.message);
    return [];
  }
  return (data ?? []) as Promotion[];
}

// ── Paciente ────────────────────────────────────────────────────────
export function mapPatient(row: Record<string, any>, channel: Channel): PatientState {
  const profile = (row.extracted_profile && typeof row.extracted_profile === "object"
    ? row.extracted_profile
    : {}) as PatientProfile;
  return {
    id: row.id,
    fullName: row.full_name ?? null,
    phone: row.phone_e164,
    waContactId: row.wa_contact_id ?? null,
    channel,
    isBlocked: row.is_blocked === true,
    blockedReason: row.blocked_reason ?? null,
    botPausedUntil: row.bot_paused_until ?? null,
    lastTemplateKey: row.last_template_key ?? null,
    aiFallbackStreak: typeof row.ai_fallback_streak === "number" ? row.ai_fallback_streak : 0,
    negotiationStage: typeof row.negotiation_stage === "number" ? row.negotiation_stage : 0,
    lastDiscountOffered: typeof row.last_discount_offered === "number" ? row.last_discount_offered : null,
    profile,
  };
}

/**
 * Crea o actualiza al paciente SIN pisar datos buenos:
 *  - el nombre solo se escribe si todavía no hay uno
 *  - last_contact_at solo se mueve con mensajes ENTRANTES (esta función solo
 *    se llama para entrantes), así la detección de inactividad es confiable
 */
export async function ensurePatient(params: {
  clinicId: string;
  phone: string;
  channel: Channel;
  name?: string | null;
  waContactId?: string | null;
  /** false para mensajes salientes: no deben mover last_contact_at. */
  touchContact?: boolean;
}): Promise<Record<string, any>> {
  const db = admin();
  const now = new Date().toISOString();
  const touch = params.touchContact !== false;
  const cleanName = params.name?.trim() ? params.name.trim().slice(0, 80) : null;

  const find = async () =>
    db
      .from("patients")
      .select("*")
      .eq("clinic_id", params.clinicId)
      .eq("phone_e164", params.phone)
      .maybeSingle();

  const { data: existing, error: selErr } = await find();
  if (selErr) throw new Error(`ensurePatient.select: ${selErr.message}`);

  if (existing) {
    const upd: Record<string, unknown> = {};
    if (touch) upd.last_contact_at = now;
    if (!existing.full_name && cleanName && touch) upd.full_name = cleanName;
    if (params.waContactId && existing.wa_contact_id !== params.waContactId) upd.wa_contact_id = params.waContactId;
    if (Object.keys(upd).length) {
      const { error } = await db.from("patients").update(upd).eq("id", existing.id);
      if (error) console.error("[ensurePatient.update]", error.message);
    }
    return { ...existing, ...upd };
  }

  const { data: created, error: insErr } = await db
    .from("patients")
    .insert({
      clinic_id: params.clinicId,
      phone_e164: params.phone,
      full_name: touch ? cleanName : null,
      wa_contact_id: params.waContactId ?? null,
      channel_source: params.channel,
      status: "lead",
      last_contact_at: touch ? now : null,
    })
    .select("*")
    .single();

  if (insErr) {
    // Carrera: dos mensajes simultáneos del mismo número creando el paciente.
    if (insErr.code === "23505") {
      const { data: again } = await find();
      if (again) return again;
    }
    throw new Error(`ensurePatient.insert: ${insErr.message}`);
  }
  return created;
}

// ── Mensajes ────────────────────────────────────────────────────────
export async function insertInbound(params: {
  clinicId: string;
  patientId: string;
  channel: Channel;
  text: string;
  messageId?: string | null;
  sentAt?: string | null;
  extended: boolean;
}): Promise<{ id: string | null; duplicate: boolean }> {
  const row: Record<string, unknown> = {
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    direction: "inbound",
    content_text: params.text,
    wa_message_id: params.messageId ?? null,
    sent_at: params.sentAt ?? new Date().toISOString(),
    processing_status: "pending",
  };
  if (params.extended) row.channel = params.channel;
  const { data, error } = await admin().from("messages").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") return { id: null, duplicate: true };
    throw new Error(`insertInbound: ${error.message}`);
  }
  return { id: data.id as string, duplicate: false };
}

export async function fetchRecentMessages(patientId: string, limit = 14): Promise<
  (HistoryMessage & { id: string })[]
> {
  const { data, error } = await admin()
    .from("messages")
    .select("id, direction, content_text, sent_at, response_source")
    .eq("patient_id", patientId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[history]", error.message);
    return [];
  }
  return (data ?? [])
    .map((m: any) => ({
      id: m.id as string,
      direction: (m.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
      text: String(m.content_text ?? ""),
      at: String(m.sent_at ?? ""),
      source: m.response_source ?? null,
    }))
    .reverse();
}

export async function countRecentBotReplies(patientId: string, minutes: number): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await admin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("direction", "outbound")
    .gte("sent_at", since);
  return count ?? 0;
}
