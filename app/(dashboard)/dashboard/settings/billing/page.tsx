import { createClient } from "@/lib/supabase/server";
import { CardCaptureForm } from "@/components/billing/CardCaptureForm";
import { CancelSubscriptionButton } from "@/components/billing/CancelSubscriptionButton";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Falta confirmar tarjeta", color: "bg-amber-100 text-amber-700" },
  trialing: { label: "Prueba gratis activa", color: "bg-blue-100 text-blue-700" },
  active: { label: "Activa", color: "bg-emerald-100 text-emerald-700" },
  past_due: { label: "Pago fallido", color: "bg-red-100 text-red-700" },
  canceled: { label: "Cancelada", color: "bg-gray-100 text-gray-600" },
};

export default async function BillingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase.from("clinics").select("id").eq("owner_id", user.id).single()
    : { data: null };

  const { data: subscription } = clinic
    ? await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end, mp_preapproval_id")
        .eq("clinic_id", clinic.id)
        .single()
    : { data: null };

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] ?? STATUS_LABELS.active
    : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-lg space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tu plan y método de pago.
        </p>
      </div>

      {subscription ? (
        <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Plan Cohortech — $79/mes</p>
            {statusInfo && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )}
          </div>

          {subscription.status === "trialing" && subscription.trial_ends_at && (
            <p className="text-sm text-muted-foreground">
              Tu prueba gratis termina el{" "}
              {new Date(subscription.trial_ends_at).toLocaleDateString("es", {
                day: "numeric",
                month: "long",
              })}
              . Después de eso se cobrará automáticamente a tu tarjeta.
            </p>
          )}

          {subscription.status === "active" && subscription.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Próximo cobro:{" "}
              {new Date(subscription.current_period_end).toLocaleDateString("es", {
                day: "numeric",
                month: "long",
              })}
            </p>
          )}

          {(subscription.status === "past_due" ||
            subscription.status === "canceled" ||
            subscription.status === "pending") && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {subscription.status === "pending"
                  ? "Termina de agregar tu tarjeta en MercadoPago para activar tu prueba gratis."
                  : "Actualiza tu tarjeta para reactivar tu suscripción."}
              </p>
              <CardCaptureForm />
            </div>
          )}

          {(subscription.status === "active" || subscription.status === "trialing") &&
            subscription.mp_preapproval_id && (
              <div className="border-t pt-4">
                <CancelSubscriptionButton preapprovalId={subscription.mp_preapproval_id} />
              </div>
            )}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            No tienes una suscripción activa todavía.
          </p>
          <CardCaptureForm />
        </div>
      )}
    </div>
  );
}
