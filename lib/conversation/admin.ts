import { createClient } from "@/lib/supabase/server";

// Mismo correo que protege el layout de /admin.
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "jhordanmeza77@gmail.com";

export async function isAdminUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.email === ADMIN_EMAIL;
}
