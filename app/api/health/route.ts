import { NextRequest, NextResponse } from "next/server";
import { admin, getSchemaFlags } from "@/lib/conversation/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Chequeo de salud. Público: solo { ok }. Con `Authorization: Bearer CRON_SECRET`
 * devuelve el detalle de cada componente (útil desde el celular o un monitor).
 */
export async function GET(request: NextRequest) {
  const detailed = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const { error } = await admin().from("clinics").select("id", { head: true, count: "exact" }).limit(1);
    checks.database = error ? { ok: false, detail: error.message } : { ok: true };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : "error" };
  }

  try {
    const flags = await getSchemaFlags(true);
    checks.migration_0010 = {
      ok: flags.patientsExtended && flags.messagesExtended && flags.promotions,
      detail: JSON.stringify(flags),
    };
  } catch (err) {
    checks.migration_0010 = { ok: false, detail: err instanceof Error ? err.message : "error" };
  }

  const evo = process.env.EVOLUTION_API_URL;
  if (evo) {
    try {
      const res = await fetch(evo, { signal: AbortSignal.timeout(6000) });
      checks.whatsapp_api = { ok: res.ok, detail: `HTTP ${res.status}` };
    } catch (err) {
      checks.whatsapp_api = { ok: false, detail: err instanceof Error ? err.message : "sin respuesta" };
    }
  } else {
    checks.whatsapp_api = { ok: false, detail: "EVOLUTION_API_URL no configurada" };
  }

  checks.openai_key = { ok: !!process.env.OPENAI_API_KEY };
  checks.webhook_secret = { ok: !!process.env.WEBHOOK_SECRET, detail: "protege el webhook de WhatsApp" };
  checks.cron_secret = { ok: !!process.env.CRON_SECRET };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(detailed ? { ok, checks } : { ok }, { status: ok ? 200 : 503 });
}
