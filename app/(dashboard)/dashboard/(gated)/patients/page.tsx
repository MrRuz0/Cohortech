import { createClient } from "@/lib/supabase/server";

export default async function PatientsPage() {
  const supabase = await createClient();

  const { data: patients } = await supabase
    .from("patients")
    .select(
      `id, full_name, phone_e164, status, last_contact_at, last_auto_response_at,
       cohort_memberships(
         cohort_id,
         membership_status,
         message_count,
         cohort_definitions(name, conversion_strategy)
       )`
    )
    .order("last_contact_at", { ascending: false, nullsFirst: false });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          {patients?.length ?? 0} pacientes registrados
        </p>
      </div>

      {!patients?.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Aún no hay pacientes. Se crean automáticamente cuando alguien escribe al WhatsApp.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Cohorte</th>
                <th className="px-4 py-3 font-medium">Mensajes recibidos</th>
                <th className="px-4 py-3 font-medium">Último contacto</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const memberships = (patient.cohort_memberships as any[]) ?? [];
                const activeMembership =
                  memberships.find((m) => m.membership_status === "active") ??
                  memberships[0];
                const cohort = activeMembership?.cohort_definitions;

                return (
                  <tr key={patient.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      {patient.full_name ?? "Sin nombre"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {patient.phone_e164}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          patient.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {patient.status === "active" ? "Activo" : "Lead"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {cohort ? (
                        <span className="text-xs font-medium text-primary">
                          {cohort.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin clasificar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {activeMembership?.message_count ?? 0}
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
