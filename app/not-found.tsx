import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 text-center px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-xl font-bold text-white">
        C
      </div>
      <p className="mt-6 text-6xl font-black tracking-tighter text-muted-foreground/20">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        Página no encontrada
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
