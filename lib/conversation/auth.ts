import { createClient } from "@/lib/supabase/server";
import { admin, invalidateClinic } from "./db";

/** Clínica del usuario autenticado, o null. Usa el cliente admin SOLO tras validar la sesión. */
export async function requireClinic(): Promise<{ userId: string; clinicId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: clinic } = await admin().from("clinics").select("id").eq("owner_id", user.id).maybeSingle();
  if (!clinic) return null;
  return { userId: user.id, clinicId: clinic.id as string };
}

export { invalidateClinic };
