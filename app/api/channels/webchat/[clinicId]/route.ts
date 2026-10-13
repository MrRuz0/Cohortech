import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { admin, getClinic } from "@/lib/conversation/db";
import { handleInbound } from "@/lib/conversation/handle";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[A-Za-z0-9_-]{12,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Límite por IP + clínica (mejor esfuerzo: cada instancia serverless lleva su cuenta).
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, max = 25, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  cur.n++;
  return cur.n > max;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Historial de la sesión (para repintar el chat al recargar y ver respuestas de una persona). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!UUID_RE.test(clinicId) || !SESSION_RE.test(sessionId)) return json({ error: "bad_request" }, 400);

  const db = admin();
  const { data: patient } = await db
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("phone_e164", `web:${sessionId}`)
    .maybeSingle();
  if (!patient) return json({ messages: [] });

  const { data } = await db
    .from("messages")
    .select("direction, content_text, sent_at")
    .eq("patient_id", patient.id)
    .order("sent_at", { ascending: false })
    .limit(40);

  const messages = (data ?? [])
    .reverse()
    .map((m: any) => ({ from: m.direction === "outbound" ? "clinic" : "me", text: m.content_text, at: m.sent_at }));
  return json({ messages });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  if (!UUID_RE.test(clinicId)) return json({ error: "bad_request" }, 400);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`${clinicId}:${ip}`)) return json({ error: "rate_limited" }, 429);

  let body: { session?: string; text?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const session = String(body.session ?? "");
  const text = String(body.text ?? "").trim().slice(0, 800);
  if (!SESSION_RE.test(session) || !text) return json({ error: "bad_request" }, 400);

  const clinic = await getClinic(clinicId);
  if (!clinic) return json({ error: "not_found" }, 404);
  if (clinic.settings.webchat_enabled === false) return json({ error: "disabled" }, 403);

  const result = await handleInbound({
    clinicId,
    channel: "webchat",
    externalId: `web:${session}`,
    displayName: typeof body.name === "string" ? body.name.slice(0, 60) : null,
    text,
    messageId: `web:${randomUUID()}`,
    debounceMs: 0,
  });

  return json({
    reply: result.reply ?? null,
    status: result.status,
  });
}
