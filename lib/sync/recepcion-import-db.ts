import { getSchemaFlags } from "@/lib/conversation/db";
import { logWarn } from "@/lib/conversation/log";
import {
  analyzeConversation,
  appointmentSummary,
  cleanPhone,
  COHORT_DEFS,
  pool,
  ruleCategory,
  sanitizePatients,
  type Analysis,
  type Category,
  type ImportedProfile,
  type ImportPatient,
} from "./recepcion-import";

type Db = ReturnType<typeof import("@/lib/conversation/db").admin>;
type ClinicRef = { id: string; name: string; settings: any };

const CHUNK = 200;
const PAUSE_REACTIVATION_UNTIL = new Date(Date.now() + 3650 * 86_400_000).toISOString();
const chunks = <T,>(list: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Teléfonos bloqueados en Recepción IA: Cohortech tampoco les escribe. */
async function markBlocked(db: Db, clinicId: string, rawPhones: unknown): Promise<number> {
  const flags = await getSchemaFlags();
  if (!flags.patientsExtended || !Array.isArray(rawPhones)) return 0;
  const phones = [...new Set(rawPhones.slice(0, 3000).map(cleanPhone).filter((p): p is string => !!p))];
  let marked = 0;
  for (const part of chunks(phones)) {
    const { data: existing } = await db.from("patients").select("phone_e164").eq("clinic_id", clinicId).in("phone_e164", part);
    const have = new Set((existing ?? []).map((r: any) => r.phone_e164));
    const stamp = { is_blocked: true, blocked_reason: "manual", blocked_at: new Date().toISOString() };
    if (have.size) await db.from("patients").update(stamp).eq("clinic_id", clinicId).in("phone_e164", [...have]);
    const fresh = part.filter((p) => !have.has(p));
    if (fresh.length) {
      await db.from("patients").insert(fresh.map((phone) => ({ clinic_id: clinicId, phone_e164: phone, channel_source: "whatsapp", reactivation_paused_until: PAUSE_REACTIVATION_UNTIL, status: "lead", ...stamp })));
    }
    marked += part.length;
  }
  return marked;
}

/** Guarda un lote de pacientes con sus mensajes y su «porqué». No envía nada. */
export async function importPatients(db: Db, clinic: ClinicRef, rawPatients: unknown, rawBlocked: unknown) {
  const flags = await getSchemaFlags();
  const patients = sanitizePatients(rawPatients);
  const blocked = rawBlocked ? await markBlocked(db, clinic.id, rawBlocked) : 0;
  if (!patients.length) return { ok: true, imported: 0, analyzed: 0, blocked };

  const { data: existingRows } = await db
    .from("patients")
    .select("id, phone_e164, full_name, last_contact_at, extracted_profile")
    .eq("clinic_id", clinic.id)
    .in("phone_e164", patients.map((p) => p.phone));
  const existing = new Map<string, any>((existingRows ?? []).map((r: any) => [r.phone_e164, r]));

  // 1) Qué le pasó a cada una: por sus citas, o leyendo la conversación (solo si hace falta y no se analizó ya).
  let analyzedByAi = 0;
  const results = await pool(patients, 5, async (p): Promise<Analysis> => {
    const byRule = ruleCategory(p);
    if (byRule) return byRule;
    const prev = existing.get(p.phone)?.extracted_profile?.recepcion as ImportedProfile | undefined;
    if (prev?.analyzed_at && prev.msg_count === p.messages.length && prev.category) {
      return { category: prev.category, reason: prev.reason, treatment: prev.treatment, pain_signals: prev.pain_signals };
    }
    try {
      analyzedByAi++;
      return await analyzeConversation(clinic.name, p);
    } catch (err) {
      await logWarn("recepcion-import", "No se pudo analizar una conversación", { error: String((err as Error)?.message ?? err).slice(0, 200) }, { clinicId: clinic.id });
      return { category: "otro", reason: "No se pudo analizar la conversación.", treatment: null, pain_signals: [] };
    }
  });

  // 2) Pacientes (se crean los nuevos y se completan los que ya existían, sin pisar lo que Cohortech ya sabía).
  const ids = new Map<string, string>();
  const now = new Date().toISOString();
  const profileOf = (p: ImportPatient, a: Analysis, base: any): any => ({
    ...(base && typeof base === "object" ? base : {}),
    recepcion: { ...a, analyzed_at: now, msg_count: p.messages.length, appointments: appointmentSummary(p) } satisfies ImportedProfile,
  });
  const lastInbound = (p: ImportPatient) =>
    p.messages.filter((m) => m.dir === "in").map((m) => m.at).sort().pop() ?? p.last_contact_at;

  const toInsert: any[] = [];
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const a = results[i];
    const row = existing.get(p.phone);
    const status = a.category === "atendido" ? "active" : "lead";
    if (row) {
      ids.set(p.phone, row.id);
      const upd: Record<string, unknown> = { extracted_profile: profileOf(p, a, row.extracted_profile) };
      if (!row.full_name && p.name) upd.full_name = p.name;
      const last = lastInbound(p);
      if (last && (!row.last_contact_at || Date.parse(last) > Date.parse(row.last_contact_at))) upd.last_contact_at = last;
      await db.from("patients").update(upd).eq("id", row.id);
    } else {
      toInsert.push({
        clinic_id: clinic.id,
        phone_e164: p.phone,
        full_name: p.name,
        // WhatsApp de verdad (con otro valor, los seguimientos los tratarían como otro canal y nunca saldrían).
        channel_source: "whatsapp",
        // La reactivación automática por inactividad queda apagada para ellos: solo reciben mensajes por la cohorte que apruebes.
        reactivation_paused_until: PAUSE_REACTIVATION_UNTIL,
        status,
        last_contact_at: lastInbound(p),
        extracted_profile: profileOf(p, a, {}),
      });
    }
  }
  if (toInsert.length) {
    const { data: created } = await db.from("patients").insert(toInsert).select("id, phone_e164");
    for (const r of created ?? []) ids.set((r as any).phone_e164, (r as any).id);
  }

  // 3) Mensajes (idempotente: el id de Recepción IA va dentro del identificador).
  const msgRows: Record<string, unknown>[] = [];
  for (const p of patients) {
    const patientId = ids.get(p.phone);
    if (!patientId) continue;
    for (const m of p.messages) {
      msgRows.push({
        clinic_id: clinic.id,
        patient_id: patientId,
        wa_message_id: `rec:${m.id}`,
        direction: m.dir === "in" ? "inbound" : "outbound",
        content_text: m.text,
        sent_at: m.at,
        processing_status: "processed",
        ...(flags.messagesExtended ? { channel: "whatsapp", response_source: m.dir === "in" ? null : "human" } : {}),
      });
    }
  }
  for (const part of chunks(msgRows, 500)) {
    await db.from("messages").upsert(part, { onConflict: "wa_message_id", ignoreDuplicates: true });
  }

  return { ok: true, imported: patients.length, analyzed: analyzedByAi, blocked };
}

type PendingCohort = { cohort_id: string; name: string; count: number };

/** Con todos los pacientes ya importados: crea las cohortes y los asigna. Los seguimientos quedan en pausa hasta que se aprueben. */
export async function finalizeImport(db: Db, clinic: ClinicRef) {
  const byCategory = new Map<Category, { id: string; lastAt: string | null }[]>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("patients")
      .select("id, is_blocked, extracted_profile")
      .eq("clinic_id", clinic.id)
      .order("created_at")
      .range(from, from + 999);
    for (const row of (data ?? []) as any[]) {
      const prof = row.extracted_profile?.recepcion as ImportedProfile | undefined;
      if (!prof?.category || row.is_blocked === true) continue;
      byCategory.set(prof.category, [...(byCategory.get(prof.category) ?? []), { id: row.id, lastAt: prof.appointments?.last_at ?? null }]);
    }
    if ((data ?? []).length < 1000) break;
  }

  const pending: PendingCohort[] = [];
  const summary: { name: string; count: number; status: "convertida" | "pendiente" }[] = [];
  const nowIso = new Date().toISOString();

  for (const [category, members] of byCategory) {
    if (category === "agendado" || category === "otro") continue;
    const def = COHORT_DEFS[category as keyof typeof COHORT_DEFS];
    if (!def || !members.length) continue;

    const { data: found } = await db.from("cohort_definitions").select("id").eq("clinic_id", clinic.id).eq("name", def.name).limit(1);
    let cohortId = (found?.[0] as any)?.id as string | undefined;
    if (!cohortId) {
      const { data: created, error } = await db
        .from("cohort_definitions")
        .insert({
          clinic_id: clinic.id,
          name: def.name,
          behavioral_description: def.description,
          pain_point: def.pain,
          conversion_strategy: def.strategy,
          message_template: def.template,
          is_auto_generated: true,
          is_active: true,
        })
        .select("id")
        .single();
      if (error || !created) continue;
      cohortId = (created as any).id as string;
    }

    const converted = category === "atendido";
    for (const part of chunks(members)) {
      // next_followup_at en null a propósito: la base lo llena con «ahora» si se omite, y saldrían mensajes sin aprobar.
      await db.from("cohort_memberships").upsert(
        part.map((m) => ({
          clinic_id: clinic.id,
          patient_id: m.id,
          cohort_id: cohortId,
          membership_status: converted ? "converted" : "active",
          assigned_at: nowIso,
          next_followup_at: null,
          ...(converted ? { converted_at: m.lastAt ?? nowIso, conversion_type: "booking" } : {}),
        })),
        { onConflict: "patient_id,cohort_id", ignoreDuplicates: true }
      );
    }
    summary.push({ name: def.name, count: members.length, status: converted ? "convertida" : "pendiente" });
    if (!converted) pending.push({ cohort_id: cohortId, name: def.name, count: members.length });
  }

  const settings = {
    ...(clinic.settings ?? {}),
    recepcion: { ...(clinic.settings?.recepcion ?? {}), import: { at: nowIso, pending } },
  };
  await db.from("clinics").update({ settings }).eq("id", clinic.id);
  return { ok: true, cohorts: summary };
}
