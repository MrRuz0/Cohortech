import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubscription } from "@/lib/mercadopago/client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATUS_MAP: Record<string, string> = {
  authorized: "active",
  paused: "past_due",
  cancelled: "canceled",
  pending: "trialing",
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  // MercadoPago sends { type: "subscription_preapproval" | "payment", data: { id } }
  const type = body.type ?? body.topic;
  const id = body.data?.id ?? body.id;

  if (type === "subscription_preapproval" || type === "preapproval") {
    try {
      const preapproval = await getSubscription(id);
      const mappedStatus = STATUS_MAP[preapproval.status ?? ""] ?? "past_due";

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: mappedStatus,
          current_period_end:
            (preapproval.auto_recurring as { start_date?: string } | undefined)
              ?.start_date ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("mp_preapproval_id", id);
    } catch (err) {
      console.error("Error procesando webhook de suscripción:", err);
    }
  }

  // Payment events (recurring charges) — mark past_due on rejection
  if (type === "payment") {
    try {
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN!;
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payment = await res.json();

      if (payment.status === "rejected" && payment.metadata?.preapproval_id) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("mp_preapproval_id", payment.metadata.preapproval_id);
      }

      if (payment.status === "approved" && payment.metadata?.preapproval_id) {
        const nextPeriodEnd = new Date();
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            current_period_end: nextPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("mp_preapproval_id", payment.metadata.preapproval_id);
      }
    } catch (err) {
      console.error("Error procesando webhook de pago:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
