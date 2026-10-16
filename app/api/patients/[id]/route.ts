import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin, getSchemaFlags } from "@/lib/conversation/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Acciones de la clínica sobre un paciente:
 *   { action: "block" | "unblock" }        → bloquear / desbloquear
 *   { action: "takeover" | "resume_bot" }  → tomar el control (pausa 24 h) / reactivar el asistente
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const flags = await getSchemaFlags();
  if (!flags.patientsExtended) {
    return NextResponse.json(
      { error: "Falta aplicar la migración 0010 en Supabase para usar esta función." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const now = new Date();
  let updates: Record<string, unknown>;

  switch (action) {
    case "block":
      updates = { is_blocked: true, blocked_reason: "manual", blocked_at: now.toISOString() };
      break;
    case "unblock":
      updates = { is_blocked: false, blocked_reason: null, blocked_at: null };
      break;
    case "takeover":
      updates = { bot_paused_until: new Date(now.getTime() + 24 * 3_600_000).toISOString() };
      break;
    case "resume_bot":
      updates = { bot_paused_until: null };
      break;
    default:
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  const db = admin();
  const { data, error } = await db
    .from("patients")
    .update(updates)
    .eq("id", id)
    .eq("clinic_id", ctx.clinicId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  // Bloquear = ningún seguimiento automático nunca más.
  if (action === "block") {
    await db
      .from("cohort_memberships")
      .update({ next_followup_at: null })
      .eq("patient_id", id)
      .eq("membership_status", "active");
  }

  return NextResponse.json({ ok: true });
}

/** Elimina por completo al paciente y su historial (derecho de supresión). */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = admin();

  const { data: patient } = await db.from("patients").select("id").eq("id", id).eq("clinic_id", ctx.clinicId).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  await db.from("messages").delete().eq("patient_id", id).eq("clinic_id", ctx.clinicId);
  await db.from("cohort_memberships").delete().eq("patient_id", id).eq("clinic_id", ctx.clinicId);
  const { error } = await db.from("patients").delete().eq("id", id).eq("clinic_id", ctx.clinicId);
  if (error) return NextResponse.json({ error: "No se pudo eliminar (tiene datos asociados)" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
