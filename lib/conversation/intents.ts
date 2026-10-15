import { normalize, rawWords } from "./normalize";
import type { Intent } from "./types";

// Todos los patrones corren sobre texto ya normalizado (minúsculas, sin tildes).

const URGENT: RegExp[] = [
  /\bme duele (mucho|bastante|demasiado|horrible|fuerte)\b/,
  /\bdolor (fuerte|intenso|insoportable|terrible)\b/,
  /\breaccion (alergica|adversa|rara)\b/,
  /\bme (salieron|salio) (ronchas|manchas|granos|moretones|moreton|bolitas|bulto|marcas)\b/,
  /\b(se me|me) (hincho|inflamo|infecto|quemo)\b/,
  /\b(estoy|esta|tengo|siento|quedo) (muy |bien |bastante )?(hinchad|inflamad|infectad|hinchazon|inflamacion|infeccion|fiebre|mareo|ardor)\w*/,
  /\bsangr(a|o|e|ado|ando|ia)\b/,
  /\bno puedo respirar\b/,
  /\bdificultad (para|al) respirar\b/,
  /\bme siento mal\b/,
  /\bemergencia\b/,
  /\bquemadura\b/,
  /\bpus\b/,
];

const COMPLAINT: RegExp[] = [
  /\b(queja|quejas|reclamo|reclamos|reclamar|pesimo|pesima|estafa|estafadores|denuncia|denunciar|indecopi)\b/,
  /\b(mal servicio|mala atencion|mala experiencia|horrible servicio|libro de reclamaciones)\b/,
  /\bme estafaron\b/,
  /\b(devuelvan|devolucion|reembolso)\b/,
  /\bme cobraron de mas\b/,
  /\b(nunca|no) me (respondieron|atendieron|contestaron)\b/,
  /\bme dejaron (plantad|esperando)\w*/,
];

const CANCEL: RegExp[] = [
  /\b(cancelar|cancelo|anular|anulo|reprogramar|reprogramo|reagendar|reagendo|posponer|pospongo)\b/,
  /\bcambiar (mi|la|el|de) ?(cita|hora|turno|reserva|fecha|dia)\b/,
  /\bmover (mi|la) ?(cita|hora|turno|reserva)\b/,
  /\bno (podre|voy a poder|puedo) (asistir|llegar|ir a (mi|la) cita)\b/,
];

const DECLINE: RegExp[] = [
  /\bno me interesa\b/,
  /\bya no (quiero|me interesa|necesito|voy)\b/,
  /\bno gracias\b/,
  /\bno (voy a|quiero) (agendar|reservar|ir|hacerme|hacer)\b/,
  /\bno por ahora\b/,
];

const BOOKING: RegExp[] = [
  /\b(agendar|agendarme|agendame|agenda|reservar|reservarme|reservame|reserva|separar|separame|apartar|apartame|aparto)\b/,
  /\bcita\b/,
  /\bturno\b/,
  /\bvaloracion\b/,
  /\bevaluacion\b/,
  /\bquiero (ir|venir|hacerme|sacar|programar|pasar)\b/,
  /\bcuando (puedo|hay|tienen|pueden)\b/,
  /\bdisponibilidad\b/,
  /\bhay (cupo|cupos|espacio|hora|horas|disponible)\b/,
  /\bme gustaria (ir|agendar|reservar|hacerme|venir)\b/,
  /\bpuedo (ir|venir|pasar)\b/,
  /\bpara (hoy|manana|pasado manana|esta semana|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/,
];

const PRICE_OBJECTION: RegExp[] = [
  /\b(caro|cara|carisimo|carisima|costoso|costosa|elevado|elevada)\b/,
  /\bmuy alto\b/,
  /\bno me alcanza\b/,
  /\bno tengo (dinero|plata|presupuesto)\b/,
  /\bfuera de mi (presupuesto|alcance)\b/,
  /\bmucho dinero\b/,
  /\bmas (barato|economico|accesible)\b/,
  /\bultimo precio\b/,
  /\bprecio final\b/,
  /\bme (lo )?(dejan|hacen|rebajan)\b/,
  /\brebaja\b/,
  /\bhay algo mas (barato|economico)\b/,
];

const PROMO: RegExp[] = [
  /\b(promocion|promociones|promo|promos|oferta|ofertas|descuento|descuentos|cupon|combo|paquete|paquetes|2x1)\b/,
];

const THINKING: RegExp[] = [
  /\b(lo|la) (voy a )?pensar(lo|la)?\b/,
  /\blo pienso\b/,
  /\b(voy a|tengo que|dejame) pensar(lo|me)?\b/,
  /\bpensarlo\b/,
  /\bdejame (ver|consultar|pensar)\b/,
  /\blo (voy a )?consult(o|are|ar)\b/,
  /\b(despues|luego|mas tarde) (te|le|les) (aviso|escribo|confirmo|hablo)\b/,
  /\bmas adelante\b/,
  /\ben otro momento\b/,
  /\bahorita no\b/,
  /\bpor ahora no\b/,
  /\b(otro dia|la proxima semana|el proximo mes)\b/,
  /\bte aviso\b/,
];

const COMPARING: RegExp[] = [
  /\botra clinica\b/,
  /\b(otro lugar|otro lado|otra parte)\b/,
  /\ben otro(s)? (lugar|lado|sitio)\b/,
  /\bla competencia\b/,
  /\bvi (mas )?(barato|economico)\b/,
  /\bme (ofrecen|cobran|dan) (menos|mas barato)\b/,
  /\b(cotizando|cotizar|comparando|comparar)\b/,
];

const NO_TIME: RegExp[] = [
  /\bno tengo tiempo\b/,
  /\b(estoy|ando) (muy )?ocupad[oa]\b/,
  /\bno me da el tiempo\b/,
  /\bqueda (muy )?lejos\b/,
  /\bno puedo ir\b/,
  /\bmuy lejos\b/,
];

const PRICE: RegExp[] = [
  /\b(precio|precios|costo|costos|tarifa|tarifas)\b/,
  /\bcuanto (cuesta|cuestan|sale|salen|es|vale|valen|cobran|cobra|seria|serian|esta)\b/,
  /\ba como (esta|esta el|estan|sale|salen)\b/,
  /\b(valor|valores) (de|del|de la|de los)\b/,
];

const HOURS: RegExp[] = [
  /\b(horario|horarios)\b/,
  /\ba que hora(s)?\b/,
  /\bhasta que hora\b/,
  /\bdesde que hora\b/,
  /\b(abren|abiertos|cierran|atienden|atendiendo)\b/,
  /\bdias de atencion\b/,
  /\btrabajan (los )?(sabados|domingos|feriados)\b/,
];

const LOCATION: RegExp[] = [
  /\b(direccion|ubicacion|ubicados|ubicada)\b/,
  /\bdonde (estan|queda|quedan|se encuentran|es|atienden|las puedo encontrar)\b/,
  /\bcomo (llego|llegar)\b/,
  /\bque distrito\b/,
  /\b(google maps|maps|mapa)\b/,
];

const SERVICES: RegExp[] = [
  /\bque (tratamientos|servicios|procedimientos)\b/,
  /\b(servicios|tratamientos|procedimientos)\b/,
  /\bque (hacen|ofrecen|manejan|realizan)\b/,
  /\bcatalogo\b/,
  /\blista de (servicios|tratamientos|precios)\b/,
];

const DURATION: RegExp[] = [
  /\bcuanto (dura|duran|demora|demoran|tarda|tardan|se tarda|se demora|tiempo)\b/,
  /\b(duracion|demora|tiempo que (dura|toma|demora))\b/,
  /\bcuantos? (minutos|horas)\b/,
  /\bcuanto tiempo\b/,
];

const PAYMENT: RegExp[] = [
  /\b(yape|plin|transferencia|efectivo|tarjeta|visa|mastercard)\b/,
  /\bformas? de pago\b/,
  /\bmetodos? de pago\b/,
  /\bmedios? de pago\b/,
  /\b(cuotas|financiamiento|financiar|adelanto|a cuenta)\b/,
];

const SOCIAL_WORDS = new Set([
  "hola", "holaa", "holi", "buenas", "buenos", "buen", "buena", "dia", "dias", "tarde", "tardes",
  "noche", "noches", "tal", "que", "como", "estas", "esta", "estan", "estamos", "gracias",
  "muchas", "mil", "chau", "chao", "adios", "hasta", "luego", "pronto", "saludos", "ok",
  "okay", "okey", "listo", "dale", "perfecto", "vale", "si", "claro", "excelente", "genial",
  "bien", "bueno", "por", "favor", "doctora", "doctor", "clinica", "equipo", "amables",
  "atencion", "la", "el", "su", "tu", "de", "a", "me", "les", "le", "un", "amigo", "amiga",
  "estimado", "estimada", "senorita", "senor", "lic", "dra", "dr", "confirmo", "acuerdo",
  "entendido", "entiendo", "nos", "vemos", "cuidate", "bye", "y", "o", "mas", "muy", "todo",
  "super", "mil", "gracias!", "la", "lo", "se", "te", "lindo", "linda", "feliz", "bendiciones",
]);

const GREETING_WORDS = ["hola", "holaa", "holi", "buenas", "buenos", "saludos", "buen"];
const CONFIRM_WORDS = ["si", "ok", "okay", "okey", "listo", "dale", "perfecto", "vale", "claro", "confirmo", "acuerdo", "entendido", "genial", "excelente", "bueno"];
const FAREWELL_WORDS = ["chau", "chao", "adios", "bye", "cuidate", "luego", "pronto", "vemos"];

const any = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

export type IntentAnalysis = {
  intents: Set<Intent>;
  wordCount: number;
  questionMarks: number;
  isComplex: boolean;
};

export function analyzeIntents(rawText: string): IntentAnalysis {
  const norm = normalize(rawText);
  const words = rawWords(rawText);
  const intents = new Set<Intent>();
  const questionMarks = (rawText.match(/\?/g) ?? []).length;

  if (any(URGENT, norm)) intents.add("urgent_medical");
  if (any(COMPLAINT, norm)) intents.add("complaint");
  if (any(CANCEL, norm)) intents.add("cancel_reschedule");

  const negated = /\b(no|ya no|tampoco)\s+(quiero|quisiera|deseo|voy a|puedo|me interesa|necesito)\b/.test(norm);
  const declines = any(DECLINE, norm);
  if (declines || (negated && any(BOOKING, norm))) intents.add("decline");

  if (any(PRICE_OBJECTION, norm)) intents.add("price_objection");
  if (any(THINKING, norm)) intents.add("thinking");
  if (any(COMPARING, norm)) intents.add("comparing");
  if (any(NO_TIME, norm)) intents.add("no_time");

  if (any(BOOKING, norm) && !negated && !intents.has("cancel_reschedule")) intents.add("booking");

  if (!intents.has("price_objection") && any(PROMO, norm)) intents.add("promo_inquiry");
  if (any(PRICE, norm)) intents.add("price_inquiry");
  if (any(HOURS, norm)) intents.add("hours_inquiry");
  if (any(LOCATION, norm)) intents.add("location_inquiry");
  if (any(SERVICES, norm)) intents.add("service_inquiry");
  if (any(DURATION, norm)) intents.add("duration_inquiry");
  if (any(PAYMENT, norm)) intents.add("payment_inquiry");

  // Mensajes puramente sociales: solo cuentan si TODO el mensaje es social.
  // "Hola, quería saber si hacen peeling" NO es un saludo: es una pregunta.
  const pureSocial = words.length > 0 && words.length <= 8 && words.every((w) => SOCIAL_WORDS.has(w));
  if (pureSocial && questionMarks === 0 && intents.size === 0) {
    if (words.includes("gracias")) intents.add("thanks");
    else if (words.some((w) => FAREWELL_WORDS.includes(w))) intents.add("farewell");
    else if (words.some((w) => CONFIRM_WORDS.includes(w))) intents.add("confirmation");
    else if (words.some((w) => GREETING_WORDS.includes(w))) intents.add("greeting");
  }

  return {
    intents,
    wordCount: words.length,
    questionMarks,
    isComplex: questionMarks >= 2 || words.length > 22,
  };
}

// ── Baja voluntaria (opt-out) ───────────────────────────────────────
const OPTOUT: RegExp[] = [
  /\bno (me )?(escriban|escribas|escribir|contacten|contactes|molesten|molestes|llamen|envien|envies|manden|mandes)\b/,
  /\bdejen? de (escribir|enviar|mandar|molestar|contactar|llamar)\b/,
  /\bno quiero (recibir|mas) (mensajes|publicidad|promociones|informacion|info)\b/,
  /\bno (mas|quiero mas) mensajes\b/,
  /\b(borren|borra|eliminen|elimina|saquen|saca)( me)? (de )?(mi|la|su)? ?(numero|contacto|datos|lista)\b/,
  /\bsaquen me de (la|su) lista\b/,
  /\bno me (interesan|interesa) (sus )?(mensajes|promociones|publicidad)\b/,
  /\bspam\b/,
  /^(stop|baja|basta|no mas|desuscribir|cancelar suscripcion)$/,
];

export function detectOptOut(rawText: string): boolean {
  const norm = normalize(rawText);
  return any(OPTOUT, norm);
}
