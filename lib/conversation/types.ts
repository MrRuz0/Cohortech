export type Channel = "whatsapp" | "webchat" | "instagram" | "messenger";

export type Service = { name: string; price: string; durationMin?: number };

export type Promotion = {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number | null;
  service_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

export type ClinicContext = {
  id: string;
  name: string;
  services: Service[];
  hours?: string;
  address?: string;
  bookingPhone?: string;
  bookingLink?: string;
  paymentMethods?: string;
  maxDiscountPercent: number;
  receptionistPhone: string | null;
  ownPhone: string | null;
  waSessionId: string | null;
  timezone: string;
  botPaused: boolean;
  /** Vinculada con Recepción IA: ese producto contesta las conversaciones; Cohortech solo guarda los mensajes y hace campañas. */
  recepcionLinked?: boolean;
  /**
   * Módulos contratados (se activan por clínica desde /admin):
   *  - reception: contesta y agenda a cualquiera que escriba
   *  - recovery:  detecta inactivos, los reactiva y les da seguimiento
   */
  modules: { reception: boolean; recovery: boolean; multichannel: boolean };
  /** Plan manual: suspendido o vencido = el asistente no responde ni envía nada. */
  plan: { status: "trial" | "active" | "suspended"; expiresAt: string | null; active: boolean };
  settings: Record<string, unknown>;
};

export type PatientProfile = {
  interested_services?: string[];
  objections?: string[];
  last_intent?: string;
  last_notified?: Record<string, string>;
  /** Última vez que respondió dentro de un flujo de recuperación (mantiene la conversación abierta). */
  recovery_engaged_at?: string;
};

export type PatientState = {
  id: string;
  fullName: string | null;
  phone: string;
  waContactId: string | null;
  channel: Channel;
  isBlocked: boolean;
  blockedReason: string | null;
  botPausedUntil: string | null;
  lastTemplateKey: string | null;
  aiFallbackStreak: number;
  negotiationStage: number;
  lastDiscountOffered: number | null;
  profile: PatientProfile;
};

export type HistoryMessage = {
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  source?: string | null;
};

export type Intent =
  | "urgent_medical"
  | "complaint"
  | "cancel_reschedule"
  | "decline"
  | "booking"
  | "price_objection"
  | "promo_inquiry"
  | "thinking"
  | "comparing"
  | "no_time"
  | "price_inquiry"
  | "hours_inquiry"
  | "location_inquiry"
  | "service_inquiry"
  | "duration_inquiry"
  | "payment_inquiry"
  | "thanks"
  | "farewell"
  | "greeting"
  | "confirmation";

export type NotifyReason =
  | "booking"
  | "cancel_reschedule"
  | "complaint"
  | "urgent_medical"
  | "escalation"
  | "media"
  | "payment"
  | "negotiation_limit"
  | "missing_info"
  | "rate_limit"
  | "ai_failure";

export type ResponseSource = "template" | "negotiation" | "safety" | "ai" | "human";

export type PatientUpdates = {
  negotiationStage?: number;
  lastDiscountOffered?: number | null;
  pauseBotHours?: number;
  block?: { reason: "opt_out" | "manual" | "spam" };
  addInterestedService?: string;
  addObjection?: string;
  followupInDays?: number | null;
};

export type Decision = {
  kind: "reply" | "ai" | "silent";
  text?: string;
  intent: Intent | null;
  templateKey?: string;
  source?: ResponseSource;
  notify?: { reason: NotifyReason; priority: "normal" | "high" };
  updates: PatientUpdates;
};
