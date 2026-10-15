import { discountedPrice, parsePriceNumber } from "./services";
import type { ClinicContext, Promotion } from "./types";

/**
 * Antes de enviar cualquier texto generado por IA verificamos que no haya
 * inventado precios, descuentos, enlaces ni teléfonos. Si algo no coincide
 * con los datos reales de la clínica, el mensaje NO se envía.
 */
export type ValidationResult = { ok: true } | { ok: false; reason: string };

function allowedAmounts(clinic: ClinicContext, promos: Promotion[]): Set<number> {
  const set = new Set<number>();
  const maxD = Math.max(
    clinic.maxDiscountPercent,
    ...promos.map((p) => p.discount_percent ?? 0),
    0
  );
  // Montos que la clínica escribió en promociones y formas de pago también son datos reales.
  const textual = [
    clinic.paymentMethods ?? "",
    ...promos.map((p) => `${p.name} ${p.description ?? ""}`),
  ].join(" ");
  for (const m of textual.replace(/(\d),(\d)/g, "$1.$2").matchAll(/\d+(?:\.\d+)?/g)) set.add(Number(m[0]));

  for (const s of clinic.services) {
    for (const m of s.price.replace(/,/g, ".").matchAll(/\d+(?:\.\d+)?/g)) set.add(Number(m[0]));
    const base = parsePriceNumber(s.price);
    if (base !== null) {
      for (let d = 1; d <= maxD; d++) {
        const dp = discountedPrice(s.price, d);
        if (dp) set.add(Number(dp.replace(/[^\d.]/g, "")));
      }
    }
  }
  return set;
}

export function validateReply(reply: string, clinic: ClinicContext, promos: Promotion[]): ValidationResult {
  const text = reply.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > 900) return { ok: false, reason: "too_long" };
  if (/\{\{|\}\}|\{[a-zA-Z_]+\}/.test(text)) return { ok: false, reason: "placeholder" };

  // Montos en soles/dólares
  const amounts = allowedAmounts(clinic, promos);
  const moneyRe = /(?:S\/\.?|s\/\.?|\$)\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:soles|dolares|dólares)/g;
  for (const m of text.matchAll(moneyRe)) {
    const n = Number((m[1] ?? m[2]).replace(",", "."));
    if (!amounts.has(n)) return { ok: false, reason: `unknown_amount:${n}` };
  }

  // Porcentajes: no más que el máximo configurado ni que una promoción real.
  const allowedPct = new Set<number>([clinic.maxDiscountPercent]);
  for (const p of promos) if (p.discount_percent) allowedPct.add(p.discount_percent);
  const maxPct = Math.max(...allowedPct, 0);
  for (const m of text.matchAll(/(\d{1,3})\s?%/g)) {
    const n = Number(m[1]);
    if (n > maxPct) return { ok: false, reason: `unknown_discount:${n}` };
  }

  // Enlaces: solo el de reservas configurado.
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/gi)) {
    const link = clinic.bookingLink?.trim();
    if (!link || !m[0].startsWith(link.replace(/\/+$/, ""))) return { ok: false, reason: "unknown_link" };
  }

  // Teléfonos (7+ dígitos seguidos): solo el configurado.
  const knownDigits = [clinic.bookingPhone, clinic.ownPhone, clinic.receptionistPhone]
    .filter(Boolean)
    .map((p) => String(p).replace(/\D/g, ""));
  for (const m of text.matchAll(/\+?\d[\d\s-]{6,}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 7) continue;
    if (!knownDigits.some((k) => k.endsWith(digits) || digits.endsWith(k))) {
      return { ok: false, reason: "unknown_phone" };
    }
  }

  return { ok: true };
}

/** Limpieza final de cualquier texto saliente. */
export function sanitizeOutgoing(text: string): string {
  return text
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // markdown → negrita de WhatsApp
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500);
}

/** Recorta descuentos mencionados que superen el tope permitido (seguimientos con IA). */
export function clampDiscount(percent: number | null, max: number): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  if (max <= 0) return null;
  return Math.max(0, Math.min(Math.round(percent), max));
}
