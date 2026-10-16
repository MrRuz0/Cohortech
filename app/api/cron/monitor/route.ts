import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/conversation/db";
import { logError } from "@/lib/conversation/log";
import { getConnectionState } from "@/lib/evolution/client";

export const maxDuration = 60;

/** Vigila que cada WhatsApp conectado siga conectado y deja una alerta en la auditoría si no. */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: clinics } = await admin().from("clinics").select("id, name, wa_session_id").not("wa_session_id", "is", null);
  let down = 0;
  for (const c of clinics ?? []) {
    try {
      const state = await getConnectionState(c.wa_session_id as string);
      const status = String(state?.instance?.state ?? state?.state ?? "unknown");
      if (status !== "open") {
        down++;
        await logError("monitor", `WhatsApp desconectado: ${c.name} (${status})`, new Error(status), { clinicId: c.id });
      }
    } catch (err) {
      down++;
      await logError("monitor", `No se pudo consultar WhatsApp de ${c.name}`, err, { clinicId: c.id });
    }
  }
  return NextResponse.json({ ok: true, checked: clinics?.length ?? 0, down });
}
