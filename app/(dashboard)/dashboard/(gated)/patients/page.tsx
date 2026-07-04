import { createClient } from "@/lib/supabase/server";

function ltvBadge(score: number) {
  if (score >= 0.6) return { label: "Alto LTV", classes: "bg-emerald-100 text-emerald-700" };
  if (score >= 0.3) return { label: "Medio LTV", classes: "bg-blue-100 text-blue-700" };
  return { label: "Bajo LTV", classes: "bg-gray-100 text-gray-500" };
}

function churnBadge(score: number) {
  if (score >= 0.65) return { label: "⚠ Riesgo alto", classes: "bg-red-100 text-red-700" };
  if (score >= 0.35) return { label: "Riesgo medio", classes: "bg-yellow-100 text-yellow-700" };
  return null;
}

export default async function PatientsPage() {
  const supabase = await createClient();

  const { data: patients } = await supabase
    .from("patients")
    .select(
      `id, full_name, phone_e164, status, is_returning,
       ltv_score, churn_risk_score, days_since_last_contact,
       total_messages_received, conversions_count, last_contact_at,
       cohort_memberships(
         membership_status,
         message_count,
         cohort_definitions(name)
       )`
    )
    .order("last_contact_at", { ascending: false, nullsFirst: false });

  const total = patients?.length ?? 0;
  const returning = patients?.filter((p) => p.is_returning).length ?? 0;
  const highChurn =
    patients?.filter((p) => (p.churn_risk_score ?? 0) >= 0.65).length ?? 0;
  const converted = patients?.filter((p) => (p.conversions_count ?? 0) > 0).length ?? 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          {total} contactos registrados automáticamente desde WhatsApp
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Recurrentes</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{returning}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Convertidos</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{converted}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Riesgo de churn</p>
          <p className="mt-1 text-2xl font-bold text-red-500">{highChurn}</p>
        </div>
      </div>

      {!patients?.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Aún no hay pacientes. Se crean automáticamente cuando alguien escribe al WhatsApp.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Cohorte</th>
                <th className="px-4 py-3 font-medium">LTV</th>
                <th className="px-4 py-3 font-medium">Churn</th>
                <th className="px-4 py-3 font-medium">Mensajes</th>
                <th className="px-4 py-3 font-medium">Último contacto</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const memberships = (patient.cohort_memberships as any[]) ?? [];
                const activeMembership =
                  memberships.find((m) => m.membership_status === "active") ??
                  memberships[0];
                const cohortName = activeMembership?.cohort_definitions?.name;

                const ltv = ltvBadge(patient.ltv_score ?? 0);
                const churn = churnBadge(patient.churn_risk_score ?? 0);

                return (
                  <tr
                    key={patient.id}
                    className="border-t transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      {patient.full_name ?? "Sin nombre"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {patient.phone_e164}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {patient.is_returning ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Recurrente
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            Nuevo
                          </span>
                        )}
                        {patient.conversions_count > 0 && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {patient.conversions_count}x cita
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cohortName ? (
                        <span className="text-xs font-medium text-primary">
                          {cohortName}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin clasificar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ltv.classes}`}
                      >
                        {ltv.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {churn ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${churn.classes}`}
                        >
                          {churn.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {patient.total_messages_received ?? 0}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {patient.last_contact_at
                        ? new Date(patient.last_contact_at).toLocaleDateString(
                            "es",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
