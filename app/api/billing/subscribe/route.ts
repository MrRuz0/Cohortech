import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSubscription } from "@/lib/mercadopago/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardTokenId } = await request.json();
  if (!cardTokenId) {
    return NextResponse.json({ error: "Falta cardTokenId" }, { status: 400 });
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
    const subscription = await createSubscription({
      cardTokenId,
      payerEmail: user.email,
      clinicId: clinic.id,
    });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    await supabase.from("subscriptions").upsert(
      {
        clinic_id: clinic.id,
        status: "trialing",
        trial_ends_at: trialEndsAt.toISOString(),
        mp_preapproval_id: subscription.id,
        payer_email: user.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id" }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error creando suscripción MercadoPago:", err);
    const message =
      err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
