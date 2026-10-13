"use client";

import { useCallback, useEffect, useState } from "react";

type Promotion = {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number | null;
  service_name: string | null;
  ends_at: string | null;
  is_active: boolean;
};

const inputCls =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function isExpired(p: Promotion): boolean {
  return !!p.ends_at && new Date(p.ends_at).getTime() < Date.now();
}

export function PromotionsManager({ serviceNames, ready }: { serviceNames: string[]; ready: boolean }) {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", discount: "", service: "", endsAt: "" });

  const load = useCallback(async () => {
    if (!ready) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/promotions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar");
      setItems(json.promotions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          discount_percent: form.discount ? Number(form.discount) : null,
          service_name: form.service || null,
          ends_at: form.endsAt || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo crear");
      setForm({ name: "", description: "", discount: "", service: "", endsAt: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: Promotion) {
    await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    load();
  }

  async function remove(p: Promotion) {
    if (!confirm(`¿Eliminar la promoción "${p.name}"?`)) return;
    await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    load();
  }

  if (!ready) {
    return (
      <div className="rounded-xl border border-advertencia/30 bg-advertencia/10 p-4 text-sm text-advertencia">
        Falta aplicar la migración <strong>0010</strong> en Supabase para activar las promociones.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Nueva promoción</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
            <input
              required
              maxLength={80}
              className={inputCls}
              placeholder="Ej. Mes de la belleza"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Detalle (opcional)</label>
            <input
              maxLength={240}
              className={inputCls}
              placeholder="Ej. Válido para nuevas pacientes"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Descuento % (opcional)</label>
            <input
              type="number"
              min={1}
              max={90}
              className={inputCls}
              placeholder="15"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Válida hasta (opcional)</label>
            <input
              type="date"
              className={inputCls}
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Aplica a</label>
            <select
              className={inputCls}
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
            >
              <option value="">Todos los tratamientos</option>
              {serviceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Crear promoción"}
        </button>
        <p className="text-xs text-muted-foreground">
          El asistente solo menciona promociones que estén aquí y vigentes. Nunca inventa ofertas.
        </p>
      </form>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Tus promociones</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
            Aún no tienes promociones. Crea la primera arriba.
          </div>
        ) : (
          items.map((p) => {
            const expired = isExpired(p);
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {p.discount_percent ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">
                        {p.discount_percent}%
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        expired
                          ? "bg-muted text-muted-foreground"
                          : p.is_active
                            ? "bg-exito/10 text-exito"
                            : "bg-advertencia/10 text-advertencia"
                      }`}
                    >
                      {expired ? "Vencida" : p.is_active ? "Activa" : "Pausada"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.service_name ?? "Todos los tratamientos"}
                    {p.ends_at ? ` · hasta ${new Date(p.ends_at).toLocaleDateString("es-PE")}` : " · sin fecha de término"}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!expired && (
                    <button
                      onClick={() => toggle(p)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {p.is_active ? "Pausar" : "Activar"}
                    </button>
                  )}
                  <button
                    onClick={() => remove(p)}
                    className="rounded-lg border border-error/30 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
