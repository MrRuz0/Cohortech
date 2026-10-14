/**
 * Simula meses de recuperación en minutos, contra la base REAL pero con una
 * clínica temporal en modo simulación (settings.dry_run): toda la lógica corre
 * igual, pero NO sale ningún mensaje a WhatsApp. La clínica se borra al final.
 *
 *   npx tsx --env-file=.env.local scripts/simulate-recovery.ts
 *
 * "Viajar en el tiempo" = retroceder fechas guardadas (last_contact_at,
 * last_reactivation_sent_at, next_followup_at) y volver a ejecutar el cron.
 */
import { NextRequest } from "next/server";
import { GET as dispatch } from "../app/api/cron/dispatch/route";
import { GET as followups } from "../app/api/cron/followups/route";
import { admin } from "../lib/conversation/db";

const db = admin();
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail !== undefined ? `→ ${JSON.stringify(detail)}` : "");
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

type Handler = (req: NextRequest) => Promise<Response>;
async function run(handler: Handler, clinicId: string, extra = "") {
  const req = new NextRequest(`http://localhost/api/cron?clinic=${clinicId}${extra}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await handler(req);
  return (await res.json()) as Record<string, any>;
}

async function main() {
  if (!process.env.CRON_SECRET) throw new Error("Falta CRON_SECRET (usa --env-file=.env.local)");

  const { data: clinic, error } = await db
    .from("clinics")
    .insert({
      name: "ZZ Simulación Recuperación",
      wa_session_id: "dry_sim",
      max_discount_percent: 10,
      settings: {
        dry_run: true,
        reactivation_after_days: 90,
        services: [{ name: "Limpieza facial profunda", price: "S/90" }],
      },
    })
    .select("id")
    .single();
  if (error || !clinic) throw new Error(`No se pudo crear la clínica: ${error?.message}`);
  const clinicId = clinic.id as string;

  const phone = (n: number) => `51988${String(n).padStart(6, "0")}`;
  const base = { clinic_id: clinicId, channel_source: "whatsapp", status: "lead" };

  try {
    // ── Pacientes de prueba ───────────────────────────────────────────
    const rows = [
      { ...base, phone_e164: phone(1), full_name: "A Inactivo 100d", last_contact_at: daysAgo(100) },
      { ...base, phone_e164: phone(2), full_name: "B Reciente 30d", last_contact_at: daysAgo(30) },
      { ...base, phone_e164: phone(3), full_name: "C Bloqueado", last_contact_at: daysAgo(100), is_blocked: true, blocked_reason: "manual" },
      { ...base, phone_e164: phone(4), full_name: "D Atiende persona", last_contact_at: daysAgo(100), bot_paused_until: daysAhead(1) },
      { ...base, phone_e164: "web:simulacion123", full_name: "E Chat web", last_contact_at: daysAgo(100), channel_source: "webchat" },
      { ...base, phone_e164: phone(6), full_name: "F Sin respuesta 1.er intento", last_contact_at: daysAgo(100), reactivation_attempts_count: 1, last_reactivation_sent_at: daysAgo(4) },
      { ...base, phone_e164: phone(7), full_name: "G Respondió y se enfrió", last_contact_at: daysAgo(95), reactivation_attempts_count: 1, last_reactivation_sent_at: daysAgo(120) },
      { ...base, phone_e164: phone(8), full_name: "H Agotó intentos", last_contact_at: daysAgo(100), reactivation_attempts_count: 2, last_reactivation_sent_at: daysAgo(4) },
    ];
    const { error: pErr } = await db.from("patients").insert(rows);
    if (pErr) throw new Error(`pacientes: ${pErr.message}`);

    const { data: list } = await db.from("patients").select("*").eq("clinic_id", clinicId);
    const byName = (prefix: string) => (list ?? []).find((p: any) => p.full_name.startsWith(prefix))!;
    const get = async (prefix: string) => {
      const { data } = await db.from("patients").select("*").eq("id", byName(prefix).id).single();
      return data as Record<string, any>;
    };

    // ── Fase 1: vista previa (no debe modificar nada) ─────────────────
    console.log("\n▶ Fase 1 — Vista previa de hoy (sin efectos)");
    let r = await run(dispatch as Handler, clinicId, "&preview=1");
    check("preview: A (1.er intento) y F (2.º intento) saldrían hoy", r.wouldSend?.length === 2, r);
    check("preview: B, C, D y E NO reciben nada", !JSON.stringify(r.wouldSend).includes("0002") && !JSON.stringify(r.wouldSend).includes("0003"), r.wouldSend);
    check("preview: no tocó la base", (await get("A")).reactivation_attempts_count === 0 || (await get("A")).reactivation_attempts_count === null);

    // ── Fase 2: día 0 ─────────────────────────────────────────────────
    console.log("\n▶ Fase 2 — Día 0: primera corrida real (simulada)");
    r = await run(dispatch as Handler, clinicId);
    check("A recibe 1.er intento", (await get("A")).reactivation_attempts_count === 1);
    check("F recibe 2.º intento", (await get("F")).reactivation_attempts_count === 2);
    check("G (había respondido) se reinicia", (await get("G")).reactivation_attempts_count === 0 && (await get("G")).last_reactivation_sent_at === null);
    check("H (agotó intentos) queda en pausa 12 meses", !!(await get("H")).reactivation_paused_until && (await get("H")).reactivation_attempts_count === 0);
    check("B (30 días) NO se contacta", ((await get("B")).reactivation_attempts_count ?? 0) === 0);
    check("C (bloqueado) NO se contacta", ((await get("C")).reactivation_attempts_count ?? 0) === 0);
    check("D (atiende una persona) NO se contacta", ((await get("D")).reactivation_attempts_count ?? 0) === 0);
    check("E (chat web) NO se contacta por WhatsApp", ((await get("E")).reactivation_attempts_count ?? 0) === 0);
    check("contadores del cron coherentes", r.firstAttempt >= 1 && r.secondAttempt >= 1 && r.paused === 1, r);

    // ── Fase 3: mismo día otra vez (idempotencia) ─────────────────────
    console.log("\n▶ Fase 3 — Misma jornada: no debe duplicar envíos");
    const a1 = (await get("A")).reactivation_attempts_count;
    r = await run(dispatch as Handler, clinicId);
    check("A no recibe un segundo mensaje el mismo día", (await get("A")).reactivation_attempts_count === a1);
    check("F no recibe un 3.er mensaje", (await get("F")).reactivation_attempts_count === 2);

    // ── Fase 4: viaje en el tiempo (+4 días) ──────────────────────────
    console.log("\n▶ Fase 4 — +4 días: A recibe el 2.º intento, F pasa a pausa");
    await db.from("patients").update({ last_reactivation_sent_at: daysAgo(4) }).in("id", [byName("A").id, byName("F").id]);
    r = await run(dispatch as Handler, clinicId);
    check("A recibe el 2.º intento", (await get("A")).reactivation_attempts_count === 2);
    check("F (2 intentos sin respuesta) pasa a pausa de 12 meses", !!(await get("F")).reactivation_paused_until);

    // ── Fase 5: +4 días más ───────────────────────────────────────────
    console.log("\n▶ Fase 5 — +4 días más: A agota intentos");
    await db.from("patients").update({ last_reactivation_sent_at: daysAgo(4) }).eq("id", byName("A").id);
    r = await run(dispatch as Handler, clinicId);
    const aFinal = await get("A");
    check("A queda en pausa de 12 meses", !!aFinal.reactivation_paused_until);
    const monthsAhead = (new Date(aFinal.reactivation_paused_until).getTime() - Date.now()) / (30 * 86_400_000);
    check("la pausa dura ~12 meses", monthsAhead > 11 && monthsAhead < 13, monthsAhead);

    console.log("\n▶ Fase 6 — Día 120: nadie vuelve a ser contactado");
    r = await run(dispatch as Handler, clinicId, "&preview=1");
    check("no queda nadie por contactar", (r.wouldSend ?? []).length === 0, r.wouldSend);

    // ── Fase 7: seguimientos por cohorte (4 etapas y cierre) ─────────
    console.log("\n▶ Fase 7 — Seguimientos por cohorte (usa IA real)");
    const { data: cohort } = await db
      .from("cohort_definitions")
      .insert({
        clinic_id: clinicId,
        name: "Interesados indecisos",
        behavioral_description: "Preguntan precios y no agendan",
        pain_point: "Duda si vale la pena la inversión",
        conversion_strategy: "social_proof",
        message_template: "Hola {{patient_name}}, ¿te ayudo a agendar?",
      })
      .select("id")
      .single();

    const mk = async (name: string, extra: Record<string, unknown>) => {
      const { data: p } = await db
        .from("patients")
        .insert({ ...base, phone_e164: phone(20 + Math.floor(Math.random() * 900)), full_name: name, ...extra })
        .select("id")
        .single();
      const { data: m } = await db
        .from("cohort_memberships")
        .insert({
          clinic_id: clinicId,
          patient_id: p!.id,
          cohort_id: cohort!.id,
          membership_status: "active",
          followup_stage: 0,
          next_followup_at: daysAgo(1),
        })
        .select("id")
        .single();
      return { patientId: p!.id as string, membershipId: m!.id as string };
    };
    const fa = await mk("FA Seguimiento normal", { last_contact_at: daysAgo(10) });
    const fb = await mk("FB Bloqueado", { last_contact_at: daysAgo(10), is_blocked: true, blocked_reason: "manual" });
    const fc = await mk("FC Escribió hace 2 h", { last_contact_at: new Date(Date.now() - 2 * 3_600_000).toISOString() });

    const stage = async (id: string) => {
      const { data } = await db.from("cohort_memberships").select("*").eq("id", id).single();
      return data as Record<string, any>;
    };

    for (let expected = 1; expected <= 4; expected++) {
      r = await run(followups as Handler, clinicId);
      const m = await stage(fa.membershipId);
      check(`etapa ${expected}: FA recibe el seguimiento ${expected}`, m.followup_stage === expected, { stage: m.followup_stage, r });
      await db.from("cohort_memberships").update({ next_followup_at: daysAgo(1) }).eq("id", fa.membershipId);
    }
    check("FB (bloqueado) nunca recibe seguimientos", (await stage(fb.membershipId)).followup_stage === 0);
    const mc = await stage(fc.membershipId);
    check("FC (escribió hace 2 h) no recibe seguimiento y se reprograma", mc.followup_stage === 0 && new Date(mc.next_followup_at).getTime() > Date.now());

    r = await run(followups as Handler, clinicId);
    const closed = await stage(fa.membershipId);
    check("tras la oferta final, el siguiente ciclo la marca como abandono (churned)", closed.membership_status === "churned", closed.membership_status);

    // ── Registro de mensajes ─────────────────────────────────────────
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("direction", "outbound");
    check("todos los envíos quedaron registrados (4 reactivaciones + 4 seguimientos = 8)", count === 8, count);
    const { count: logCount } = await db
      .from("followup_log")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId);
    check("followup_log tiene los 4 seguimientos", logCount === 4, logCount);
  } finally {
    await db.from("clinics").delete().eq("id", clinicId);
    console.log("\n(clínica de simulación eliminada)");
  }

  console.log(`\n${passed} OK, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Error en la simulación:", e);
  process.exit(1);
});
