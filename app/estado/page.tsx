export const dynamic = "force-dynamic";

async function check(): Promise<{ ok: boolean }> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return { ok: true };
  try {
    const res = await fetch(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export default async function EstadoPage() {
  const { ok } = await check();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">Estado del servicio</h1>
      <p className={`mt-6 rounded-xl border p-5 text-sm font-medium ${ok ? "bg-exito/10 text-exito" : "bg-error/10 text-error"}`}>
        {ok ? "Todos los sistemas funcionan con normalidad." : "Estamos teniendo problemas. Ya lo estamos revisando."}
      </p>
      <h2 className="mt-10 text-lg font-semibold">Soporte</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Si algo no funciona, escríbenos por WhatsApp o al correo de soporte indicado en tu contrato. Respondemos en horario
        de oficina (lunes a sábado, 9:00 a 19:00, hora de Lima).
      </p>
    </main>
  );
}
