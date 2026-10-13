import { AssistantSettings } from "@/components/settings/AssistantSettings";

export default function AssistantPage() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cohortech.vercel.app").replace(/\/+$/, "");
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-2xl space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asistente y canales</h1>
        <p className="text-sm text-muted-foreground">
          Controla el asistente, la reactivación y por dónde te escriben tus pacientes.
        </p>
      </div>
      <AssistantSettings appUrl={appUrl} />
    </div>
  );
}
