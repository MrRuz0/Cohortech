import Link from "next/link";

export const metadata = {
  title: "Política de Privacidad — Cohortech",
};

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Volver al inicio
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: {new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">1. Qué datos recopilamos</h2>
          <p className="mt-2">
            Recopilamos los datos de tu cuenta (nombre de la clínica, correo
            electrónico), los mensajes de WhatsApp que tu clínica intercambia con sus
            pacientes a través de la plataforma, y los datos de facturación
            necesarios para procesar pagos (gestionados directamente por MercadoPago,
            no almacenamos números de tarjeta).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">2. Cómo usamos los datos</h2>
          <p className="mt-2">
            Usamos los mensajes de WhatsApp para generar respuestas automáticas
            mediante inteligencia artificial, clasificar pacientes en cohortes de
            comportamiento y enviar seguimientos automáticos en nombre de tu clínica.
            No vendemos ni compartimos datos de pacientes con terceros para fines
            publicitarios.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">3. Dónde se almacenan los datos</h2>
          <p className="mt-2">
            Los datos se almacenan en infraestructura de Supabase (base de datos) y
            Vercel (hosting de la aplicación), con cifrado en tránsito y controles de
            acceso por clínica mediante políticas de seguridad a nivel de fila
            (Row Level Security).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">4. Datos de salud</h2>
          <p className="mt-2">
            Dado que Cohortech sirve a clínicas estéticas, algunos mensajes pueden
            contener referencias a tratamientos o condiciones de salud de los
            pacientes. Estos datos se tratan con el mismo nivel de protección que el
            resto de la información de la cuenta y solo son visibles para la clínica
            propietaria de esos pacientes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">5. Terceros que procesan datos</h2>
          <p className="mt-2">
            Usamos servicios de terceros para operar la plataforma: Meta/WhatsApp
            Business API (mensajería), OpenAI/Anthropic (generación de respuestas con
            IA), MercadoPago (procesamiento de pagos) y Supabase/Vercel
            (infraestructura). Cada uno procesa únicamente los datos necesarios para
            su función específica.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">6. Tus derechos</h2>
          <p className="mt-2">
            Puedes solicitar la exportación o eliminación de los datos de tu clínica
            en cualquier momento escribiendo a{" "}
            <a href="mailto:soporte@cohortech.com" className="text-primary hover:underline">
              soporte@cohortech.com
            </a>
            . Al cancelar tu cuenta, tus datos se conservan por un periodo razonable
            para fines de respaldo y luego se eliminan.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">7. Contacto</h2>
          <p className="mt-2">
            Para cualquier consulta sobre el tratamiento de tus datos, escríbenos a{" "}
            <a href="mailto:soporte@cohortech.com" className="text-primary hover:underline">
              soporte@cohortech.com
            </a>
            . Consulta también nuestros{" "}
            <Link href="/terminos" className="text-primary hover:underline">
              Términos y Condiciones
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
