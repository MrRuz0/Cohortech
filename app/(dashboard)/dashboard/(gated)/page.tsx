import { createClient } from "@/lib/supabase/server";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, wa_session_id, settings")
    .eq("owner_id", user.user?.id ?? "")
    .single();

  const isConnected = !!clinic?.wa_session_id;
  const settings = (clinic?.settings as Record<string, any>) ?? {};
  const hasTools = !!(
    settings.services?.length ||
    settings.booking_link ||
    settings.booking_phone ||
    settings.hours
  );
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    { count: totalPatients },
    { count: newPatientsWeek },
    { count: messagesProcessedToday },
    { count: followupsPending },
    { count: conversionsMonth },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfWeek.toISOString()),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .gte("sent_at", todayStart.toISOString()),
    supabase
      .from("cohort_memberships")
      .select("*", { count: "exact", head: true })
      .eq("membership_status", "active")
      .lte("next_followup_at", now.toISOString()),
    supabase
      .from("cohort_memberships")
      .select("*", { count: "exact", head: true })
      .eq("membership_status", "converted")
      .gte("enrolled_at", startOfMonth.toISOString()),
    supabase.from("messages").select("*", { count: "exact", head: true }),
  ]);

  const conversionRate =
    totalPatients && totalPatients > 0
      ? Math.round(((conversionsMonth ?? 0) / totalPatients) * 100)
      : 0;

  // Recent booking-intent messages
  const { data: bookingMessages } = await supabase
    .from("messages")
    .select("id, content_text, sent_at, patients(full_name, phone_e164)")
    .eq("direction", "inbound")
    .contains("nlp_result", { intent: "booking" })
    .order("sent_at", { ascending: false })
    .limit(5);

  const hasPatients = (totalPatients ?? 0) > 0;
  const hasMessages = (totalMessages ?? 0) > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {clinic?.name ?? "Mi Clínica"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumen de actividad
          </p>
        </div>
        <Link
          href="/dashboard/settings/whatsapp"
          className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm shadow-sm hover:shadow-md transition-shadow"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected
                ? "bg-emerald-500 animate-pulse"
                : "bg-red-400"
            }`}
          />
          <span className="text-muted-foreground">
            {isConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}
          </span>
        </Link>
      </div>

      {/* Onboarding checklist — disappears when all steps done */}
      <OnboardingChecklist
        waConnected={isConnected}
        hasPatients={hasPatients}
        hasMessages={hasMessages}
        hasTools={hasTools}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Pacientes totales"
          value={totalPatients ?? 0}
        />
        <KpiCard
          label="Nuevos esta semana"
          value={newPatientsWeek ?? 0}
          highlight="emerald"
        />
        <KpiCard
          label="Mensajes hoy"
          value={messagesProcessedToday ?? 0}
        />
        <KpiCard
          label="Follow-ups pendientes"
          value={followupsPending ?? 0}
          highlight={followupsPending ? "yellow" : undefined}
        />
        <KpiCard
          label="Conversiones este mes"
          value={conversionsMonth ?? 0}
          highlight="emerald"
        />
        <KpiCard
          label="Tasa conversión"
          value={`${conversionRate}%`}
          highlight={conversionRate > 0 ? "emerald" : undefined}
        />
      </div>

      {/* Booking requests */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Solicitudes de cita recientes</h2>
          <Link
            href="/dashboard/patients"
            className="text-xs text-primary hover:underline"
          >
            Ver todos los pacientes →
          </Link>
        </div>

        {!bookingMessages?.length ? (
          <EmptyState
            icon="📅"
            title="Sin solicitudes de cita aún"
            description={
              isConnected
                ? "Cuando un paciente quiera agendar, aparecerá aquí automáticamente."
                : "Conecta tu WhatsApp para empezar a recibir mensajes."
            }
            action={
              !isConnected
                ? { label: "Conectar WhatsApp", href: "/dashboard/settings/whatsapp" }
                : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Paciente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Mensaje</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {bookingMessages.map((msg) => {
                  const patient = msg.patients as any;
                  return (
                    <tr
                      key={msg.id}
                      className="border-t transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium">
                        {patient?.full_name ?? "Desconocido"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient?.phone_e164 ?? "—"}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                        {msg.content_text}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(msg.sent_at).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: "emerald" | "yellow";
}) {
  const valueClass =
    highlight === "emerald"
      ? "text-emerald-600"
      : highlight === "yellow"
      ? "text-yellow-600"
      : "";

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-10 text-center shadow-sm">
      <p className="text-3xl">{icon}</p>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
