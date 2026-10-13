/**
 * Reapunta el webhook de cada instancia de WhatsApp a producción CON el token
 * compartido (WEBHOOK_SECRET). Seguro de correr antes y después del deploy:
 * la versión anterior del webhook ignora el parámetro ?token.
 *
 *   APP_URL=https://cohortech.vercel.app npx tsx --env-file=.env.local scripts/refresh-webhooks.ts
 */
import { admin } from "../lib/conversation/db";
import { setWebhook } from "../lib/evolution/client";

async function main() {
  const base = (process.env.APP_URL ?? "https://cohortech.vercel.app").replace(/\/+$/, "");
  const token = process.env.WEBHOOK_SECRET;
  if (!token) throw new Error("WEBHOOK_SECRET no está definido");

  const { data: clinics, error } = await admin()
    .from("clinics")
    .select("id, name, wa_session_id")
    .not("wa_session_id", "is", null);
  if (error) throw new Error(error.message);

  for (const c of clinics ?? []) {
    const url = `${base}/api/webhooks/wa/${c.id}?token=${encodeURIComponent(token)}`;
    try {
      await setWebhook(c.wa_session_id as string, url);
      console.log(`✓ ${c.name} (${c.wa_session_id}) → ${base}/api/webhooks/wa/${c.id}?token=***`);
    } catch (err) {
      console.error(`✗ ${c.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
