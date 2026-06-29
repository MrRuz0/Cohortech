import Link from "next/link";

const sections = [
  {
    href: "/dashboard/settings/profile",
    title: "Mi Clínica",
    description: "Tu cuenta, correo, nombre y datos esenciales de la clínica.",
    icon: "🏥",
  },
  {
    href: "/dashboard/settings/whatsapp",
    title: "Conexión WhatsApp",
    description:
      "Conecta el WhatsApp de tu clínica, configura el número de recepcionista y sincroniza el historial.",
    icon: "💬",
  },
];

export default function SettingsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-500">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border bg-white p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="text-xl">{s.icon}</div>
            <h2 className="mt-2 text-sm font-semibold">{s.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
            <span className="mt-3 inline-block text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Configurar →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
