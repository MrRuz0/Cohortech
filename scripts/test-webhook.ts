import { parseEvolutionPayload } from "../lib/channels/whatsapp";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

const base = (key: Record<string, unknown>, message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  data: { key, message, messageTimestamp: 1_760_000_000, pushName: "Ana", ...extra },
});

let r = parseEvolutionPayload(base({ id: "A1", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { conversation: "Hola" }));
check("texto simple", r.kind === "inbound" && r.text === "Hola" && r.externalId === "51999111222", r);

r = parseEvolutionPayload(base({ id: "A2", remoteJid: "120363025@g.us", fromMe: false }, { conversation: "hola grupo" }));
check("grupo ignorado", r.kind === "ignore", r);

r = parseEvolutionPayload(base({ id: "A3", remoteJid: "status@broadcast", fromMe: false }, { conversation: "estado" }));
check("estado ignorado", r.kind === "ignore", r);

r = parseEvolutionPayload(base({ id: "A4", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { audioMessage: { seconds: 5 } }));
check("audio → mediaType", r.kind === "inbound" && r.mediaType === "audio" && r.text === "", r);

r = parseEvolutionPayload(base({ id: "A5", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { imageMessage: { caption: "mira mi lunar" } }));
check("foto con texto → texto", r.kind === "inbound" && r.text === "mira mi lunar" && r.mediaType === null, r);

r = parseEvolutionPayload(base({ id: "A6", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { ephemeralMessage: { message: { extendedTextMessage: { text: "precio?" } } } }));
check("mensaje efímero desenvuelto", r.kind === "inbound" && r.text === "precio?", r);

r = parseEvolutionPayload(base({ id: "A7", remoteJid: "51999111222@s.whatsapp.net", fromMe: true }, { conversation: "Te espero mañana" }));
check("saliente detectado", r.kind === "outbound" && r.text === "Te espero mañana", r);

r = parseEvolutionPayload(base({ id: "A8", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { reactionMessage: { text: "👍" } }));
check("reacción ignorada", r.kind === "ignore", r);

r = parseEvolutionPayload(base({ id: "A9", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, { stickerMessage: {} }));
check("sticker ignorado", r.kind === "ignore", r);

r = parseEvolutionPayload(
  base({ id: "B1", remoteJid: "98765432101234@lid", remoteJidAlt: "51988777666@s.whatsapp.net", fromMe: false }, { conversation: "hola" })
);
check("@lid con teléfono alterno", r.kind === "inbound" && r.externalId === "51988777666", r);

r = parseEvolutionPayload({ event: "MESSAGES_UPSERT", data: { key: { id: "C1", remoteJid: "51999111222@s.whatsapp.net", fromMe: false }, message: { conversation: "x" } } });
check("evento en mayúsculas", r.kind === "inbound", r);

r = parseEvolutionPayload({ event: "connection.update", data: {} });
check("otros eventos ignorados", r.kind === "ignore", r);

r = parseEvolutionPayload(base({ id: "D1", remoteJid: "51999111222:12@s.whatsapp.net", fromMe: false }, { conversation: "hola" }));
check("jid con dispositivo", r.kind === "inbound" && r.externalId === "51999111222", r);

r = parseEvolutionPayload(null);
check("payload nulo no revienta", r.kind === "ignore", r);

console.log(`\n${passed} OK, ${failed} fallos`);
process.exit(failed ? 1 : 0);
