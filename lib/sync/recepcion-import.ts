import OpenAI from "openai";

/**
 * Importación de pacientes desde Recepción IA: qué llega, cómo se decide el «porqué» de cada uno y qué cohortes se crean.
 * Lo que se puede saber por las citas se decide sin IA; solo quien preguntó y no agendó pasa por la IA (que lee su conversación).
 */

export type ImportMessage = { id: string; dir: "in" | "out"; text: string; at: string };
export type ImportAppointment = { at: string; status: string; service: string | null };
export type ImportPatient = {
  phone: string;
  name: string | null;
  last_contact_at: string | null;
  messages: ImportMessage[];
  appointments: ImportAppointment[];
};

export type Category = "atendido" | "agendado" | "no_asistio" | "precio" | "horario" | "adelanto" | "indeciso" | "sin_respuesta" | "solo_info" | "otro";

export const AI_CATEGORIES: Category[] = ["precio", "horario", "adelanto", "indeciso", "sin_respuesta", "solo_info", "otro"];

export const MAX_PATIENTS_PER_BATCH = 25;
const MAX_MESSAGES = 30;
const MAX_TEXT = 300;

export type Analysis = {
  category: Category;
  reason: string;
  treatment: string | null;
  pain_signals: string[];
};

/** Datos de la importación guardados en `patients.extracted_profile.recepcion`. */
export type ImportedProfile = Analysis & {
  analyzed_at: string;
  msg_count: number;
  appointments: { total: number; completed: number; last_status: string | null; last_at: string | null };
};

/** Cohortes que se crean. «atendido» queda como convertido (ya vino); el resto queda con el seguimiento en pausa hasta que la dueña apruebe. */
export const COHORT_DEFS: Record<Exclude<Category, "agendado" | "otro">, { name: string; description: string; pain: string; strategy: string; template: string }> = {
  atendido: {
    name: "Pacientes atendidos (recompra)",
    description: "Ya se atendieron en la clínica. Son quienes más fácil vuelven si se les recuerda a tiempo.",
    pain: "Se olvidan de su próxima sesión o cuidado.",
    strategy: "reciprocity",
    template: "Hola {{patient_name}}, ¿cómo te fue con tu tratamiento? Cuando quieras agendamos tu próxima sesión.",
  },
  no_asistio: {
    name: "No asistieron a su cita",
    description: "Agendaron pero no llegaron.",
    pain: "Algo les impidió venir y no reprogramaron.",
    strategy: "loss_aversion",
    template: "Hola {{patient_name}}, vimos que no pudiste venir a tu cita. ¿Te la reprogramamos para otro día?",
  },
  precio: {
    name: "Dudaron por el precio",
    description: "Preguntaron por un tratamiento y se frenaron al ver el precio.",
    pain: "Sienten que el tratamiento es caro o no ven el valor todavía.",
    strategy: "social_proof",
    template: "Hola {{patient_name}}, te cuento que tenemos opciones y promociones para tu tratamiento. ¿Te paso los detalles?",
  },
  horario: {
    name: "No les cuadró el horario",
    description: "Querían agendar pero no encontraron un día u hora que les sirviera.",
    pain: "No hubo un horario compatible con su agenda.",
    strategy: "scarcity",
    template: "Hola {{patient_name}}, tenemos nuevos espacios disponibles esta semana. ¿Quieres que te reserve uno?",
  },
  adelanto: {
    name: "Se frenaron en el adelanto",
    description: "Iban a agendar pero no completaron el adelanto.",
    pain: "Dudan en pagar por adelantado o no les quedó claro cómo hacerlo.",
    strategy: "reciprocity",
    template: "Hola {{patient_name}}, ¿te ayudo a dejar tu cita lista? Te explico el adelanto paso a paso.",
  },
  indeciso: {
    name: "Indecisos",
    description: "Se interesaron pero dijeron que lo pensarían o necesitaban consultar.",
    pain: "Les falta confianza o una razón para decidir ahora.",
    strategy: "authority",
    template: "Hola {{patient_name}}, ¿pudiste pensarlo? Si tienes dudas, te las resuelvo con gusto.",
  },
  sin_respuesta: {
    name: "Dejaron de responder",
    description: "Preguntaron algo, se les contestó y no volvieron a escribir.",
    pain: "Se enfriaron o se les pasó el momento.",
    strategy: "urgency",
    template: "Hola {{patient_name}}, quedamos pendientes de lo que conversamos. ¿Sigues interesada?",
  },
  solo_info: {
    name: "Solo pidieron información",
    description: "Consultaron datos generales (ubicación, horarios, precios) sin intención clara de agendar.",
    pain: "Aún están comparando o no tienen urgencia.",
    strategy: "social_proof",
    template: "Hola {{patient_name}}, ¿te gustaría agendar una valoración? Te ayudo a elegir el mejor tratamiento.",
  },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  atendido: "Ya se atendió",
  agendado: "Tiene una cita próxima",
  no_asistio: "No asistió a su cita",
  precio: "Dudó por el precio",
  horario: "No le cuadró el horario",
  adelanto: "Se frenó en el adelanto",
  indeciso: "Indeciso",
  sin_respuesta: "Dejó de responder",
  solo_info: "Solo pidió información",
  otro: "Sin clasificar",
};

/** Teléfono válido (solo dígitos, 7–16). */
export function cleanPhone(raw: unknown): string | null {
  const p = String(raw ?? "").replace(/\D/g, "");
  return /^\d{7,16}$/.test(p) ? p : null;
}

/** Limpia lo que llega (límites de tamaño y formato). Descarta lo que no sirve. */
export function sanitizePatients(input: unknown): ImportPatient[] {
  if (!Array.isArray(input)) return [];
  const out: ImportPatient[] = [];
  for (const raw of input.slice(0, MAX_PATIENTS_PER_BATCH)) {
    const phone = cleanPhone((raw as any)?.phone);
    if (!phone) continue;
    const messages = (Array.isArray((raw as any).messages) ? (raw as any).messages : [])
      .slice(0, MAX_MESSAGES)
      .map((m: any) => ({
        id: String(m?.id ?? "").slice(0, 64),
        dir: m?.dir === "out" ? "out" : "in",
        text: String(m?.text ?? "").slice(0, MAX_TEXT),
        at: new Date(m?.at ?? Date.now()).toISOString(),
      }))
      .filter((m: ImportMessage) => m.id && !Number.isNaN(Date.parse(m.at)));
    const appointments = (Array.isArray((raw as any).appointments) ? (raw as any).appointments : [])
      .slice(0, 30)
      .map((a: any) => ({ at: new Date(a?.at ?? 0).toISOString(), status: String(a?.status ?? ""), service: a?.service ? String(a.service).slice(0, 80) : null }))
      .filter((a: ImportAppointment) => !Number.isNaN(Date.parse(a.at)));
    out.push({
      phone,
      name: (raw as any).name ? String((raw as any).name).slice(0, 80) : null,
      last_contact_at: (raw as any).last_contact_at && !Number.isNaN(Date.parse((raw as any).last_contact_at)) ? new Date((raw as any).last_contact_at).toISOString() : null,
      messages,
      appointments,
    });
  }
  return out;
}

export function appointmentSummary(p: ImportPatient): ImportedProfile["appointments"] {
  const sorted = p.appointments.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted[sorted.length - 1];
  return {
    total: sorted.filter((a) => a.status !== "cancelled").length,
    completed: sorted.filter((a) => a.status === "completed").length,
    last_status: last?.status ?? null,
    last_at: last?.at ?? null,
  };
}

/** Lo que se decide sin IA a partir de las citas. `null` = hay que leer la conversación. */
export function ruleCategory(p: ImportPatient, now = Date.now()): Analysis | null {
  const live = p.appointments.filter((a) => a.status !== "cancelled");
  const lastService = (list: ImportAppointment[]) => list.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.service ?? null;

  const upcoming = live.filter((a) => ["scheduled", "confirmed"].includes(a.status) && Date.parse(a.at) > now);
  if (upcoming.length) {
    return { category: "agendado", reason: `Tiene una cita próxima${upcoming[0].service ? ` (${upcoming[0].service})` : ""}.`, treatment: upcoming[0].service, pain_signals: [] };
  }
  const completed = live.filter((a) => a.status === "completed");
  if (completed.length) {
    return { category: "atendido", reason: `Ya se atendió${lastService(completed) ? ` (${lastService(completed)})` : ""}.`, treatment: lastService(completed), pain_signals: [] };
  }
  const sorted = live.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (sorted.length && sorted[sorted.length - 1].status === "no_show") {
    return { category: "no_asistio", reason: `No asistió a su cita${sorted[sorted.length - 1].service ? ` de ${sorted[sorted.length - 1].service}` : ""}.`, treatment: sorted[sorted.length - 1].service, pain_signals: [] };
  }
  if (!p.messages.some((m) => m.dir === "in")) {
    return { category: "otro", reason: "Sin mensajes de la paciente.", treatment: null, pain_signals: [] };
  }
  return null;
}

const PROMPT = `Eres analista de una clínica de estética. Lees la conversación de WhatsApp de una persona que escribió a la clínica y NO terminó atendiéndose. Dices por qué no avanzó.

Categorías (elige UNA):
- precio: se frenó o dudó por el costo.
- horario: quería ir pero no cuadró día u hora.
- adelanto: se frenó al pedirle el adelanto/pago o no lo completó.
- indeciso: dijo que lo pensaría, consultaría o veía después.
- sin_respuesta: la clínica contestó y la persona dejó de escribir sin dar un motivo.
- solo_info: solo pidió datos generales (ubicación, horarios, información) sin intención clara.
- otro: no se puede saber.

Responde SOLO un JSON: {"category": "...", "reason": "una frase concreta en español, máx. 140 caracteres, sobre ESTA persona", "treatment": "tratamiento que mencionó o null", "pain_signals": ["máx. 3 palabras clave"]}
No inventes: si la conversación no lo dice, usa "otro" o "sin_respuesta".`;

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
  return _openai;
}

function transcript(p: ImportPatient): string {
  return p.messages
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((m) => `${m.dir === "in" ? "Paciente" : "Clínica"}: ${m.text}`)
    .join("\n")
    .slice(-3500);
}

export function parseAnalysis(raw: string): Analysis {
  const j = JSON.parse(raw) as Partial<Analysis>;
  const category = AI_CATEGORIES.includes(j.category as Category) ? (j.category as Category) : "otro";
  return {
    category,
    reason: String(j.reason ?? "").slice(0, 160) || "Sin motivo claro.",
    treatment: j.treatment ? String(j.treatment).slice(0, 80) : null,
    pain_signals: Array.isArray(j.pain_signals) ? j.pain_signals.slice(0, 3).map((s) => String(s).slice(0, 40)) : [],
  };
}

/** La IA lee la conversación de una persona que no terminó agendando y dice por qué. */
export async function analyzeConversation(clinicName: string, p: ImportPatient): Promise<Analysis> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: `Clínica: ${clinicName}\n\nConversación:\n${transcript(p)}` },
    ],
  });
  return parseAnalysis(completion.choices[0]?.message?.content ?? "{}");
}

/** Ejecuta `fn` sobre cada elemento con un máximo de `n` a la vez. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}
