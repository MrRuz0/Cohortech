import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { services, booking_link, booking_phone, address, hours, max_discount_percent } =
    await request.json();

  // Fetch current settings to merge
  const { data: clinic } = await supabaseAdmin
    .from("clinics")
    .select("id, settings")
    .eq("owner_id", user.id)
    .single();

  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

  const updatedSettings = {
    ...(clinic.settings as object),
    services,
    booking_link,
    booking_phone,
    address,
    hours,
  };

  const { error } = await supabaseAdmin
    .from("clinics")
    .update({
      settings: updatedSettings,
      max_discount_percent,
    })
    .eq("id", clinic.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
