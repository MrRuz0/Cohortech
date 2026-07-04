"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 text-center px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-xl font-bold text-white">
        C
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        Algo salió mal
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Ocurrió un error inesperado. Puedes intentarlo de nuevo o volver al
        inicio.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50"
        >
          Ir al dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-muted-foreground/60">
          Código: {error.digest}
        </p>
      )}
    </div>
  );
}
