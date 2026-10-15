import { admin } from "@/lib/conversation/db";
import { normalize } from "@/lib/conversation/normalize";
import { parsePriceNumber } from "@/lib/conversation/services";

export type ClinicStats = {
  inbound: number;
  template: number;
  negotiation: number;
  ai: number;
  safety: number;
  human: number;
  bookings: number;
  lastMessageAt: string | null;
  errors7d: number;
  /** Ingreso potencial: suma del precio del tratamiento de interés de quienes pidieron cita. */
  revenueEstimate: number;
  /** % de respuestas del asistente resueltas sin derivar a una persona. */
  autoPct: number;
};

export type StatsResult = { ready: boolean; byClinic: Map<string, ClinicStats> };

type ClinicRef = { id: string; settings: unknown };

export async function loadClinicStats(clinics: ClinicRef[], days = 30): Promise<StatsResult> {
  const db = admin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db.rpc("admin_clinic_stats", { p_since: since });
  if (error || !Array.isArray(data)) return { ready: false, byClinic: new Map() };

  // Perfiles de quienes pidieron cita → tratamiento de interés → precio.
  const ids = Array.from(new Set((data as any[]).flatMap((r) => r.booking_patient_ids ?? []))).slice(0, 2000);
  const profiles = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: pats } = await db
      .from("patients")
      .select("id, extracted_profile")
      .in("id", ids.slice(i, i + 200));
    for (const p of pats ?? []) profiles.set(p.id, p.extracted_profile ?? {});
  }

  const settingsOf = new Map(clinics.map((c) => [c.id, (c.settings ?? {}) as Record<string, any>]));
  const byClinic = new Map<string, ClinicStats>();

  for (const r of data as any[]) {
    const services: { name?: string; price?: string }[] = settingsOf.get(r.clinic_id)?.services ?? [];
    let revenue = 0;
    for (const pid of (r.booking_patient_ids ?? []) as string[]) {
      const last: string | undefined = profiles.get(pid)?.interested_services?.slice(-1)[0];
      if (!last) continue;
      const target = normalize(last);
      const svc = services.find((s) => s.name && normalize(s.name).split("/")[0].trim() === target)
        ?? services.find((s) => s.name && normalize(s.name).includes(target));
      const price = svc?.price ? parsePriceNumber(String(svc.price)) : null;
      if (price) revenue += price;
    }

    const template = Number(r.template);
    const negotiation = Number(r.negotiation);
    const ai = Number(r.ai);
    const safety = Number(r.safety);
    const resolved = template + negotiation + ai;
    const total = resolved + safety;

    byClinic.set(r.clinic_id, {
      inbound: Number(r.inbound),
      template,
      negotiation,
      ai,
      safety,
      human: Number(r.human),
      bookings: Number(r.bookings),
      lastMessageAt: r.last_message_at ?? null,
      errors7d: Number(r.errors_7d),
      revenueEstimate: Math.round(revenue * 10) / 10,
      autoPct: total ? Math.round((resolved / total) * 100) : 0,
    });
  }
  return { ready: true, byClinic };
}
