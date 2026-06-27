import { createClient } from "@/lib/supabase/server";
import { ClinicProfileForm } from "@/components/onboarding/ClinicProfileForm";

export default async function ClinicProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase
        .from("clinics")
        .select("name, clinic_description, created_at")
        .eq("owner_id", user.id)
        .single()
    : { data: null };

  const provider = user?.app_metadata?.provider ?? "email";
  const providerLabels: Record<string, string> = {
    email: "Correo y contraseña",
    google: "Google",
    azure: "Microsoft / Outlook",
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 max-w-lg space-y-6 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi Clínica</h1>
        <p className="text-sm text-muted-foreground">
          Datos esenciales de tu cuenta y tu clínica.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Cuenta</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Correo</dt>
            <dd className="font-medium">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Inicio de sesión vía</dt>
            <dd className="font-medium">
              {providerLabels[provider] ?? provider}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Cliente desde</dt>
            <dd className="font-medium">
              {clinic?.created_at
                ? new Date(clinic.created_at).toLocaleDateString("es", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Datos de la clínica</h2>
        <ClinicProfileForm
          initialName={clinic?.name ?? ""}
          initialDescription={clinic?.clinic_description ?? null}
        />
      </section>
    </div>
  );
}
