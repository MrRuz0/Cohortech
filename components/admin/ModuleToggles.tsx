"use client";

import { useState } from "react";

export function ModuleToggles({
  clinicId,
  initial,
}: {
  clinicId: string;
  initial: { reception: boolean; recovery: boolean };
}) {
  const [mods, setMods] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function set(key: "reception" | "recovery", value: boolean) {
    setBusy(true);
    const prev = mods;
    setMods({ ...mods, [key]: value });
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, [key]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMods(prev);
      alert("No se pudo guardar el cambio");
    } finally {
      setBusy(false);
    }
  }

  const Item = ({ k, label }: { k: "reception" | "recovery"; label: string }) => (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium">
      <input type="checkbox" disabled={busy} checked={mods[k]} onChange={(e) => set(k, e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Módulos contratados:</span>
      <Item k="reception" label="Recepción (contesta y agenda)" />
      <Item k="recovery" label="Cohortech (recupera pacientes)" />
    </div>
  );
}
