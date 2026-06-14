export type CohortInfo = {
  id: string;
  treatment_name: string;
  bio_cycle_days: number;
  is_active: boolean | null;
  memberCount: number;
};

export function CohortCard({ cohort }: { cohort: CohortInfo }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{cohort.treatment_name}</h3>
        {!cohort.is_active && (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
            Inactiva
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Ciclo biológico: {cohort.bio_cycle_days} días
      </p>
      <p className="mt-2 text-2xl font-bold">{cohort.memberCount}</p>
      <p className="text-xs text-gray-500">pacientes en esta cohorte</p>
    </div>
  );
}
