import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sincronización desde Recepción IA (la fuente de verdad): perfil de la clínica y promociones.
 * Todo lo que llega va FIRMADO (HMAC-SHA256 con un secreto compartido) y con marca de tiempo.
 */

export const SYNC_MAX_SKEW_MS = 5 * 60_000;
export const MARK_START = "[[RECEPCION-IA]]";
export const MARK_END = "[[/RECEPCION-IA]]";
export const PROMO_TAG = "[recepcion:";

export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Firma válida y reciente (evita que alguien reenvíe una petición vieja). */
export function verifySignature(secret: string, timestamp: string | null, signature: string | null, rawBody: string, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SYNC_MAX_SKEW_MS) return false;
  const expected = Buffer.from(signBody(secret, timestamp, rawBody));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export type SnapshotService = {
  id: string;
  name: string;
  price: number;
  duration_min: number;
  promo: { price: number; list_price: number; from: string | null; until: string } | null;
};

export type Snapshot = {
  v: 1;
  email: string;
  recepcion_clinic_id: string;
  clinic: {
    name: string;
    address: string | null;
    city: string | null;
    receptionist_phone: string | null;
    max_discount_pct: number | null;
    hours: string;
  };
  services: SnapshotService[];
};

const money = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Bloque administrado por Recepción IA dentro de la descripción de la clínica. */
export function buildManagedBlock(s: Snapshot): string {
  const lines: string[] = [MARK_START, "Datos que se actualizan solos desde Recepción IA:"];
  if (s.clinic.address) lines.push(`Dirección: ${s.clinic.address}${s.clinic.city ? ` (${s.clinic.city})` : ""}`);
  if (s.clinic.hours) lines.push(`Horario: ${s.clinic.hours}`);
  if (s.services.length) {
    lines.push("Tratamientos y precios:");
    for (const t of s.services.slice(0, 80)) {
      const promo = t.promo ? ` — promoción ${money(t.promo.price)} (normal ${money(t.promo.list_price)}) hasta el ${t.promo.until}` : "";
      lines.push(`- ${t.name}: ${money(t.price)}, dura ${t.duration_min} min${promo}`);
    }
  }
  lines.push(MARK_END);
  return lines.join("\n").slice(0, 4000);
}

/** Reemplaza el bloque anterior (si existe) o lo agrega al final, sin tocar lo que la clínica escribió a mano. */
export function mergeDescription(existing: string | null | undefined, block: string): string {
  const current = existing ?? "";
  const a = current.indexOf(MARK_START);
  const b = current.indexOf(MARK_END);
  if (a >= 0 && b > a) return (current.slice(0, a).trimEnd() + "\n\n" + block + current.slice(b + MARK_END.length)).trim();
  return (current.trimEnd() ? current.trimEnd() + "\n\n" : "") + block;
}

export type PromoRow = { name: string; description: string; discount_percent: number; service_name: string; starts_at: string; ends_at: string; is_active: true; tag: string };

/** Promociones de Recepción IA → filas de `promotions` (identificadas por la etiqueta `[recepcion:<id>]`). */
export function promotionsFrom(s: Snapshot): PromoRow[] {
  const out: PromoRow[] = [];
  for (const t of s.services) {
    const p = t.promo;
    if (!p || !(p.list_price > 0) || !(p.price >= 0) || p.price >= p.list_price) continue;
    const pct = Math.min(90, Math.max(1, Math.round((1 - p.price / p.list_price) * 100)));
    const tag = `${PROMO_TAG}${t.id}]`;
    out.push({
      name: `Promoción ${t.name}`.slice(0, 120),
      description: `${tag} ${t.name} a ${money(p.price)} (normal ${money(p.list_price)}) hasta el ${p.until}`,
      discount_percent: pct,
      service_name: t.name,
      // Fechas en hora de Perú (UTC-5).
      starts_at: p.from ? `${p.from}T00:00:00-05:00` : new Date().toISOString(),
      ends_at: `${p.until}T23:59:59-05:00`,
      is_active: true,
      tag,
    });
  }
  return out;
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Elige cuál clínica de Cohortech corresponde a la de Recepción IA: ya vinculada, mismo nombre, o la única que hay. */
export function chooseClinic<T extends { id: string; name: string; settings?: any }>(
  clinics: T[],
  recepcionClinicId: string,
  recepcionName: string
): { clinic: T | null; reason: "already" | "name" | "only" | "none" | "ambiguous" } {
  const linked = clinics.find((c) => c.settings?.recepcion?.clinic_id === recepcionClinicId);
  if (linked) return { clinic: linked, reason: "already" };
  const free = clinics.filter((c) => !c.settings?.recepcion?.clinic_id);
  const byName = free.filter((c) => norm(c.name) === norm(recepcionName));
  if (byName.length === 1) return { clinic: byName[0], reason: "name" };
  if (free.length === 1 && clinics.length === 1) return { clinic: free[0], reason: "only" };
  return { clinic: null, reason: clinics.length ? "ambiguous" : "none" };
}
