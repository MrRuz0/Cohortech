import { ChurnRiskBadge } from "@/components/dashboard/ChurnRiskBadge";

export type PatientRow = {
  id: string;
  full_name: string | null;
  phone_e164: string;
  status: string | null;
  churn_risk_score: number | null;
  last_contact_at: string | null;
};

export function PatientTable({ patients }: { patients: PatientRow[] }) {
  if (patients.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aún no hay pacientes. Conecta WhatsApp para empezar a recibir conversaciones.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Teléfono</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Riesgo de abandono</th>
            <th className="px-4 py-2 font-medium">Último contacto</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id} className="border-t">
              <td className="px-4 py-2">{patient.full_name ?? "Sin nombre"}</td>
              <td className="px-4 py-2">{patient.phone_e164}</td>
              <td className="px-4 py-2 capitalize">{patient.status ?? "lead"}</td>
              <td className="px-4 py-2">
                <ChurnRiskBadge score={patient.churn_risk_score ?? 0} />
              </td>
              <td className="px-4 py-2 text-gray-500">
                {patient.last_contact_at
                  ? new Date(patient.last_contact_at).toLocaleDateString("es")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
