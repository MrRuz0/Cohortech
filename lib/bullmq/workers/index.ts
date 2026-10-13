// OBSOLETO. Desde el motor conversacional (migración 0010) los mensajes se
// procesan directamente en el webhook de Vercel (lib/conversation/handle.ts):
// ya no hace falta cola, worker de Railway ni Upstash Redis.
//
// Este archivo se deja solo para que un deploy antiguo no consuma Redis ni
// responda mensajes con la lógica anterior (que no respetaba bloqueados,
// pausas ni validaciones). Puedes apagar el servicio del worker en Railway.

console.log(
  "[worker] Obsoleto: el procesamiento de mensajes ahora corre en Vercel. Este servicio puede apagarse."
);
process.exit(0);
