"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PatientActions({
  patientId,
  isBlocked,
  botPaused,
}: {
  patientId: string;
  isBlocked: boolean;
  botPaused: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: "block" | "unblock" | "takeover" | "resume_bot", confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "No se pudo completar la acción");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50";

  return (
    <div className="flex flex-wrap gap-1.5">
      {botPaused ? (
        <button disabled={busy} className={btn} onClick={() => run("resume_bot")}>
          Reactivar asistente
        </button>
      ) : (
        <button
          disabled={busy || isBlocked}
          className={btn}
          onClick={() => run("takeover", "El asistente dejará de responder a este paciente durante 24 horas. ¿Continuar?")}
        >
          Tomar control
        </button>
      )}
      {isBlocked ? (
        <button disabled={busy} className={btn} onClick={() => run("unblock")}>
          Desbloquear
        </button>
      ) : (
        <button
          disabled={busy}
          className={`${btn} border-error/30 text-error hover:bg-error/10`}
          onClick={() =>
            run("block", "Este contacto no recibirá respuestas ni mensajes automáticos. ¿Bloquear?")
          }
        >
          Bloquear
        </button>
      )}
    </div>
  );
}
