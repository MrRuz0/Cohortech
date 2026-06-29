// Billing gate is disabled for now — cobro manual mientras se gestiona el RUC
// y se integra Stripe. No borrar la lógica de abajo, solo está comentada.
export default async function GatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
