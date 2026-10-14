import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin } from "@/lib/conversation/db";

/** Marca eventos como resueltos: { ids: string[] }. */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "Sin ids" }, { status: 400 });

  const { error } = await admin()
    .from("system_events")
    .update({ resolved_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resolved: ids.length });
}
