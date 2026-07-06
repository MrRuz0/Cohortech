"use client";

import { useState } from "react";

type Service = {
  name: string;
  price: string;
};

type ClinicTools = {
  services: Service[];
  booking_link: string;
  booking_phone: string;
  address: string;
  hours: string;
  max_discount_percent: number;
};

export function ClinicToolsForm({
  initialTools,
}: {
  initialTools: ClinicTools;
}) {
  const [services, setServices] = useState<Service[]>(
    initialTools.services?.length ? initialTools.services : [{ name: "", price: "" }]
  );
  const [bookingLink, setBookingLink] = useState(initialTools.booking_link ?? "");
  const [bookingPhone, setBookingPhone] = useState(initialTools.booking_phone ?? "");
  const [address, setAddress] = useState(initialTools.address ?? "");
  const [hours, setHours] = useState(initialTools.hours ?? "");
  const [maxDiscount, setMaxDiscount] = useState(initialTools.max_discount_percent ?? 10);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function addService() {
    setServices((prev) => [...prev, { name: "", price: "" }]);
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateService(i: number, field: "name" | "price", value: string) {
    setServices((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    );
  }

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/settings/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        services: services.filter((s) => s.name.trim()),
        booking_link: bookingLink,
        booking_phone: bookingPhone,
        address,
        hours,
        max_discount_percent: maxDiscount,
      }),
    });
    setStatus(res.ok ? "saved" : "error");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Services */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Servicios y precios</h3>
            <p className="text-xs text-muted-foreground">
              El bot los menciona cuando un paciente pregunta por tratamientos.
            </p>
          </div>
          <button
            type="button"
            onClick={addService}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
          >
            + Agregar
          </button>
        </div>

        <div className="space-y-2">
          {services.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: Botox"
                value={s.name}
                onChange={(e) => updateService(i, "name", e.target.value)}
                className="flex-1 rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="text"
                placeholder="Precio (ej: S/. 350)"
                value={s.price}
                onChange={(e) => updateService(i, "price", e.target.value)}
                className="w-36 rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {services.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeService(i)}
                  className="rounded-lg border px-2.5 text-muted-foreground hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Booking */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Cómo agendar</h3>
          <p className="text-xs text-muted-foreground">
            El bot lo menciona cuando un paciente quiere agendar una cita.
          </p>
        </div>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Link de agenda (ej: calendly.com/miclinica)"
            value={bookingLink}
            onChange={(e) => setBookingLink(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            placeholder="Teléfono de reservas (ej: +51 999 888 777)"
            value={bookingPhone}
            onChange={(e) => setBookingPhone(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Hours */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Horario de atención</h3>
          <p className="text-xs text-muted-foreground">
            El bot lo comparte cuando preguntan cuándo pueden ir.
          </p>
        </div>
        <input
          type="text"
          placeholder="Ej: Lun–Vie 9am–7pm · Sáb 9am–2pm"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Address */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Dirección</h3>
          <p className="text-xs text-muted-foreground">
            Para pacientes que preguntan dónde están ubicados.
          </p>
        </div>
        <input
          type="text"
          placeholder="Ej: Av. Ejército 123, Yanahuara, Arequipa"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Max discount */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">
            Descuento máximo que puedes ofrecer
          </h3>
          <p className="text-xs text-muted-foreground">
            El sistema nunca ofrecerá más de este porcentaje en los seguimientos
            automáticos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={30}
            value={maxDiscount}
            onChange={(e) => setMaxDiscount(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="w-12 text-center text-sm font-semibold text-primary">
            {maxDiscount}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {maxDiscount === 0
            ? "Sin descuentos automáticos."
            : `El bot puede ofrecer hasta ${maxDiscount}% de descuento para reconvertir pacientes.`}
        </p>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={status === "saving"}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {status === "saving"
          ? "Guardando..."
          : status === "saved"
          ? "✓ Guardado"
          : status === "error"
          ? "Error al guardar"
          : "Guardar configuración"}
      </button>
    </div>
  );
}
