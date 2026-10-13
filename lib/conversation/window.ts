/** Hora local (0-23) en una zona horaria IANA. */
export function localHour(timezone: string, now: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(now);
    const n = Number(h) % 24;
    return Number.isFinite(n) ? n : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

/**
 * Los mensajes proactivos (reactivación, seguimientos) solo salen de día.
 * Antes los crons corrían a las 4 a. m. hora de Lima.
 */
export function inSendingWindow(timezone: string, now: Date = new Date(), start = 9, end = 20): boolean {
  const h = localHour(timezone, now);
  return h >= start && h < end;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pausa aleatoria entre envíos masivos para no parecer una ráfaga automática. */
export const jitter = (minMs = 900, maxMs = 2200) =>
  sleep(minMs + Math.floor(Math.random() * (maxMs - minMs)));
