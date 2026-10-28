@AGENTS.md

# Cohortech — guía para Claude

Producto de **recuperación de pacientes por cohortes** para clínicas estéticas (Perú): etiqueta cada mensaje con IA, descubre cohortes, y hace seguimientos, reactivaciones y campañas con límites. Next.js 16 + Supabase + OpenAI + Evolution API, desplegado en Vercel (`cohortech.vercel.app`). Dueño: Jhordan (no técnico, español).

Lee primero: `docs/COHORTECH.md` (qué hace y cómo), `docs/SINCRONIZACION.md` (conexión con Recepción IA, que es quien contesta a las pacientes) y `docs/BASE_DE_DATOS.md`. La documentación completa de los dos productos está en el repo `recepcion-ia`, carpeta `docs/traspaso/`.

Reglas: nunca imprimir ni pegar claves ni leer `.env*`; un número bloqueado no recibe nada automático; proponer y esperar confirmación antes de tocar producción; cada error corregido debe dejar una prueba o un script de verificación. Verifica los tipos con `npx tsc --noEmit` antes de cada commit. Cuando una clínica está vinculada con Recepción IA, Cohortech NO contesta a quien escribe (solo analiza y hace campañas).
