export type EventRow = {
  id: string;
  event_type: string;
  status: string | null;
  scheduled_at: string;
  patient_name: string | null;
  treatment_name: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function EventTimeline({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No hay eventos programados.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <div>
            <p className="font-medium">{event.patient_name ?? "Paciente"}</p>
            <p className="text-sm text-gray-500">
              {event.event_type === "reactivation_reminder"
                ? `Recordatorio de reactivación${event.treatment_name ? ` — ${event.treatment_name}` : ""}`
                : event.event_type}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              {new Date(event.scheduled_at).toLocaleDateString("es")}
            </p>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                STATUS_STYLES[event.status ?? "pending"] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {event.status ?? "pending"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
