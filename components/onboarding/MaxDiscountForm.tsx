"use client";

import { useState } from "react";

export function MaxDiscountForm({ initialPercent }: { initialPercent: number }) {
  const [percent, setPercent] = useState(initialPercent);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/settings/clinic", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_discount_percent: percent }),
    });
    setStatus(res.ok ? "saved" : "error");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Descuento máximo permitido en seguimientos
      </label>
      <p className="text-xs text-gray-500">
        La IA puede ofrecer descuentos en los mensajes de seguimiento automático
        para pacientes indecisos, pero nunca por encima de este porcentaje.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="w-24 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-500">%</span>
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {status === "saving"
            ? "Guardando…"
            : status === "saved"
              ? "Guardado ✓"
              : status === "error"
                ? "Error"
                : "Guardar"}
        </button>
      </div>
    </div>
  );
}
