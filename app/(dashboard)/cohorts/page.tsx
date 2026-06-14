import { createClient } from "@/lib/supabase/server";
import { CohortCard } from "@/components/dashboard/CohortCard";

export default async function CohortsPage() {
  const supabase = await createClient();

  const { data: cohorts } = await supabase
    .from("cohort_definitions")
    .select("id, treatment_name, bio_cycle_days, is_active, cohort_memberships(count)")
    .order("treatment_name");

  const items = (cohorts ?? []).map((cohort) => ({
    id: cohort.id,
    treatment_name: cohort.treatment_name,
    bio_cycle_days: cohort.bio_cycle_days,
    is_active: cohort.is_active,
    memberCount: (cohort.cohort_memberships as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cohortes</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((cohort) => (
          <CohortCard key={cohort.id} cohort={cohort} />
        ))}
      </div>
    </div>
  );
}
