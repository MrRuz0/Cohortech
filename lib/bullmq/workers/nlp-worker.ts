import { Worker, type ConnectionOptions } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { extractEntities } from "@/lib/openai/extract-entities";
import { getCohortQueue } from "@/lib/bullmq/queues";
import { generateAutoResponse, canAutoRespond } from "@/lib/cohorts/respond";
import { sendTextMessage } from "@/lib/evolution/client";
import ws from "ws";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } }
);

function getConnection(): ConnectionOptions {
  const url = process.env.UPSTASH_REDIS_URL ?? "";
  const parsed = new URL(url || "redis://localhost:6379");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

type NlpJobData = {
  messageId: string;
  clinicId: string;
  patientId: string | null;
  text: string;
};

export const nlpWorker = new Worker<NlpJobData>(
  "nlp-extraction",
  async (job) => {
    const { messageId, clinicId, patientId, text } = job.data;

    const result = await extractEntities(text);

    await supabaseAdmin
      .from("messages")
      .update({ nlp_result: result, processing_status: "processed" })
      .eq("id", messageId);

    if (!patientId) return result;

    // Update patient name/status if NLP extracted it
    if (result.patient_name) {
      await supabaseAdmin
        .from("patients")
        .update({
          full_name: result.patient_name,
          status: result.is_existing_patient ? "active" : "lead",
        })
        .eq("id", patientId);
    }

    // Fetch clinic + patient data in parallel
    const [clinicRes, patientRes] = await Promise.all([
      supabaseAdmin
        .from("clinics")
        .select("id, name, wa_session_id, receptionist_phone")
        .eq("id", clinicId)
        .single(),
      supabaseAdmin
        .from("patients")
        .select("id, full_name, phone_e164, last_auto_response_at")
        .eq("id", patientId)
        .single(),
    ]);

    const clinic = clinicRes.data;
    const patient = patientRes.data;

    // Auto-respond to patient
    if (
      clinic?.wa_session_id &&
      patient?.phone_e164 &&
      canAutoRespond(patient.last_auto_response_at) &&
      result.intent !== "other"
    ) {
      try {
        const responseText = await generateAutoResponse({
          clinicName: clinic.name ?? "la clínica",
          patientName: patient.full_name,
          messageText: text,
          nlpResult: result,
        });

        if (responseText) {
          await sendTextMessage(clinic.wa_session_id, patient.phone_e164, responseText);
          await supabaseAdmin
            .from("patients")
            .update({ last_auto_response_at: new Date().toISOString() })
            .eq("id", patientId);

          console.log(`Auto-response sent to ${patient.phone_e164} (intent: ${result.intent})`);
        }
      } catch (err) {
        console.error("Auto-response error:", err);
      }
    }

    // Notify receptionist on booking intent
    if (
      result.intent === "booking" &&
      clinic?.wa_session_id &&
      clinic?.receptionist_phone
    ) {
      try {
        const summary = [
          `🔔 *Nueva solicitud de cita*`,
          `Paciente: ${patient?.full_name ?? "Desconocido"}`,
          `Tel: ${patient?.phone_e164 ?? "N/A"}`,
          result.treatment_mentioned
            ? `Tratamiento: ${result.treatment_mentioned}`
            : null,
          `Mensaje: "${text.slice(0, 100)}"`,
        ]
          .filter(Boolean)
          .join("\n");

        await sendTextMessage(clinic.wa_session_id, clinic.receptionist_phone, summary);
        console.log(`Receptionist notified at ${clinic.receptionist_phone}`);
      } catch (err) {
        console.error("Receptionist notification error:", err);
      }
    }

    // Queue cohort assignment (async, non-blocking)
    await getCohortQueue().add(
      "assign-cohort",
      { clinicId, patientId, nlpResult: result, messageText: text },
      { attempts: 2 }
    );

    return result;
  },
  {
    connection: getConnection(),
    settings: {
      backoffStrategy: (attemptsMade) => {
        const delays = [5000, 25000, 125000];
        return delays[attemptsMade - 1] ?? 125000;
      },
    },
  }
);

nlpWorker.on("failed", async (job, err) => {
  if (!job) return;
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await supabaseAdmin
      .from("messages")
      .update({ processing_status: "failed", nlp_result: { error: err.message } })
      .eq("id", job.data.messageId);
  }
});

console.log("NLP worker iniciado, esperando jobs en 'nlp-extraction'...");
