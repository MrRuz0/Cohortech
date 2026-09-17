// Recepción IA — clasificador de intención rápido y gratuito (sin IA).
// Corre ANTES de tocar OpenAI. Si encuentra match con alta confianza,
// el mensaje se resuelve 100% por plantilla y nunca llega a costar un
// centavo de API. Solo cuando no hay match se cae al flujo con IA.

export type FastIntent =
  | "greeting"
  | "thanks"
  | "farewell"
  | "price_inquiry"
  | "hours_inquiry"
  | "location_inquiry"
  | "service_inquiry"
  | "booking_intent"
  | "confirmation";

type Rule = {
  intent: FastIntent;
  // Cada patrón se busca como palabra completa (word boundary) sobre el
  // texto ya normalizado (minúsculas, sin tildes).
  patterns: RegExp[];
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .trim();
}

// Orden importa: booking_intent y price_inquiry se revisan antes que
// greeting porque un mensaje como "hola quiero agendar" debe ganar
// booking_intent, no greeting.
const RULES: Rule[] = [
  {
    intent: "booking_intent",
    patterns: [
      /\bagendar\b/, /\bagenda\b/, /\bcita\b/, /\breservar\b/, /\breserva\b/,
      /\bseparar\b/, /\baparto\b/, /\bapartar\b/, /\bquiero (ir|venir)\b/,
      /\bcuando (puedo|hay)\b/, /\bdisponibilidad\b/, /\bhay hora\b/,
      /\bme gustaria (ir|agendar|reservar)\b/, /\bnecesito una cita\b/,
    ],
  },
  {
    intent: "confirmation",
    patterns: [
      /^si$/, /^si,?\s*(confirmo|claro|dale)?$/, /^confirmo$/, /^dale$/,
      /^ok(ay)?$/, /^listo$/, /^de acuerdo$/, /^perfecto$/, /^vale$/,
      /^esta bien$/,
    ],
  },
  {
    intent: "price_inquiry",
    patterns: [
      /\bprecio(s)?\b/, /\bcuanto cuesta\b/, /\bcuanto sale\b/,
      /\bcuanto es\b/, /\bcosto(s)?\b/, /\btarifa(s)?\b/, /\bcuanto vale\b/,
      /\bcuanto cobran\b/, /\bque precio\b/,
    ],
  },
  {
    intent: "hours_inquiry",
    patterns: [
      /\bhorario(s)?\b/, /\ba que hora\b/, /\ba que horas\b/,
      /\babren\b/, /\bcierran\b/, /\batienden\b/, /\batencion\b/,
      /\bhasta que hora\b/, /\bdesde que hora\b/,
    ],
  },
  {
    intent: "location_inquiry",
    patterns: [
      /\bdireccion\b/, /\bubicacion\b/, /\bdonde estan\b/,
      /\bdonde quedan\b/, /\bdonde queda\b/, /\bcomo llego\b/,
      /\bdonde se encuentran\b/, /\bubicados\b/, /\bzona\b/,
    ],
  },
  {
    intent: "service_inquiry",
    patterns: [
      /\bque tratamientos\b/, /\bque hacen\b/, /\bservicios\b/,
      /\bque ofrecen\b/, /\bque tienen\b/, /\bque tipos de\b/,
      /\bcuales son sus\b/, /\bque procedimientos\b/,
    ],
  },
  {
    intent: "thanks",
    patterns: [/\bgracias\b/, /\bmuchas gracias\b/, /\bmil gracias\b/, /\bgracias totales\b/],
  },
  {
    intent: "farewell",
    patterns: [
      /^chau$/, /^adios$/, /^nos vemos$/, /^bye$/, /^hasta luego$/,
      /^hasta pronto$/, /^cuidate$/,
    ],
  },
  {
    intent: "greeting",
    patterns: [
      /\bhola\b/, /\bbuenas\b/, /\bbuenos dias\b/, /\bbuenas tardes\b/,
      /\bbuenas noches\b/, /\bque tal\b/, /\bsaludos\b/,
    ],
  },
];

export function matchFastIntent(rawText: string): FastIntent | null {
  const text = normalize(rawText);
  if (!text) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.intent;
    }
  }
  return null;
}

// Intenciones que SÍ se resuelven completamente por plantilla, sin pasar
// nunca por IA de extracción ni de generación. booking_intent se maneja
// aparte (ver respond.ts) porque además dispara la notificación a la
// recepcionista del flujo existente.
export const FULLY_AUTOMATABLE: FastIntent[] = [
  "greeting",
  "thanks",
  "farewell",
  "price_inquiry",
  "hours_inquiry",
  "location_inquiry",
  "service_inquiry",
  "confirmation",
];
