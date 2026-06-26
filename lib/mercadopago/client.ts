import { MercadoPagoConfig, PreApproval } from "mercadopago";

let _client: MercadoPagoConfig | null = null;
function getClient() {
  if (!_client) {
    _client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
    });
  }
  return _client;
}

const PLAN_PRICE_PEN = 290; // ~$79 USD
const TRIAL_DAYS = 7;

export async function createSubscriptionCheckout({
  payerEmail,
  clinicId,
}: {
  payerEmail: string;
  clinicId: string;
}) {
  const preapproval = new PreApproval(getClient());

  const result = await preapproval.create({
    body: {
      reason: "Cohortech - Plan mensual",
      external_reference: clinicId,
      payer_email: payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PLAN_PRICE_PEN,
        currency_id: "PEN",
        free_trial: {
          frequency: TRIAL_DAYS,
          frequency_type: "days",
        },
      } as any,
      back_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });

  return result;
}

export async function getSubscription(preapprovalId: string) {
  const preapproval = new PreApproval(getClient());
  return preapproval.get({ id: preapprovalId });
}

export async function cancelSubscription(preapprovalId: string) {
  const preapproval = new PreApproval(getClient());
  return preapproval.update({
    id: preapprovalId,
    body: { status: "cancelled" },
  });
}
