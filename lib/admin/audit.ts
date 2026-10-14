import { getConnectionState } from "@/lib/evolution/client";
import { admin } from "@/lib/conversation/db";

export type Verdict = "ok" | "attention" | "critical";

export type AuditGroup = {
  key: string;
  level: "error" | "warn";
  source: string;
  message: string;
  count: number;
  firstAt: string;
  lastAt: string;
  clinics: string[];
  eventIds: string[];
  sample: Record<string, unknown>;
  whatHappened: string;
  likelyCause: string;
  suggestedFix: string;
};

export type UnansweredItem = { clinic: string; patient: string; waitingMinutes: number; preview: string };

export type ClinicHealth = {
  id: string;
  name: string;
  whatsapp: "conectado" | "desconectado" | "sin_conectar" | "sin_respuesta";
  inbound: number;
  outbound: number;
  failed: number;
  errors: number;
};

export type AuditReport = {
  day: string;
  generatedAt: string;
  window: { from: string; to: string };
  verdict: Verdict;
  headline: string;
  totals: { errors: number; warnings: number; inbound: number; outbound: number; failedOutbound: number; unanswered: number };
  groups: AuditGroup[];
  unanswered: UnansweredItem[];
  clinics: ClinicHealth[];
};

/** Fecha (YYYY-MM-DD) en hora de Lima. */
export function limaDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(d);
}

// ── Explicaciones: qué pasó, causa probable y cómo arreglarlo ───────────
type Explanation = { whatHappened: string; likelyCause: string; suggestedFix: string };

export function explain(source: string, message: string, detail: Record<string, unknown>): Explanation {
  const err = String(detail.error ?? "");
  const hay = (re: RegExp) => re.test(err) || re.test(message);

  if (source === "deliver" || source === "dispatch" || source === "followups" || source === "broadcast") {
    if (hay(/no tiene whatsapp conectado/i)) {
      return {
        whatHappened: "El sistema intentó enviar un mensaje pero la clínica no tiene WhatsApp vinculado.",
        likelyCause: "La clínica cerró sesión, cambió de teléfono o nunca terminó de escanear el QR.",
        suggestedFix: "Pedir a la clínica que entre a Configuración → WhatsApp y vuelva a escanear el código QR.",
      };
    }
    if (hay(/sendText failed: 40[01]|exists.*false|not.*registered/i)) {
      return {
        whatHappened: "Evolution API rechazó el envío (error 400).",
        likelyCause: "El número del paciente no tiene WhatsApp, está mal escrito, o la sesión de la clínica se cayó.",
        suggestedFix: "Revisar si el número del paciente es válido. Si ocurre con varios pacientes de la misma clínica, la sesión de WhatsApp está caída: reescanear el QR.",
      };
    }
    if (hay(/sendText failed: (401|403)/i)) {
      return {
        whatHappened: "Evolution API rechazó las credenciales.",
        likelyCause: "La EVOLUTION_API_KEY de Vercel no coincide con la del servidor de Evolution.",
        suggestedFix: "Verificar EVOLUTION_API_KEY en Vercel (Settings → Environment Variables) y volver a desplegar.",
      };
    }
    if (hay(/fetch failed|ECONNREFUSED|ENOTFOUND|timeout|aborted|sendText failed: 5\d\d/i)) {
      return {
        whatHappened: "No se pudo contactar con Evolution API (el servicio de WhatsApp).",
        likelyCause: "El servicio de Evolution en Railway está apagado, reiniciándose o sin créditos.",
        suggestedFix: "Entrar a Railway → proyecto endearing-benevolence → comprobar que Evolution API, Redis y Postgres estén 'Online'; si no, hacer Redeploy.",
      };
    }
    return {
      whatHappened: "Falló el envío de un mensaje.",
      likelyCause: "Error no clasificado; mira el detalle técnico.",
      suggestedFix: "Revisar el mensaje de error original y la sesión de WhatsApp de la clínica afectada.",
    };
  }

  if (source === "ai") {
    if (hay(/no_api_key/i)) {
      return {
        whatHappened: "La IA no pudo responder porque no hay clave de OpenAI.",
        likelyCause: "Falta la variable OPENAI_API_KEY en Vercel.",
        suggestedFix: "Agregar OPENAI_API_KEY en Vercel y volver a desplegar.",
      };
    }
    if (hay(/insufficient_quota|exceeded your current quota|429|billing/i)) {
      return {
        whatHappened: "OpenAI rechazó la solicitud por límite o saldo.",
        likelyCause: "Se agotó el crédito o se alcanzó el límite de uso en la cuenta de OpenAI.",
        suggestedFix: "Entrar a platform.openai.com → Billing y recargar saldo.",
      };
    }
    if (hay(/rechazada \(unknown_amount/i)) {
      return {
        whatHappened: "La IA escribió un precio que no coincide con los servicios configurados y el sistema NO lo envió (respondió con un mensaje seguro y avisó a recepción).",
        likelyCause: "El paciente preguntó por algo que no está en la lista de servicios, o el precio configurado es ambiguo (ej. 'desde S/50').",
        suggestedFix: "Completar el servicio y su precio en Configuración → Herramientas del sistema para que el bot pueda responderlo sin IA.",
      };
    }
    if (hay(/rechazada \(unknown_discount/i)) {
      return {
        whatHappened: "La IA ofreció un descuento mayor al permitido y el sistema lo bloqueó.",
        likelyCause: "El paciente insistió en el precio y la IA improvisó un porcentaje.",
        suggestedFix: "Revisar el descuento máximo de la clínica; el bloqueo funcionó correctamente, no hace falta acción urgente.",
      };
    }
    if (hay(/rechazada \((unknown_link|unknown_phone)/i)) {
      return {
        whatHappened: "La IA inventó un enlace o teléfono y el sistema lo bloqueó.",
        likelyCause: "La clínica no tiene configurado teléfono/enlace de reservas y el paciente lo pidió.",
        suggestedFix: "Completar teléfono o enlace de reservas en Herramientas del sistema.",
      };
    }
    return {
      whatHappened: "La IA no pudo generar una respuesta válida.",
      likelyCause: "Respuesta mal formada o demora de OpenAI (ocasional).",
      suggestedFix: "Si se repite muchas veces en el día, revisar el estado de OpenAI. El paciente recibió un mensaje seguro y recepción fue avisada.",
    };
  }

  if (source === "notify") {
    if (hay(/no tiene recepcionista/i)) {
      return {
        whatHappened: "Había que avisar a recepción (cita, reclamo o urgencia) pero la clínica no tiene número de recepcionista.",
        likelyCause: "La clínica no completó 'Notificaciones a recepcionista'.",
        suggestedFix: "Pedirle a la clínica que registre el número en Configuración → WhatsApp. Es importante: sin esto nadie se entera de las citas.",
      };
    }
    return {
      whatHappened: "No se pudo avisar a la recepcionista.",
      likelyCause: "Sesión de WhatsApp caída o número de recepción inválido.",
      suggestedFix: "Verificar el número de recepcionista y que el WhatsApp de la clínica esté conectado.",
    };
  }

  if (source === "wa-webhook") {
    if (/token inválido/i.test(message)) {
      return {
        whatHappened: "Alguien llamó al webhook de WhatsApp con un token incorrecto y fue rechazado.",
        likelyCause: "Una instancia con el webhook desactualizado, o un intento externo de enviar mensajes falsos.",
        suggestedFix: "Si coincide con una clínica real que no recibe mensajes, ejecutar scripts/refresh-webhooks.ts. Si no, ignorar: la protección funcionó.",
      };
    }
    return {
      whatHappened: "Falló el procesamiento de un mensaje entrante.",
      likelyCause: "Error interno al procesar el mensaje (ver detalle técnico).",
      suggestedFix: "Revisar el stack en el detalle; si el paciente quedó sin respuesta, contactarlo manualmente.",
    };
  }

  if (source === "engine") {
    return {
      whatHappened: "El motor falló al decidir la respuesta; el paciente recibió un mensaje seguro y se avisó a recepción.",
      likelyCause: "Error de programación o dato inesperado en el mensaje o el paciente.",
      suggestedFix: "Revisar el stack técnico y el mensaje del paciente (incluidos en el detalle) para reproducir y corregir.",
    };
  }

  if (/(dispatch|followups)/.test(source) && /consulta/i.test(message)) {
    return {
      whatHappened: "Un cron no pudo consultar la base de datos.",
      likelyCause: "Migración pendiente o columna inexistente.",
      suggestedFix: "Abrir /api/health con el CRON_SECRET y revisar 'migration_0010'.",
    };
  }

  return {
    whatHappened: message,
    likelyCause: "Sin clasificación automática.",
    suggestedFix: "Revisar el detalle técnico del evento.",
  };
}

// ── Construcción del reporte ────────────────────────────────────────────
export async function buildAuditReport(now: Date = new Date()): Promise<AuditReport> {
  const db = admin();
  const to = now;
  const from = new Date(now.getTime() - 24 * 3_600_000);
  const fromIso = from.toISOString();

  const { data: clinics } = await db.from("clinics").select("id, name, wa_session_id");
  const clinicName = new Map<string, string>((clinics ?? []).map((c: any) => [c.id, c.name]));

  // 1) Eventos del sistema (errores y avisos de las últimas 24 h)
  const { data: events } = await db
    .from("system_events")
    .select("id, created_at, level, source, message, detail, clinic_id, resolved_at")
    .gte("created_at", fromIso)
    .in("level", ["error", "warn"])
    .order("created_at", { ascending: true })
    .limit(2000);

  const groupsMap = new Map<string, AuditGroup>();
  for (const e of events ?? []) {
    if (e.resolved_at) continue;
    const key = `${e.level}|${e.source}|${e.message}`;
    const clinic = e.clinic_id ? clinicName.get(e.clinic_id) ?? "—" : null;
    const g = groupsMap.get(key);
    if (g) {
      g.count++;
      g.lastAt = e.created_at;
      g.eventIds.push(e.id);
      if (clinic && !g.clinics.includes(clinic)) g.clinics.push(clinic);
    } else {
      const ex = explain(e.source, e.message, (e.detail ?? {}) as Record<string, unknown>);
      groupsMap.set(key, {
        key,
        level: e.level,
        source: e.source,
        message: e.message,
        count: 1,
        firstAt: e.created_at,
        lastAt: e.created_at,
        clinics: clinic ? [clinic] : [],
        eventIds: [e.id],
        sample: (e.detail ?? {}) as Record<string, unknown>,
        ...ex,
      });
    }
  }
  const groups = Array.from(groupsMap.values()).sort(
    (a, b) => (a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1)
  );

  // 2) Actividad de mensajes
  const { data: msgs } = await db
    .from("messages")
    .select("id, clinic_id, patient_id, direction, content_text, sent_at, processing_status")
    .gte("sent_at", fromIso)
    .order("sent_at", { ascending: true })
    .limit(8000);

  const perClinic = new Map<string, ClinicHealth>();
  const ensure = (id: string): ClinicHealth => {
    let h = perClinic.get(id);
    if (!h) {
      h = { id, name: clinicName.get(id) ?? "—", whatsapp: "sin_conectar", inbound: 0, outbound: 0, failed: 0, errors: 0 };
      perClinic.set(id, h);
    }
    return h;
  };
  for (const c of clinics ?? []) ensure(c.id);

  const lastInbound = new Map<string, any>();
  const lastOutboundAt = new Map<string, number>();
  let inbound = 0;
  let outbound = 0;
  let failedOutbound = 0;
  for (const m of msgs ?? []) {
    const h = ensure(m.clinic_id);
    if (m.direction === "inbound") {
      inbound++;
      h.inbound++;
      if (m.patient_id) lastInbound.set(m.patient_id, m);
    } else {
      outbound++;
      h.outbound++;
      if (m.processing_status === "failed") {
        failedOutbound++;
        h.failed++;
      }
      if (m.patient_id) lastOutboundAt.set(m.patient_id, new Date(m.sent_at).getTime());
    }
  }
  for (const e of events ?? []) if (e.clinic_id && !e.resolved_at && e.level === "error") ensure(e.clinic_id).errors++;

  // 3) Mensajes de pacientes sin respuesta (esperando > 15 min), excluyendo bloqueados/pausados
  const candidates = Array.from(lastInbound.values()).filter((m) => {
    const out = lastOutboundAt.get(m.patient_id) ?? 0;
    return out < new Date(m.sent_at).getTime() && now.getTime() - new Date(m.sent_at).getTime() > 15 * 60_000;
  });
  let unansweredList: UnansweredItem[] = [];
  if (candidates.length) {
    const ids = candidates.map((m) => m.patient_id);
    const { data: pats } = await db
      .from("patients")
      .select("id, full_name, phone_e164, is_blocked, bot_paused_until")
      .in("id", ids.slice(0, 500));
    const pmap = new Map<string, any>((pats ?? []).map((p: any) => [p.id, p]));
    const { data: cl } = await db.from("clinics").select("id, settings");
    const clinicSettings = new Map<string, any>((cl ?? []).map((c: any) => [c.id, c.settings ?? {}]));

    unansweredList = candidates
      .filter((m) => {
        const p = pmap.get(m.patient_id);
        if (!p || p.is_blocked) return false;
        if (p.bot_paused_until && new Date(p.bot_paused_until).getTime() > now.getTime()) return false;
        const s = clinicSettings.get(m.clinic_id) ?? {};
        if (s.bot_paused === true) return false;
        // Con recepción apagada, no contestar a contactos fuera de recuperación es lo esperado.
        if (s.modules?.reception === false) return false;
        if (/^\[(sticker|reaction)\]$/.test(m.content_text ?? "")) return false;
        return true;
      })
      .slice(0, 25)
      .map((m) => {
        const p = pmap.get(m.patient_id);
        return {
          clinic: clinicName.get(m.clinic_id) ?? "—",
          patient: p?.full_name ?? p?.phone_e164 ?? "—",
          waitingMinutes: Math.round((now.getTime() - new Date(m.sent_at).getTime()) / 60_000),
          preview: String(m.content_text ?? "").slice(0, 120),
        };
      });
  }

  // 4) Estado real de la sesión de WhatsApp de cada clínica (consulta en vivo)
  await Promise.all(
    (clinics ?? []).map(async (c: any) => {
      const h = ensure(c.id);
      if (!c.wa_session_id) {
        h.whatsapp = "sin_conectar";
        return;
      }
      try {
        const st = await Promise.race([
          getConnectionState(c.wa_session_id),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
        ]);
        h.whatsapp = st?.instance?.state === "open" ? "conectado" : "desconectado";
      } catch {
        h.whatsapp = "sin_respuesta";
      }
    })
  );

  const errors = groups.filter((g) => g.level === "error").reduce((n, g) => n + g.count, 0);
  const warnings = groups.filter((g) => g.level === "warn").reduce((n, g) => n + g.count, 0);

  const disconnectedActive = Array.from(perClinic.values()).filter(
    (c) => (c.whatsapp === "desconectado" || c.whatsapp === "sin_respuesta") && c.inbound > 0
  );
  let verdict: Verdict = "ok";
  if (errors > 0 || failedOutbound > 0 || disconnectedActive.length > 0) verdict = "critical";
  else if (warnings > 0 || unansweredList.length > 0) verdict = "attention";

  const headline =
    verdict === "ok"
      ? `Todo en orden: ${inbound} mensajes recibidos, ${outbound} enviados, sin errores.`
      : verdict === "critical"
        ? `Requiere acción: ${errors} errores, ${failedOutbound} envíos fallidos${disconnectedActive.length ? `, ${disconnectedActive.length} clínica(s) con WhatsApp caído` : ""}.`
        : `Revisar: ${warnings} avisos${unansweredList.length ? ` y ${unansweredList.length} pacientes sin respuesta` : ""}.`;

  return {
    day: limaDay(now),
    generatedAt: now.toISOString(),
    window: { from: fromIso, to: to.toISOString() },
    verdict,
    headline,
    totals: { errors, warnings, inbound, outbound, failedOutbound, unanswered: unansweredList.length },
    groups,
    unanswered: unansweredList,
    clinics: Array.from(perClinic.values()).sort((a, b) => b.errors - a.errors || b.inbound - a.inbound),
  };
}

export async function saveAuditReport(report: AuditReport): Promise<void> {
  const { error } = await admin()
    .from("audit_reports")
    .upsert({ day: report.day, summary: report }, { onConflict: "day" });
  if (error) throw new Error(`audit_reports: ${error.message}`);
}
