import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { BillingPaywall } from "@/components/billing/BillingPaywall";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isBillingPage = pathname.startsWith("/dashboard/settings/billing");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id")
    .eq("owner_id", data.user.id)
    .single();

  const { data: subscription } = clinic
    ? await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end")
        .eq("clinic_id", clinic.id)
        .single()
    : { data: null };

  const isBlocked =
    !isBillingPage &&
    subscription &&
    (subscription.status === "past_due" || subscription.status === "canceled");

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-bold tracking-tight">Cohortech</span>
        </div>
        <div className="flex items-center gap-5">
          <DashboardNav />
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">
        {isBlocked ? <BillingPaywall status={subscription.status} /> : children}
      </main>
    </div>
  );
}
