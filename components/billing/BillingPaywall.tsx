import Link from "next/link";

const MESSAGES: Record<string, { title: string; description: string }> = {
  pending: {
    title: "Falta confirmar tu método de pago",
    description:
      "Aún no terminaste de agregar tu tarjeta en MercadoPago. Complétalo para activar tu prueba gratis de 7 días.",
  },
  past_due: {
    title: "No pudimos cobrar tu suscripción",
    description:
      "Hubo un problema con tu método de pago. Actualiza tu tarjeta para seguir usando Cohortech sin interrupciones.",
  },
  canceled: {
    title: "Tu suscripción está cancelada",
    description:
      "Reactiva tu plan para volver a tener acceso al panel y a todas las automatizaciones de tu clínica.",
  },
};

export function BillingPaywall({ status }: { status: string }) {
  const copy = MESSAGES[status] ?? MESSAGES.past_due;

  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
        ⚠️
      </div>
      <h1 className="mt-4 text-lg font-bold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      <Link
        href="/dashboard/settings/billing"
        className="mt-6 inline-block rounded-lg bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Actualizar método de pago
      </Link>
    </div>
  );
}
