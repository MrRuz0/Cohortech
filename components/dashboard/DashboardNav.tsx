"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/patients", label: "Pacientes" },
  { href: "/dashboard/cohorts", label: "Cohortes" },
  { href: "/dashboard/settings", label: "Configuración" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {links.map((link) => {
        const isActive =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-gray-600 hover:bg-gray-100 hover:text-black"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
