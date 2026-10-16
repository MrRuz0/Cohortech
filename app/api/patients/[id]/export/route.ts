import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin } from "@/lib/conversation/db";

type Ctx = { params: Promise<{ id: string }> };

/** Descarga todos los datos de un paciente (derecho de acceso). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = admin();

  const { data: patient } = await db.from("patients").select("*").eq("id", id).eq("clinic_id", ctx.clinicId).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  const { data: messages } = await db
    .from("messages")
    .select("direction, content_text, sent_at, channel")
    .eq("patient_id", id)
    .eq("clinic_id", ctx.clinicId)
    .order("sent_at", { ascending: true });

  return new NextResponse(JSON.stringify({ patient, messages: messages ?? [] }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="paciente-${id}.json"`,
    },
  });
}
