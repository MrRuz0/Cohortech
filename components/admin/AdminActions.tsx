"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunAuditButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/audit", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Auditando…" : "Generar auditoría ahora"}
      </button>
      {err && <span className="text-sm text-error">{err}</span>}
    </div>
  );
}

export function ResolveButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) router.refresh();
      else alert("No se pudo marcar como resuelto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={resolve}
      disabled={busy}
      className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {busy ? "…" : "Marcar resuelto"}
    </button>
  );
}

export function ImpersonateButton({ clinicId, clinicName }: { clinicId: string; clinicName: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    if (
      !confirm(
        `Vas a generar un acceso al panel de "${clinicName}". Ábrelo en una VENTANA PRIVADA para no cerrar tu sesión de administrador. ¿Continuar?`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar el acceso");
      await navigator.clipboard.writeText(json.url);
      alert(
        `Enlace copiado al portapapeles (entra como ${json.email}).\n\nPégalo en una ventana privada del navegador. Es de un solo uso.`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
    >
      {busy ? "Generando…" : "👁 Entrar a su panel"}
    </button>
  );
}
