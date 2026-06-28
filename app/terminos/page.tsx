import Link from "next/link";

export const metadata = {
  title: "Términos y Condiciones — Cohortech",
};

export default function TerminosPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Volver al inicio
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Términos y Condiciones</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: {new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">1. Descripción del servicio</h2>
          <p className="mt-2">
            Cohortech es una plataforma de software como servicio (SaaS) que ayuda a
            clínicas de medicina estética a automatizar la comunicación por WhatsApp
            con sus pacientes, incluyendo respuestas automáticas, segmentación de
            pacientes y seguimiento de citas.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">2. Cuenta y suscripción</h2>
          <p className="mt-2">
            Al registrarte aceptas brindar información veraz sobre tu clínica. El
            servicio incluye un período de prueba gratuito de 7 días. Al finalizar la
            prueba, se cobrará automáticamente la tarifa mensual vigente a la tarjeta
            registrada, salvo que canceles antes de esa fecha desde tu panel de
            configuración.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">3. Cancelación</h2>
          <p className="mt-2">
            Puedes cancelar tu suscripción en cualquier momento desde
            Configuración → Facturación. La cancelación detiene los cobros futuros;
            no se realizan reembolsos por periodos ya facturados.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">4. Uso aceptable</h2>
          <p className="mt-2">
            El servicio debe usarse para comunicación legítima con pacientes que
            hayan tenido contacto previo con tu clínica. No está permitido usar
            Cohortech para enviar mensajes masivos no solicitados (spam) ni para
            fines distintos a la gestión de pacientes de tu clínica.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">5. Datos de pacientes</h2>
          <p className="mt-2">
            La clínica es responsable de contar con el consentimiento de sus
            pacientes para el tratamiento de sus datos personales y de salud a
            través de la plataforma. Consulta nuestra{" "}
            <Link href="/privacidad" className="text-primary hover:underline">
              Política de Privacidad
            </Link>{" "}
            para conocer cómo protegemos esa información.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">6. Limitación de responsabilidad</h2>
          <p className="mt-2">
            Cohortech se ofrece &ldquo;tal cual&rdquo;. No garantizamos disponibilidad
            ininterrumpida del servicio ni de las plataformas de terceros (WhatsApp,
            MercadoPago) de las que depende.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">7. Contacto</h2>
          <p className="mt-2">
            Para consultas sobre estos términos, escríbenos a{" "}
            <a href="mailto:soporte@cohortech.com" className="text-primary hover:underline">
              soporte@cohortech.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
