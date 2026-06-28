import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WhatsAppFloatButton } from "@/components/marketing/WhatsAppFloatButton";

const features = [
  {
    title: "Auto-respuesta en segundos",
    description:
      "Cada mensaje de WhatsApp se analiza con IA y recibe una respuesta personalizada, pensada para convencer, no una respuesta genérica de robot.",
    icon: "⚡",
  },
  {
    title: "Cohortes que se descubren solas",
    description:
      "El sistema agrupa a tus pacientes por comportamiento real (indecisos por precio, inactivos, etc.) sin que tengas que definir nada a mano.",
    icon: "🧩",
  },
  {
    title: "Seguimiento que no se rinde",
    description:
      "Hasta 4 mensajes de seguimiento automático con ofertas que escalan, deteniéndose apenas el paciente agenda.",
    icon: "🔁",
  },
  {
    title: "Tu recepcionista, siempre al tanto",
    description:
      "En el instante en que alguien quiere agendar, tu recepcionista recibe el aviso por WhatsApp con todos los datos.",
    icon: "🔔",
  },
];

const steps = [
  { n: "1", title: "Conecta tu WhatsApp", text: "Escanea un código QR una sola vez." },
  { n: "2", title: "Configura tu recepcionista", text: "Define a quién avisar cuando alguien quiera agendar." },
  { n: "3", title: "Deja que el sistema trabaje", text: "Responde, clasifica y da seguimiento, todos los días." },
];

const faqs = [
  {
    q: "¿Necesito cambiar mi número de WhatsApp?",
    a: "No. Conectas el mismo número que ya usas con tus pacientes, solo escaneas un código QR una vez.",
  },
  {
    q: "¿Qué pasa con los datos de mis pacientes?",
    a: "Se almacenan de forma segura y solo tu clínica puede verlos. Nunca los vendemos ni los compartimos con terceros. Más detalle en nuestra Política de Privacidad.",
  },
  {
    q: "¿Cuánto cuesta y cuándo me cobran?",
    a: "Un solo plan de $79/mes. Tienes 7 días de prueba gratis y solo se cobra automáticamente a tu tarjeta si no cancelas antes de que termine la prueba.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí, sin contratos forzosos. Cancelas desde tu panel en un clic y dejas de pagar desde el siguiente ciclo.",
  },
  {
    q: "¿Reemplaza a mi recepcionista?",
    a: "No, la potencia. Cohortech responde y filtra automáticamente, y avisa a tu recepcionista por WhatsApp solo cuando un paciente está listo para agendar.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-bold tracking-tight">Cohortech</span>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/casos-de-exito"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            Casos de éxito
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Iniciar sesión
          </Link>
          <Link href="/register">
            <Button className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90">
              Empezar gratis
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[var(--brand-from)]/5 via-transparent to-[var(--brand-to)]/10" />
        <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto max-w-2xl duration-700">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Para clínicas de medicina estética
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Recupera las citas que tu clínica está perdiendo
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Cohortech responde tu WhatsApp en segundos, descubre por qué tus
            pacientes no agendan, y les da seguimiento automático hasta
            convertirlos — sin que tú o tu recepcionista muevan un dedo.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-base hover:opacity-90"
              >
                Empezar prueba gratis
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            7 días gratis · cancela cuando quieras
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Todo lo que tu clínica necesita en automático
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {features.map((f, i) => (
              <div
                key={f.title}
                style={{ animationDelay: `${i * 100}ms` }}
                className="animate-in fade-in slide-in-from-bottom-3 rounded-2xl border bg-white p-6 shadow-sm transition-shadow duration-700 hover:shadow-md"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/40 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Listo en 3 pasos
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-2xl font-bold tracking-tight">Un solo plan, sin sorpresas</h2>
          <div className="mt-8 rounded-2xl border-2 border-primary/20 bg-white p-8 shadow-lg shadow-primary/5">
            <p className="text-sm font-medium text-primary">Plan Cohortech</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">
              $79<span className="text-base font-normal text-muted-foreground">/mes</span>
            </p>
            <ul className="mt-6 space-y-2 text-left text-sm text-muted-foreground">
              <li>✓ Hasta 1,000 mensajes/mes incluidos</li>
              <li>✓ Auto-respuesta con IA en segundos</li>
              <li>✓ Cohortes y seguimiento automático ilimitados</li>
              <li>✓ Notificación a recepcionista</li>
              <li>✓ Dashboard completo</li>
            </ul>
            <Link href="/register" className="mt-6 block">
              <Button className="w-full bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] hover:opacity-90">
                Empezar prueba gratis
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 space-y-4">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border bg-white p-5 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                  {f.q}
                  <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Cohortech. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4">
            <Link href="/casos-de-exito" className="hover:text-foreground">
              Casos de éxito
            </Link>
            <Link href="/terminos" className="hover:text-foreground">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
          </div>
        </div>
      </footer>

      <WhatsAppFloatButton />
    </div>
  );
}
