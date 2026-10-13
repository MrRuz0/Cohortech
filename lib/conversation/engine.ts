import { analyzeIntents, detectOptOut } from "./intents";
import { cleanFirstName, normalize } from "./normalize";
import { planNegotiation, type Objection } from "./negotiation";
import { promoLines, promosFor } from "./promotions";
import { findServiceMatch, formatPrice, serviceLine, serviceNamedIn } from "./services";
import { fill, Picker } from "./templates";
import type {
  ClinicContext,
  Decision,
  HistoryMessage,
  Intent,
  PatientState,
  PatientUpdates,
  Promotion,
  Service,
} from "./types";

export type DecideInput = {
  text: string;
  mediaType?: string | null;
  clinic: ClinicContext;
  patient: PatientState;
  promos: Promotion[];
  history: HistoryMessage[];
  rand?: () => number;
};

const MAX_LIST = 10;

function serviceList(services: Service[], withPrice: boolean): string {
  const shown = services.slice(0, MAX_LIST);
  const lines = shown.map((s) => `• ${withPrice ? serviceLine(s) : s.name}`);
  if (services.length > MAX_LIST) lines.push(`…y ${services.length - MAX_LIST} más. Pregúntame por cualquiera.`);
  return lines.join("\n");
}

/**
 * Decide cómo responder SIN llamar a ninguna API. Devuelve:
 *   kind "reply"  → texto listo para enviar (plantilla / negociación / seguridad)
 *   kind "ai"     → el mensaje necesita comprensión libre; lo resuelve la IA
 *   kind "silent" → no responder (p. ej. solo un emoji)
 */
export function decide(input: DecideInput): Decision {
  const { clinic, patient } = input;
  const rand = input.rand ?? Math.random;
  const picker = new Picker(patient.lastTemplateKey, rand);
  const name = cleanFirstName(patient.fullName);
  const vars = { name, clinic: clinic.name };
  const text = input.text.trim();
  const norm = normalize(text);

  const lastAssistant =
    [...input.history].reverse().find((h) => h.direction === "outbound")?.text ?? "";
  const hasHistory = input.history.length > 0;

  const reply = (
    body: string,
    extra: Partial<Decision> & { updates?: PatientUpdates } = {}
  ): Decision => ({
    kind: "reply",
    text: fill(body, vars),
    intent: null,
    source: "template",
    templateKey: picker.key() || undefined,
    updates: {},
    ...extra,
  });

  // ── 0. Solo multimedia (audio, foto, documento) ────────────────────
  if (!text && input.mediaType) {
    return reply(picker.pick("media"), {
      source: "safety",
      notify: { reason: "media", priority: "normal" },
    });
  }
  if (!norm) return { kind: "silent", intent: null, updates: {} };

  // ── 1. Baja voluntaria ──────────────────────────────────────────────
  if (detectOptOut(text)) {
    return reply(picker.pick("optOut"), {
      source: "safety",
      updates: { block: { reason: "opt_out" } },
    });
  }

  const analysis = analyzeIntents(text);
  const has = (i: Intent) => analysis.intents.has(i);

  // ── 2. Seguridad: urgencias médicas y reclamos van directo a una persona
  if (has("urgent_medical")) {
    return reply(picker.pick("urgent"), {
      intent: "urgent_medical",
      source: "safety",
      notify: { reason: "urgent_medical", priority: "high" },
      updates: { pauseBotHours: 24 },
    });
  }
  if (has("complaint")) {
    return reply(picker.pick("complaint"), {
      intent: "complaint",
      source: "safety",
      notify: { reason: "complaint", priority: "high" },
      updates: { pauseBotHours: 24 },
    });
  }

  // ── 3. Cancelar / reprogramar ───────────────────────────────────────
  if (has("cancel_reschedule")) {
    return reply(picker.pick("cancel"), {
      intent: "cancel_reschedule",
      notify: { reason: "cancel_reschedule", priority: "normal" },
    });
  }

  // ── 4. No le interesa ───────────────────────────────────────────────
  if (has("decline") && !has("booking")) {
    return reply(picker.pick("decline"), {
      intent: "decline",
      updates: { followupInDays: 30 },
    });
  }

  // ── Contexto de servicio (memoria corta sin IA) ─────────────────────
  const match = findServiceMatch(text, clinic.services);
  const explicit = match.kind === "exact" ? match.service : null;
  const implied = serviceNamedIn(lastAssistant, clinic.services);
  const remembered = (() => {
    const last = patient.profile.interested_services?.[patient.profile.interested_services.length - 1];
    return last ? clinic.services.find((s) => normalize(s.name) === normalize(last)) ?? null : null;
  })();
  const contextService = explicit ?? implied ?? remembered;
  const baseUpdates: PatientUpdates = explicit ? { addInterestedService: explicit.name } : {};

  // ── 5. Negociación (objeciones, promociones, "lo voy a pensar") ─────
  let objection: Objection | null = null;
  if (has("price_objection")) objection = "price";
  else if (has("comparing")) objection = "comparing";
  else if (has("thinking")) objection = "thinking";
  else if (has("no_time")) objection = "no_time";
  else if (has("promo_inquiry")) objection = "promo";

  const bookingWins = has("booking") && (objection === "promo" || objection === "no_time");

  if (objection && !bookingWins && !analysis.isComplex) {
    const plan = planNegotiation({
      objection,
      stage: patient.negotiationStage,
      maxDiscount: clinic.maxDiscountPercent,
      service: contextService,
      promos: promosFor(input.promos, contextService?.name),
      timezone: clinic.timezone,
      alreadyOffered: patient.lastDiscountOffered,
      name,
      rand,
    });
    const intentMap: Record<Objection, Intent> = {
      price: "price_objection",
      comparing: "comparing",
      thinking: "thinking",
      no_time: "no_time",
      promo: "promo_inquiry",
    };
    return reply(plan.text, {
      intent: intentMap[objection],
      source: "negotiation",
      notify: plan.escalate ? { reason: "negotiation_limit", priority: "normal" } : undefined,
      updates: {
        ...baseUpdates,
        negotiationStage: plan.newStage,
        ...(plan.discountPercent !== null ? { lastDiscountOffered: plan.discountPercent } : {}),
        addObjection: objection === "price" || objection === "promo" ? "precio" : objection,
        followupInDays: plan.followupInDays,
        ...(plan.escalate ? { pauseBotHours: 12 } : {}),
      },
    });
  }

  // ── 6. Quiere agendar ───────────────────────────────────────────────
  const confirmsBookingCta =
    has("confirmation") && /(agend|reserv|cita|coordin|valoracion)/.test(normalize(lastAssistant));

  if (has("booking") || confirmsBookingCta) {
    const svc = explicit ?? implied ?? remembered;
    let body: string;
    if (match.kind === "ambiguous") {
      body = `¡Con gusto{name}! ¿Para cuál de estos tratamientos quieres la cita?\n${serviceList(match.services, false)}`;
    } else if (svc) {
      body = picker.pick("bookingService").replaceAll("{service}", svc.name);
    } else {
      body = picker.pick("bookingReply");
    }
    const extras: string[] = [];
    if (clinic.bookingLink) extras.push(`También puedes reservar aquí: ${clinic.bookingLink}`);
    if (clinic.bookingPhone) extras.push(`O comunicarte al ${clinic.bookingPhone}.`);
    const promoBlock = promosFor(input.promos, svc?.name);
    if (promoBlock.length) extras.push(promoLines(promoBlock, clinic.timezone, 2));

    return reply([body, ...extras].join("\n\n"), {
      intent: "booking",
      notify: { reason: "booking", priority: "normal" },
      updates: { ...baseUpdates, followupInDays: null },
    });
  }

  // ── 7. Información (precio, horario, ubicación, servicios, pagos) ───
  const wantsPrice = has("price_inquiry");
  const wantsServices = has("service_inquiry");
  const wantsHours = has("hours_inquiry");
  const wantsLocation = has("location_inquiry");
  const wantsPayment = has("payment_inquiry");
  const wantsInfo = wantsPrice || wantsServices || wantsHours || wantsLocation || wantsPayment;

  if (wantsInfo) {
    // Preguntas largas o con varios temas: la IA responde mejor, con los mismos datos.
    if (analysis.isComplex) return { kind: "ai", intent: null, updates: baseUpdates };

    const bodies: string[] = [];
    let missing = false;
    let cta: "book" | "choose" | null = "book";

    if (wantsPrice || wantsServices) {
      const target = match.kind === "exact" ? match.service : null;
      // "¿y cuánto cuesta?" tras hablar de un tratamiento → precio de ese tratamiento.
      // Si pide "los precios"/"la lista", se muestra el catálogo completo.
      const asksList = wantsServices || /\b(precios|tarifas|todos|lista|catalogo)\b/.test(norm);
      const contextual = !asksList && match.kind === "none" && analysis.wordCount <= 8 ? implied : null;
      if (!clinic.services.length) {
        missing = true;
        cta = null;
      } else if (target || contextual) {
        const s = (target ?? contextual) as Service;
        if (formatPrice(s.price)) {
          bodies.push(`${s.name}: ${formatPrice(s.price)}.`);
        } else {
          bodies.push(`Sobre ${s.name}, el valor lo define la doctora en la valoración.`);
          missing = true;
        }
      } else if (match.kind === "ambiguous") {
        bodies.push(`Tenemos estas opciones:\n${serviceList(match.services, true)}`);
        cta = "choose";
      } else if (wantsPrice) {
        bodies.push(`Estos son nuestros tratamientos y precios:\n${serviceList(clinic.services, true)}`);
        cta = "choose";
      } else {
        bodies.push(`Estos son los tratamientos que ofrecemos:\n${serviceList(clinic.services, false)}`);
        cta = "choose";
      }
    }
    if (wantsHours) {
      if (clinic.hours) bodies.push(`Nuestro horario de atención es: ${clinic.hours}.`);
      else missing = true;
    }
    if (wantsLocation) {
      if (clinic.address) bodies.push(`Estamos ubicados en ${clinic.address}.`);
      else missing = true;
    }
    if (wantsPayment) {
      if (clinic.paymentMethods) bodies.push(`Formas de pago: ${clinic.paymentMethods}.`);
      else missing = true;
    }

    const greeted = /\b(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(norm);
    const opener = greeted ? "¡Hola{name}!" : bodies.length === 1 ? picker.pick("ack") : "";

    const parts: string[] = [];
    if (bodies.length) {
      parts.push([opener, ...bodies].filter(Boolean).join(" "));
      const promos = promosFor(input.promos, contextService?.name);
      if ((wantsPrice || wantsServices) && promos.length) parts.push(promoLines(promos, clinic.timezone, 2));
      if (cta === "book") parts.push(picker.pick("ctaBook"));
      else if (cta === "choose") parts.push(picker.pick("ctaChoose"));
    }
    if (missing) parts.push(picker.pick("handoff"));

    return reply(parts.join("\n\n"), {
      intent: wantsPrice ? "price_inquiry" : wantsHours ? "hours_inquiry" : wantsLocation ? "location_inquiry" : wantsServices ? "service_inquiry" : "payment_inquiry",
      notify: missing ? { reason: wantsPayment ? "payment" : "missing_info", priority: "normal" } : undefined,
      updates: baseUpdates,
    });
  }

  // ── 8. Mensajes sociales puros ──────────────────────────────────────
  if (has("thanks")) return reply(picker.pick("thanks"), { intent: "thanks" });
  if (has("farewell")) return reply(picker.pick("farewell"), { intent: "farewell" });
  if (has("confirmation")) return reply(picker.pick("confirmation"), { intent: "confirmation" });
  if (has("greeting")) {
    return reply(picker.pick(hasHistory ? "greetingBack" : "greetingNew"), { intent: "greeting" });
  }

  // ── 9. Todo lo demás: comprensión libre con IA ──────────────────────
  return { kind: "ai", intent: null, updates: baseUpdates };
}
