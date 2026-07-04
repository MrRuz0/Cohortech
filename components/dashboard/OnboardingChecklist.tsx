"use client";

import Link from "next/link";

type Step = {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
};

export function OnboardingChecklist({
  waConnected,
  hasPatients,
  hasMessages,
}: {
  waConnected: boolean;
  hasPatients: boolean;
  hasMessages: boolean;
}) {
  const steps: Step[] = [
    {
      id: "wa",
      label: "Conecta tu WhatsApp",
      description: "Escanea el QR para vincular el número de tu clínica.",
      href: "/dashboard/settings/whatsapp",
      done: waConnected,
    },
    {
      id: "patients",
      label: "Espera tu primer mensaje",
      description: "Cuando alguien escriba, aparecerá automáticamente como paciente.",
      href: "/dashboard/patients",
      done: hasPatients,
    },
    {
      id: "messages",
      label: "El sistema trabaja solo",
      description: "Cohortech responde, clasifica y hace seguimiento por ti.",
      href: "/dashboard/cohorts",
      done: hasMessages,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Configuración inicial</p>
          <p className="text-xs text-muted-foreground">
            {completed} de {steps.length} pasos completados
          </p>
        </div>
        <span className="text-sm font-bold text-primary">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.done ? "#" : step.href}
            className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
              step.done
                ? "cursor-default opacity-60"
                : "hover:bg-primary/5 cursor-pointer"
            }`}
          >
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                step.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-primary/40 text-primary/60"
              }`}
            >
              {step.done ? "✓" : ""}
            </div>
            <div>
              <p className={`text-sm font-medium ${step.done ? "line-through" : ""}`}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            {!step.done && (
              <span className="ml-auto shrink-0 text-xs font-medium text-primary">
                Ir →
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
