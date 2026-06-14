import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("owner_id", user.user?.id)
    .single();

  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [
    { count: totalPatients },
    { count: activeCohorts },
    { count: eventsThisWeek },
    { count: highChurnRisk },
  ] = await Promise.all([
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase
      .from("cohort_memberships")
      .select("*", { count: "exact", head: true })
      .eq("membership_status", "active"),
    supabase
      .from("scheduled_events")
      .select("*", { count: "exact", head: true })
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", weekFromNow.toISOString()),
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .gte("churn_risk_score", 0.7),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {clinic?.name ?? "Cargando clínica..."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total pacientes</p>
          <p className="text-2xl font-bold">{totalPatients ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Cohortes activas</p>
          <p className="text-2xl font-bold">{activeCohorts ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Eventos esta semana</p>
          <p className="text-2xl font-bold">{eventsThisWeek ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Riesgo de abandono alto</p>
          <p className="text-2xl font-bold">{highChurnRisk ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
