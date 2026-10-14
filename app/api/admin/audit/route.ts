import { NextResponse } from "next/server";
import { buildAuditReport, saveAuditReport } from "@/lib/admin/audit";
import { isAdminUser } from "@/lib/conversation/admin";

export const maxDuration = 60;

/** "Generar auditoría ahora" desde el panel. */
export async function POST() {
  if (!(await isAdminUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const report = await buildAuditReport();
    await saveAuditReport(report);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
