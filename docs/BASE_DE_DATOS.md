# 07 · Bases de datos (Supabase / Postgres)

Hay **dos proyectos de Supabase independientes** (organización "Cohortech"): el de Recepción IA ("Recepción IA + Agenda", plan Free) y el de Cohortech. **No mezclar claves ni datos.** Las migraciones se ejecutan **a mano** (Supabase → SQL Editor → New query → pegar → Run) por Jhordan; todas son **idempotentes** (se pueden repetir) y el código tolera que falten.

## A) Recepción IA (`codigo/recepcion-ia/supabase`)
`schema.sql` = esquema completo para una base nueva. `migrations/NNN_*.sql` = cambios incrementales (ejecutar en orden si la base ya existía).

### Tablas
`clinics` (una por clínica: nombre, ciudad, `wa_instance`, `wa_status`, `receptionist_phone`, `agenda_token`, plan `plan_status`/`plan_expires_at`, ajustes de agenda `slot_minutes`/`slot_capacity`/`min_notice_minutes`, adelanto y pausas, `ai_monthly_cap`, `tone`, `faq` jsonb, `templates` jsonb, `bot_enabled`, `enabled_channels`…) · `patients` (por `clinic_id`+`channel`+`phone`; etapa, `flow`/`flow_state`, `interest_service_id`, `last_inbound_intent`, `bot_paused_until`, `desired_date`, `nudge_count`…) · `messages` (entrantes/salientes con `response_source`: template, flow, ai, escalation, safe_fallback, human, nudge, reminder) · `appointments` (estado, precio, descuento, adelanto `deposit_*`, recordatorios) · `services` (precio, duración, promoción con fechas, sesiones de paquete, nombres alternativos) · `professionals`, `professional_services`, `professional_hours` · `business_hours`, `blocked_days`, `blocked_contacts` (números bloqueados) · `negotiation_settings` (reglas de descuento, `confirmed_at`) · `patient_packages` · `products`, `product_orders` · `channel_accounts` (Messenger/Instagram) · `agenda_notes` (notas/stickers del calendario) · `account_flags` (clínicas permitidas por dueño) · `admins` · `bot_events` (errores y eventos del bot) · `audit_reports` (informe diario) · `job_locks` (candado de tareas entre réplicas).

### Funciones (RPC) importantes
- Reservas: `book_appointment` (**atómica**, evita dobles citas), `start_package`, `consume_package_session`, `sync_package_usage`.
- Seguridad/propiedad: `owns_clinic`, `is_admin`, `on_clinic_created` (trigger: crea ajustes de negociación), `enforce_max_clinics` (tope de clínicas por correo), `set_wa_instance`.
- Admin: `admin_clinic_stats`, `admin_daily_activity`, `admin_set_plan`, `admin_set_ai_cap`, `admin_set_channels`, `admin_set_deposit_verification`, `admin_set_required_deposit`, `admin_set_max_clinics`.
- Link de agenda por token: `clinic_by_token`, `agenda_by_token`, `regenerate_agenda_token`, y (025) `agenda_range_by_token`, `agenda_marks_by_token`, `agenda_set_status_by_token` (solo confirmar/atendida/no asistió), `agenda_mark_deposit_by_token`.
- Mantenimiento: `acquire_job_lock`, `erase_patient_data` (borrar datos de una paciente).

### Seguridad
RLS en todas las tablas: el dueño solo ve sus clínicas (`owns_clinic`); el administrador ve todo vía `is_admin()`. Las funciones del link de agenda son `security definer` y validan el token. El **motor** usa service-role (salta RLS). Supabase corta en **1.000 filas** por consulta: usar `paging.ts`.

### Migraciones (propósito) y estado
| # | Para qué | Estado en producción |
|---|---|---|
| 002 | Configuración obligatoria (negociación confirmada, sin horarios por defecto) | en uso (se asume aplicada) |
| 003–011 | Descuento mismo día, canales Meta, números bloqueados, depósito con IA, productos/envíos, ciudad, link de agenda, adelanto obligatorio/una vez | en uso (se asumen aplicadas) |
| 012 | Promociones con fechas | confirmada |
| 013 | Nombres alternativos de tratamientos | en uso (se asume aplicada) |
| 014 | Paquetes de sesiones | confirmada |
| 015 | Horario propio de profesionales | confirmada |
| 016, 017 | Ajustes del adelanto; auditoría diaria | confirmadas |
| 018 | Permiso a la clínica para cambiar ajustes del adelanto | **por confirmar** |
| 019 | Recordatorio y pausa configurables | confirmada |
| 020 | Candado de tareas entre réplicas | **por confirmar** |
| 021 | Borrar datos de una paciente | **por confirmar** |
| 022 | Tope de IA por clínica | **por confirmar** |
| 023 | Notas de la agenda | **por confirmar** |
| 024 | Varias clínicas por correo (`account_flags`, `admin_set_max_clinics`) | **a 28-oct no consta que se haya ejecutado**: confirmar con Jhordan (sin ella no funcionan las clínicas permitidas por correo) |
| 025 | Link de agenda interactivo | **a 28-oct no consta que se haya ejecutado**: confirmar (sin ella el link de agenda muestra el calendario sin botones) |

> Jhordan confirmó explícitamente 012–017 y 019. Lo demás se infiere.
>
> Antes de afirmar que algo "ya está" en producción, **pregunta a Jhordan** qué migraciones corrió, o verifica en Supabase (SQL Editor: `select proname from pg_proc where proname like 'agenda_%'`, etc.).

## B) Cohortech (`codigo/cohortech/supabase/migrations`)
| # | Contenido |
|---|---|
| 0001 | Esquema inicial multi-tenant: `clinics`, `patients`, `messages`, (cohortes y eventos de la primera versión) |
| 0002 | Auth: `handle_new_user` (crea la clínica al registrarse) y `custom_access_token_hook` (claim `clinic_id` en el JWT) |
| 0003–0004 | Cohortes **dinámicas** (`cohort_definitions`, `cohort_memberships` con `UNIQUE(patient_id, cohort_id)`, `increment_cohort_message_count`) |
| 0005 | Secuencias de seguimiento (`followup_stage`, `next_followup_at DEFAULT now()`, `churned_at`) y `followup_log` |
| 0006 | `subscriptions` (MercadoPago) |
| 0007–0008 | Puntuación (LTV/abandono) y actividad de la clínica |
| 0009 | Reactivación (`last_reactivation_sent_at`, `reactivation_attempts_count`, `reactivation_paused_until`) |
| 0010 | **Motor conversacional**: bloqueados/opt-out, pausa humana, plantillas, negociación, canal y origen de respuesta, **promociones** (el código detecta si falta con `getSchemaFlags`) |
| 0011 | `system_events` (registro de errores) |
| 0012 | Plan por clínica (`plan_status`, `plan_expires_at`) y `admin_clinic_stats` |
Tablas: `clinics`, `patients` (`extracted_profile` jsonb: aquí vive el análisis importado), `messages` (`nlp_result` jsonb), `cohort_definitions`, `cohort_memberships`, `followup_log`, `promotions`, `scheduled_events`, `subscriptions`, `system_events`, `audit_reports`. `scripts/verify-schema.mjs` comprueba qué migraciones faltan.

## C) Cómo verificar o leer producción sin romper nada
- Lectura puntual: un script Node con `@supabase/supabase-js` y la service-role **leída del `.env` sin imprimirla** (ver `docs/09`). Nunca `select *` de pacientes para pegarlo en un documento.
- Pruebas locales de SQL: PGlite (`@electric-sql/pglite`) con roles `anon`/`authenticated` de relleno; se usó para validar cada migración antes de pedirle a Jhordan que la ejecute.
