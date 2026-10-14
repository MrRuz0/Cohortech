import { admin } from "@/lib/conversation/db";
import { isAdminUser } from "@/lib/conversation/admin";
import { redirect } from "next/navigation";
import type { AuditReport } from "@/lib/admin/audit";
import { ResolveButton, RunAuditButton } from "@/components/admin/AdminActions";

const VERDICT_STYLE = {
  ok: { label: "Todo en orden", box: "border-exito/30 bg-exito/10", text: "text-exito", icon: "🟢" },
  attention: { label: "Revisar", box: "border-advertencia/30 bg-advertencia/10", text: "text-advertencia", icon: "🟡" },
  critical: { label: "Requiere acción", box: "border-error/30 bg-error/10", text: "text-error", icon: "🔴" },
} as const;

const WA_LABEL: Record<string, { text: string; cls: string }> = {
  conectado: { text: "Conectado", cls: "bg-exito/10 text-exito" },
  desconectado: { text: "Desconectado", cls: "bg-error/10 text-error" },
  sin_conectar: { text: "Sin conectar", cls: "bg-muted text-muted-foreground" },
  sin_respuesta: { text: "Sin respuesta del servidor", cls: "bg-advertencia/10 text-advertencia" },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AuditPage() {
  if (!(await isAdminUser())) redirect("/login");
  const db = admin();

  const { data: rows, error } = await db
    .from("audit_reports")
    .select("day, created_at, summary")
    .order("day", { ascending: false })
    .limit(14);

  const tableMissing = !!error && /audit_reports/.test(error.message);
  const latest = (rows?.[0]?.summary ?? null) as AuditReport | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoría diaria</h1>
          <p className="text-sm text-muted-foreground">
            Qué falló en las últimas 24 horas, por qué probablemente falló y cómo arreglarlo.
          </p>
        </div>
        <RunAuditButton />
      </div>

      {tableMissing && (
        <div className="rounded-xl border border-advertencia/30 bg-advertencia/10 p-4 text-sm text-advertencia">
          Falta aplicar la migración <strong>0011_system_events.sql</strong> en Supabase para activar la auditoría.
        </div>
      )}

      {!latest && !tableMissing && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          Aún no hay una auditoría. Pulsa “Generar auditoría ahora” o espera la de las 7:00 a. m.
        </div>
      )}

      {latest && (
        <>
          <div className={`rounded-xl border p-5 ${VERDICT_STYLE[latest.verdict].box}`}>
            <p className={`text-lg font-bold ${VERDICT_STYLE[latest.verdict].text}`}>
              {VERDICT_STYLE[latest.verdict].icon} {VERDICT_STYLE[latest.verdict].label}
            </p>
            <p className="mt-1 text-sm">{latest.headline}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Ventana: {fmt(latest.window.from)} → {fmt(latest.window.to)} · generada {fmt(latest.generatedAt)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Errores", latest.totals.errors, latest.totals.errors > 0 ? "text-error" : ""],
              ["Avisos", latest.totals.warnings, latest.totals.warnings > 0 ? "text-advertencia" : ""],
              ["Recibidos", latest.totals.inbound, ""],
              ["Enviados", latest.totals.outbound, ""],
              ["Sin respuesta", latest.totals.unanswered, latest.totals.unanswered > 0 ? "text-advertencia" : ""],
            ].map(([label, value, cls]) => (
              <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Problemas */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Problemas detectados</h2>
            {latest.groups.length === 0 ? (
              <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
                Sin errores ni avisos en las últimas 24 horas. 🎉
              </div>
            ) : (
              latest.groups.map((g) => (
                <article key={g.key} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            g.level === "error" ? "bg-error/10 text-error" : "bg-advertencia/10 text-advertencia"
                          }`}
                        >
                          {g.level === "error" ? "ERROR" : "AVISO"}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{g.source}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.count} {g.count === 1 ? "vez" : "veces"} · primera {fmt(g.firstAt)} · última {fmt(g.lastAt)}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold">{g.message}</h3>
                      {g.clinics.length > 0 && (
                        <p className="text-xs text-muted-foreground">Clínicas afectadas: {g.clinics.join(", ")}</p>
                      )}
                    </div>
                    <ResolveButton ids={g.eventIds} />
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/60 p-3">
                      <dt className="text-xs font-semibold text-muted-foreground">QUÉ PASÓ</dt>
                      <dd className="mt-1">{g.whatHappened}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-3">
                      <dt className="text-xs font-semibold text-muted-foreground">CAUSA PROBABLE</dt>
                      <dd className="mt-1">{g.likelyCause}</dd>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <dt className="text-xs font-semibold text-primary">CÓMO ARREGLARLO</dt>
                      <dd className="mt-1">{g.suggestedFix}</dd>
                    </div>
                  </dl>

                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground">Detalle técnico</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3">
                      {JSON.stringify(g.sample, null, 2)}
                    </pre>
                  </details>
                </article>
              ))
            )}
          </section>

          {/* Sin respuesta */}
          {latest.unanswered.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Pacientes que escribieron y no recibieron respuesta</h2>
              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Clínica</th>
                      <th className="px-4 py-3 font-medium">Paciente</th>
                      <th className="px-4 py-3 font-medium">Esperando</th>
                      <th className="px-4 py-3 font-medium">Mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.unanswered.map((u, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2">{u.clinic}</td>
                        <td className="px-4 py-2">{u.patient}</td>
                        <td className="px-4 py-2">{u.waitingMinutes} min</td>
                        <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">{u.preview}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Clínicas */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Estado por clínica</h2>
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Clínica</th>
                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                    <th className="px-4 py-3 font-medium">Recibidos</th>
                    <th className="px-4 py-3 font-medium">Enviados</th>
                    <th className="px-4 py-3 font-medium">Fallidos</th>
                    <th className="px-4 py-3 font-medium">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.clinics.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WA_LABEL[c.whatsapp]?.cls}`}>
                          {WA_LABEL[c.whatsapp]?.text}
                        </span>
                      </td>
                      <td className="px-4 py-2">{c.inbound}</td>
                      <td className="px-4 py-2">{c.outbound}</td>
                      <td className={`px-4 py-2 ${c.failed ? "font-semibold text-error" : ""}`}>{c.failed}</td>
                      <td className={`px-4 py-2 ${c.errors ? "font-semibold text-error" : ""}`}>{c.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Historial */}
          {rows && rows.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Días anteriores</h2>
              <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
                {rows.slice(1).map((r) => {
                  const s = r.summary as AuditReport;
                  return (
                    <li key={r.day} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="font-medium">{r.day}</span>
                      <span className="text-muted-foreground">{VERDICT_STYLE[s.verdict]?.icon} {s.headline}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
