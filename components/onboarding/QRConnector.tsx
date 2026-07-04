"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";

type QrResponse = {
  connected?: boolean;
  qr?: string;
  error?: string;
};

type Status = "loading" | "connected" | "awaiting_scan" | "generating" | "error";

export function QRConnector() {
  const [data, setData] = useState<QrResponse | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [disconnecting, setDisconnecting] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/whatsapp/qr");
      const json: QrResponse = await res.json();
      setData(json);
      if (json.error) setStatus("error");
      else if (json.connected) setStatus("connected");
      else if (json.qr) setStatus("awaiting_scan");
      else setStatus("generating");
    } catch {
      setData({ error: "No se pudo conectar con el servidor de WhatsApp" });
      setStatus("error");
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/whatsapp/disconnect", { method: "POST" });
    setDisconnecting(false);
    fetchStatus();
  }

  // ── Loading ──────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Verificando estado de conexión...
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="space-y-3">
        <StatusIndicator level="error" label="Sin conexión con el servidor" />
        <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {data?.error}
        </p>
        <button
          onClick={fetchStatus}
          className="text-sm text-primary hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────
  if (status === "connected") {
    return (
      <div className="space-y-4">
        <StatusIndicator level="connected" label="WhatsApp conectado y activo" />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          Tu WhatsApp está vinculado. El sistema recibe y procesa mensajes automáticamente.
        </div>
        <ConfirmDialog
          trigger={
            <button className="text-xs text-red-500 hover:underline">
              {disconnecting ? "Desconectando..." : "Desconectar WhatsApp"}
            </button>
          }
          title="¿Desconectar WhatsApp?"
          description="El sistema dejará de recibir mensajes automáticamente. Podrás reconectar en cualquier momento."
          confirmLabel="Sí, desconectar"
          danger
          onConfirm={handleDisconnect}
        />
      </div>
    );
  }

  // ── Generating QR ────────────────────────────────────────
  if (status === "generating") {
    return (
      <div className="space-y-3">
        <StatusIndicator level="waiting" label="Generando código QR..." />
        <div className="flex h-64 w-64 items-center justify-center rounded-xl border bg-muted/30">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // ── Awaiting scan ────────────────────────────────────────
  return (
    <div className="space-y-4">
      <StatusIndicator level="waiting" label="Esperando escaneo del QR" />
      <p className="text-sm text-muted-foreground">
        Abre WhatsApp en tu teléfono →{" "}
        <strong>Dispositivos vinculados</strong> →{" "}
        <strong>Vincular un dispositivo</strong> → escanea este código.
      </p>
      <img
        src={data?.qr}
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

function StatusIndicator({
  level,
  label,
}: {
  level: "connected" | "waiting" | "error";
  label: string;
}) {
  const styles = {
    connected: "bg-emerald-500",
    waiting: "bg-yellow-400 animate-pulse",
    error: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${styles[level]}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
