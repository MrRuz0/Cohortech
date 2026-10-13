import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin, invalidateClinic } from "@/lib/conversation/db";

/** Interruptores del asistente y configuración de canales. */
export async function GET() {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await admin().from("clinics").select("id, settings").eq("id", ctx.clinicId).single();
  const s = (data?.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    clinicId: ctx.clinicId,
    botPaused: s.bot_paused === true,
    webchatEnabled: s.webchat_enabled !== false,
    paymentMethods: typeof s.payment_methods === "string" ? s.payment_methods : "",
    reactivationAfterDays: typeof s.reactivation_after_days === "number" ? s.reactivation_after_days : 90,
    metaPageId: typeof s.meta_page_id === "string" ? s.meta_page_id : "",
    // El token nunca vuelve al navegador: solo se informa si existe.
    metaTokenSet: typeof s.meta_page_token === "string" && s.meta_page_token.length > 0,
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = admin();
  const { data: clinic } = await db.from("clinics").select("settings").eq("id", ctx.clinicId).single();
  const settings = { ...((clinic?.settings ?? {}) as Record<string, unknown>) };

  if (typeof body.botPaused === "boolean") settings.bot_paused = body.botPaused;
  if (typeof body.webchatEnabled === "boolean") settings.webchat_enabled = body.webchatEnabled;
  if (typeof body.paymentMethods === "string") settings.payment_methods = body.paymentMethods.trim().slice(0, 300);
  if (body.reactivationAfterDays !== undefined) {
    const n = Number(body.reactivationAfterDays);
    if (!Number.isInteger(n) || n < 30 || n > 720) {
      return NextResponse.json({ error: "Los días de inactividad deben estar entre 30 y 720" }, { status: 400 });
    }
    settings.reactivation_after_days = n;
  }
  if (typeof body.metaPageId === "string") settings.meta_page_id = body.metaPageId.trim().slice(0, 64);
  if (typeof body.metaPageToken === "string" && body.metaPageToken.trim()) {
    settings.meta_page_token = body.metaPageToken.trim().slice(0, 600);
  }

  const { error } = await db.from("clinics").update({ settings }).eq("id", ctx.clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateClinic(ctx.clinicId);
  return NextResponse.json({ ok: true });
}
