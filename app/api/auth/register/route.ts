import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Límite por IP (best-effort por instancia serverless): 5 registros por hora.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Demasiados intentos. Prueba de nuevo en una hora." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const clinicName = String(body.clinicName ?? "").trim();

  if (!email || !password || !clinicName) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "La contraseña debe tener entre 8 y 72 caracteres" }, { status: 400 });
  }
  if (clinicName.length > 120) {
    return NextResponse.json({ error: "Nombre de clínica demasiado largo" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { clinic_name: clinicName },
  });

  if (error) {
    // Mensaje genérico: no revela si el correo ya existe.
    return NextResponse.json({ error: "No se pudo crear la cuenta. Revisa los datos o inicia sesión." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}
