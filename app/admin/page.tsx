import { createClient } from "@/lib/supabase/server";

// ── Thresholds ─────────────────────────────────────────────────
const WA_MESSAGES_MODERATE_DAYS = 5;
const WA_MESSAGES_CRITICAL_DAYS = 14;
const LOGIN_MODERATE_DAYS = 5;
const LOGIN_CRITICAL_DAYS = 14;
const PATIENTS_MODERATE_DAYS = 15;
const PATIENTS_CRITICAL_DAYS = 30;

// ── Types ──────────────────────────────────────────────────────
type Signal = {
  label: string;
  level: "critical" | "moderate" | "ok";
};

type ChurnLevel = "critical" | "at-risk" | "healthy";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function computeSignals(clinic: any): Signal[] {
  const signals: Signal[] = [];

  // 1. WhatsApp disconnected (no session configured)
  if (!clinic.wa_session_id) {
    signals.push({ label: "WhatsApp desconectado", level: "critical" });
  } else {
    // 2. WhatsApp connected but no recent messages
    const waInactive = daysSince(clinic.last_wa_message_at);
    if (waInactive !== null && waInactive >= WA_MESSAGES_CRITICAL_DAYS) {
      signals.push({
        label: `Sin mensajes en WhatsApp hace ${waInactive}d`,
        level: "critical",
      });
    } else if (waInactive !== null && waInactive >= WA_MESSAGES_MODERATE_DAYS) {
      signals.push({
        label: `Sin mensajes en WhatsApp hace ${waInactive}d`,
        level: "moderate",
      });
    }
  }

  // 2. Dashboard login inactivity
  const loginInactive = daysSince(clinic.owner_last_login_at);
  if (loginInactive !== null && loginInactive >= LOGIN_CRITICAL_DAYS) {
    signals.push({
      label: `Sin entrar al dashboard hace ${loginInactive}d`,
      level: "critical",
    });
  } else if (loginInactive !== null && loginInactive >= LOGIN_MODERATE_DAYS) {
    signals.push({
      label: `Sin entrar al dashboard hace ${loginInactive}d`,
      level: "moderate",
    });
  }

  // 3. New patients drought
  const lastPatient = daysSince(clinic.last_patient_created_at);
  if (lastPatient !== null && lastPatient >= PATIENTS_CRITICAL_DAYS) {
    signals.push({
      label: `Sin pacientes nuevos hace ${lastPatient}d`,
      level: "critical",
    });
  } else if (lastPatient !== null && lastPatient >= PATIENTS_MODERATE_DAYS) {
    signals.push({
      label: `Sin pacientes nuevos hace ${lastPatient}d`,
      level: "moderate",
    });
  } else if (lastPatient === null) {
    signals.push({ label: "Nunca tuvo pacientes", level: "moderate" });
  }

  return signals;
}

function computeChurnLevel(signals: Signal[]): ChurnLevel {
  const criticals = signals.filter((s) => s.level === "critical").length;
  const moderates = signals.filter((s) => s.level === "moderate").length;
  if (criticals >= 2 || (criticals === 1 && moderates >= 1)) return "critical";
  if (criticals === 1 || moderates >= 2) return "at-risk";
  return "healthy";
}

const CHURN_STYLES: Record<ChurnLevel, string> = {
  critical: "border-red-200 bg-red-50",
  "at-risk": "border-yellow-200 bg-yellow-50",
  healthy: "border-emerald-200 bg-white",
};

const CHURN_BADGE: Record<ChurnLevel, { label: string; classes: string }> = {
  critical: { label: "🔴 Churn inminente", classes: "bg-red-100 text-red-700" },
  "at-risk": { label: "🟡 En riesgo", classes: "bg-yellow-100 text-yellow-700" },
  healthy: { label: "🟢 Saludable", classes: "bg-emerald-100 text-emerald-700" },
};

const SIGNAL_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  moderate: "bg-yellow-100 text-yellow-700",
  ok: "bg-gray-100 text-gray-500",
};

export default async function AdminPage() {
  const supabase = await createClient();

  // Fetch all clinics with aggregated signals
  const { data: clinics } = await supabase
    .from("clinics")
    .select(
      `id, name, wa_phone_number, wa_session_id, created_at,
       owner_last_login_at, last_wa_message_at,
       patients(created_at)`
    )
    .order("created_at", { ascending: false });

  if (!clinics?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Panel de retención</h1>
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No hay clínicas registradas aún.
        </div>
      </div>
    );
  }

  // Enrich each clinic with last_patient_created_at
  const enriched = clinics.map((clinic) => {
    const patients = (clinic.patients as any[]) ?? [];
    const sorted = patients
      .map((p) => p.created_at)
      .filter(Boolean)
      .sort()
      .reverse();
    return {
      ...clinic,
      last_patient_created_at: sorted[0] ?? null,
      total_patients: patients.length,
    };
  });

  // Compute signals and sort by churn severity
  const ranked = enriched
    .map((clinic) => {
      const signals = computeSignals(clinic);
      const churnLevel = computeChurnLevel(signals);
      return { ...clinic, signals, churnLevel };
    })
    .sort((a, b) => {
      const order: Record<ChurnLevel, number> = { critical: 0, "at-risk": 1, healthy: 2 };
      return order[a.churnLevel] - order[b.churnLevel];
    });

  const criticalCount = ranked.filter((c) => c.churnLevel === "critical").length;
  const atRiskCount = ranked.filter((c) => c.churnLevel === "at-risk").length;
  const healthyCount = ranked.filter((c) => c.churnLevel === "healthy").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de retención</h1>
        <p className="text-sm text-muted-foreground">
          Clínicas ordenadas por riesgo de abandono — actúa primero en las rojas
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600">Churn inminente</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{criticalCount}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-medium text-yellow-600">En riesgo</p>
          <p className="mt-1 text-3xl font-bold text-yellow-700">{atRiskCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-600">Saludable</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{healthyCount}</p>
        </div>
      </div>

      {/* Clinic cards */}
      <div className="space-y-3">
        {ranked.map((clinic) => {
          const badge = CHURN_BADGE[clinic.churnLevel];
          const cardStyle = CHURN_STYLES[clinic.churnLevel];
          const clientDays = daysSince(clinic.created_at);
          const waNumber = clinic.wa_phone_number?.replace(/\D/g, "");
          const waLink = waNumber
            ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
                `Hola, soy Jhordan de Cohortech. ¿Cómo están llevando el sistema? Quería saber si necesitan ayuda con algo.`
              )}`
            : null;

          return (
            <div
              key={clinic.id}
              className={`rounded-xl border p-5 shadow-sm ${cardStyle}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{clinic.name}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cliente hace {clientDays ?? "?"} días ·{" "}
                    {clinic.total_patients} pacientes registrados
                    {clinic.wa_phone_number && ` · ${clinic.wa_phone_number}`}
                  </p>
                </div>

                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg bg-[#25D366] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                  >
                    💬 Llamar por WhatsApp
                  </a>
                )}
              </div>

              {/* Signals */}
              {clinic.signals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {clinic.signals.map((signal, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        SIGNAL_STYLES[signal.level]
                      }`}
                    >
                      {signal.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
