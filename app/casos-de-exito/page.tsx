import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Casos de éxito — Cohortech",
};

const cases = [
  {
    clinic: "Próximamente",
    result: "Estamos trabajando con nuestras primeras clínicas piloto.",
    detail:
      "Pronto verás aquí resultados reales de citas recuperadas y tiempo ahorrado.",
  },
];

export default function CasosDeExitoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-bold tracking-tight">Cohortech</span>
        </Link>
        <Link href="/register">
          <Button className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90">
            Empezar gratis
          </Button>
        </Link>
      </header>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Casos de éxito
          </h1>
          <p className="mt-3 text-muted-foreground">
            Clínicas reales que recuperaron citas perdidas con Cohortech.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-6">
          {cases.map((c) => (
            <div
              key={c.clinic}
              className="rounded-2xl border bg-white p-8 text-center shadow-sm"
            >
              <p className="text-sm font-semibold text-primary">{c.clinic}</p>
              <p className="mt-2 text-lg font-medium">{c.result}</p>
              <p className="mt-2 text-sm text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/register">
            <Button
              size="lg"
              className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90"
            >
              Sé de los primeros en probarlo
            </Button>
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t px-6 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Cohortech. Todos los derechos reservados.
      </footer>
    </div>
  );
}
