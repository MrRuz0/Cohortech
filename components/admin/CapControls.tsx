"use client";

import { useState } from "react";

type Init = { enabled: boolean; warmup: boolean; tier: string; custom: number | null };

export function CapControls({ clinicId, initial }: { clinicId: string; initial: Init }) {
  const [v, setV] = useState(initial);
  const [custom, setCustom] = useState(initial.custom?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>, next: Partial<Init>) {
    setBusy(true);
    const prev = v;
    setV({ ...v, ...next });
    try {
      const res = await fetch("/api/admin/cap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
    } catch (e) {
      setV(prev);
      alert((e as Error).message || "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const box = "flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Tope diario automático:</span>
      <label className={box}>
        <input
          type="checkbox"
          disabled={busy}
          checked={v.enabled}
          onChange={(e) => save({ enabled: e.target.checked }, { enabled: e.target.checked })}
        />
        Activo
      </label>
      <label className={box}>
        Plan
        <select
          disabled={busy || !v.enabled}
          value={v.tier}
          onChange={(e) => save({ tier: e.target.value }, { tier: e.target.value })}
        >
          <option value="starter">Starter (80/día)</option>
          <option value="pro">Pro (150/día)</option>
          <option value="scale">Scale (300/día)</option>
        </select>
      </label>
      <label className={box}>
        <input
          type="checkbox"
          disabled={busy || !v.enabled}
          checked={v.warmup}
          onChange={(e) => save({ warmup: e.target.checked }, { warmup: e.target.checked })}
        />
        Calentamiento
      </label>
      <label className={box}>
        Fijo
        <input
          className="w-16 rounded border px-1"
          inputMode="numeric"
          placeholder="plan"
          value={custom}
          disabled={busy || !v.enabled}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => {
            const n = custom.trim() === "" ? null : Number(custom);
            if (n !== v.custom) save({ custom: n }, { custom: n });
          }}
        />
      </label>
    </div>
  );
}
