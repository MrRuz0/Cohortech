"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export function CardCaptureForm() {
  const router = useRouter();
  const [mp, setMp] = useState<any>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expirationMonth, setExpirationMonth] = useState("");
  const [expirationYear, setExpirationYear] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => {
      const instance = new window.MercadoPago(
        process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY,
        { locale: "es-PE" }
      );
      setMp(instance);
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mp) {
      setError("El formulario de pago aún está cargando, intenta de nuevo en un momento.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const cardToken = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: expirationYear,
        securityCode,
        identificationType: "DNI",
        identificationNumber,
      });

      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardTokenId: cardToken.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "No se pudo activar la suscripción");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la tarjeta");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Número de tarjeta</label>
        <input
          required
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="4509 9535 6623 3704"
          className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Nombre del titular</label>
        <input
          required
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mes</label>
          <input
            required
            placeholder="MM"
            maxLength={2}
            value={expirationMonth}
            onChange={(e) => setExpirationMonth(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Año</label>
          <input
            required
            placeholder="AA"
            maxLength={2}
            value={expirationYear}
            onChange={(e) => setExpirationYear(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">CVV</label>
          <input
            required
            maxLength={4}
            value={securityCode}
            onChange={(e) => setSecurityCode(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">DNI del titular</label>
        <input
          required
          value={identificationNumber}
          onChange={(e) => setIdentificationNumber(e.target.value)}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Button
        type="submit"
        disabled={loading || !mp}
        className="w-full bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90"
      >
        {loading ? "Procesando..." : "Empezar prueba gratis de 7 días"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No se te cobrará nada hoy. Tu primer cobro será en 7 días, cancela cuando quieras.
      </p>
    </form>
  );
}
