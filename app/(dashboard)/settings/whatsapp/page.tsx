import { QRConnector } from "@/components/onboarding/QRConnector";
import { HistoricalSyncButton } from "@/components/onboarding/HistoricalSyncButton";

export default function WhatsAppSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conexión WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Conecta el WhatsApp de tu clínica escaneando el código QR.
        </p>
      </div>
      <QRConnector />
      <div>
        <h2 className="text-lg font-semibold">Sincronización histórica</h2>
        <p className="mb-2 text-sm text-gray-500">
          Importa las conversaciones previas para detectar pacientes y cohortes existentes.
        </p>
        <HistoricalSyncButton />
      </div>
    </div>
  );
}
