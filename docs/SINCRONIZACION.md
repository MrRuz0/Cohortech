# 06 · Sincronización Recepción IA ↔ Cohortech

**Objetivo del dueño:** que quien usa los dos productos con el **mismo correo** no cargue todo dos veces. Decisiones: solo Recepción IA contesta; **Recepción IA es la fuente de verdad**; se empezó por la Fase 1.

## Protocolo (firmado, sin sesiones)
- Recepción IA (panel, servidor) llama a `POST {COHORTECH_URL}/api/sync/recepcion` con cuerpo JSON `{action, snapshot, …}`.
- Cabeceras: `x-sync-timestamp` (ms) y `x-sync-signature` = **HMAC-SHA256 hex** de `"<timestamp>.<cuerpo crudo>"` con el secreto compartido. Cohortech rechaza (401) si la firma no coincide o la hora difiere más de **5 min** (evita repeticiones). Cuerpo máx. 400 KB.
- Secreto compartido (el **mismo valor** en los dos): `COHORTECH_SYNC_SECRET` (panel de Recepción IA, Railway) = `RECEPCION_SYNC_SECRET` (Cohortech, Vercel). Si falta en Cohortech responde 503 `sync_disabled`; si falta en el panel, la tarjeta de Ajustes no aparece.
- Código: `panel/src/lib/sync-sign.ts`, `panel/src/lib/cohortech-sync.ts` (cliente) ↔ `cohortech/lib/sync/recepcion.ts`, `recepcion-import.ts`, `recepcion-import-db.ts` y `app/api/sync/recepcion/route.ts` (servidor).

## Cómo se encuentra la clínica
Cohortech busca la cuenta por **correo** (`auth.admin.listUsers`) y elige la clínica: la ya vinculada (`settings.recepcion.clinic_id`), o la de **nombre idéntico** (sin tildes/mayúsculas), o la única del correo. Si hay varias y ninguna coincide → `ambiguous` (hay que igualar el nombre).

## Acciones
| `action` | Qué hace |
|---|---|
| `status` | ¿Vinculada? clínica candidata, cuántas clínicas, última sincronización. |
| `link` | Guarda `settings.recepcion = {clinic_id, linked_at}` y sincroniza. |
| `sync` | Copia a Cohortech: bloque **gestionado** `[[RECEPCION-IA]]…[[/RECEPCION-IA]]` dentro de `clinic_description` (dirección, horario, tratamientos con precio y duración; **no pisa lo escrito a mano**), `receptionist_phone`, `max_discount_percent`, **Herramientas** (`settings.services` con precio `S/. 350`, `address`, `hours`), `settings.recepcion.wa_connected`, y **promociones** etiquetadas `[recepcion:<id>]` (descuento % = lista vs promo; fechas en UTC-5; las que ya no existen se **desactivan**, no se borran). Requiere estar vinculada. |
| `patients` | Importa un **lote** (≤ 25; el panel manda 12) de pacientes con sus últimos 30 mensajes y sus citas (+ la lista de **bloqueados** en el primer lote). |
| `finalize` | Crea las cohortes y asigna a cada paciente. |

## Importación de pacientes → cohortes (lo que decide el "porqué")
1. Por **citas** (sin IA): cita próxima → `agendado`; ya se atendió → `atendido`; última cita no asistió → `no_asistio`; sin mensajes de ella → `otro`.
2. A quien **preguntó y no agendó**, la IA (gpt-4o-mini, 1 llamada por paciente, 5 a la vez) lee su conversación y dice **por qué**: `precio`, `horario`, `adelanto`, `indeciso`, `sin_respuesta`, `solo_info`, `otro` (+ una frase concreta, tratamiento y señales). Se guarda en `patients.extracted_profile.recepcion`; si la conversación no cambió, no se vuelve a analizar.
3. `finalize` crea una cohorte por motivo (plantillas fijas escritas a mano en `COHORT_DEFS`, con estrategia y mensaje de ≤160 caracteres) y asigna. **`atendido`** queda como **convertida**; las demás quedan **activas con `next_followup_at = NULL`** (¡importante: la columna tiene `DEFAULT now()`, si se omitiera saldrían mensajes sin aprobar).
4. **Aprobación**: `/dashboard/cohorts` muestra "Pacientes importados… pendientes de tu aprobación" (`settings.recepcion.import.pending`). **Aprobar seguimiento** (`/api/cohorts/[id]/approve`) pone `next_followup_at = now` a los miembros no bloqueados; recién ahí salen los mensajes (con horario y tope de siempre).
5. **Bloqueados** de Recepción IA se marcan `is_blocked` en Cohortech (nadie les escribe). Los pacientes importados llevan la **reactivación automática pausada**.
6. Idempotente: mensajes con `wa_message_id = rec:<id>`; se puede repetir sin duplicar ni volver a gastar IA.

## Lo que ve la dueña
Recepción IA → Ajustes → tarjeta **"Sincronizar con Cohortech"** (Vincular y sincronizar / Sincronizar ahora; la sincronización **no es automática**, hay que pulsar) y tarjeta **"Enviar pacientes a Cohortech"** (barra de avance, lista de grupos creados). Cohortech → Cohortes: aprobar.

## Fases
- **Fase 1** ✔ datos de la clínica. **Importación de pacientes/conversaciones** ✔. **Modo escucha** de Cohortech ✔.
- **Fase 2** ✘ un solo QR que conecte el WhatsApp a los dos (hoy se escanea uno en cada sistema; WhatsApp permite varios dispositivos vinculados).
- **Fase 3 (resto)** ✘ sincronizar bloqueos/bajas **en vivo** (hoy solo al enviar pacientes), pacientes nuevos y conversaciones continuas, y actualizar el aviso de privacidad por mover datos entre productos.

## Riesgos conocidos
- Una campaña de Cohortech podría escribir a una paciente que Recepción IA está atendiendo justo ahora, o que se dio de baja después del último envío (solo se comparten bloqueados al importar).
- El estado de WhatsApp se copia solo al sincronizar.
