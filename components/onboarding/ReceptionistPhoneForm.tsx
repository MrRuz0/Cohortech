"use client";

import { useState } from "react";

export function ReceptionistPhoneForm({
  initialPhone,
}: {
  initialPhone: string | null;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/settings/clinic", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receptionist_phone: phone }),
    });
    setStatus(res.ok ? "saved" : "error");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Número de la recepcionista
      </label>
      <p className="text-xs text-gray-500">
        Cuando un paciente quiera agendar una cita, el sistema enviará una
        notificación a este número por WhatsApp. Formato: 51XXXXXXXXX
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="51987654321"
          className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={save}
          disabled={status === "saving" || !phone}
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
