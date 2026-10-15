import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/conversation/admin";
import { admin, mapClinic } from "@/lib/conversation/db";
import { fetchLinkedAccounts } from "@/lib/evolution/client";
import { loadClinicStats } from "@/lib/admin/clinic-stats";
import { ModuleToggles } from "@/components/admin/ModuleToggles";
import { ImpersonateButton } from "@/components/admin/AdminActions";
import { PlanActions } from "@/components/admin/PlanActions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Umbrales de riesgo de abandono ──────────────────────────────────
const WA_MESSAGES_MODERATE_DAYS = 5;
const WA_MESSAGES_CRITICAL_DAYS = 14;
const LOGIN_MODERATE_DAYS = 5;
const LOGIN_CRITICAL_DAYS = 14;
const PATIENTS_MODERATE_DAYS = 15;
const PATIENTS_CRITICAL_DAYS = 30;
const AI_COST_PER_RESPONSE_USD = 0.0003;

type Signal = { label: string; level: "critical" | "moderate" | "ok" };
type ChurnLevel = "critical" | "at-risk" | "healthy";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function computeSignals(clinic: any, waLive: "conectado" | "desconectado" | "sin_conectar"): Signal[] {
  const signals: Signal[] = [];

  if (waLive === "sin_conectar") {
    signals.push({ label: "WhatsApp sin conectar", level: "critical" });
  } else if (waLive === "desconectado") {
    signals.push({ label: "WhatsApp desconectado", level: "critical" });
  } else {
    const waInactive = daysSince(clinic.last_wa_message_at);
    if (waInactive !== null && waInactive >= WA_MESSAGES_CRITICAL_DAYS) {
      signals.push({ label: `Sin mensajes en WhatsApp hace ${waInactive}d`, level: "critical" });
    } else if (waInactive !== null && waInactive >= WA_MESSAGES_MODERATE_DAYS) {
      signals.push({ label: `Sin mensajes en WhatsApp hace ${waInactive}d`, level: "moderate" });
    }
  }

  const loginInactive = daysSince(clinic.owner_last_login_at);
  if (loginInactive !== null && loginInactive >= LOGIN_CRITICAL_DAYS) {
    signals.push({ label: `Sin entrar al dashboard hace ${loginInactive}d`, level: "critical" });
  } else if (loginInactive !== null && loginInactive >= LOGIN_MODERATE_DAYS) {
    signals.push({ label: `Sin entrar al dashboard hace ${loginInactive}d`, level: "moderate" });
  }

  const lastPatient = daysSince(clinic.last_patient_created_at);
  if (lastPatient !== null && lastPatient >= PATIENTS_CRITICAL_DAYS) {
    signals.push({ label: `Sin pacientes nuevos hace ${lastPatient}d`, level: "critical" });
  } else if (lastPatient !== null && lastPatient >= PATIENTS_MODERATE_DAYS) {
    signals.push({ label: `Sin pacientes nuevos hace ${lastPatient}d`, level: "moderate" });
  } else if (lastPatient === null) {
    signals.push({ label: "Nunca tuvo pacientes", level: "moderate" });
  }
  return signals;
}

function computeChurnLevel(signals: Signal[]): ChurnLevel {
  const criticals = signals.filter((s) => s.level === "critical").length;
  const moderates = signals.filter((s) => s.level === "moderate").length;
  if (criticals >= 2 || (criticals === 1 && moderates >= 1)) return "critical";
  if (criticals === 1 || moderates >= 2) return "at-risk";
  return "healthy";
}

const CHURN_STYLES: Record<ChurnLevel, string> = {
  critical: "border-error/30 bg-error/5",
  "at-risk": "border-advertencia/30 bg-advertencia/5",
  healthy: "border-border bg-white",
};
const CHURN_BADGE: Record<ChurnLevel, { label: string; classes: string }> = {
  critical: { label: "🔴 Churn inminente", classes: "bg-error/10 text-error" },
  "at-risk": { label: "🟡 En riesgo", classes: "bg-advertencia/10 text-advertencia" },
  healthy: { label: "🟢 Saludable", classes: "bg-exito/10 text-exito" },
};
const SIGNAL_STYLES: Record<string, string> = {
  critical: "bg-error/10 text-error",
  moderate: "bg-advertencia/10 text-advertencia",
  ok: "bg-muted text-muted-foreground",
};

const fmtMoney = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "2-digit" });
const fmtPhone = (digits: string) => (digits.startsWith("51") && digits.length === 11
  ? `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  : `+${digits}`);

export default async function AdminPage() {
  if (!(await isAdminUser())) redirect("/login");

  const db = admin();
  // select("*"): no se rompe si alguna migración todavía no se aplicó.
  const { data: clinics } = await db
    .from("clinics")
    .select("*, patients(created_at)")
    .order("created_at", { ascending: false });

  if (!clinics?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Panel de retención</h1>
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No hay clínicas registradas aún.
        </div>
      </div>
    );
  }

  // Datos externos en paralelo: correos de dueños, sesiones de WhatsApp, estadísticas.
  const [linked, stats, owners, openErrors] = await Promise.all([
    fetchLinkedAccounts(),
    loadClinicStats(clinics.map((c: any) => ({ id: c.id, settings: c.settings }))),
    Promise.all(
      clinics.map(async (c: any) => {
        if (!c.owner_id) return [c.id, null] as const;
        const { data } = await db.auth.admin.getUserById(c.owner_id);
        return [c.id, data?.user?.email ?? null] as const;
      })
    ),
    db
      .from("system_events")
      .select("clinic_id")
      .eq("level", "error")
      .is("resolved_at", null)
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()),
  ]);
  const ownerEmail = new Map(owners);
  const errorsByClinic = new Map<string, number>();
  for (const e of openErrors.data ?? []) {
    if (e.clinic_id) errorsByClinic.set(e.clinic_id, (errorsByClinic.get(e.clinic_id) ?? 0) + 1);
  }

  const ranked = clinics
    .map((row: any) => {
      const ctx = mapClinic(row);
      const patients = (row.patients as any[]) ?? [];
      const lastPatient = patients.map((p) => p.created_at).filter(Boolean).sort().reverse()[0] ?? null;
      const account = row.wa_session_id ? linked.get(row.wa_session_id) : undefined;
      const waLive: "conectado" | "desconectado" | "sin_conectar" = !row.wa_session_id
        ? "sin_conectar"
        : account?.state === "open"
          ? "conectado"
          : "desconectado";
      const metaOn = !!(ctx.settings.meta_page_id && ctx.settings.meta_page_token);
      const st = stats.byClinic.get(row.id);
      const signals = computeSignals({ ...row, last_patient_created_at: lastPatient }, waLive);
      return {
        row,
        ctx,
        account,
        waLive,
        metaOn,
        st,
        total_patients: patients.length,
        signals,
        churnLevel: computeChurnLevel(signals),
        email: ownerEmail.get(row.id) ?? null,
        errors24h: errorsByClinic.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => {
      const order: Record<ChurnLevel, number> = { critical: 0, "at-risk": 1, healthy: 2 };
      return order[a.churnLevel] - order[b.churnLevel];
    });

  const counts = {
    critical: ranked.filter((c) => c.churnLevel === "critical").length,
    atRisk: ranked.filter((c) => c.churnLevel === "at-risk").length,
    healthy: ranked.filter((c) => c.churnLevel === "healthy").length,
  };
  const totals = ranked.reduce(
    (t, c) => ({
      msgs: t.msgs + (c.st?.inbound ?? 0),
      ai: t.ai + (c.st?.ai ?? 0),
      bookings: t.bookings + (c.st?.bookings ?? 0),
      revenue: t.revenue + (c.st?.revenueEstimate ?? 0),
    }),
    { msgs: 0, ai: 0, bookings: 0, revenue: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de retención</h1>
        <p className="text-sm text-muted-foreground">
          Clínicas ordenadas por riesgo de abandono — actúa primero en las rojas. Cifras de los últimos 30 días.
        </p>
      </div>

      {!stats.ready && (
        <div className="rounded-xl border border-advertencia/30 bg-advertencia/10 p-4 text-sm text-advertencia">
          Falta aplicar la migración <strong>0012</strong> en Supabase para ver mensajes, automatización, citas e
          ingresos por clínica y para gestionar planes.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-error/30 bg-error/5 p-4">
          <p className="text-xs font-medium text-error">Churn inminente</p>
          <p className="mt-1 text-3xl font-bold text-error">{counts.critical}</p>
        </div>
        <div className="rounded-xl border border-advertencia/30 bg-advertencia/5 p-4">
          <p className="text-xs font-medium text-advertencia">En riesgo</p>
          <p className="mt-1 text-3xl font-bold text-advertencia">{counts.atRisk}</p>
        </div>
        <div className="rounded-xl border border-exito/30 bg-exito/5 p-4">
          <p className="text-xs font-medium text-exito">Saludable</p>
          <p className="mt-1 text-3xl font-bold text-exito">{counts.healthy}</p>
        </div>
      </div>

      {stats.ready && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Mensajes recibidos", totals.msgs.toLocaleString("es-PE")],
            ["Solicitudes de cita", totals.bookings.toLocaleString("es-PE")],
            ["Ingreso potencial (est.)", fmtMoney(totals.revenue)],
            [`Respuestas con IA · ≈ $${(totals.ai * AI_COST_PER_RESPONSE_USD).toFixed(2)}`, totals.ai.toLocaleString("es-PE")],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {ranked.map((c) => {
          const { row, ctx, st } = c;
          const badge = CHURN_BADGE[c.churnLevel];
          const plan = ctx.plan;
          const planLabel =
            plan.status === "suspended" ? "Suspendido" : !plan.active ? "Vencido" : plan.status === "active" ? "Activo" : "Prueba";
          const planCls =
            plan.status === "suspended" || !plan.active
              ? "bg-error/10 text-error"
              : plan.status === "active"
                ? "bg-exito/10 text-exito"
                : "bg-advertencia/10 text-advertencia";
          const clientDays = daysSince(row.created_at);
          const waNumber = c.account?.number ?? String(row.wa_phone_number ?? "").replace(/\D/g, "");
          const waLink = waNumber
            ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
                "Hola, soy Jhordan de Cohortech. ¿Cómo están llevando el sistema? Quería saber si necesitan ayuda con algo."
              )}`
            : null;
          const chip = "rounded-full px-2.5 py-1 text-xs font-medium";

          return (
            <div key={row.id} className={`rounded-xl border p-5 shadow-sm ${CHURN_STYLES[c.churnLevel]}`}>
              {/* Cabecera */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{row.name}</h2>
                    <span className={`${chip} ${badge.classes}`}>{badge.label}</span>
                    <span className={`${chip} ${planCls}`}>{planLabel}</span>
                    {plan.expiresAt && (
                      <span className="text-xs text-muted-foreground">hasta {fmtDay(plan.expiresAt)}</span>
                    )}
                    {!plan.expiresAt && plan.status === "active" && (
                      <span className="text-xs text-muted-foreground">sin vencimiento</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.email ?? "sin correo"} · Cliente hace {clientDays ?? "?"} días · {c.total_patients} pacientes
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <ImpersonateButton clinicId={row.id} clinicName={row.name} />
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                    >
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {/* Canales */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`${chip} ${
                    c.waLive === "conectado" ? "bg-exito/10 text-exito" : "bg-error/10 text-error"
                  }`}
                >
                  WhatsApp {c.waLive === "conectado" ? "✓" : c.waLive === "sin_conectar" ? "sin conectar" : "✗"}
                </span>
                {ctx.modules.multichannel && (
                  <>
                    <span className={`${chip} ${c.metaOn ? "bg-exito/10 text-exito" : "bg-advertencia/10 text-advertencia"}`}>
                      Messenger {c.metaOn ? "✓" : "sin conectar"}
                    </span>
                    <span className={`${chip} ${c.metaOn ? "bg-exito/10 text-exito" : "bg-advertencia/10 text-advertencia"}`}>
                      Instagram {c.metaOn ? "✓" : "sin conectar"}
                    </span>
                    <span
                      className={`${chip} ${
                        ctx.settings.webchat_enabled === false ? "bg-muted text-muted-foreground" : "bg-exito/10 text-exito"
                      }`}
                    >
                      Chat web {ctx.settings.webchat_enabled === false ? "apagado" : "✓"}
                    </span>
                  </>
                )}
                {c.errors24h > 0 && (
                  <a href="/admin/audit" className={`${chip} bg-error/10 font-semibold text-error`}>
                    ⚠ {c.errors24h} errores abiertos (24 h)
                  </a>
                )}
              </div>

              {/* Contacto */}
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="inline text-muted-foreground">WhatsApp enlazado: </dt>
                  <dd className="inline font-medium">
                    {c.account?.number ? (
                      <>
                        <a href={`https://wa.me/${c.account.number}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {fmtPhone(c.account.number)}
                        </a>
                        {c.account.profileName ? ` · ${c.account.profileName}` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Recepcionista: </dt>
                  <dd className="inline font-medium">{row.receptionist_phone ?? "no configurada"}</dd>
                </div>
              </dl>

              {/* Métricas 30 días */}
              {st && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    ["Msgs", st.inbound.toLocaleString("es-PE"), "Mensajes recibidos (30 d)"],
                    ["Auto", `${st.autoPct}%`, "Respuestas resueltas sin derivar a una persona"],
                    ["IA", st.ai.toLocaleString("es-PE"), "Respuestas generadas con IA"],
                    ["Citas", st.bookings.toLocaleString("es-PE"), "Pacientes que pidieron agendar (solicitudes)"],
                    ["Ingresos", fmtMoney(st.revenueEstimate), "Estimado: precio del tratamiento de interés de quienes pidieron cita"],
                    ["Última actividad", fmtDateTime(st.lastMessageAt ?? row.last_wa_message_at ?? null), "Último mensaje"],
                  ].map(([label, value, hint]) => (
                    <div key={label} title={hint} className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Módulos y plan */}
              <ModuleToggles
                clinicId={row.id}
                initial={{
                  reception: ctx.modules.reception,
                  recovery: ctx.modules.recovery,
                  multichannel: ctx.modules.multichannel,
                }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">Plan:</span>
                <PlanActions clinicId={row.id} suspended={plan.status === "suspended"} />
              </div>

              {/* Señales de riesgo */}
              {c.signals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.signals.map((signal, i) => (
                    <span key={i} className={`${chip} ${SIGNAL_STYLES[signal.level]}`}>
                      {signal.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
