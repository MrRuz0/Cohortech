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
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Cargando...
      </div>
    );
  }

  if (data?.error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
        Error: {data.error}
      </p>
    );
  }

  if (data?.connected) {
    return (
      <div className="animate-in fade-in zoom-in-95 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 duration-300">
        <span className="text-lg">✓</span>
        <p className="font-medium text-emerald-700">
          WhatsApp conectado correctamente
        </p>
      </div>
    );
  }

  if (data?.qr) {
    return (
      <div className="animate-in fade-in space-y-3 duration-500">
        <p className="text-sm text-muted-foreground">
          Escanea este código QR con WhatsApp (Dispositivos vinculados → Vincular
          un dispositivo).
        </p>
        <img
          src={data.qr}
          alt="QR de WhatsApp"
          className="h-64 w-64 rounded-xl border shadow-sm"
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          El código se actualiza automáticamente cada 5 segundos.
        </p>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">Generando código QR...</p>;
}
