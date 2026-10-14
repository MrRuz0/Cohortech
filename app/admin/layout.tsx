import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/conversation/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user || data.user.email !== ADMIN_EMAIL) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
              C
            </div>
            <span className="text-lg font-bold tracking-tight">Cohortech</span>
            <span className="rounded-full bg-advertencia/15 px-2 py-0.5 text-xs font-semibold text-advertencia">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-muted">
              Clínicas
            </Link>
            <Link href="/admin/audit" className="rounded-lg px-3 py-1.5 hover:bg-muted">
              Auditoría
            </Link>
          </nav>
        </div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver al dashboard
        </Link>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
