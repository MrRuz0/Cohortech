import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/LogoutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-bold">Cohortech</span>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/" className="hover:underline">
            Dashboard
          </a>
          <a href="/patients" className="hover:underline">
            Pacientes
          </a>
          <a href="/cohorts" className="hover:underline">
            Cohortes
          </a>
          <a href="/events" className="hover:underline">
            Eventos
          </a>
          <a href="/settings" className="hover:underline">
            Settings
          </a>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
