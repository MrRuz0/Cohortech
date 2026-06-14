import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("owner_id", user.user?.id)
    .single();

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
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Cohortes activas</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Eventos esta semana</p>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Riesgo de abandono alto</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>
    </div>
  );
}
