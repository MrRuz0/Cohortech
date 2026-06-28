import { createClient } from "@/lib/supabase/server";
import { EventTimeline } from "@/components/dashboard/EventTimeline";

export default async function EventsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("scheduled_events")
    .select(
      "id, event_type, status, scheduled_at, patients(full_name), cohort_memberships(cohort_definitions(treatment_name))"
    )
    .order("scheduled_at", { ascending: false })
    .limit(50);

  const items = (events ?? []).map((event) => ({
    id: event.id,
    event_type: event.event_type,
    status: event.status,
    scheduled_at: event.scheduled_at,
    patient_name:
      (event.patients as { full_name: string | null }[] | null)?.[0]?.full_name ?? null,
    treatment_name:
      (
        event.cohort_memberships as {
          cohort_definitions: { treatment_name: string }[] | null;
        }[] | null
      )?.[0]?.cohort_definitions?.[0]?.treatment_name ?? null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Eventos</h1>
      <EventTimeline events={items} />
    </div>
  );
}
