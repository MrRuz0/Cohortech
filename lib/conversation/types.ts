export type Channel = "whatsapp" | "webchat" | "instagram" | "messenger";

export type Service = { name: string; price: string };

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
  settings: Record<string, unknown>;
};

export type PatientProfile = {
  interested_services?: string[];
  objections?: string[];
  last_intent?: string;
  last_notified?: Record<string, string>;
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
