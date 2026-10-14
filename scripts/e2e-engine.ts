/**
 * Prueba de punta a punta del motor contra la base REAL y OpenAI REAL.
 * Usa el canal "webchat" (no envía nada por WhatsApp) y una clínica temporal
 * que se borra al terminar (ON DELETE CASCADE limpia pacientes y mensajes).
 *
 *   npx tsx --env-file=.env.local scripts/e2e-engine.ts
 */
import { admin, getSchemaFlags, invalidateClinic } from "../lib/conversation/db";
import { handleInbound } from "../lib/conversation/handle";

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

async function main() {
  const flags = await getSchemaFlags(true);
  console.log("Esquema:", flags);

  const { data: clinic, error } = await db
    .from("clinics")
    .insert({
      name: "ZZ Prueba Motor",
      max_discount_percent: 10,
      settings: {
        services: [
          { name: "Limpieza facial profunda", price: "S/90" },
          { name: "Microblading de cejas", price: "S/350" },
          { name: "Masajes reductores", price: "12 sesiones x S/500" },
        ],
        hours: "Lunes a sábado de 9:00 a 19:00",
        address: "Av. Ejército 123, Arequipa",
      },
    })
    .select("id")
    .single();
  if (error || !clinic) throw new Error(`No se pudo crear la clínica de prueba: ${error?.message}`);
  const clinicId = clinic.id as string;

  const session = `e2e${Date.now()}abcdef`;
  let seq = 0;
  const say = async (text: string) => {
    const r = await handleInbound({
      clinicId,
      channel: "webchat",
      externalId: `web:${session}`,
      displayName: "Ana",
      text,
      messageId: `web:e2e-${session}-${seq++}`,
      debounceMs: 0,
    });
    console.log(`\n👤 ${text}\n🤖 [${r.status}] ${r.reply ?? "(sin respuesta)"}`);
    return r;
  };

  try {
    let r = await say("Hola");
    check("saludo responde", r.status === "replied" && !!r.reply);

    r = await say("cuánto cuesta la limpieza facial?");
    check("precio exacto", !!r.reply?.includes("S/90"), r.reply);

    r = await say("precio del microblading");
    check("precio de otro servicio", !!r.reply?.includes("S/350"), r.reply);

    r = await say("a qué hora atienden?");
    check("horario real", !!r.reply?.includes("9:00"), r.reply);

    r = await say("está muy caro");
    check("objeción sin inventar descuento", r.status === "replied" && !/\d+\s?%/.test(r.reply ?? ""), r.reply);

    r = await say("sigue caro");
    if (flags.patientsExtended) {
      check("2.ª objeción ofrece 5% (mitad del máximo)", !!r.reply?.includes("5%"), r.reply);
      r = await say("todavía no me alcanza");
      check("3.ª objeción ofrece el máximo 10%", !!r.reply?.includes("10%"), r.reply);
    } else {
      console.log("  (migración 0010 pendiente: escalera de negociación omitida)");
    }

    r = await say(
      "La limpieza facial profunda sirve si tengo la piel muy sensible y me salen granos seguido? además trabajo mucho y no sé si tengo tiempo"
    );
    check("pregunta compleja → IA responde", r.status === "replied" && !!r.reply, r);
    check("la IA no inventa precios", !/S\/\s?(?!90\b|350\b|500\b|81\b|315\b|450\b)\d+/.test(r.reply ?? ""), r.reply);

    r = await say("quiero agendar la limpieza facial para mañana");
    check("agendar responde y avisa", r.status === "replied" && /Limpieza facial/i.test(r.reply ?? ""), r.reply);

    // Duplicado exacto (mismo id) no debe responder dos veces
    const dup = await handleInbound({
      clinicId,
      channel: "webchat",
      externalId: `web:${session}`,
      text: "quiero agendar la limpieza facial para mañana",
      messageId: `web:e2e-${session}-${seq - 1}`,
      debounceMs: 0,
    });
    check("mensaje duplicado se ignora", dup.status === "duplicate", dup);

    r = await say("no me escriban más por favor");
    check("baja voluntaria confirmada", r.status === "replied" && /no (te|volver)/i.test(r.reply ?? ""), r.reply);
    if (flags.patientsExtended) {
      r = await say("hola de nuevo");
      check("tras darse de baja, si vuelve a escribir se le atiende", r.status === "replied", r);
    }

    // Verificación en BD
    const { data: patient } = await db
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("phone_e164", `web:${session}`)
      .single();
    check("paciente creado con nombre", patient?.full_name === "Ana", patient?.full_name);
    check("canal registrado", patient?.channel_source === "webchat", patient?.channel_source);

    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patient?.id);
    check("mensajes guardados (entrantes + salientes)", (count ?? 0) >= 16, count);

    // ── Módulos: recepción apagada, solo recuperación ──────────────
    await db
      .from("clinics")
      .update({
        settings: {
          services: [{ name: "Limpieza facial profunda", price: "S/90" }],
          modules: { reception: false, recovery: true },
        },
      })
      .eq("id", clinicId);
    invalidateClinic(clinicId);

    const other = `e2eb${Date.now()}abcdef`;
    const sayAs = (sess: string, text: string) =>
      handleInbound({
        clinicId,
        channel: "webchat",
        externalId: `web:${sess}`,
        text,
        messageId: `web:e2e-${sess}-${seq++}`,
        debounceMs: 0,
      });

    let m = await sayAs(other, "hola, cuánto cuesta la limpieza facial");
    check("recepción apagada: un contacto nuevo NO recibe respuesta", m.status === "ignored", m);

    await db
      .from("patients")
      .update({ last_reactivation_sent_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("phone_e164", `web:${other}`);
    m = await sayAs(other, "hola, cuánto cuesta la limpieza facial");
    check("recepción apagada: quien fue reactivado SÍ recibe respuesta", m.status === "replied" && !!m.reply?.includes("S/90"), m);

    // La marca de reactivación se limpia (lo hace el cron) y la conversación sigue abierta.
    await db
      .from("patients")
      .update({ last_reactivation_sent_at: null })
      .eq("clinic_id", clinicId)
      .eq("phone_e164", `web:${other}`);
    m = await sayAs(other, "y a qué hora atienden?");
    check("la conversación de recuperación sigue abierta tras limpiar la marca", m.status !== "ignored", m);
  } finally {
    await db.from("clinics").delete().eq("id", clinicId);
    console.log("\n(clínica de prueba eliminada)");
  }

  console.log(`\n${passed} OK, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Error en la prueba:", e);
  process.exit(1);
});
