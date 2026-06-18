import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, wa_session_id")
    .eq("owner_id", user.user?.id ?? "")
    .single();

  const [
    { count: totalPatients },
    { count: totalCohorts },
    { count: pendingBookings },
    { count: processedToday },
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("cohort_definitions")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .contains("nlp_result", { intent: "booking" }),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "processed")
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  // Recent booking-intent messages
  const { data: bookingMessages } = await supabase
    .from("messages")
    .select("id, content_text, sent_at, patient_id, patients(full_name, phone_e164)")
    .eq("direction", "inbound")
    .contains("nlp_result", { intent: "booking" })
    .order("sent_at", { ascending: false })
    .limit(5);

  const isConnected = !!clinic?.wa_session_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">{clinic?.name ?? "Mi Clínica"}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-400"}`}
          />
          <span className="text-gray-500">
            {isConnected ? "WhatsApp conectado" : "WhatsApp no conectado"}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-gray-500">Pacientes totales</p>
          <p className="text-3xl font-bold">{totalPatients ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-gray-500">Cohortes activas</p>
          <p className="text-3xl font-bold">{totalCohorts ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-gray-500">Quieren agendar</p>
          <p className="text-3xl font-bold text-green-600">{pendingBookings ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-gray-500">Mensajes hoy</p>
          <p className="text-3xl font-bold">{processedToday ?? 0}</p>
        </div>
      </div>

      {/* Pending bookings */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Solicitudes de cita recientes
        </h2>
        {!bookingMessages?.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
            Aún no hay solicitudes de cita detectadas.
            {!isConnected && (
              <span>
                {" "}
                <a href="/settings/whatsapp" className="text-indigo-500 underline">
                  Conecta WhatsApp
                </a>{" "}
                para empezar.
              </span>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Paciente</th>
                  <th className="px-4 py-2 font-medium">Teléfono</th>
                  <th className="px-4 py-2 font-medium">Mensaje</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {bookingMessages.map((msg) => {
                  const patient = msg.patients as any;
                  return (
                    <tr key={msg.id} className="border-t">
                      <td className="px-4 py-2 font-medium">
                        {patient?.full_name ?? "Desconocido"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {patient?.phone_e164 ?? "—"}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-gray-600">
                        {msg.content_text}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
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

      {!isConnected && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          WhatsApp no está conectado.{" "}
          <a href="/settings/whatsapp" className="font-medium underline">
            Ir a configuración →
          </a>
        </div>
      )}
    </div>
  );
}
