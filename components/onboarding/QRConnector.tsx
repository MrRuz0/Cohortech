"use client";

import { useEffect, useState } from "react";

type QrResponse = {
  connected?: boolean;
  qr?: string;
  error?: string;
};

export function QRConnector() {
  const [data, setData] = useState<QrResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/whatsapp/qr");
      const json: QrResponse = await res.json();
      setData(json);
    } catch {
      setData({ error: "No se pudo conectar con el servidor" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando...</p>;
  }

  if (data?.error) {
    return <p className="text-sm text-red-600">Error: {data.error}</p>;
  }

  if (data?.connected) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-medium text-green-700">
          WhatsApp conectado correctamente ✓
        </p>
      </div>
    );
  }

  if (data?.qr) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Escanea este código QR con WhatsApp (Dispositivos vinculados → Vincular
          un dispositivo).
        </p>
        <img
          src={data.qr}
          alt="QR de WhatsApp"
          className="h-64 w-64 rounded-lg border"
        />
        <p className="text-xs text-gray-400">
          El código se actualiza automáticamente cada 5 segundos.
        </p>
      </div>
    );
  }

  return <p className="text-sm text-gray-500">Generando código QR...</p>;
}
