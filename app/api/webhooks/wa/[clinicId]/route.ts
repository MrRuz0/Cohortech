import { after, NextRequest, NextResponse } from "next/server";
import { processEvolutionPayload } from "@/lib/channels/whatsapp";
import { logError, logWarn } from "@/lib/conversation/log";

// El procesamiento (espera de 3.5 s + IA + envío con "escribiendo…") corre
// después de responder a Evolution API, por eso necesita margen de tiempo.
export const maxDuration = 60;

let lastRejectLog = 0;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  if (!UUID_RE.test(clinicId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Sin este token cualquiera podría fabricar mensajes y hacer que el número
  // de la clínica escriba a terceros.
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const token =
      new URL(request.url).searchParams.get("token") ?? request.headers.get("x-webhook-token");
    if (token !== secret) {
      // Sin esto, un atacante podría llenar el registro de eventos.
      if (Date.now() - lastRejectLog > 60_000) {
        lastRejectLog = Date.now();
        await logWarn("wa-webhook", "Se rechazó una llamada al webhook con token inválido", { clinicId });
      }
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // `after` garantiza que el trabajo termine aunque ya se haya respondido
  // (con queueMicrotask, Vercel podía congelar la función y perder mensajes).
  after(async () => {
    try {
      const result = await processEvolutionPayload(clinicId, body);
      if (result.status !== "ignored") console.log(`[wa-webhook] ${clinicId}`, JSON.stringify(result).slice(0, 300));
    } catch (err) {
      await logError("wa-webhook", "Error procesando un mensaje entrante", err, { clinicId });
    }
  });

  return NextResponse.json({ ok: true });
}
