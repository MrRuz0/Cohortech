import Link from "next/link";

const sections = [
  {
    href: "/settings/whatsapp",
    title: "Conexión WhatsApp",
    description:
      "Conecta el WhatsApp de tu clínica, configura el número de recepcionista y sincroniza el historial.",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border p-4 hover:border-indigo-400 hover:shadow-sm transition-all"
          >
            <h2 className="font-semibold text-sm">{s.title}</h2>
            <p className="mt-1 text-xs text-gray-500">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
