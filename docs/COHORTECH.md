# 05 · Cohortech (`codigo/cohortech`)

Next.js **16** (App Router, React 19) + Supabase + OpenAI (+ Anthropic opcional) + Evolution API + MercadoPago, desplegado en **Vercel** (`cohortech.vercel.app`). ⚠️ Esta versión de Next tiene cambios incompatibles: lee `node_modules/next/dist/docs/` antes de usar APIs (ver `AGENTS.md`). El archivo `proxy.ts` es el *middleware* (en Next 16 se llama `proxy`): refresca la sesión de Supabase.

## Qué hace
1. **Escucha** los mensajes de WhatsApp de la clínica (webhook), los guarda y los **etiqueta con IA** (`lib/openai/extract-entities.ts`: intención, nombre, tratamiento mencionado, señales de dolor, siguiente acción; si la confianza es < 0.65 y hay `ANTHROPIC_API_KEY`, pide una segunda opinión a Claude).
2. **Descubre cohortes** (`/api/cron/discover-cohorts`): con las etiquetas de los últimos 7 días (mínimo 5 con contenido) la IA propone 3–6 grupos con *nombre, descripción, dolor, estrategia de conversión y mensaje*. Cada paciente que escribe se **clasifica** en una cohorte (`lib/cohorts/assign.ts`).
3. **Seguimientos** (`/api/cron/followups`): a los miembros activos con `next_followup_at` vencido se les manda un mensaje generado (`lib/cohorts/followup.ts`, hasta 4 etapas, con descuentos solo dentro del tope y validación de lo que dice la IA). Máx. 25 por corrida, solo 9–20 h de la clínica, respetando tope diario y calentamiento.
4. **Reactivación** (`/api/cron/dispatch`): pacientes sin contacto hace N días (90 por defecto, `settings.reactivation_after_days`) reciben un mensaje de "te extrañamos" con 10 variantes; alterna con promociones vigentes.
5. **Envío masivo a una cohorte** (`/api/cohorts/[id]/broadcast`, botón en la tarjeta).
6. **Puntuación** (`/api/cron/score-patients`): LTV y riesgo de abandono por paciente.
7. **Resumen semanal** (`weekly-summary`, lunes) al teléfono de la recepcionista; **monitor** (estado de WhatsApp) y **auditoría diaria** (`daily-audit`, `lib/admin/audit.ts`).
8. **Motor de conversación** (`lib/conversation/*`): puede **responder** a quien escribe (recepción) cuando no hay Recepción IA vinculada: `handle.ts` (flujo completo: bloqueos, pausas, plan, módulos, espera de 3,5 s, tope de 15 respuestas/hora, toma de control humana 12 h), `engine.ts` (decisión por reglas), `ai.ts` (IA), `negotiation.ts`, `templates.ts`, `validate.ts` (revisa que la IA no invente precios/promesas), `notify.ts` (aviso al equipo), `window.ts` (horario de envío), `limits.ts` (tope diario por plan: starter 80 / pro 150 / scale 300; calentamiento 30→60→100 en números nuevos; tope mensual de IA 1.500).

## Crons (`vercel.json`; hora UTC → Lima UTC-5)
| Ruta | UTC | Lima |
|---|---|---|
| `/api/cron/score-patients` | 07:00 | 02:00 |
| `/api/cron/discover-cohorts` | 11:00 | 06:00 |
| `/api/cron/daily-audit` | 12:00 | 07:00 |
| `/api/cron/monitor` | 13:00 | 08:00 |
| `/api/cron/weekly-summary` (lunes) | 14:00 | 09:00 |
| `/api/cron/dispatch` (reactivación) | 15:00 | 10:00 |
| `/api/cron/followups` | 17:00 | 12:00 |

Todos exigen `Authorization: Bearer $CRON_SECRET`. `followups` y `dispatch` aceptan `?clinic=<id>` y `?preview=1` (solo informa, no envía).

## Módulos y planes (por clínica, `clinics.settings`)
- `modules`: `reception` (contesta y agenda), `recovery` (reactivación/seguimientos), `multichannel`. Se activan desde `/admin`.
- `plan_status` (`trial` 7 días / `active` / `suspended`) y `plan_expires_at`; sin plan activo no se envía nada. Cobro con MercadoPago (`/api/billing/*`, webhook `/api/webhooks/mercadopago`).
- Otros ajustes: `services`, `booking_link`, `booking_phone`, `address`, `hours` (la pestaña **Herramientas**), `payment_methods`, `bot_paused`, `dry_run` (simulación: no sale nada), `daily_cap_enabled`, `plan_tier`, `daily_send_cap`, `warmup_enabled`, `ai_monthly_cap`.

## Pantallas
`/` (landing), `/login`, `/register`, `/reset-password`, `/dashboard` (resumen y lista de configuración inicial), `/dashboard/patients` (importar CSV nombre/teléfono/última visita, máx. 2.000), `/dashboard/cohorts` (tarjetas, plantilla editable, **banner de cohortes importadas pendientes de aprobación**), `/dashboard/events`, `/dashboard/settings/{tools,assistant,promotions,whatsapp,profile}`, `/dashboard/settings/billing`, `/admin` y `/admin/audit`, `/estado` (estado público), `/privacidad`, `/terminos`, `/casos-de-exito`.

## Estado cuando la clínica está vinculada con Recepción IA
- `settings.recepcion.clinic_id` presente ⇒ `ClinicContext.recepcionLinked = true`.
- **No responde** a quien escribe (`reason: recepcion_handles`), pero **sí analiza y clasifica** cada mensaje (modo escucha) para que las cohortes se sigan formando.
- **Sí** hace campañas, seguimientos y reactivaciones (necesita su **propia** conexión de WhatsApp; el mismo número puede estar en los dos sistemas: se escanea un QR en cada uno).
- Los pacientes importados llevan `channel_source = 'whatsapp'` y la reactivación automática **pausada** (`reactivation_paused_until` a 10 años); sus seguimientos arrancan **solo tras la aprobación** de la dueña.

## Variables (nombres)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (opcional), `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `UPSTASH_REDIS_*` (presentes en el entorno local; revisar si aún se usan), MercadoPago (`MP_*`/token del cliente `lib/mercadopago/client.ts`), y para la sincronización `RECEPCION_SYNC_SECRET`. Plantilla: `env-ejemplos/cohortech.env.example`.

## Scripts útiles (`scripts/`)
`test-engine.ts` (motor de conversación), `e2e-engine.ts`, `test-webhook.ts`, `test-isolation.ts` (aislamiento entre clínicas), `test-audit.ts`, `simulate-recovery.ts`, `refresh-webhooks.ts` (reapunta los webhooks de Evolution), `verify-schema.mjs` (¿faltan migraciones?). Se ejecutan con `npx tsx scripts/<archivo>`.

## Lo que Cohortech NO tiene (aún)
No hay un README propio ni una suite de pruebas automática comparable a la de Recepción IA; las verificaciones están en `scripts/`. Mejorar eso es una tarea natural (doc 11).
