const BASE_URL = process.env.EVOLUTION_API_URL ?? "";
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: API_KEY,
  };
}

export async function createInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  if (!res.ok) throw new Error(`Evolution createInstance failed: ${res.status}`);
  return res.json();
}

export async function getConnectionState(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connectionState/${instanceName}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution connectionState failed: ${res.status}`);
  return res.json();
}

export async function getQrCode(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution connect failed: ${res.status}`);
  return res.json();
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  const res = await fetch(`${BASE_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
  if (!res.ok) throw new Error(`Evolution setWebhook failed: ${res.status}`);
  return res.json();
}

export async function sendTextMessage(
  instanceName: string,
  number: string,
  text: string
) {
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) throw new Error(`Evolution sendText failed: ${res.status}`);
  return res.json();
}

export async function fetchMessages(instanceName: string, remoteJid?: string) {
  const res = await fetch(`${BASE_URL}/chat/findMessages/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(remoteJid ? { where: { key: { remoteJid } } } : {}),
  });
  if (!res.ok) throw new Error(`Evolution findMessages failed: ${res.status}`);
  return res.json();
}
