import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin } from "@/lib/conversation/db";

export async function GET() {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await admin()
    .from("promotions")
    .select("*")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promotions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const pctRaw = body?.discount_percent;
  const pct = pctRaw === null || pctRaw === undefined || pctRaw === "" ? null : Number(pctRaw);
  if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 90)) {
    return NextResponse.json({ error: "El descuento debe estar entre 1% y 90%" }, { status: 400 });
  }

  const endsAt = body?.ends_at ? new Date(body.ends_at) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Fecha de término inválida" }, { status: 400 });
  }
  // Una promo que vence "hoy" debe durar todo el día.
  if (endsAt) endsAt.setHours(23, 59, 59, 999);

  const { data, error } = await admin()
    .from("promotions")
    .insert({
      clinic_id: ctx.clinicId,
      name,
      description: body?.description ? String(body.description).trim().slice(0, 240) : null,
      discount_percent: pct,
      service_name: body?.service_name ? String(body.service_name).trim().slice(0, 120) : null,
      ends_at: endsAt ? endsAt.toISOString() : null,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promotion: data });
}
