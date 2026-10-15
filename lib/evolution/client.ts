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

export async function logoutInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution logout failed: ${res.status}`);
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

/** URL de webhook de una clínica, con el token compartido si está configurado. */
export function webhookUrlFor(clinicId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const token = process.env.WEBHOOK_SECRET;
  const url = `${base}/api/webhooks/wa/${clinicId}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export async function sendTextMessage(
  instanceName: string,
  number: string,
  text: string,
  opts?: { delayMs?: number }
) {
  const body: Record<string, unknown> = { number, text };
  // "delay" hace que WhatsApp muestre "escribiendo…" antes de enviar: se siente humano.
  if (opts?.delayMs && opts.delayMs > 0) body.delay = Math.round(opts.delayMs);
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Evolution sendText failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

/** Id del mensaje enviado (para reconocer el "eco" del webhook). */
export function sentMessageId(response: unknown): string | null {
  const r = response as { key?: { id?: string }; data?: { key?: { id?: string } } } | null;
  return r?.key?.id ?? r?.data?.key?.id ?? null;
}

export type LinkedAccount = { number: string | null; profileName: string | null; state: string | null };

/** Número, nombre de perfil y estado de TODAS las sesiones de WhatsApp (una sola llamada). */
export async function fetchLinkedAccounts(): Promise<Map<string, LinkedAccount>> {
  const out = new Map<string, LinkedAccount>();
  try {
    const res = await fetch(`${BASE_URL}/instance/fetchInstances`, {
      headers: headers(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return out;
    const list = (await res.json()) as unknown;
    if (!Array.isArray(list)) return out;
    for (const raw of list) {
      const i = (raw as { instance?: Record<string, unknown> }).instance ?? (raw as Record<string, unknown>);
      const name = String(i.name ?? i.instanceName ?? "");
      if (!name) continue;
      const digits = String(i.ownerJid ?? i.owner ?? i.number ?? "").split("@")[0].replace(/\D/g, "");
      out.set(name, {
        number: digits || null,
        profileName: typeof i.profileName === "string" && i.profileName ? i.profileName : null,
        state: typeof (i.connectionStatus ?? i.status) === "string" ? String(i.connectionStatus ?? i.status) : null,
      });
    }
  } catch {
    /* sin respuesta: el panel muestra "—" */
  }
  return out;
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
