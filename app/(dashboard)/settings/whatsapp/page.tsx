import { createClient } from "@/lib/supabase/server";
import { QRConnector } from "@/components/onboarding/QRConnector";
import { HistoricalSyncButton } from "@/components/onboarding/HistoricalSyncButton";
import { ReceptionistPhoneForm } from "@/components/onboarding/ReceptionistPhoneForm";

export default async function WhatsAppSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase
        .from("clinics")
        .select("receptionist_phone")
        .eq("owner_id", user.id)
        .single()
    : { data: null };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Conexión WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Conecta el WhatsApp de tu clínica escaneando el código QR.
        </p>
      </div>

      <QRConnector />

      <hr />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Notificaciones a recepcionista</h2>
        <ReceptionistPhoneForm
          initialPhone={clinic?.receptionist_phone ?? null}
        />
      </div>

      <hr />

      <div>
        <h2 className="text-lg font-semibold">Sincronización histórica</h2>
        <p className="mb-2 text-sm text-gray-500">
          Importa las conversaciones previas para detectar pacientes y cohortes
          existentes.
        </p>
        <HistoricalSyncButton />
      </div>
    </div>
  );
}
