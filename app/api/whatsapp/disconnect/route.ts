import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logoutInstance } from "@/lib/evolution/client";

export async function POST() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, wa_session_id")
    .eq("owner_id", userData.user.id)
    .single();

  if (!clinic?.wa_session_id) {
    return NextResponse.json({ error: "No hay sesión activa" }, { status: 400 });
  }

  try {
    await logoutInstance(clinic.wa_session_id).catch(() => {
      // Instance may already be logged out on Evolution's side — still clear our state
    });

    await supabase
      .from("clinics")
      .update({ wa_session_id: null })
      .eq("id", clinic.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
