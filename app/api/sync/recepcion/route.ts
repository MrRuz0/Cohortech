import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/conversation/db";
import { logError, logWarn } from "@/lib/conversation/log";
import { finalizeImport, importPatients } from "@/lib/sync/recepcion-import-db";
import { buildManagedBlock, chooseClinic, mergeDescription, promotionsFrom, toolsFrom, verifySignature, PROMO_TAG, type Snapshot } from "@/lib/sync/recepcion";

/**
 * Punto de entrada de la sincronización desde Recepción IA.
 * Acciones: "status" (¿está vinculada?), "link" (vincular por correo y nombre) y "sync" (copiar perfil y promociones).
 * Sin RECEPCION_SYNC_SECRET configurado queda apagado.
 */
export const maxDuration = 60;

const MAX_BODY = 400_000;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const db = admin();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RECEPCION_SYNC_SECRET;
  if (!secret) return json({ ok: false, reason: "sync_disabled" }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, reason: "too_large" }, 413);
  if (!verifySignature(secret, request.headers.get("x-sync-timestamp"), request.headers.get("x-sync-signature"), raw)) {
    await logWarn("sync-recepcion", "Firma inválida o vencida en la sincronización desde Recepción IA");
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  let body: { action?: string; snapshot?: Snapshot; patients?: unknown; blocked?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: "bad_json" }, 400);
  }
  const snap = body.snapshot;
  const action = body.action;
  if (!snap || snap.v !== 1 || !snap.email || !snap.recepcion_clinic_id || !snap.clinic?.name || !["status", "link", "sync", "patients", "finalize"].includes(String(action))) {
    return json({ ok: false, reason: "bad_request" }, 400);
  }

  try {
    const db = admin();
    const userId = await findUserIdByEmail(snap.email);
    if (!userId) return json({ ok: false, reason: "no_account", message: "No hay una cuenta de Cohortech con ese correo." });
    const { data: clinics } = await db.from("clinics").select("id, name, settings, clinic_description").eq("owner_id", userId);
    const list = (clinics ?? []) as { id: string; name: string; settings: any; clinic_description: string | null }[];
    const pick = chooseClinic(list, snap.recepcion_clinic_id, snap.clinic.name);

    if (action === "status") {
      return json({ ok: true, linked: pick.reason === "already", candidate: pick.clinic?.name ?? null, clinics: list.length, synced_at: pick.clinic?.settings?.recepcion?.synced_at ?? null });
    }
    if (!pick.clinic) {
      return json({
        ok: false,
        reason: pick.reason === "none" ? "no_clinic" : "ambiguous",
        message:
          pick.reason === "none"
            ? "Esa cuenta de Cohortech aún no tiene una clínica."
            : "Hay varias clínicas en Cohortech con ese correo y ninguna se llama igual. Ponle a la clínica de Cohortech el mismo nombre que en Recepción IA y vuelve a vincular.",
      });
    }
    if (["sync", "patients", "finalize"].includes(String(action)) && pick.reason !== "already") {
      return json({ ok: false, reason: "not_linked", message: "Primero vincula la clínica desde Recepción IA." });
    }
    const clinic = pick.clinic;
    // Pacientes y conversaciones (importación). No envía nada: solo guarda, analiza y arma las cohortes.
    if (action === "patients") return json(await importPatients(db, clinic, body.patients, body.blocked));
    if (action === "finalize") return json(await finalizeImport(db, clinic));
    const recepcion = { ...(clinic.settings?.recepcion ?? {}), clinic_id: snap.recepcion_clinic_id, linked_at: clinic.settings?.recepcion?.linked_at ?? new Date().toISOString() };

    if (action === "link" && pick.reason !== "already") {
      await db.from("clinics").update({ settings: { ...(clinic.settings ?? {}), recepcion } }).eq("id", clinic.id);
    }

    // sync (también tras vincular): perfil + promociones. Cohortech NO contesta por este número: solo se actualizan sus datos.
    const block = buildManagedBlock(snap);
    // «Herramientas» de Cohortech (servicios con precio y duración, dirección, horario): para que no las pida de nuevo.
    const tools = toolsFrom(snap);
    const settings: Record<string, unknown> = {
      ...(clinic.settings ?? {}),
      recepcion: { ...recepcion, synced_at: new Date().toISOString(), wa_connected: snap.wa_connected === true },
    };
    if (tools.services.length) settings.services = tools.services;
    if (tools.address) settings.address = tools.address;
    if (tools.hours) settings.hours = tools.hours;
    const patch: Record<string, unknown> = {
      clinic_description: mergeDescription(clinic.clinic_description, block),
      settings,
    };
    const phone = (snap.clinic.receptionist_phone ?? "").replace(/\D/g, "");
    if (phone) patch.receptionist_phone = phone;
    if (snap.clinic.max_discount_pct != null && Number.isFinite(snap.clinic.max_discount_pct)) {
      patch.max_discount_percent = Math.min(90, Math.max(0, Math.round(snap.clinic.max_discount_pct)));
    }
    const { error: upErr } = await db.from("clinics").update(patch).eq("id", clinic.id);
    if (upErr) throw upErr;

    // Promociones administradas por Recepción IA (se reconocen por la etiqueta en la descripción).
    const wanted = promotionsFrom(snap);
    const { data: existing } = await db.from("promotions").select("id, description, is_active").eq("clinic_id", clinic.id).like("description", `${PROMO_TAG}%`);
    const byTag = new Map<string, { id: string; is_active: boolean }>();
    for (const e of (existing ?? []) as { id: string; description: string; is_active: boolean }[]) {
      const m = /^\[recepcion:[^\]]+\]/.exec(e.description ?? "");
      if (m) byTag.set(m[0], { id: e.id, is_active: e.is_active });
    }
    let created = 0;
    let updated = 0;
    for (const p of wanted) {
      const { tag, ...row } = p;
      const prev = byTag.get(tag);
      if (prev) {
        await db.from("promotions").update(row).eq("id", prev.id);
        updated++;
        byTag.delete(tag);
      } else {
        await db.from("promotions").insert({ ...row, clinic_id: clinic.id });
        created++;
      }
    }
    // Las que ya no existen en Recepción IA se desactivan (no se borran).
    let deactivated = 0;
    for (const [, v] of byTag) {
      if (v.is_active) {
        await db.from("promotions").update({ is_active: false }).eq("id", v.id);
        deactivated++;
      }
    }
    return json({ ok: true, linked: true, clinic: clinic.name, promotions: { created, updated, deactivated }, services: snap.services.length });
  } catch (err) {
    await logError("sync-recepcion", "Falló la sincronización desde Recepción IA", err);
    return json({ ok: false, reason: "server_error" }, 500);
  }
}
