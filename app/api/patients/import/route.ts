import { NextRequest, NextResponse } from "next/server";
import { requireClinic } from "@/lib/conversation/auth";
import { admin } from "@/lib/conversation/db";

const MAX_ROWS = 2000;

/** Importa pacientes con su fecha real de última visita: { rows: [{ name, phone, lastVisit }] } (YYYY-MM-DD o DD/MM/YYYY). */
export async function POST(request: NextRequest) {
  const ctx = await requireClinic();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rows: unknown[] = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) return NextResponse.json({ error: "Sin filas" }, { status: 400 });

  const db = admin();
  let created = 0;
  let updated = 0;
  let invalid = 0;

  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const phone = String(r.phone ?? "").replace(/\D/g, "");
    if (!/^\d{7,16}$/.test(phone)) {
      invalid++;
      continue;
    }
    const name = String(r.name ?? "").trim().slice(0, 120) || null;
    const date = parseDate(String(r.lastVisit ?? ""));
    if (date && date.getTime() > Date.now()) {
      invalid++;
      continue;
    }

    const { data: existing } = await db
      .from("patients")
      .select("id, last_contact_at, full_name")
      .eq("clinic_id", ctx.clinicId)
      .eq("phone_e164", phone)
      .maybeSingle();

    if (existing) {
      const upd: Record<string, unknown> = {};
      const cur = existing.last_contact_at ? new Date(existing.last_contact_at).getTime() : 0;
      if (date && date.getTime() > cur) upd.last_contact_at = date.toISOString();
      if (!existing.full_name && name) upd.full_name = name;
      if (Object.keys(upd).length) await db.from("patients").update(upd).eq("id", existing.id);
      updated++;
    } else {
      const { error } = await db.from("patients").insert({
        clinic_id: ctx.clinicId,
        phone_e164: phone,
        full_name: name,
        channel_source: "whatsapp",
        status: "lead",
        last_contact_at: date ? date.toISOString() : null,
      });
      if (error) invalid++;
      else created++;
    }
  }

  return NextResponse.json({ ok: true, created, updated, invalid });
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
