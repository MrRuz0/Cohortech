import { createClient } from "@/lib/supabase/server";
import { PatientActions } from "@/components/dashboard/PatientActions";
import { PatientImport } from "@/components/dashboard/PatientImport";
import Link from "next/link";

const PAGE_SIZE = 50;

function ltvBadge(score: number) {
  if (score >= 0.6) return { label: "Alto LTV", classes: "bg-exito/10 text-exito" };
  if (score >= 0.3) return { label: "Medio LTV", classes: "bg-info/10 text-info" };
  return { label: "Bajo LTV", classes: "bg-muted text-muted-foreground" };
}

function churnBadge(score: number) {
  if (score >= 0.65) return { label: "⚠ Riesgo alto", classes: "bg-coral/15 text-error" };
  if (score >= 0.35) return { label: "Riesgo medio", classes: "bg-advertencia/10 text-advertencia" };
  return null;
}

const CHANNEL_LABEL: Record<string, string> = {
  webchat: "Chat web",
  instagram: "Instagram",
  messenger: "Messenger",
};

function contactLabel(p: { phone_e164: string; channel_source?: string | null }) {
  if (p.channel_source && CHANNEL_LABEL[p.channel_source]) return CHANNEL_LABEL[p.channel_source];
  return p.phone_e164;
}

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const supabase = await createClient();
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const countOf = async (apply?: (q: any) => any) => {
    let q: any = supabase.from("patients").select("id", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count } = await q;
    return count ?? 0;
  };
  const [total, returning, highChurn, converted, blocked] = await Promise.all([
    countOf(),
    countOf((q) => q.eq("is_returning", true)),
    countOf((q) => q.gte("churn_risk_score", 0.65)),
    countOf((q) => q.gt("conversions_count", 0)),
    countOf((q) => q.eq("is_blocked", true)),
  ]);

  // select("*"): no se rompe si alguna migración aún no se aplicó.
  const { data: patients } = await supabase
    .from("patients")
    .select(
      `*,
       cohort_memberships(
         membership_status,
         message_count,
         cohort_definitions(name)
       )`
    )
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          {total} contactos registrados automáticamente
          {blocked > 0 ? ` · ${blocked} bloqueados` : ""}
        </p>
      </div>

      <PatientImport />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Recurrentes</p>
          <p className="mt-1 text-2xl font-bold text-exito">{returning}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Convertidos</p>
          <p className="mt-1 text-2xl font-bold text-info">{converted}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Riesgo de churn</p>
          <p className="mt-1 text-2xl font-bold text-coral">{highChurn}</p>
        </div>
      </div>

      {!patients?.length ? (
        <div className="rounded-xl border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">
          Aún no hay pacientes. Se crean automáticamente cuando alguien escribe.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Cohorte</th>
                <th className="px-4 py-3 font-medium">LTV</th>
                <th className="px-4 py-3 font-medium">Churn</th>
                <th className="px-4 py-3 font-medium">Último contacto</th>
                <th className="px-4 py-3 font-medium">Asistente</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const memberships = (patient.cohort_memberships as any[]) ?? [];
                const activeMembership =
                  memberships.find((m) => m.membership_status === "active") ?? memberships[0];
                const cohortName = activeMembership?.cohort_definitions?.name;
                const ltv = ltvBadge(patient.ltv_score ?? 0);
                const churn = churnBadge(patient.churn_risk_score ?? 0);
                const isBlocked = patient.is_blocked === true;
                const paused =
                  !!patient.bot_paused_until && new Date(patient.bot_paused_until).getTime() > now;

                return (
                  <tr
                    key={patient.id}
                    className={`border-t transition-colors hover:bg-secondary/60 ${isBlocked ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium">{patient.full_name ?? "Sin nombre"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{contactLabel(patient)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isBlocked ? (
                          <span className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                            {patient.blocked_reason === "opt_out" ? "Se dio de baja" : "Bloqueado"}
                          </span>
                        ) : patient.is_returning ? (
                          <span className="rounded-full bg-exito/10 px-2 py-0.5 text-xs font-medium text-exito">
                            Recurrente
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Nuevo
                          </span>
                        )}
                        {(patient.conversions_count ?? 0) > 0 && (
                          <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                            {patient.conversions_count}x cita
                          </span>
                        )}
                        {paused && (
                          <span className="rounded-full bg-advertencia/10 px-2 py-0.5 text-xs font-medium text-advertencia">
                            Atiende una persona
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cohortName ? (
                        <span className="text-xs font-medium text-primary">{cohortName}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin clasificar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ltv.classes}`}>
                        {ltv.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {churn ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${churn.classes}`}>
                          {churn.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {patient.last_contact_at
                        ? new Date(patient.last_contact_at).toLocaleDateString("es", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PatientActions patientId={patient.id} isBlocked={isBlocked} botPaused={paused} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="underline" href={`?page=${page - 1}`}>← Anterior</Link> : <span />}
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          {page < totalPages ? <Link className="underline" href={`?page=${page + 1}`}>Siguiente →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
