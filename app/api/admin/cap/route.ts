import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin, invalidateClinic } from "@/lib/conversation/db";
import { TIER_CAPS } from "@/lib/conversation/limits";

/** El administrador define el tope diario de mensajes automáticos de una clínica. */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const clinicId = String(body.clinicId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return NextResponse.json({ error: "clinicId inválido" }, { status: 400 });

  const db = admin();
  const { data: clinic } = await db.from("clinics").select("settings").eq("id", clinicId).maybeSingle();
  if (!clinic) return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });
  const settings = { ...((clinic.settings ?? {}) as Record<string, unknown>) };

  if (typeof body.enabled === "boolean") settings.daily_cap_enabled = body.enabled;
  if (typeof body.warmup === "boolean") settings.warmup_enabled = body.warmup;
  if (typeof body.tier === "string") {
    if (!TIER_CAPS[body.tier]) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
    settings.plan_tier = body.tier;
  }
  if ("custom" in body) {
    const n = Number(body.custom);
    if (body.custom === null || body.custom === "") delete settings.daily_send_cap;
    else if (Number.isFinite(n) && n > 0 && n <= 5000) settings.daily_send_cap = Math.floor(n);
    else return NextResponse.json({ error: "Tope inválido (1–5000)" }, { status: 400 });
  }

  const { error } = await db.from("clinics").update({ settings }).eq("id", clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateClinic(clinicId);
  return NextResponse.json({ ok: true });
}
