// Plantillas con rotación. Cada "pool" tiene varias variantes escritas con
// ángulos distintos; Picker evita repetir la última usada con el mismo paciente.
// Variables: {name} (se expande a ", Ana" o vacío), {clinic}, {service}.

export const POOLS = {
  greetingNew: [
    "¡Hola{name}! 😊 Bienvenido/a a {clinic}. ¿En qué te puedo ayudar hoy?",
    "Hola{name}, gracias por escribir a {clinic}. Cuéntame, ¿qué te gustaría saber?",
    "¡Hola{name}! Qué gusto que nos escribas. ¿Buscas información de algún tratamiento?",
    "Hola{name}, bienvenido/a a {clinic}. Dime en qué te ayudo y lo vemos juntos.",
    "¡Hola{name}! Soy el asistente virtual de {clinic}. ¿Qué tratamiento te interesa?",
    "Hola{name} 👋 Gracias por contactarnos. ¿Quieres conocer precios, horarios o agendar una cita?",
    "¡Buen día{name}! Estás en {clinic}. ¿Cómo te puedo ayudar?",
    "Hola{name}, un gusto saludarte. ¿Sobre qué tratamiento quieres consultar?",
  ],
  greetingBack: [
    "¡Hola de nuevo{name}! 🙌 ¿En qué te ayudo?",
    "Hola{name}, qué gusto leerte otra vez. ¿Qué necesitas?",
    "¡Hola{name}! Cuéntame, ¿seguimos con lo que veíamos?",
    "Hola{name}, aquí estoy. ¿Cómo te puedo ayudar?",
  ],
  thanks: [
    "¡De nada{name}! Cualquier otra duda, aquí estoy.",
    "Con gusto. Si necesitas algo más, escríbeme.",
    "Un placer ayudarte{name}. Estamos para lo que necesites.",
    "¡Para eso estamos! Cualquier cosa, aquí en {clinic}.",
    "No hay de qué{name}. Aquí seguimos si tienes más preguntas.",
    "Con mucho gusto. Que tengas un lindo día 😊",
    "¡A ti por escribirnos{name}! Cuando quieras, aquí estamos.",
    "Gracias a ti. Si surge otra duda, me escribes con confianza.",
  ],
  farewell: [
    "¡Hasta pronto{name}! Cualquier cosa, aquí estamos.",
    "Nos vemos{name}, ¡cuídate mucho!",
    "¡Que tengas un excelente día! Aquí seguimos en {clinic}.",
    "¡Hasta luego! Fue un gusto ayudarte.",
    "Cuídate{name}. Estamos disponibles cuando nos necesites.",
    "¡Hasta la próxima! Que estés muy bien 🙌",
  ],
  confirmation: [
    "¡Perfecto{name}! Quedamos así.",
    "Genial, entonces lo dejamos así. Cualquier cambio, avísame.",
    "¡Listo{name}! Gracias por confirmar.",
    "De acuerdo, anotado. Cualquier cosa me escribes.",
    "Excelente. Si necesitas algo más, aquí estoy.",
    "Muy bien{name}. ¡Gracias!",
  ],
  ack: [
    "Claro{name}.",
    "Con gusto{name}.",
    "Por supuesto.",
    "Claro que sí.",
    "Te cuento{name}.",
    "Sí, te cuento.",
  ],
  ctaBook: [
    "¿Te gustaría agendar una cita?",
    "Si quieres, te ayudo a reservar tu cita.",
    "¿Quieres que te coordine una cita?",
    "Cuéntame qué día te acomoda y lo coordinamos.",
    "¿Agendamos tu valoración?",
    "Si te interesa, puedo dejarte una cita lista.",
    "¿Te reservo un espacio?",
    "Dime qué día prefieres y lo coordino con recepción.",
  ],
  ctaChoose: [
    "Dime cuál te interesa y te cuento el detalle.",
    "¿Cuál te llama más la atención?",
    "Cuéntame cuál te interesa y lo coordinamos.",
    "¿Sobre cuál quieres más información?",
    "Dime cuál y te ayudo a agendar.",
  ],
  bookingReply: [
    "¡Perfecto{name}! Ya avisé a recepción para coordinar tu cita. ¿Qué día y horario te acomoda?",
    "¡Genial{name}! Dejo tu solicitud lista y recepción te confirma. ¿Qué día prefieres?",
    "¡Con gusto{name}! Ya notifiqué a nuestro equipo. Para agilizar, ¿qué día y franja horaria te sirve?",
    "Perfecto{name}, vamos a agendarte. ¿Qué día y horario te queda mejor?",
    "¡Excelente decisión{name}! Le aviso a recepción ahora mismo. ¿Tienes preferencia de día y hora?",
    "¡Listo{name}! Tu solicitud ya está con nuestro equipo. ¿Qué día te vendría bien?",
  ],
  bookingService: [
    "¡Perfecto{name}! Ya avisé a recepción para coordinar tu cita de {service}. ¿Qué día y horario te acomoda?",
    "¡Genial{name}! Dejo tu solicitud de {service} lista y recepción te confirma. ¿Qué día prefieres?",
    "¡Con gusto{name}! Ya notifiqué a nuestro equipo por tu cita de {service}. ¿Qué día y franja te sirve?",
    "Perfecto{name}, vamos a agendar tu {service}. ¿Qué día y horario te queda mejor?",
  ],
  cancel: [
    "Entendido{name}, sin problema. Ya avisé a recepción para que gestione tu cita. ¿Quieres que la reprogramemos para otro día?",
    "Claro{name}. Le paso tu solicitud a recepción ahora mismo. Si quieres, dime qué día te acomodaría más adelante.",
    "Sin problema{name}. Ya notifiqué a nuestro equipo para que ajuste tu cita. ¿Te gustaría elegir otra fecha?",
    "Gracias por avisarnos{name}. Recepción se encarga de reprogramar o cancelar tu cita; te confirman en breve.",
  ],
  decline: [
    "Entendido{name}, gracias por avisarme. Si más adelante te interesa, aquí estaremos. ¡Que estés muy bien!",
    "Sin problema{name}. Cuando quieras retomar, escríbenos con confianza. ¡Un abrazo!",
    "Gracias por contarme{name}. Quedo atento por si más adelante deseas más información.",
    "Perfecto{name}, lo respeto. Estamos a tu disposición cuando lo necesites.",
  ],
  optOut: [
    "Entendido{name}, no te enviaremos más mensajes. Si más adelante quieres retomar, escríbenos cuando gustes. ¡Gracias!",
    "Listo{name}, te sacamos de nuestra lista y no volverás a recibir mensajes de nuestra parte. ¡Que estés muy bien!",
    "Muy bien{name}. Respetamos tu decisión: no recibirás más mensajes. Aquí estaremos si nos necesitas.",
  ],
  complaint: [
    "Lamento mucho lo ocurrido{name} y gracias por contárnoslo. Ya avisé a la persona encargada para que te contacte personalmente y lo resolvamos.",
    "Tienes toda la razón en escribirnos{name}. Esto es importante para nosotros: ya le pasé tu caso a la responsable para que te llame lo antes posible.",
    "Siento mucho tu experiencia{name}. Ya notifiqué a nuestro equipo con prioridad para que se comuniquen contigo directamente.",
  ],
  urgent: [
    "Lamento que estés pasando por esto{name}. Ya avisé de inmediato a la doctora para que te contacte. Si sientes que es una emergencia o tienes dificultad para respirar, acude ahora mismo a un centro de salud o a emergencias.",
    "Gracias por avisarnos{name}. Ya notifiqué con urgencia a nuestro equipo médico para que te contacten. Si empeora o te sientes muy mal, por favor acude a emergencias de inmediato.",
  ],
  media: [
    "¡Gracias por tu mensaje{name}! Para ayudarte mejor, ¿me lo puedes escribir por texto? Si es una foto o documento, ya aviso a nuestro equipo para que lo revise.",
    "Recibí tu archivo{name}. Ya le avisé a recepción para que lo revise; mientras tanto, cuéntame por escrito en qué te puedo ayudar.",
    "Gracias{name}. No puedo escuchar audios ni abrir archivos por aquí, pero ya avisé a nuestro equipo. ¿Me cuentas por escrito qué necesitas?",
  ],
  handoff: [
    "Para darte ese dato con exactitud, ya le pedí a nuestro equipo que te lo confirme en breve{name}.",
    "Prefiero que esa información te la confirme directamente recepción{name}; ya les avisé y te escriben pronto.",
    "Ese detalle lo confirma mejor nuestro equipo{name}. Ya les pasé tu consulta para que te respondan enseguida.",
    "Déjame verificarlo con recepción{name} para no darte un dato equivocado. Te escriben en breve.",
    "Para no darte información incorrecta, voy a consultarlo con nuestro equipo{name}. Te respondemos pronto.",
  ],
  safeFallback: [
    "Gracias por tu mensaje{name}. Ya le avisé a nuestro equipo para que te ayude directamente; en breve te responden 🙂",
    "Recibí tu consulta{name}. Voy a pasarla a recepción para que te den una respuesta precisa. Te escriben pronto.",
  ],
  escalation: [
    "Creo que esto lo puede resolver mejor alguien de nuestro equipo{name}; en un momento te contacta una persona de {clinic}.",
    "Voy a pasar tu consulta directo con recepción{name} para darte una respuesta más precisa. Te escriben en breve.",
    "Para ayudarte mejor con esto{name}, ya avisé a nuestro equipo en {clinic}. Te contactan pronto.",
  ],
  rateLimit: [
    "Gracias por tu paciencia{name}. Ya avisé a nuestro equipo para que continúe la conversación contigo directamente.",
  ],
  paused: [
    "Ahora mismo no estamos atendiendo por este canal{name}. Déjanos tu consulta y te respondemos apenas podamos.",
  ],
} as const;

export type PoolId = keyof typeof POOLS;

/** Guarda en una sola cadena el índice elegido de cada pool: "greetingNew3|ctaBook5". */
export function parseKey(key: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!key) return out;
  for (const part of key.split("|")) {
    const m = part.match(/^([A-Za-z]+)(\d+)$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

export class Picker {
  private last: Record<string, number>;
  private chosen: string[] = [];

  constructor(lastKey: string | null | undefined, private random: () => number = Math.random) {
    this.last = parseKey(lastKey);
  }

  pick(pool: PoolId): string {
    const variants = POOLS[pool];
    const avoid = this.last[pool];
    const candidates = variants.map((_, i) => i).filter((i) => i !== avoid);
    const options = candidates.length ? candidates : variants.map((_, i) => i);
    const index = options[Math.floor(this.random() * options.length)];
    this.chosen.push(`${pool}${index}`);
    return variants[index];
  }

  key(): string {
    return this.chosen.join("|");
  }
}

export function fill(template: string, vars: { name?: string; clinic?: string; service?: string }): string {
  const name = vars.name ? `, ${vars.name}` : "";
  return template
    .replaceAll("{name}", name)
    .replaceAll("{clinic}", vars.clinic ?? "")
    .replaceAll("{service}", vars.service ?? "")
    .replace(/\{[a-zA-Z]+\}/g, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
