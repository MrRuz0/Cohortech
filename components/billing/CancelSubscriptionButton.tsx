"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelSubscriptionButton({ preapprovalId }: { preapprovalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (!confirm("¿Seguro que quieres cancelar tu suscripción? Perderás acceso al panel.")) {
      return;
    }
    setLoading(true);
    await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preapprovalId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {loading ? "Cancelando..." : "Cancelar suscripción"}
    </button>
  );
}
