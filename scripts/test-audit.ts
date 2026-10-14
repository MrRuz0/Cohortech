import { buildAuditReport, explain } from "../lib/admin/audit";

let ok = 0, bad = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) ok++; else { bad++; console.log("  ✗", n, d ?? ""); } };

// Explicaciones
check("sesión caída", /reescanear|escanear/i.test(explain("deliver", "No se pudo enviar el mensaje", { error: "La clínica no tiene WhatsApp conectado" }).suggestedFix));
check("número sin WhatsApp (400)", /400|no tiene WhatsApp/i.test(explain("deliver", "x", { error: "Evolution sendText failed: 400 {\"exists\":false}" }).likelyCause));
check("Evolution caído", /Railway/.test(explain("dispatch", "x", { error: "fetch failed" }).suggestedFix));
check("sin crédito OpenAI", /Billing/.test(explain("ai", "La IA no respondió (429 insufficient_quota)", { error: "" }).suggestedFix));
check("monto inventado bloqueado", /Herramientas del sistema/.test(explain("ai", "Respuesta de IA rechazada (unknown_amount:120)", {}).suggestedFix));
check("sin recepcionista", /recepcionista/i.test(explain("notify", "La clínica no tiene recepcionista/WhatsApp configurado: no se pudo avisar (booking)", {}).whatHappened));
check("token inválido", /refresh-webhooks|protección funcionó/i.test(explain("wa-webhook", "Se rechazó una llamada al webhook con token inválido", {}).suggestedFix));

(async () => {
  const r = await buildAuditReport();
  console.log(`\nVeredicto: ${r.verdict} — ${r.headline}`);
  console.log("Totales:", r.totals);
  for (const c of r.clinics) console.log(`  · ${c.name}: WhatsApp=${c.whatsapp} in=${c.inbound} out=${c.outbound}`);
  check("el reporte tiene fecha de Lima", /^\d{4}-\d{2}-\d{2}$/.test(r.day), r.day);
  check("lista todas las clínicas", r.clinics.length >= 1);
  console.log(`\n${ok} OK, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})();
