import { normalize } from "./normalize";
import type { Promotion } from "./types";

export function activePromotions(all: Promotion[], now: Date = new Date()): Promotion[] {
  const t = now.getTime();
  return all.filter((p) => {
    if (!p.is_active) return false;
    if (p.starts_at && new Date(p.starts_at).getTime() > t) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < t) return false;
    return true;
  });
}

/** Promos que aplican a todo o al servicio indicado (comparación sin tildes). */
export function promosFor(promos: Promotion[], serviceName?: string | null): Promotion[] {
  const target = serviceName ? normalize(serviceName) : null;
  return promos.filter((p) => {
    if (!p.service_name) return true;
    if (!target) return true;
    return normalize(p.service_name) === target;
  });
}

function formatUntil(iso: string | null, timezone: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const label = new Intl.DateTimeFormat("es-PE", {
      day: "numeric",
      month: "long",
      timeZone: timezone,
    }).format(d);
    return ` (hasta el ${label})`;
  } catch {
    return "";
  }
}

export function promoLine(p: Promotion, timezone: string): string {
  const pct = p.discount_percent ? ` — ${p.discount_percent}% de descuento` : "";
  const svc = p.service_name ? ` en ${p.service_name}` : "";
  const desc = p.description ? `. ${p.description.replace(/[.\s]+$/, "")}` : "";
  return `🎁 ${p.name}${pct}${svc}${desc}${formatUntil(p.ends_at, timezone)}`;
}

export function promoLines(promos: Promotion[], timezone: string, limit = 3): string {
  return promos
    .slice(0, limit)
    .map((p) => promoLine(p, timezone))
    .join("\n");
}

/** Mayor porcentaje de descuento prometido por las promos activas (0 si ninguna). */
export function bestPromoPercent(promos: Promotion[]): number {
  return promos.reduce((m, p) => Math.max(m, p.discount_percent ?? 0), 0);
}
