import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin, invalidateClinic } from "@/lib/conversation/db";
import { logEvent } from "@/lib/conversation/log";

const DAYS: Record<string, number> = { add30: 30, add90: 90, add365: 365 };

/**
 * Cobro manual: el administrador extiende o suspende el plan de una clínica.
 *   { clinicId, action: "add30" | "add90" | "add365" | "suspend" }
 */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const clinicId = String(body.clinicId ?? "");
  const action = String(body.action ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return NextResponse.json({ error: "clinicId inválido" }, { status: 400 });

  const db = admin();
  const { data: clinic, error } = await db
    .from("clinics")
    .select("id, name, plan_status, plan_expires_at")
    .eq("id", clinicId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "Falta aplicar la migración 0012 en Supabase para gestionar planes." },
      { status: 409 }
    );
  }
  if (!clinic) return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });

  let updates: Record<string, unknown>;
  if (action === "suspend") {
    updates = { plan_status: "suspended" };
  } else if (DAYS[action]) {
    // Se suma desde el vencimiento actual si todavía no venció; si ya venció, desde hoy.
    const current = clinic.plan_expires_at ? new Date(clinic.plan_expires_at).getTime() : 0;
    const base = new Date(Math.max(Date.now(), current));
    base.setDate(base.getDate() + DAYS[action]);
    updates = { plan_status: "active", plan_expires_at: base.toISOString() };
  } else {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  const { error: uErr } = await db.from("clinics").update(updates).eq("id", clinicId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  invalidateClinic(clinicId);

  await logEvent({
    level: "info",
    source: "admin",
    message: `Plan de "${clinic.name}": ${action}`,
    detail: { action, ...updates },
    clinicId,
  });
  return NextResponse.json({ ok: true, ...updates });
}
