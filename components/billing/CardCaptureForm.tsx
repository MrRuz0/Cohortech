"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CardCaptureForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/subscribe", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo iniciar la suscripción");
      }

      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la solicitud");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Button
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90"
      >
        {loading ? "Redirigiendo..." : "Empezar prueba gratis de 7 días"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Te llevaremos a MercadoPago para agregar tu tarjeta de forma segura. No
        se te cobrará nada hoy. Tu primer cobro será en 7 días, cancela cuando
        quieras.
      </p>
    </div>
  );
}
