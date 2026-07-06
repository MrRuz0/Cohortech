import { createClient } from "@/lib/supabase/server";
import { ClinicToolsForm } from "@/components/onboarding/ClinicToolsForm";

export default async function ClinicToolsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase
        .from("clinics")
        .select("settings, max_discount_percent")
        .eq("owner_id", user.id)
        .single()
    : { data: null };

  const settings = (clinic?.settings as Record<string, any>) ?? {};

  const initialTools = {
    services: settings.services ?? [],
    booking_link: settings.booking_link ?? "",
    booking_phone: settings.booking_phone ?? "",
    address: settings.address ?? "",
    hours: settings.hours ?? "",
    max_discount_percent: clinic?.max_discount_percent ?? 10,
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-xl space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Herramientas del sistema
        </h1>
        <p className="text-sm text-muted-foreground">
          Esta información le permite al bot responder correctamente a tus
          pacientes — precios, horarios, cómo agendar y qué descuentos puede
          ofrecer.
        </p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
        💡 Cuanto más completo esté esto, mejor responde el sistema. Puedes
        actualizarlo en cualquier momento.
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <ClinicToolsForm initialTools={initialTools} />
      </section>
    </div>
  );
}
