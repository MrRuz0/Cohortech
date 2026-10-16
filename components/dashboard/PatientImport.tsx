"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Acepta CSV con columnas (en cualquier orden): nombre, telefono/celular, ultima visita/fecha.
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const iName = find("nombre", "name");
  const iPhone = find("telefono", "celular", "phone", "whatsapp", "numero");
  const iDate = find("visita", "fecha", "date", "ultima");
  if (iPhone < 0) return [];
  return lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    return { name: iName >= 0 ? c[iName] : "", phone: c[iPhone], lastVisit: iDate >= 0 ? c[iDate] : "" };
  });
}

export function PatientImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) {
      setMsg("No se encontró la columna de teléfono. Usa las columnas: nombre, telefono, ultima visita.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/patients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(json.error ?? "No se pudo importar");
      else {
        setMsg(`Listo: ${json.created} nuevos, ${json.updated} actualizados, ${json.invalid} descartados.`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
      <p className="font-medium">Importar pacientes (CSV)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Columnas: nombre, telefono, ultima visita (AAAA-MM-DD o DD/MM/AAAA). Con la fecha real, el sistema sabe a quién
        recuperar. Máx. 2000 filas.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        className="mt-3 text-xs"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {msg && <p className="mt-2 text-xs">{msg}</p>}
    </div>
  );
}
