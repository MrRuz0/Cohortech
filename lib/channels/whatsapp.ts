import { handleInbound, handleOutboundEcho } from "@/lib/conversation/handle";

type Json = Record<string, any>;

export type ParsedWaEvent =
  | { kind: "ignore"; reason: string }
  | {
      kind: "inbound";
      externalId: string;
      contactJid: string;
      displayName: string | null;
      text: string;
      mediaType: string | null;
      messageId: string;
      sentAt: string | null;
    }
  | {
      kind: "outbound";
      externalId: string;
      contactJid: string;
      text: string;
      messageId: string;
      sentAt: string | null;
    };

const IGNORED_TYPES = [
  "reactionMessage",
  "protocolMessage",
  "senderKeyDistributionMessage",
  "pollUpdateMessage",
  "stickerMessage",
  "messageContextInfo",
  "editedMessage",
];

const MEDIA_TYPES: Record<string, string> = {
  audioMessage: "audio",
  imageMessage: "image",
  videoMessage: "video",
  documentMessage: "document",
  contactMessage: "contact",
  locationMessage: "location",
};

/** Desenvuelve mensajes efímeros / de una sola vista. */
function unwrap(message: Json | undefined): Json {
  let m: Json = message ?? {};
  for (let i = 0; i < 4; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message ??
      m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function extractText(m: Json): string {
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText ??
    ""
  )
    .toString()
    .trim();
}

function toIso(ts: unknown): string | null {
  let n: number | null = null;
  if (typeof ts === "number") n = ts;
  else if (typeof ts === "string" && /^\d+$/.test(ts)) n = Number(ts);
  else if (ts && typeof ts === "object" && typeof (ts as Json).low === "number") n = (ts as Json).low;
  if (!n || !Number.isFinite(n)) return null;
  // Segundos → ms (los timestamps de WhatsApp vienen en segundos).
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseEvolutionPayload(body: unknown): ParsedWaEvent {
  const payload = (body ?? {}) as Json;
  const event = String(payload.event ?? "").toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return { kind: "ignore", reason: `event:${event || "none"}` };

  const data: Json = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const key: Json | undefined = data?.key;
  if (!key?.id || !key?.remoteJid) return { kind: "ignore", reason: "no_key" };

  const jid = String(key.remoteJid);
  // Grupos, estados, canales y listas de difusión NO son pacientes.
  if (!(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"))) {
    return { kind: "ignore", reason: "not_a_direct_chat" };
  }

  let phoneJid = jid;
  if (jid.endsWith("@lid")) {
    const alt = String(key.remoteJidAlt ?? data.senderPn ?? key.senderPn ?? "");
    if (alt.endsWith("@s.whatsapp.net")) phoneJid = alt;
  }
  const externalId = phoneJid.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!/^\d{7,16}$/.test(externalId)) return { kind: "ignore", reason: "invalid_phone" };

  const message = unwrap(data.message);
  const types = Object.keys(message);
  if (types.length > 0 && types.every((t) => IGNORED_TYPES.includes(t))) {
    return { kind: "ignore", reason: "ignored_type" };
  }

  const text = extractText(message);
  const mediaKey = types.find((t) => MEDIA_TYPES[t]);
  const mediaType = mediaKey ? MEDIA_TYPES[mediaKey] : null;
  if (!text && !mediaType) return { kind: "ignore", reason: "empty" };

  const sentAt = toIso(data.messageTimestamp);

  if (key.fromMe === true) {
    return {
      kind: "outbound",
      externalId,
      contactJid: jid,
      text: text || (mediaType ? `[${mediaType}]` : ""),
      messageId: String(key.id),
      sentAt,
    };
  }

  return {
    kind: "inbound",
    externalId,
    contactJid: jid,
    displayName: typeof data.pushName === "string" ? data.pushName : null,
    text,
    mediaType: text ? null : mediaType,
    messageId: String(key.id),
    sentAt,
  };
}

export async function processEvolutionPayload(clinicId: string, body: unknown) {
  const ev = parseEvolutionPayload(body);
  if (ev.kind === "ignore") return { status: "ignored", reason: ev.reason };

  if (ev.kind === "outbound") {
    const r = await handleOutboundEcho({
      clinicId,
      externalId: ev.externalId,
      contactJid: ev.contactJid,
      messageId: ev.messageId,
      text: ev.text,
      sentAt: ev.sentAt,
    });
    return { status: r };
  }

  const r = await handleInbound({
    clinicId,
    channel: "whatsapp",
    externalId: ev.externalId,
    contactJid: ev.contactJid,
    displayName: ev.displayName,
    text: ev.text,
    mediaType: ev.mediaType,
    messageId: ev.messageId,
    sentAt: ev.sentAt,
  });
  return r;
}
