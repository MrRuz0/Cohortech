import { NextRequest, NextResponse } from "next/server";
import { buildAuditReport, saveAuditReport } from "@/lib/admin/audit";
import { logError } from "@/lib/conversation/log";

export const maxDuration = 60;

/** Auditoría diaria: revisa las últimas 24 h y guarda el reporte para /admin/audit. */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await buildAuditReport();
    await saveAuditReport(report);
    return NextResponse.json({ ok: true, day: report.day, verdict: report.verdict, headline: report.headline, totals: report.totals });
  } catch (err) {
    await logError("daily-audit", "No se pudo generar la auditoría diaria", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
