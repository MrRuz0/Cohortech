import { createClient } from "@/lib/supabase/server";
import { BillingPaywall } from "@/components/billing/BillingPaywall";

export default async function GatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clinic } = user
    ? await supabase.from("clinics").select("id").eq("owner_id", user.id).single()
    : { data: null };

  const { data: subscription } = clinic
    ? await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end")
        .eq("clinic_id", clinic.id)
        .single()
    : { data: null };

  // Allowlist: only "trialing" or "active" get in. No subscription row at all
  // (pilot clinics onboarded manually, pre-billing) is also let through.
  const isBlocked =
    subscription &&
    subscription.status !== "trialing" &&
    subscription.status !== "active";

  if (isBlocked) {
    return <BillingPaywall status={subscription.status} />;
  }

  return <>{children}</>;
}
