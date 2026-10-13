"use client";

import { useEffect, useState } from "react";

type Settings = {
  clinicId: string;
  botPaused: boolean;
  webchatEnabled: boolean;
  paymentMethods: string;
  reactivationAfterDays: number;
  metaPageId: string;
  metaTokenSet: boolean;
};

const inputCls =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

async function save(payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/settings/assistant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return null;
  const json = await res.json().catch(() => ({}));
  return json.error ?? "No se pudo guardar";
}

export function AssistantSettings({ appUrl }: { appUrl: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/settings/assistant")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setMsg({ kind: "err", text: "No se pudo cargar la configuración" }));
  }, []);

  if (!s) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  async function apply(payload: Record<string, unknown>, patch: Partial<Settings>) {
    const err = await save(payload);
    if (err) setMsg({ kind: "err", text: err });
    else {
      setS((cur) => (cur ? { ...cur, ...patch } : cur));
      setMsg({ kind: "ok", text: "Guardado" });
      setTimeout(() => setMsg(null), 2000);
    }
  }

  const snippet = `<script src="${appUrl}/cohortech-widget.js" data-clinic="${s.clinicId}" async></script>`;

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.kind === "ok" ? "bg-exito/10 text-exito" : "bg-error/10 text-error"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Interruptor general */}
      <section
        className={`rounded-xl border p-5 shadow-sm ${
          s.botPaused ? "border-advertencia/40 bg-advertencia/10" : "bg-white"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              Asistente {s.botPaused ? "en pausa" : "activo"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {s.botPaused
                ? "No responde ni envía seguimientos. Tu equipo atiende todo manualmente."
                : "Responde mensajes, negocia y hace seguimiento automáticamente."}
            </p>
          </div>
          <button
            onClick={() => apply({ botPaused: !s.botPaused }, { botPaused: !s.botPaused })}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
              s.botPaused ? "bg-primary text-primary-foreground" : "border border-error/40 text-error hover:bg-error/10"
            }`}
          >
            {s.botPaused ? "Reactivar" : "Pausar todo"}
          </button>
        </div>
      </section>

      {/* Reactivación */}
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Reactivación de pacientes</h2>
        <p className="text-sm text-muted-foreground">
          Se escribe a quien lleva este tiempo sin contacto (máximo 2 intentos, y solo de 9:00 a 20:00).
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Días sin contacto</label>
            <input
              type="number"
              min={30}
              max={720}
              className={`${inputCls} w-32`}
              value={s.reactivationAfterDays}
              onChange={(e) => setS({ ...s, reactivationAfterDays: Number(e.target.value) })}
            />
          </div>
          <button
            onClick={() => apply({ reactivationAfterDays: s.reactivationAfterDays }, {})}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Pagos */}
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Formas de pago</h2>
        <p className="text-sm text-muted-foreground">
          Si lo completas, el asistente puede responderlo. Si no, avisa a recepción en vez de inventar.
        </p>
        <input
          className={inputCls}
          maxLength={300}
          placeholder="Ej. Efectivo, Yape, Plin y tarjetas"
          value={s.paymentMethods}
          onChange={(e) => setS({ ...s, paymentMethods: e.target.value })}
        />
        <button
          onClick={() => apply({ paymentMethods: s.paymentMethods }, {})}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Guardar
        </button>
      </section>

      {/* Chat web */}
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Chat en tu página web</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.webchatEnabled}
              onChange={(e) => apply({ webchatEnabled: e.target.checked }, { webchatEnabled: e.target.checked })}
            />
            Habilitado
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Pega este código antes de &lt;/body&gt; en tu sitio. Los mensajes llegan al mismo asistente y al mismo panel.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{snippet}</pre>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {copied ? "¡Copiado!" : "Copiar código"}
        </button>
      </section>

      {/* Instagram / Messenger */}
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Instagram y Messenger</h2>
        <p className="text-sm text-muted-foreground">
          Requiere una app de Meta con permisos de mensajería. Webhook:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{appUrl}/api/channels/meta</code>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ID de la página / cuenta</label>
            <input
              className={inputCls}
              value={s.metaPageId}
              onChange={(e) => setS({ ...s, metaPageId: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Token de acceso {s.metaTokenSet && <span className="text-exito">(configurado)</span>}
            </label>
            <input
              type="password"
              className={inputCls}
              placeholder={s.metaTokenSet ? "••••••••  (déjalo vacío para conservarlo)" : "Pega el token"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => {
            apply(
              { metaPageId: s.metaPageId, ...(token ? { metaPageToken: token } : {}) },
              { metaTokenSet: s.metaTokenSet || !!token }
            );
            setToken("");
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Guardar
        </button>
      </section>
    </div>
  );
}
