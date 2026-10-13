import { createClient } from "@/lib/supabase/server";
import { getSchemaFlags } from "@/lib/conversation/db";
import { PromotionsManager } from "@/components/settings/PromotionsManager";

export default async function PromotionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase.from("clinics").select("settings").eq("owner_id", user.id).single()
    : { data: null };

  const services = ((clinic?.settings as Record<string, any>)?.services ?? []) as { name?: string }[];
  const serviceNames = services.map((s) => s?.name).filter((n): n is string => !!n);
  const flags = await getSchemaFlags();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-2xl space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promociones</h1>
        <p className="text-sm text-muted-foreground">
          Las ofertas que crees aquí las usa el asistente al responder precios, al agendar y al reactivar
          pacientes.
        </p>
      </div>
      <PromotionsManager serviceNames={serviceNames} ready={flags.promotions} />
    </div>
  );
}
