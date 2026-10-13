"use client";

import { useState } from "react";

export function HistoricalSyncButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ imported: number; patients: number } | null>(null);

  async function handleSync() {
    setStatus("loading");
    try {
      const res = await fetch("/api/onboarding/historical-sync", { method: "POST" });
      if (!res.ok) throw new Error("sync_failed");
      const json = await res.json();
      setResult(json);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={status === "loading"}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Sincronizando..." : "Sincronizar historial de WhatsApp"}
      </button>
      {status === "done" && result && (
        <p className="text-sm text-exito">
          {result.patients} pacientes y {result.imported} mensajes importados. No se envió ningún mensaje.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-error">Error al sincronizar el historial.</p>
      )}
    </div>
  );
}
