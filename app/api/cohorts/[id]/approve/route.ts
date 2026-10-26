import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin, invalidateClinic } from "@/lib/conversation/db";
import { logError } from "@/lib/conversation/log";

/**
 * Aprueba los seguimientos de una cohorte importada desde Recepción IA: hasta ahora estaban en pausa.
 * Al aprobar, los pacientes de la cohorte (que no estén bloqueados) quedan listos para el seguimiento automático,
 * que sale con el horario y el tope diario de siempre.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: cohortId } = await params;
  const db = admin();

  const { data: clinic } = await db.from("clinics").select("id, settings").eq("id", ctx.clinicId).single();
  const imp = (clinic?.settings as any)?.recepcion?.import;
  const pending: { cohort_id: string; name: string; count: number }[] = Array.isArray(imp?.pending) ? imp.pending : [];
  if (!pending.some((c) => c.cohort_id === cohortId)) return NextResponse.json({ error: "Esa cohorte no está pendiente de aprobación." }, { status: 404 });

  try {
    const { data: members } = await db
      .from("cohort_memberships")
      .select("id, patient_id, patients(is_blocked)")
      .eq("cohort_id", cohortId)
      .eq("clinic_id", ctx.clinicId)
      .eq("membership_status", "active")
      .is("next_followup_at", null);
    const ready = ((members ?? []) as any[]).filter((m) => (Array.isArray(m.patients) ? m.patients[0] : m.patients)?.is_blocked !== true).map((m) => m.id as string);
    const nowIso = new Date().toISOString();
    let activated = 0;
    for (let i = 0; i < ready.length; i += 200) {
      const part = ready.slice(i, i + 200);
      const { error } = await db.from("cohort_memberships").update({ next_followup_at: nowIso }).in("id", part);
      if (error) throw error;
      activated += part.length;
    }
    const settings = {
      ...(clinic?.settings as object),
      recepcion: { ...(clinic?.settings as any)?.recepcion, import: { ...imp, pending: pending.filter((c) => c.cohort_id !== cohortId) } },
    };
    await db.from("clinics").update({ settings }).eq("id", ctx.clinicId);
    invalidateClinic(ctx.clinicId);
    return NextResponse.json({ ok: true, activated });
  } catch (err) {
    await logError("cohort.approve", "No se pudo aprobar la cohorte", err, { clinicId: ctx.clinicId });
    return NextResponse.json({ error: "No se pudo aprobar. Inténtalo de nuevo." }, { status: 500 });
  }
}
