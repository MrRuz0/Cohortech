import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["receptionist_phone", "clinic_description", "name"] as const;
  const updates: Record<string, string | number> = {};

  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if ("max_discount_percent" in body) {
    const pct = Number(body.max_discount_percent);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      updates.max_discount_percent = pct;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("clinics")
    .update(updates)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
