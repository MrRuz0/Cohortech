import { createClient } from "@/lib/supabase/server";
import { CohortCard } from "@/components/dashboard/CohortCard";

export default async function CohortsPage() {
  const supabase = await createClient();

  const { data: cohorts } = await supabase
    .from("cohort_definitions")
    .select(
      `id, name, behavioral_description, pain_point, conversion_strategy,
       message_template, is_auto_generated, is_active,
       cohort_memberships(
         id,
         membership_status,
         conversion_type,
         message_count,
         followup_stage
       )`
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const items = (cohorts ?? []).map((cohort) => {
    const memberships = (cohort.cohort_memberships as any[]) ?? [];
    const memberCount = memberships.length;
    const convertedCount = memberships.filter(
      (m) => m.conversion_type !== null
    ).length;
    const churnedCount = memberships.filter(
      (m) => m.membership_status === "churned"
    ).length;
    const messageCount = memberships.reduce(
      (sum: number, m) => sum + (m.message_count ?? 0),
      0
    );

    return {
      id: cohort.id,
      name: cohort.name,
      behavioral_description: cohort.behavioral_description,
      pain_point: cohort.pain_point,
      conversion_strategy: cohort.conversion_strategy,
      message_template: cohort.message_template,
      is_auto_generated: cohort.is_auto_generated ?? true,
      is_active: cohort.is_active,
      memberCount,
      convertedCount,
      churnedCount,
      messageCount,
    };
  });

  const totalPatients = items.reduce((s, c) => s + c.memberCount, 0);
  const totalMessages = items.reduce((s, c) => s + c.messageCount, 0);
  const totalConverted = items.reduce((s, c) => s + c.convertedCount, 0);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cohortes de Comportamiento</h1>
        <p className="text-sm text-muted-foreground">
          El sistema descubre y crea estas cohortes automáticamente analizando las
          conversaciones de WhatsApp.
        </p>
      </div>

      {/* Summary stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold tracking-tight">{items.length}</p>
            <p className="text-sm text-muted-foreground">cohortes activas</p>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold tracking-tight">{totalPatients}</p>
            <p className="text-sm text-muted-foreground">pacientes clasificados</p>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold tracking-tight text-emerald-600">
              {totalPatients > 0
                ? Math.round((totalConverted / totalPatients) * 100)
                : 0}
              %
            </p>
            <p className="text-sm text-muted-foreground">conversión global</p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-12 text-center shadow-sm">
          <p className="text-4xl">🧠</p>
          <p className="mt-4 text-base font-semibold">Aún no hay cohortes detectadas</p>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            El sistema analiza los mensajes de WhatsApp y crea cohortes de
            comportamiento automáticamente una vez al día. Necesitas al menos
            algunos mensajes entrantes para que empiece a detectar patrones.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Paso 1: Conecta WhatsApp
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Paso 2: Recibe mensajes de pacientes
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Paso 3: El sistema detecta cohortes (automático, cada 24h)
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((cohort, i) => (
            <div
              key={cohort.id}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <CohortCard cohort={cohort} />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Las cohortes marcadas con "IA" fueron generadas automáticamente. Puedes
        editar la plantilla de mensaje en cada tarjeta.
      </p>
    </div>
  );
}
