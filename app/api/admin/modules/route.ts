import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin, invalidateClinic } from "@/lib/conversation/db";

/** Solo el administrador de Cohortech activa o desactiva los módulos contratados por una clínica. */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const clinicId = String(body.clinicId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return NextResponse.json({ error: "clinicId inválido" }, { status: 400 });

  const db = admin();
  const { data: clinic } = await db.from("clinics").select("settings").eq("id", clinicId).maybeSingle();
  if (!clinic) return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });

  const settings = { ...((clinic.settings ?? {}) as Record<string, unknown>) };
  const current = {
    reception: true,
    recovery: true,
    multichannel: true,
    ...((settings.modules as object) ?? {}),
  } as Record<string, boolean>;
  if (typeof body.reception === "boolean") current.reception = body.reception;
  if (typeof body.recovery === "boolean") current.recovery = body.recovery;
  if (typeof body.multichannel === "boolean") current.multichannel = body.multichannel;
  settings.modules = current;

  const { error } = await db.from("clinics").update({ settings }).eq("id", clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateClinic(clinicId);
  return NextResponse.json({ ok: true, modules: current });
}
