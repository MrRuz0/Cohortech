import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin } from "@/lib/conversation/db";
import { logEvent } from "@/lib/conversation/log";

/**
 * "Entrar como la clínica": genera un enlace de acceso de un solo uso para el dueño de la
 * clínica. Ábrelo en una ventana privada para no cerrar tu sesión de administrador.
 * Cada uso queda registrado en la auditoría.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const clinicId = String(body.clinicId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return NextResponse.json({ error: "clinicId inválido" }, { status: 400 });

  const db = admin();
  const { data: clinic } = await db.from("clinics").select("id, name, owner_id").eq("id", clinicId).maybeSingle();
  if (!clinic?.owner_id) return NextResponse.json({ error: "La clínica no tiene un usuario dueño" }, { status: 404 });

  const { data: user, error: uErr } = await db.auth.admin.getUserById(clinic.owner_id);
  const email = user?.user?.email;
  if (uErr || !email) return NextResponse.json({ error: "No se encontró el correo del dueño" }, { status: 404 });

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://cohortech.vercel.app").replace(/\/+$/, "");
  const { data: link, error: lErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${base}/dashboard` },
  });
  if (lErr || !link?.properties?.action_link) {
    return NextResponse.json({ error: lErr?.message ?? "No se pudo generar el enlace" }, { status: 500 });
  }

  await logEvent({
    level: "info",
    source: "admin",
    message: `El administrador entró como la clínica "${clinic.name}"`,
    detail: { email },
    clinicId: clinic.id,
  });

  return NextResponse.json({ ok: true, url: link.properties.action_link, email });
}
