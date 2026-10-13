import { after, NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { admin, getSchemaFlags } from "@/lib/conversation/db";
import { handleInbound } from "@/lib/conversation/handle";
import { CHANNEL_PREFIX } from "@/lib/channels/send";

export const maxDuration = 60;

// Webhook de Meta para Instagram y Messenger.
// Requiere en Vercel: META_VERIFY_TOKEN y META_APP_SECRET.
// Cada clínica configura en Ajustes → Canales su `meta_page_id` y `meta_page_token`.

export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const verify = process.env.META_VERIFY_TOKEN;
  if (
    verify &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === verify
  ) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

type MetaEvent = {
  object?: string;
  entry?: {
    id?: string;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
    }[];
  }[];
};

export async function POST(request: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: MetaEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const channel = event.object === "instagram" ? "instagram" : event.object === "page" ? "messenger" : null;
  if (!channel) return NextResponse.json({ ok: true });

  after(async () => {
    try {
      await getSchemaFlags();
      for (const entry of event.entry ?? []) {
        for (const m of entry.messaging ?? []) {
          const msg = m.message;
          if (!msg || msg.is_echo || !m.sender?.id || !m.recipient?.id) continue;
          const text = (msg.text ?? "").trim();
          const hasMedia = Array.isArray(msg.attachments) && msg.attachments.length > 0;
          if (!text && !hasMedia) continue;

          const { data: clinic } = await admin()
            .from("clinics")
            .select("id")
            .eq("settings->>meta_page_id", m.recipient.id)
            .maybeSingle();
          if (!clinic) {
            console.warn(`[meta] sin clínica para la página ${m.recipient.id}`);
            continue;
          }

          await handleInbound({
            clinicId: clinic.id,
            channel,
            externalId: `${CHANNEL_PREFIX[channel]}${m.sender.id}`,
            text,
            mediaType: text ? null : "media",
            messageId: msg.mid ?? null,
            sentAt: m.timestamp ? new Date(m.timestamp).toISOString() : null,
            debounceMs: 0,
          });
        }
      }
    } catch (err) {
      console.error("[meta-webhook]", err);
    }
  });

  return NextResponse.json({ ok: true });
}
