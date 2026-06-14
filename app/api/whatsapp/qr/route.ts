import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createInstance,
  getQrCode,
  getConnectionState,
  setWebhook,
} from "@/lib/evolution/client";

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, wa_session_id")
    .eq("owner_id", userData.user.id)
    .single();

  if (clinicError || !clinic) {
    return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });
  }

  const instanceName = clinic.wa_session_id ?? `clinic_${clinic.id}`;

  try {
    const state = await getConnectionState(instanceName).catch(() => null);

    if (!state) {
      await createInstance(instanceName);
      await setWebhook(
        instanceName,
        `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/wa/${clinic.id}`
      );

      await supabase
        .from("clinics")
        .update({ wa_session_id: instanceName })
        .eq("id", clinic.id);
    }

    if (state?.instance?.state === "open") {
      return NextResponse.json({ connected: true });
    }

    const qr = await getQrCode(instanceName);
    return NextResponse.json({ connected: false, qr: qr.base64 ?? qr.qrcode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
