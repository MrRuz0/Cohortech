import { createClient } from "@/lib/supabase/server";
import { PatientTable } from "@/components/dashboard/PatientTable";

export default async function PatientsPage() {
  const supabase = await createClient();

  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, phone_e164, status, churn_risk_score, last_contact_at")
    .order("last_contact_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pacientes</h1>
      <PatientTable patients={patients ?? []} />
    </div>
  );
}
