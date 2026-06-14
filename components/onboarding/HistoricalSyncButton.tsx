"use client";

import { useState } from "react";

export function HistoricalSyncButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ imported: number; queued: number } | null>(null);

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
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status === "loading" ? "Sincronizando..." : "Sincronizar historial de WhatsApp"}
      </button>
      {status === "done" && result && (
        <p className="text-sm text-green-700">
          {result.imported} mensajes importados, {result.queued} en análisis.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">Error al sincronizar el historial.</p>
      )}
    </div>
  );
}
