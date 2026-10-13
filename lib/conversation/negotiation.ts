import { discountedPrice, formatPrice } from "./services";
import type { Promotion, Service } from "./types";
import { promoLines } from "./promotions";

export type Objection = "price" | "thinking" | "comparing" | "no_time" | "promo";

export type NegotiationPlan = {
  text: string;
  newStage: number;
  discountPercent: number | null;
  escalate: boolean;
  followupInDays: number | null;
  tag: string;
};

type PlanInput = {
  objection: Objection;
  stage: number;
  maxDiscount: number;
  service: Service | null;
  promos: Promotion[];
  timezone: string;
  alreadyOffered: number | null;
  name: string;
  rand?: () => number;
};

const pickOne = <T,>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)];

function withName(text: string, name: string): string {
  return text.replaceAll("{name}", name ? `, ${name}` : "");
}

const VALUE_LINES = [
  "Entiendo{name}, es una inversión importante y es válido que lo analices. Lo que nos distingue es que la doctora evalúa tu caso personalmente antes de cualquier procedimiento, para que hagas solo lo que realmente necesitas.",
  "Te entiendo{name}. Por eso en {clinic} empezamos con una evaluación personalizada: así sabes exactamente qué necesitas y cuánto, sin gastar de más.",
  "Gracias por tu sinceridad{name}. Cuidamos que cada paciente reciba lo que de verdad le conviene, y la valoración con la doctora te da claridad antes de decidir.",
];

const THINKING_LINES = [
  "¡Claro{name}, tómate tu tiempo! Si quieres, te dejo una valoración reservada sin compromiso, o te escribo en unos días para ver cómo vas. ¿Qué prefieres?",
  "Por supuesto{name}, es una decisión importante. Cuando quieras retomarlo, aquí estaré. Si te sirve, puedo escribirte en unos días para ver si te quedó alguna duda.",
  "Sin presión{name}. Piénsalo con calma; si te surge alguna pregunta mientras decides, me escribes y te ayudo.",
];

const COMPARING_LINES = [
  "Hacer comparaciones es lo más sensato{name}. Lo que valoran nuestros pacientes es la evaluación personalizada con la doctora y el seguimiento posterior. Si me cuentas qué estás comparando, te ayudo a ver diferencias.",
  "Tiene todo el sentido{name}. Antes de decidir, puedes venir a una valoración y comparar con información clara. ¿Te cuento cómo funciona?",
];

const NO_TIME_LINES = [
  "Sin problema{name}, podemos adaptarnos a tu agenda. ¿Qué día y franja horaria te resulta más cómoda?",
  "Entiendo{name}, el tiempo es lo más valioso. Dime qué día y horario te acomoda y lo coordinamos con recepción.",
];

const NO_DISCOUNT_ESCALATE = [
  "Entiendo{name}. Para ver qué opciones podemos darte, le voy a pedir a nuestro equipo que te contacte directamente.",
  "Gracias por tu paciencia{name}. Voy a pedir que alguien de recepción te llame para ver la mejor alternativa para ti.",
];

/**
 * Escalera de negociación. Nunca ofrece más que `maxDiscount` (configurado por
 * la clínica) ni inventa promociones. Cada objeción de precio sube un peldaño:
 *   0 → valor + promos reales   1 → ~mitad del máximo   2 → máximo   3+ → humano
 */
export function planNegotiation(input: PlanInput): NegotiationPlan {
  const rand = input.rand ?? Math.random;
  const { objection, stage, maxDiscount, service, promos, timezone, name } = input;
  const promoBlock = promos.length ? `\n\n${promoLines(promos, timezone)}` : "";

  if (objection === "thinking") {
    return {
      text: withName(pickOne(THINKING_LINES, rand), name),
      newStage: stage,
      discountPercent: null,
      escalate: false,
      followupInDays: 3,
      tag: "thinking",
    };
  }
  if (objection === "no_time") {
    return {
      text: withName(pickOne(NO_TIME_LINES, rand), name),
      newStage: stage,
      discountPercent: null,
      escalate: false,
      followupInDays: null,
      tag: "no_time",
    };
  }

  // price | promo | comparing → escalera
  const canDiscount = maxDiscount > 0;
  const half = Math.max(1, Math.ceil(maxDiscount / 2));
  const asksPromoOnly = objection === "promo";

  // Pregunta por promociones y hay promos reales → mostrarlas sin quemar la escalera.
  if (asksPromoOnly && promos.length) {
    return {
      text: withName(
        `¡Claro{name}! Estas son las promociones vigentes:\n\n${promoLines(promos, timezone)}\n\n¿Te interesa aprovechar alguna? Te ayudo a agendar.`,
        name
      ),
      newStage: stage,
      discountPercent: null,
      escalate: false,
      followupInDays: null,
      tag: "promo_list",
    };
  }

  if (stage <= 0) {
    if (objection === "comparing") {
      return {
        text: withName(pickOne(COMPARING_LINES, rand), name) + promoBlock,
        newStage: 1,
        discountPercent: null,
        escalate: false,
        followupInDays: 3,
        tag: "comparing",
      };
    }
    if (asksPromoOnly && !promos.length && !canDiscount) {
      return {
        text: withName(
          "Por ahora no tenemos una promoción activa{name}, pero con gusto te aviso apenas haya una. Mientras tanto, la valoración con la doctora te ayuda a elegir lo que de verdad necesitas. ¿Te la agendo?",
          name
        ),
        newStage: stage,
        discountPercent: null,
        escalate: false,
        followupInDays: null,
        tag: "no_promo",
      };
    }
    return {
      text: withName(pickOne(VALUE_LINES, rand), name) + promoBlock +
        "\n\n¿Te gustaría que te agende una valoración para que la doctora te recomiende?",
      newStage: 1,
      discountPercent: null,
      escalate: false,
      followupInDays: 2,
      tag: "value",
    };
  }

  if (!canDiscount) {
    return {
      text: withName(pickOne(NO_DISCOUNT_ESCALATE, rand), name),
      newStage: 3,
      discountPercent: null,
      escalate: true,
      followupInDays: null,
      tag: "escalate_no_discount",
    };
  }

  if (stage === 1) {
    const pct = half;
    return {
      text: withName(buildDiscountOffer(pct, service, false), name),
      newStage: 2,
      discountPercent: pct,
      escalate: false,
      followupInDays: 2,
      tag: "offer_half",
    };
  }

  if (stage === 2) {
    const pct = maxDiscount;
    // Si ya se ofreció el máximo por otra vía, pasar a humano.
    if (input.alreadyOffered !== null && input.alreadyOffered >= pct) {
      return {
        text: withName(pickOne(NO_DISCOUNT_ESCALATE, rand), name),
        newStage: 3,
        discountPercent: null,
        escalate: true,
        followupInDays: null,
        tag: "escalate_max_offered",
      };
    }
    return {
      text: withName(buildDiscountOffer(pct, service, true), name),
      newStage: 3,
      discountPercent: pct,
      escalate: false,
      followupInDays: 2,
      tag: "offer_max",
    };
  }

  return {
    text: withName(pickOne(NO_DISCOUNT_ESCALATE, rand), name),
    newStage: 4,
    discountPercent: null,
    escalate: true,
    followupInDays: null,
    tag: "escalate_limit",
  };
}

function buildDiscountOffer(pct: number, service: Service | null, isFinal: boolean): string {
  let priceLine = "";
  if (service) {
    const final = discountedPrice(service.price, pct);
    if (final) priceLine = ` En ${service.name} pasaría de ${formatPrice(service.price)} a ${final}.`;
    else priceLine = ` Aplicaría a ${service.name}.`;
  }
  if (isFinal) {
    return `Lo consulté con la doctora{name} y puedo llegar hasta un ${pct}% de descuento, que es lo máximo que podemos ofrecer.${priceLine} ¿Te agendo para aprovecharlo?`;
  }
  return `Déjame ver qué puedo hacer por ti{name}: te ofrezco un ${pct}% de descuento si agendas en estos días.${priceLine} ¿Lo reservamos?`;
}
