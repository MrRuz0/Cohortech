import { decide } from "../lib/conversation/engine";
import { validateReply } from "../lib/conversation/validate";
import { mapClinic } from "../lib/conversation/db";
import { detectOptOut } from "../lib/conversation/intents";
import type { ClinicContext, HistoryMessage, PatientState, Promotion } from "../lib/conversation/types";

const services: { name: string; price: string; durationMin?: number }[] = [
  ["Limpieza facial profunda", "S/90"],
  ["Eliminación de lunares", "desde S/50 (según tamaño)"],
  ["Eliminación de verrugas", "desde S/25 (según tamaño)"],
  ["Masajes desestresantes", "S/65"],
  ["Masajes reductores", "12 sesiones x S/500"],
  ["Lipopapada Enzimática", "S/150"],
  ["Lifting de pestañas", "S/50"],
  ["Laminado de cejas", "S/50"],
  ["Henna de cejas", "S/50"],
  ["Depilación facial con cera", "S/60"],
  ["Microblading de cejas", "S/350"],
  ["Pigmentación de labios", "S/300"],
  ["Delineado de párpados", "S/250"],
  ["Cóctel de vitaminas", "S/250"],
  ["Calcio ampolla", "S/50"],
  ["Hierro ampolla", "S/50"],
  ["Extensión de pestañas pelo a pelo", "S/150"],
].map(([name, price]) => ({ name, price }));

const clinic: ClinicContext = {
  id: "c1",
  name: "Clínica Piloto",
  services,
  hours: "Lunes a sábado de 9:00 a 19:00",
  address: "Av. Ejército 123, Arequipa",
  bookingPhone: "+51 932 900 766",
  maxDiscountPercent: 10,
  receptionistPhone: null,
  ownPhone: null,
  waSessionId: "clinic_c1",
  timezone: "America/Lima",
  botPaused: false,
  settings: {},
};

const basePatient: PatientState = {
  id: "p1",
  fullName: "Ana Pérez",
  phone: "51999111222",
  waContactId: null,
  channel: "whatsapp",
  isBlocked: false,
  blockedReason: null,
  botPausedUntil: null,
  lastTemplateKey: null,
  aiFallbackStreak: 0,
  negotiationStage: 0,
  lastDiscountOffered: null,
  profile: {},
};

let failed = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) console.log("    →", typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

const rand = () => 0.3;
function run(text: string, opts: { patient?: Partial<PatientState>; history?: HistoryMessage[]; promos?: Promotion[]; clinic?: Partial<ClinicContext>; media?: string } = {}) {
  return decide({
    text,
    mediaType: opts.media ?? null,
    clinic: { ...clinic, ...opts.clinic },
    patient: { ...basePatient, ...opts.patient },
    promos: opts.promos ?? [],
    history: opts.history ?? [],
    rand,
  });
}
const out = (d: ReturnType<typeof decide>) => d.text ?? "";

// 1. Saludo puro vs saludo + pregunta
let d = run("Hola");
check("saludo → greeting", d.kind === "reply" && d.intent === "greeting", d);
d = run("Hola buenas tardes, quería saber si hacen peeling químico");
check("saludo + pregunta NO es saludo (va a IA)", d.kind === "ai", d);

// 2. Precios y servicios
d = run("cuanto cuesta la limpieza facial?");
check("precio exacto limpieza facial", out(d).includes("S/90") && d.intent === "price_inquiry", out(d));
d = run("precios");
check("lista de precios con tope", out(d).includes("•") && out(d).includes("más"), out(d));
d = run("cuánto cuesta el microblading");
check("microblading S/350", out(d).includes("S/350"), out(d));
d = run("cuanto cuesta pestañas");
check("pestañas ambiguo lista ambas", out(d).includes("Lifting de pestañas") && out(d).includes("Extensión de pestañas"), out(d));
d = run("precio de las cejas");
check("cejas ambiguo lista 3", out(d).includes("Laminado") && out(d).includes("Henna") && out(d).includes("Microblading"), out(d));
d = run("cuanto sale el masaje reductor");
check("masaje reductor exacto", out(d).includes("500") && !out(d).includes("desestresantes"), out(d));
d = run("cuanto cuesta eliminar lunares");
check("lunares encontrado", out(d).includes("lunares"), out(d));
d = run("cuanto cuesta el microbleiding"); // error de tipeo
check("tolera error de tipeo", out(d).includes("S/350"), out(d));

// 3. Falsos positivos que tenía Recepción IA
d = run("muchas gracias por la atención doctora");
check("gracias por la atención ≠ horario", d.intent === "thanks", d);
d = run("quiero cancelar mi cita");
check("cancelar cita ≠ agendar", d.intent === "cancel_reschedule" && d.notify?.reason === "cancel_reschedule", d);
d = run("no quiero agendar, gracias");
check("no quiero agendar → decline", d.intent === "decline", d);
d = run("me salió muy caro");
check("'me salió caro' ≠ urgencia médica", d.intent === "price_objection", d);
d = run("quiero información para bajar de peso");
check("'bajar de peso' no es opt-out", !detectOptOut("quiero información para bajar de peso"), d);

// 4. Seguridad
d = run("no me escriban más por favor");
check("opt-out bloquea", d.updates.block?.reason === "opt_out", d);
check("opt-out sin venta", !/agend/i.test(out(d)), out(d));
d = run("me duele mucho y se me hinchó la cara");
check("urgencia → alta prioridad + pausa", d.intent === "urgent_medical" && d.notify?.priority === "high" && d.updates.pauseBotHours === 24, d);
d = run("quiero poner una queja, pésimo servicio");
check("reclamo → humano", d.intent === "complaint" && d.notify?.priority === "high", d);
d = run("", { media: "audio" });
check("audio → respuesta + aviso", d.kind === "reply" && d.notify?.reason === "media", d);
d = run("👍");
check("emoji solo → silencio", d.kind === "silent", d);

// 5. Negociación (escalera) respetando el máximo
d = run("está muy caro", { patient: { negotiationStage: 0 } });
check("objeción 1: valor, sin descuento", d.updates.negotiationStage === 1 && d.updates.lastDiscountOffered === undefined && !/%/.test(out(d)), out(d));
d = run("sigue caro", { patient: { negotiationStage: 1 } });
check("objeción 2: ofrece ~mitad (5%)", d.updates.lastDiscountOffered === 5 && out(d).includes("5%"), out(d));
d = run("todavía caro", { patient: { negotiationStage: 2 } });
check("objeción 3: ofrece máximo (10%)", d.updates.lastDiscountOffered === 10 && out(d).includes("10%"), out(d));
d = run("sigue caro", { patient: { negotiationStage: 3 } });
check("objeción 4: pasa a humano", d.notify?.reason === "negotiation_limit" && d.updates.pauseBotHours === 12, d);
d = run("está caro", { patient: { negotiationStage: 1 }, clinic: { maxDiscountPercent: 0 } });
check("sin descuento permitido → nunca ofrece %", !/%/.test(out(d)) && d.notify?.reason === "negotiation_limit", out(d));
d = run("cuánto cuesta el microblading, está caro", { patient: { negotiationStage: 1 } });
check("calcula precio con descuento solo si es monto fijo", out(d).includes("S/350") && out(d).includes("S/333"), out(d));
d = run("lo voy a pensar");
check("'lo voy a pensar' no presiona", d.intent === "thinking" && d.updates.followupInDays === 3 && !/%/.test(out(d)), out(d));

// 6. Promociones
const promo: Promotion = {
  id: "pr1", name: "Mes de la belleza", description: "Válido para nuevas pacientes", discount_percent: 15,
  service_name: "Limpieza facial profunda", starts_at: null, ends_at: null, is_active: true,
};
d = run("tienen alguna promoción?", { promos: [promo] });
check("lista promos reales", out(d).includes("Mes de la belleza") && out(d).includes("15%"), out(d));
d = run("tienen alguna promoción?", { promos: [], clinic: { maxDiscountPercent: 0 } });
check("sin promos no inventa", !/%/.test(out(d)) && /no tenemos/i.test(out(d)), out(d));
d = run("cuanto cuesta la limpieza facial", { promos: [promo] });
check("precio + promo vigente", out(d).includes("S/90") && out(d).includes("Mes de la belleza"), out(d));

// 7. Agendar y memoria corta
d = run("quiero agendar un microblading");
check("agendar con servicio", d.intent === "booking" && out(d).includes("Microblading") && d.notify?.reason === "booking", out(d));
d = run("sí", { history: [{ direction: "outbound", text: "¿Te gustaría agendar una cita?", at: "" }] });
check("'sí' tras CTA = agendar", d.intent === "booking", d);
d = run("sí", { history: [] });
check("'sí' sin contexto = confirmación social", d.intent === "confirmation", d);
d = run("y cuánto cuesta?", {
  history: [{ direction: "outbound", text: "Te cuento: el Microblading de cejas es una técnica semipermanente", at: "" }],
});
check("memoria: 'y cuánto cuesta?' usa el servicio de la conversación", out(d).includes("S/350"), out(d));
d = run("precios", { patient: { profile: { interested_services: ["Microblading de cejas"] } } });
check("'precios' con servicio recordado sigue mostrando lista", out(d).includes("•"), out(d));

// 8. Horario / ubicación / datos faltantes (no inventar)
d = run("a qué hora atienden y dónde quedan?");
check("horario + ubicación juntos", out(d).includes("9:00") && out(d).includes("Ejército"), out(d));
d = run("a qué hora atienden", { clinic: { hours: undefined } });
check("sin horario configurado no inventa y avisa", d.notify?.reason === "missing_info" && !/\d{1,2}:\d{2}/.test(out(d)), out(d));

// 8b. Duración de los tratamientos
{
  const withDur = services.map((s) => ({ ...s }));
  const setDur = (name: string, min: number) => {
    const s = withDur.find((x) => x.name === name);
    if (s) s.durationMin = min;
  };
  setDur("Limpieza facial profunda", 60);
  setDur("Microblading de cejas", 120);
  setDur("Calcio ampolla", 30);
  setDur("Lifting de pestañas", 90);
  const c = { clinic: { services: withDur } };

  d = run("cuánto dura la limpieza facial?", c);
  check("duración exacta en horas", out(d).includes("1 hora") && d.intent === "duration_inquiry", out(d));
  d = run("cuanto demora el microblading", c);
  check("duración 2 horas", out(d).includes("2 horas"), out(d));
  d = run("cuántos minutos es el calcio", c);
  check("duración en minutos", out(d).includes("30 min"), out(d));
  d = run("cuanto dura el lifting de pestañas", c);
  check("duración mixta 1 h 30 min", out(d).includes("1 h 30 min"), out(d));
  d = run("cuánto cuesta y cuánto dura el microblading", c);
  check("precio + duración en una respuesta", out(d).includes("S/350") && out(d).includes("2 horas"), out(d));
  d = run("cuánto dura el tratamiento de cejas", c);
  check("duración ambigua pregunta cuál", out(d).includes("•"), out(d));
  d = run("cuánto dura la limpieza facial?");
  check("sin duración configurada no inventa y avisa", d.notify?.reason === "missing_info" && !/\d+\s?(min|hora)/.test(out(d)), out(d));
}

// 9. Complejidad → IA
d = run("hola, quiero saber el precio de la limpieza facial y si es doloroso porque tengo la piel muy sensible y me salen granos seguido? además trabajo mucho");
check("mensaje complejo → IA", d.kind === "ai", d);

// 10. Rotación y limpieza
const seen = new Set<string>();
let key: string | null = null;
for (let i = 0; i < 12; i++) {
  const r = decide({ text: "hola", clinic, patient: { ...basePatient, lastTemplateKey: key }, promos: [], history: [], rand: Math.random });
  check("sin placeholders sueltos", !/\{[a-zA-Z]+\}/.test(out(r)), out(r));
  check("rotación: no repite la anterior", r.templateKey !== key, { key, next: r.templateKey });
  key = r.templateKey ?? null;
  seen.add(out(r));
}
check("hay variedad real de saludos", seen.size >= 4, seen.size);

// 11. Validación de respuestas de IA
check("acepta precio real", validateReply("La limpieza cuesta S/90.", clinic, []).ok);
check("acepta precio con descuento válido", validateReply("Con 10% quedaría en S/81.", clinic, []).ok);
check("rechaza precio inventado", !validateReply("Cuesta S/120.", clinic, []).ok);
check("rechaza descuento mayor al permitido", !validateReply("Te doy 30% de descuento.", clinic, []).ok);
check("rechaza link inventado", !validateReply("Reserva en https://malicioso.com/x", clinic, []).ok);
check("rechaza teléfono inventado", !validateReply("Llámanos al 987 654 321.", clinic, []).ok);
check("acepta teléfono configurado", validateReply("Llámanos al +51 932 900 766.", clinic, []).ok);
check("rechaza placeholder", !validateReply("Hola {name}", clinic, []).ok);

// 12. Plan por clínica (cobro manual) y módulos
{
  const base = { id: "c", name: "X", settings: {} } as Record<string, any>;
  const day = 86_400_000;
  check("plan: sin columnas → activo", mapClinic(base).plan.active === true);
  check("plan: active sin vencimiento", mapClinic({ ...base, plan_status: "active", plan_expires_at: null }).plan.active);
  check("plan: vencido → inactivo", !mapClinic({ ...base, plan_status: "active", plan_expires_at: new Date(Date.now() - day).toISOString() }).plan.active);
  check("plan: suspendido → inactivo", !mapClinic({ ...base, plan_status: "suspended" }).plan.active);
  check("plan: prueba vigente → activo", mapClinic({ ...base, plan_status: "trial", plan_expires_at: new Date(Date.now() + day).toISOString() }).plan.active);
  check(
    "módulos: multicanal activo por defecto y apagable",
    mapClinic(base).modules.multichannel === true &&
      mapClinic({ ...base, settings: { modules: { multichannel: false } } }).modules.multichannel === false
  );
}

console.log(`\n${passed} OK, ${failed} fallos`);
process.exit(failed ? 1 : 0);
