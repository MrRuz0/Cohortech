import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import Link from "next/link";

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
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Cohortech
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link href="/patients" className="text-gray-600 hover:text-black">
            Pacientes
          </Link>
          <Link href="/cohorts" className="text-gray-600 hover:text-black">
            Cohortes
          </Link>
          <Link href="/settings" className="text-gray-600 hover:text-black">
            Configuración
          </Link>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
