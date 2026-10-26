"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Aprobar los seguimientos de una cohorte que llegó importada desde Recepción IA (estaban en pausa). */
export function ApproveImportedCohort({ cohortId, name, count }: { cohortId: string; name: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (!window.confirm(`¿Activar el seguimiento automático para «${name}» (${count} pacientes)? Empezarán a recibir mensajes con el horario y el tope diario de siempre.`)) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/cohorts/${cohortId}/approve`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? "No se pudo aprobar.");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{count} pacientes · seguimiento en pausa</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Activando…" : "Aprobar seguimiento"}
      </button>
    </div>
  );
}
