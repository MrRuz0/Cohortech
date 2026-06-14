import { QRConnector } from "@/components/onboarding/QRConnector";

export default function WhatsAppSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conexión WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Conecta el WhatsApp de tu clínica escaneando el código QR.
        </p>
      </div>
      <QRConnector />
    </div>
  );
}
