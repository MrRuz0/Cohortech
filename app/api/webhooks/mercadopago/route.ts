import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { getSubscription } from "@/lib/mercadopago/client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// "authorized" = MercadoPago confirmed the card; the free_trial window inside
// auto_recurring delays the first real charge, so we mark it "trialing" here.
// "pending" means the user has not finished entering card details yet — no access.
const STATUS_MAP: Record<string, string> = {
  authorized: "trialing",
  paused: "past_due",
  cancelled: "canceled",
  pending: "pending",
};

/** Valida x-signature de MercadoPago (HMAC-SHA256 de "id;request-id;ts"). Sin secreto configurado no bloquea:
 *  el handler igual consulta el estado real a la API de MP, así que un POST falso no puede cambiar nada. */
function validSignature(request: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const sigId = String(request.nextUrl.searchParams.get("data.id") ?? body.data?.id ?? body.id ?? "");
  if (!validSignature(request, sigId)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // MercadoPago sends { type: "subscription_preapproval" | "payment", data: { id } }
  const type = body.type ?? body.topic;
  const id = body.data?.id ?? body.id;

  if (type === "subscription_preapproval" || type === "preapproval") {
    try {
      const preapproval = await getSubscription(id);
      const mappedStatus = STATUS_MAP[preapproval.status ?? ""] ?? "past_due";

      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("trial_ends_at")
        .eq("mp_preapproval_id", id)
        .single();

      const trialEndsAt =
        mappedStatus === "trialing" && !existing?.trial_ends_at
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: mappedStatus,
          ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
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
