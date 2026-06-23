import { createClient } from "@/lib/supabase/server";
import { QRConnector } from "@/components/onboarding/QRConnector";
import { HistoricalSyncButton } from "@/components/onboarding/HistoricalSyncButton";
import { ReceptionistPhoneForm } from "@/components/onboarding/ReceptionistPhoneForm";
import { MaxDiscountForm } from "@/components/onboarding/MaxDiscountForm";

export default async function WhatsAppSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase
        .from("clinics")
        .select("receptionist_phone, max_discount_percent")
        .eq("owner_id", user.id)
        .single()
    : { data: null };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-2xl space-y-8 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conexión WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Conecta el WhatsApp de tu clínica escaneando el código QR.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <QRConnector />
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Notificaciones a recepcionista</h2>
        <ReceptionistPhoneForm
          initialPhone={clinic?.receptionist_phone ?? null}
        />
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Seguimiento automático</h2>
        <MaxDiscountForm initialPercent={clinic?.max_discount_percent ?? 10} />
      </section>

      <section className="space-y-2 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Sincronización histórica</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Importa las conversaciones previas para detectar pacientes y cohortes
          existentes.
        </p>
        <HistoricalSyncButton />
      </section>
    </div>
  );
}
