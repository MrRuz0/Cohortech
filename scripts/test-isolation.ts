/**
 * B10 — Aislamiento entre clínicas contra la base REAL.
 * Crea 2 usuarios + 2 clínicas temporales, inicia sesión como A e intenta leer/modificar/borrar datos de B
 * (con RLS, igual que el dashboard). Al terminar borra todo.
 *
 *   npx tsx --env-file=.env.local scripts/test-isolation.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`, detail !== undefined ? `→ ${JSON.stringify(detail)}` : ""); }
}

const stamp = Date.now();
const pass = `Zz-${stamp}-Aa1!`;
const emails = [`iso-a-${stamp}@example.com`, `iso-b-${stamp}@example.com`];
const userIds: string[] = [];
const clinicIds: string[] = [];

async function main() {
  const patientIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { data: u, error } = await svc.auth.admin.createUser({ email: emails[i], password: pass, email_confirm: true });
    if (error || !u.user) throw new Error("No se pudo crear usuario: " + error?.message);
    userIds.push(u.user.id);
    // El trigger de registro ya crea la clínica del usuario: se usa y se renombra.
    const { data: c, error: ce } = await svc.from("clinics").update({ name: `ZZ Aislamiento ${i ? "B" : "A"}` }).eq("owner_id", u.user.id).select("id").single();
    if (ce || !c) throw new Error("No se pudo crear clínica: " + ce?.message);
    clinicIds.push(c.id);
    const { data: p } = await svc.from("patients").insert({ clinic_id: c.id, phone_e164: `5199${stamp % 10000000}${i}`, full_name: `Paciente ${i ? "B" : "A"}`, channel_source: "whatsapp", status: "lead" }).select("id").single();
    patientIds.push(p!.id);
    await svc.from("messages").insert({ clinic_id: c.id, patient_id: p!.id, direction: "inbound", content_text: `secreto ${i ? "B" : "A"}`, sent_at: new Date().toISOString(), processing_status: "processed" });
    await svc.from("promotions").insert({ clinic_id: c.id, title: `Promo ${i ? "B" : "A"}`, discount_percent: 10 }).then(() => {}, () => {});
  }

  // Sesión de A (cliente con anon key + login, igual que el navegador).
  const a = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: le } = await a.auth.signInWithPassword({ email: emails[0], password: pass });
  if (le) throw new Error("Login A falló: " + le.message);
  const [clinicA, clinicB] = clinicIds;

  console.log("Lecturas desde la sesión de A:");
  for (const table of ["patients", "messages", "promotions", "cohort_memberships", "system_events"]) {
    const { data, error } = await a.from(table).select("*").eq("clinic_id", clinicB);
    check(`${table}: no ve filas de B`, !error ? (data ?? []).length === 0 : true, data?.length);
  }
  const { data: clinicsSeen } = await a.from("clinics").select("id");
  check("clinics: solo ve la suya", (clinicsSeen ?? []).every((c) => c.id === clinicA) && (clinicsSeen ?? []).length === 1, clinicsSeen);
  const { data: own } = await a.from("patients").select("id").eq("clinic_id", clinicA);
  check("sí ve a sus propios pacientes", (own ?? []).length === 1);

  console.log("Escrituras desde la sesión de A sobre B:");
  await a.from("patients").update({ full_name: "HACKEADO" }).eq("id", patientIds[1]);
  const { data: afterUpd } = await svc.from("patients").select("full_name").eq("id", patientIds[1]).single();
  check("no puede modificar un paciente de B", afterUpd?.full_name === "Paciente B", afterUpd);

  await a.from("patients").delete().eq("id", patientIds[1]);
  const { data: afterDel } = await svc.from("patients").select("id").eq("id", patientIds[1]);
  check("no puede borrar un paciente de B", (afterDel ?? []).length === 1);

  const ins = await a.from("patients").insert({ clinic_id: clinicB, phone_e164: "51900000000", full_name: "Intruso", channel_source: "whatsapp", status: "lead" });
  check("no puede insertar pacientes en B", !!ins.error);

  await a.from("clinics").update({ name: "HACKEADA" }).eq("id", clinicB);
  const { data: cb } = await svc.from("clinics").select("name").eq("id", clinicB).single();
  check("no puede modificar la clínica B", cb?.name === "ZZ Aislamiento B", cb);

  console.log("Funciones sensibles:");
  const rpc = await a.rpc("admin_clinic_stats", { p_since: new Date(0).toISOString() });
  check("no puede ejecutar admin_clinic_stats", !!rpc.error || (rpc.data ?? []).length === 0, rpc.data);
}

main()
  .catch((e) => { failed++; console.error("ERROR:", e); })
  .finally(async () => {
    for (const id of clinicIds) await svc.from("clinics").delete().eq("id", id);
    for (const id of userIds) await svc.auth.admin.deleteUser(id);
    console.log(`\n${passed} OK, ${failed} fallos (datos temporales borrados)`);
    process.exit(failed ? 1 : 0);
  });
