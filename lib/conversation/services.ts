import { normalize, tokenize, withinEdits } from "./normalize";
import type { Service } from "./types";

export type ServiceMatch =
  | { kind: "none" }
  | { kind: "exact"; service: Service }
  | { kind: "ambiguous"; services: Service[] };

export function parsePriceNumber(price: string): number | null {
  const m = price.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Precio simple (un solo monto) sobre el que sí podemos calcular un descuento. */
export function isFixedPrice(price: string): boolean {
  const n = normalize(price);
  if (/(desde|hasta|segun|sesion|x\s?\d|\d\s?x|aprox|rango|entre|-)/.test(n)) return false;
  return (n.match(/\d+/g) ?? []).length === 1;
}

export function currencyOf(price: string): string {
  return /\$|usd|dolar/i.test(price) ? "$" : "S/";
}

export function formatPrice(price: string): string {
  const p = price.trim();
  if (!p) return "";
  if (/^\d+([.,]\d+)?$/.test(p)) return `S/${p}`;
  return p;
}

export function discountedPrice(price: string, percent: number): string | null {
  if (!isFixedPrice(price) || percent <= 0) return null;
  const n = parsePriceNumber(price);
  if (n === null) return null;
  const value = Math.round(n * (1 - percent / 100));
  return `${currencyOf(price)}${value}`;
}

export function serviceLine(s: Service): string {
  const p = formatPrice(s.price);
  return p ? `${s.name} — ${p}` : s.name;
}

type Scored = { service: Service; score: number; matched: number; longToken: boolean };

/**
 * Busca qué tratamiento(s) de la clínica menciona el mensaje. Tolera plurales,
 * tildes y errores de tipeo de 1 letra. Si el término es genérico ("cejas",
 * "pestañas") devuelve todas las coincidencias para que el bot pregunte cuál.
 */
export function findServiceMatch(text: string, services: Service[]): ServiceMatch {
  if (!services.length) return { kind: "none" };
  const msgTokens = Array.from(new Set(tokenize(text)));
  if (!msgTokens.length) return { kind: "none" };

  const scored: Scored[] = [];
  for (const service of services) {
    const sTokens = Array.from(
      new Set(tokenize(service.name).filter((t) => t.length >= 3 && !/^\d+$/.test(t)))
    );
    if (!sTokens.length) continue;

    let matched = 0;
    let longToken = false;
    for (const st of sTokens) {
      // Palabras largas toleran 2 errores de tipeo; las medianas, 1.
      const allowed = st.length >= 9 ? 2 : 1;
      const hit = msgTokens.some(
        (mt) => mt === st || (st.length >= 6 && mt.length >= 6 && withinEdits(mt, st, allowed))
      );
      if (hit) {
        matched++;
        if (st.length >= 6) longToken = true;
      }
    }
    if (matched === 0) continue;

    const score = matched / sTokens.length;
    if (score >= 0.5 || longToken) scored.push({ service, score, matched, longToken });
  }

  if (!scored.length) return { kind: "none" };
  scored.sort((a, b) => b.score - a.score || b.matched - a.matched);

  const top = scored[0];
  const second = scored[1];
  if (!second || (top.score >= 0.6 && top.score - second.score >= 0.25)) {
    return { kind: "exact", service: top.service };
  }

  const group = scored.filter((s) => top.score - s.score <= 0.25).slice(0, 4);
  if (group.length === 1) return { kind: "exact", service: group[0].service };
  return { kind: "ambiguous", services: group.map((g) => g.service) };
}

/** Servicio nombrado explícitamente en un texto (p. ej. el último mensaje del bot). */
export function serviceNamedIn(text: string, services: Service[]): Service | null {
  const n = normalize(text);
  const found = services.filter((s) => n.includes(normalize(s.name)));
  return found.length === 1 ? found[0] : null;
}
