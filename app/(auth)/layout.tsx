import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--brand-from)]/5 via-white to-[var(--brand-to)]/5 px-4">
      <div className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-sm duration-500">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
            C
          </div>
          <span className="text-xl font-bold tracking-tight">Cohortech</span>
        </Link>
        <div className="rounded-2xl border bg-white p-8 shadow-lg shadow-black/5">
          {children}
        </div>
      </div>
    </div>
  );
}
