"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanActions({ clinicId, suspended }: { clinicId: string; suspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: "add30" | "add90" | "add365" | "suspend") {
    if (action === "suspend" && !confirm("El asistente dejará de responder y de enviar mensajes a esta clínica. ¿Suspender?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(json.error ?? "No se pudo cambiar el plan");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const base = "rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => run("add30")} className={`${base} bg-primary text-primary-foreground hover:opacity-90`}>
        {suspended ? "Reactivar (+30 d)" : "+30 d"}
      </button>
      <button disabled={busy} onClick={() => run("add90")} className={`${base} border border-primary/40 text-primary hover:bg-secondary`}>
        +90 d
      </button>
      <button disabled={busy} onClick={() => run("add365")} className={`${base} border border-primary/40 text-primary hover:bg-secondary`}>
        +1 año
      </button>
      {!suspended && (
        <button disabled={busy} onClick={() => run("suspend")} className={`${base} border border-error/40 text-error hover:bg-error/10`}>
          Suspender
        </button>
      )}
    </div>
  );
}
