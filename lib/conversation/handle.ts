import { assignPatientToCohort } from "@/lib/cohorts/assign";
import type { NlpResult } from "@/lib/openai/extract-entities";
import { humanDelayMs, sendToChannel } from "@/lib/channels/send";
import { generateAiReply } from "./ai";
import {
  admin,
  countRecentBotReplies,
  ensurePatient,
  fetchRecentMessages,
  getClinic,
  getPromotions,
  getSchemaFlags,
  insertInbound,
  mapPatient,
  sameNumber,
  type SchemaFlags,
} from "./db";
import { decide } from "./engine";
import { detectOptOut } from "./intents";
import { notifyReceptionist } from "./notify";
import { activePromotions } from "./promotions";
import { fill, POOLS } from "./templates";
import { cleanFirstName } from "./normalize";
import { sanitizeOutgoing, validateReply } from "./validate";
import type {
  Channel,
  ClinicContext,
  Decision,
  HistoryMessage,
  Intent,
  NotifyReason,
  PatientState,
  PatientUpdates,
  ResponseSource,
} from "./types";

const DEBOUNCE_MS = 3500;
const MAX_BOT_REPLIES_PER_HOUR = 15;
const AI_STREAK_ESCALATE = 6;
const HUMAN_TAKEOVER_HOURS = 12;
const STALE_MESSAGE_HOURS = 3;
const HISTORY_LIMIT = 14;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type InboundInput = {
  clinicId: string;
  channel: Channel;
  /** Teléfono (solo dígitos) en WhatsApp; id con prefijo en otros canales. */
  externalId: string;
  contactJid?: string | null;
  displayName?: string | null;
  text: string;
  mediaType?: string | null;
  messageId?: string | null;
  sentAt?: string | null;
  /** WhatsApp espera 3.5 s para juntar mensajes seguidos; webchat responde al instante. */
  debounceMs?: number;
};

export type HandleResult = {
  status:
    | "replied"
    | "silent"
    | "duplicate"
    | "superseded"
    | "blocked"
    | "paused"
    | "ignored"
    | "stale"
    | "rate_limited"
    | "delivery_failed";
  reply?: string;
  reason?: string;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function canned(
  pool: "safeFallback" | "escalation" | "rateLimit",
  clinic: ClinicContext,
  patient: PatientState
): string {
  return fill(pick(POOLS[pool]), { name: cleanFirstName(patient.fullName), clinic: clinic.name });
}

const INTENT_TO_NLP: Partial<Record<Intent, NlpResult["intent"]>> = {
  booking: "booking",
  complaint: "complaint",
  urgent_medical: "post_treatment",
  payment_inquiry: "payment",
  price_inquiry: "inquiry",
  price_objection: "inquiry",
  promo_inquiry: "inquiry",
  comparing: "inquiry",
  thinking: "inquiry",
  no_time: "inquiry",
  hours_inquiry: "inquiry",
  location_inquiry: "inquiry",
  service_inquiry: "inquiry",
};

// ─────────────────────────────────────────────────────────────────────
// Envío con registro previo (así el "eco" del webhook se reconoce como nuestro)
// ─────────────────────────────────────────────────────────────────────
async function deliver(params: {
  clinic: ClinicContext;
  patient: PatientState;
  channel: Channel;
  text: string;
  source: ResponseSource;
  flags: SchemaFlags;
  delayMs?: number;
}): Promise<boolean> {
  const text = sanitizeOutgoing(params.text);
  if (!text) return false;
  const db = admin();

  const row: Record<string, unknown> = {
    clinic_id: params.clinic.id,
    patient_id: params.patient.id,
    direction: "outbound",
    content_text: text,
    sent_at: new Date().toISOString(),
    processing_status: "sent",
  };
  if (params.flags.messagesExtended) {
    row.channel = params.channel;
    row.response_source = params.source;
  }
  const { data: logged, error: logErr } = await db.from("messages").insert(row).select("id").single();
  if (logErr) console.error("[deliver] no se pudo registrar el mensaje:", logErr.message);

  try {
    const { id } = await sendToChannel({
      channel: params.channel,
      clinic: params.clinic,
      patient: params.patient,
      text,
      delayMs: params.delayMs ?? humanDelayMs(text),
    });
    if (logged?.id && id) {
      const { error } = await db.from("messages").update({ wa_message_id: id }).eq("id", logged.id);
      if (error && error.code !== "23505") console.error("[deliver] wa_message_id:", error.message);
    }
    return true;
  } catch (err) {
    console.error("[deliver] envío falló:", err);
    if (logged?.id) await db.from("messages").update({ processing_status: "failed" }).eq("id", logged.id);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Actualización del paciente (estado + memoria)
// ─────────────────────────────────────────────────────────────────────
async function applyPatientUpdates(params: {
  patient: PatientState;
  updates: PatientUpdates;
  flags: SchemaFlags;
  templateKey?: string;
  aiUsed: boolean;
  intent: string | null;
  aiName?: string | null;
  isExisting?: boolean | null;
}) {
  const { patient, updates, flags } = params;
  const now = new Date();
  const upd: Record<string, unknown> = {};

  if (flags.patientsExtended) {
    if (params.templateKey) upd.last_template_key = params.templateKey;
    upd.ai_fallback_streak = params.aiUsed ? patient.aiFallbackStreak + 1 : 0;
    if (updates.negotiationStage !== undefined) {
      upd.negotiation_stage = updates.negotiationStage;
      upd.negotiation_updated_at = now.toISOString();
    }
    if (updates.lastDiscountOffered !== undefined) upd.last_discount_offered = updates.lastDiscountOffered;
    if (updates.pauseBotHours) {
      upd.bot_paused_until = new Date(now.getTime() + updates.pauseBotHours * 3600_000).toISOString();
    }
    if (updates.block) {
      upd.is_blocked = true;
      upd.blocked_reason = updates.block.reason;
      upd.blocked_at = now.toISOString();
    }
  }

  const profile = { ...patient.profile };
  if (updates.addInterestedService) {
    const list = [...(profile.interested_services ?? []).filter((s) => s !== updates.addInterestedService), updates.addInterestedService];
    profile.interested_services = list.slice(-5);
  }
  if (updates.addObjection) {
    const list = Array.from(new Set([...(profile.objections ?? []), updates.addObjection]));
    profile.objections = list.slice(-5);
  }
  if (params.intent) profile.last_intent = params.intent;
  upd.extracted_profile = profile;

  if (!patient.fullName && params.aiName && cleanFirstName(params.aiName)) upd.full_name = params.aiName.slice(0, 80);
  if (params.isExisting === true) upd.status = "active";

  const { error } = await admin().from("patients").update(upd).eq("id", patient.id);
  if (error) console.error("[patient.update]", error.message);
}

async function updateFollowups(params: {
  clinicId: string;
  patientId: string;
  updates: PatientUpdates;
  isBooking: boolean;
  /** Reclamos y urgencias: ningún seguimiento comercial debe salir. */
  stop?: boolean;
}) {
  const db = admin();
  const now = new Date();
  try {
    if (params.stop) {
      await db
        .from("cohort_memberships")
        .update({ next_followup_at: null })
        .eq("patient_id", params.patientId)
        .eq("membership_status", "active");
      return;
    }
    if (params.updates.block) {
      await db
        .from("cohort_memberships")
        .update({ membership_status: "churned", churned_at: now.toISOString(), next_followup_at: null })
        .eq("patient_id", params.patientId)
        .eq("membership_status", "active");
      return;
    }
    if (params.isBooking) {
      await db
        .from("cohort_memberships")
        .update({
          membership_status: "converted",
          converted_at: now.toISOString(),
          conversion_type: "booking",
          next_followup_at: null,
        })
        .eq("patient_id", params.patientId)
        .eq("membership_status", "active");
      return;
    }
    const days = params.updates.followupInDays === undefined ? 2 : params.updates.followupInDays;
    if (days === null) return;
    const next = new Date(now.getTime() + Math.max(1, days) * 86_400_000).toISOString();
    await db
      .from("cohort_memberships")
      .update({ next_followup_at: next })
      .eq("patient_id", params.patientId)
      .eq("membership_status", "active");
  } catch (err) {
    console.error("[followups.update]", err);
  }
}

async function classifyCohort(params: {
  clinicId: string;
  patientId: string;
  nlp: NlpResult;
  text: string;
}) {
  try {
    const db = admin();
    const { data: memberships } = await db
      .from("cohort_memberships")
      .select("id")
      .eq("patient_id", params.patientId)
      .limit(1);
    // Ya tiene cohorte → no gastar otra llamada a IA en cada mensaje.
    if (memberships && memberships.length > 0 && params.nlp.intent !== "booking") return;
    if (params.nlp.intent === "other") return;
    const cohort = await assignPatientToCohort(db, params.clinicId, params.patientId, params.nlp, params.text);
    if (cohort) {
      await db.rpc("increment_cohort_message_count", { p_patient_id: params.patientId, p_cohort_id: cohort.id });
    }
  } catch (err) {
    console.error("[cohort.classify]", err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Punto de entrada: un mensaje entrante de cualquier canal
// ─────────────────────────────────────────────────────────────────────
export async function handleInbound(input: InboundInput): Promise<HandleResult> {
  const db = admin();
  const flags = await getSchemaFlags();
  const clinic = await getClinic(input.clinicId);
  if (!clinic) return { status: "ignored", reason: "clinic_not_found" };

  const channel = input.channel;
  if (channel === "whatsapp") {
    if (sameNumber(input.externalId, clinic.ownPhone) || sameNumber(input.externalId, clinic.receptionistPhone)) {
      return { status: "ignored", reason: "own_or_staff_number" };
    }
  }

  const text = input.text.trim();
  const storedText = text || (input.mediaType ? `[${input.mediaType}]` : "");

  const patientRow = await ensurePatient({
    clinicId: clinic.id,
    phone: input.externalId,
    channel,
    name: input.displayName,
    waContactId: input.contactJid,
  });
  const patient = mapPatient(patientRow, channel);

  const inbound = await insertInbound({
    clinicId: clinic.id,
    patientId: patient.id,
    channel,
    text: storedText,
    messageId: input.messageId,
    sentAt: input.sentAt,
    extended: flags.messagesExtended,
  });
  if (inbound.duplicate) return { status: "duplicate" };
  const messageRowId = inbound.id as string;

  const finish = async (result: HandleResult, nlpResult?: Record<string, unknown>) => {
    await db
      .from("messages")
      .update({ processing_status: "processed", processed_at: new Date().toISOString(), nlp_result: nlpResult ?? { status: result.status, reason: result.reason ?? null } })
      .eq("id", messageRowId);
    return result;
  };

  if (channel === "whatsapp") {
    void db.from("clinics").update({ last_wa_message_at: new Date().toISOString() }).eq("id", clinic.id).then(() => {});
  }

  // Mensajes viejos (p. ej. al reconectar) se guardan pero no se contestan.
  if (input.sentAt) {
    const ageH = (Date.now() - new Date(input.sentAt).getTime()) / 3_600_000;
    if (ageH > STALE_MESSAGE_HOURS) return finish({ status: "stale" });
  }

  // Bloqueado: no responde. Quien se dio de baja y vuelve a escribir, se reactiva solo.
  if (patient.isBlocked) {
    if (patient.blockedReason === "opt_out" && text && !detectOptOut(text)) {
      patient.isBlocked = false;
      patient.blockedReason = null;
      if (flags.patientsExtended) {
        await db.from("patients").update({ is_blocked: false, blocked_reason: null, blocked_at: null }).eq("id", patient.id);
      }
    } else {
      return finish({ status: "blocked" });
    }
  }

  // Pausas: interruptor general de la clínica y toma de control humana.
  if (clinic.botPaused) return finish({ status: "paused", reason: "clinic_paused" });
  if (patient.botPausedUntil && new Date(patient.botPausedUntil).getTime() > Date.now()) {
    return finish({ status: "paused", reason: "human_takeover" });
  }

  // Juntar mensajes seguidos ("Hola" / "quiero precios" / "del lifting") en una sola respuesta.
  const debounce = input.debounceMs ?? (channel === "whatsapp" ? DEBOUNCE_MS : 0);
  if (debounce > 0) {
    await sleep(debounce);
    const { data: latest } = await db
      .from("messages")
      .select("id")
      .eq("patient_id", patient.id)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && latest.id !== messageRowId) return finish({ status: "superseded" });
  }

  const recent = await fetchRecentMessages(patient.id, HISTORY_LIMIT);
  // Mensajes del paciente sin responder aún (desde el último saliente).
  let lastOutIdx = -1;
  recent.forEach((m, i) => {
    if (m.direction === "outbound") lastOutIdx = i;
  });
  const pending = recent.slice(lastOutIdx + 1).filter((m) => m.direction === "inbound");
  const pendingText = pending.length
    ? pending.slice(-5).map((m) => m.text).filter((t) => t && !/^\[(audio|image|video|document|sticker)\]$/.test(t)).join("\n")
    : text;
  const history: HistoryMessage[] = recent.slice(0, lastOutIdx + 1).map(({ id: _id, ...m }) => m);

  // Freno anti-bucle (otro bot del otro lado, o conversación interminable).
  const botReplies = await countRecentBotReplies(patient.id, 60);
  if (botReplies >= MAX_BOT_REPLIES_PER_HOUR) {
    await notifyReceptionist({ clinic, patient, reason: "rate_limit", priority: "normal", lastText: pendingText || storedText });
    return finish({ status: "rate_limited" });
  }

  const promos = activePromotions(await getPromotions(clinic.id));
  const effectiveText = pendingText || text;
  const mediaOnly = !effectiveText && !!input.mediaType;

  let decision: Decision;
  let replyText = "";
  let source: ResponseSource = "template";
  let notify: { reason: NotifyReason; priority: "normal" | "high" } | undefined;
  let nlp: NlpResult | null = null;
  let aiUsed = false;
  let aiName: string | null = null;
  let intent: Intent | null = null;
  let updates: PatientUpdates = {};
  let templateKey: string | undefined;

  try {
    decision = decide({
      text: mediaOnly ? "" : effectiveText,
      mediaType: input.mediaType,
      clinic,
      patient,
      promos,
      history,
    });

    if (decision.kind === "silent") {
      return finish({ status: "silent" });
    }

    if (decision.kind === "ai" && patient.aiFallbackStreak >= AI_STREAK_ESCALATE) {
      // Demasiados turnos libres seguidos: mejor una persona que seguir en bucle.
      decision = {
        kind: "reply",
        text: canned("escalation", clinic, patient),
        intent: null,
        source: "safety",
        notify: { reason: "escalation", priority: "normal" },
        updates: { pauseBotHours: HUMAN_TAKEOVER_HOURS },
      };
    }

    if (decision.kind === "ai") {
      aiUsed = true;
      updates = decision.updates;
      const ai = await generateAiReply({ clinic, patient, text: effectiveText, history, promos });
      if (ai.ok) {
        const check = validateReply(ai.reply, clinic, promos);
        if (check.ok) {
          replyText = ai.reply;
          source = "ai";
          nlp = ai.nlp;
          aiName = ai.nlp.patient_name;
          if (ai.needsHuman) notify = { reason: "escalation", priority: "normal" };
          else if (ai.nlp.intent === "booking") notify = { reason: "booking", priority: "normal" };
          else if (ai.nlp.intent === "complaint") {
            notify = { reason: "complaint", priority: "high" };
            updates = { ...updates, pauseBotHours: 24 };
          }
        } else {
          console.warn(`[ai] respuesta rechazada (${check.reason}): ${ai.reply.slice(0, 120)}`);
          replyText = canned("safeFallback", clinic, patient);
          source = "safety";
          notify = { reason: "ai_failure", priority: "normal" };
        }
      } else {
        console.warn(`[ai] sin respuesta (${ai.reason})`);
        replyText = canned("safeFallback", clinic, patient);
        source = "safety";
        notify = { reason: "ai_failure", priority: "normal" };
      }
    } else {
      replyText = decision.text ?? "";
      source = decision.source ?? "template";
      notify = decision.notify;
      intent = decision.intent;
      updates = decision.updates;
      templateKey = decision.templateKey;
    }
  } catch (err) {
    // Nunca dejar al paciente en silencio por un error inesperado.
    console.error("[handle] error en decisión:", err);
    replyText = canned("safeFallback", clinic, patient);
    source = "safety";
    notify = { reason: "ai_failure", priority: "normal" };
  }

  // ── Enviar ────────────────────────────────────────────────────────
  const delivered = await deliver({ clinic, patient, channel, text: replyText, source, flags });
  if (!delivered) {
    await notifyReceptionist({ clinic, patient, reason: "ai_failure", priority: "high", lastText: effectiveText || storedText });
    return finish({ status: "delivery_failed" });
  }

  // ── Estado, memoria y seguimiento (nada de esto bloquea la respuesta) ─
  const effectiveIntent = intent ?? (nlp?.intent === "booking" ? "booking" : null);
  try {
    await applyPatientUpdates({
      patient,
      updates,
      flags,
      templateKey,
      aiUsed,
      intent: effectiveIntent ?? nlp?.intent ?? null,
      aiName,
      isExisting: nlp?.is_existing_patient ?? null,
    });
  } catch (err) {
    console.error("[handle] applyPatientUpdates:", err);
  }

  const isBooking = effectiveIntent === "booking";
  const isSafety =
    effectiveIntent === "complaint" ||
    effectiveIntent === "urgent_medical" ||
    nlp?.intent === "complaint";
  await updateFollowups({ clinicId: clinic.id, patientId: patient.id, updates, isBooking, stop: isSafety });

  // Audio/foto enviado junto a texto: el texto se contesta, pero recepción debe enterarse.
  if (input.mediaType && !text && !notify) notify = { reason: "media", priority: "normal" };

  const nlpForCohort: NlpResult =
    nlp ??
    ({
      patient_name: null,
      intent: (intent && INTENT_TO_NLP[intent]) || "other",
      treatment_mentioned: updates.addInterestedService ?? null,
      treatment_date: null,
      is_existing_patient: null,
      pain_signals: updates.addObjection ? [updates.addObjection] : [],
      next_action: "update_cohort",
      confidence: 0.8,
    } as NlpResult);
  if (!updates.block && !isSafety && nlpForCohort.intent !== "other") {
    await classifyCohort({ clinicId: clinic.id, patientId: patient.id, nlp: nlpForCohort, text: effectiveText });
  }

  if (notify) {
    await notifyReceptionist({
      clinic,
      patient,
      reason: notify.reason,
      priority: notify.priority,
      lastText: effectiveText || storedText,
    });
  }

  return finish(
    { status: "replied", reply: replyText },
    { intent: effectiveIntent ?? nlp?.intent ?? null, source, ai: aiUsed, confidence: nlp?.confidence ?? null }
  );
}

// ─────────────────────────────────────────────────────────────────────
// Mensaje SALIENTE visto en el webhook (eco del bot o persona de la clínica)
// ─────────────────────────────────────────────────────────────────────
export async function handleOutboundEcho(input: {
  clinicId: string;
  externalId: string;
  contactJid?: string | null;
  messageId: string;
  text: string;
  sentAt?: string | null;
}): Promise<"system_echo" | "human" | "ignored"> {
  const db = admin();
  const clinic = await getClinic(input.clinicId);
  if (!clinic) return "ignored";
  if (sameNumber(input.externalId, clinic.receptionistPhone) || sameNumber(input.externalId, clinic.ownPhone)) {
    return "ignored";
  }

  // 1) ¿Ya conocemos este mensaje por su id?
  const { data: byId } = await db.from("messages").select("id").eq("wa_message_id", input.messageId).maybeSingle();
  if (byId) return "system_echo";

  const flags = await getSchemaFlags();
  const patientRow = await ensurePatient({
    clinicId: clinic.id,
    phone: input.externalId,
    channel: "whatsapp",
    waContactId: input.contactJid,
    touchContact: false,
  });
  const patient = mapPatient(patientRow, "whatsapp");

  // 2) ¿Es un mensaje del bot cuyo id aún no habíamos guardado? (mismo texto, últimos 3 min)
  if (input.text) {
    const since = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: candidates } = await db
      .from("messages")
      .select("id, content_text, wa_message_id")
      .eq("patient_id", patient.id)
      .eq("direction", "outbound")
      .gte("sent_at", since)
      .is("wa_message_id", null)
      .limit(10);
    const mine = (candidates ?? []).find((m: any) => sanitizeOutgoing(m.content_text ?? "") === sanitizeOutgoing(input.text));
    if (mine) {
      const { error } = await db.from("messages").update({ wa_message_id: input.messageId }).eq("id", mine.id);
      if (error && error.code !== "23505") console.error("[echo] wa_message_id:", error.message);
      return "system_echo";
    }
  }

  // 3) Es una persona de la clínica escribiendo desde el teléfono: el bot se pausa.
  const row: Record<string, unknown> = {
    clinic_id: clinic.id,
    patient_id: patient.id,
    direction: "outbound",
    content_text: input.text || "[mensaje]",
    wa_message_id: input.messageId,
    sent_at: input.sentAt ?? new Date().toISOString(),
    processing_status: "processed",
  };
  if (flags.messagesExtended) {
    row.channel = "whatsapp";
    row.response_source = "human";
  }
  const { error } = await db.from("messages").insert(row);
  if (error && error.code !== "23505") console.error("[echo] insert:", error.message);

  if (flags.patientsExtended) {
    const until = new Date(Date.now() + HUMAN_TAKEOVER_HOURS * 3_600_000).toISOString();
    await db.from("patients").update({ bot_paused_until: until }).eq("id", patient.id);
  }
  return "human";
}
