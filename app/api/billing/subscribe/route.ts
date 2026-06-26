import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckout } from "@/lib/mercadopago/client";

export async function POST(_request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!clinic) {
    return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });
  }

  try {
    const subscription = await createSubscriptionCheckout({
      payerEmail: user.email,
      clinicId: clinic.id,
    });

    await supabase.from("subscriptions").upsert(
      {
        clinic_id: clinic.id,
        status: "trialing",
        mp_preapproval_id: subscription.id,
        payer_email: user.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" }
    );

    return NextResponse.json({ ok: true, initPoint: subscription.init_point });
  } catch (err) {
    console.error("Error creando suscripción MercadoPago:", err);
    const message =
      err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
