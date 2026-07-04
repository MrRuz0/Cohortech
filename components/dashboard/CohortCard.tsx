"use client";

import { useState } from "react";

const STRATEGY_LABELS: Record<string, string> = {
  urgency: "Urgencia",
  scarcity: "Escasez",
  social_proof: "Prueba Social",
  reciprocity: "Reciprocidad",
  authority: "Autoridad",
  loss_aversion: "Pérdida",
};

const STRATEGY_COLORS: Record<string, string> = {
  urgency: "bg-red-100 text-red-700",
  scarcity: "bg-orange-100 text-orange-700",
  social_proof: "bg-blue-100 text-blue-700",
  reciprocity: "bg-green-100 text-green-700",
  authority: "bg-purple-100 text-purple-700",
  loss_aversion: "bg-yellow-100 text-yellow-700",
};

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-right text-gray-500">{label}</span>
      <div className="flex-1 rounded-full bg-gray-100 h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-gray-500">{count}</span>
    </div>
  );
}

export type CohortInfo = {
  id: string;
  name: string;
  behavioral_description: string;
  pain_point: string;
  conversion_strategy: string;
  message_template: string;
  is_auto_generated: boolean;
  is_active: boolean | null;
  memberCount: number;
  convertedCount: number;
  churnedCount: number;
  messageCount: number;
};

export function CohortCard({ cohort }: { cohort: CohortInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [template, setTemplate] = useState(cohort.message_template);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const conversionRate =
    cohort.memberCount > 0
      ? Math.round((cohort.convertedCount / cohort.memberCount) * 100)
      : 0;

  async function broadcast() {
    if (!confirm(`¿Enviar mensaje a los ${cohort.memberCount} miembros de "${cohort.name}"?`))
      return;
    setBroadcasting(true);
    setBroadcastResult(null);
    const res = await fetch(`/api/cohorts/${cohort.id}/broadcast`, { method: "POST" });
    const data = await res.json();
    setBroadcastResult(
      res.ok ? `✓ Enviado a ${data.sent} pacientes` : `Error: ${data.error}`
    );
    setBroadcasting(false);
  }

  async function saveTemplate() {
    setSaving(true);
    await fetch(`/api/cohorts/${cohort.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_template: template }),
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <div
      className={`rounded-lg border p-4 transition-shadow hover:shadow-md ${
        !cohort.is_active ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{cohort.name}</h3>
            {cohort.is_auto_generated && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-600">
                IA
              </span>
            )}
          </div>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              STRATEGY_COLORS[cohort.conversion_strategy] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {STRATEGY_LABELS[cohort.conversion_strategy] ?? cohort.conversion_strategy}
          </span>
        </div>
        {!cohort.is_active && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Inactiva
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-xl font-bold">{cohort.memberCount}</p>
          <p className="text-xs text-gray-500">pacientes</p>
        </div>
        <div>
          <p className="text-xl font-bold">{cohort.messageCount}</p>
          <p className="text-xs text-gray-500">mensajes</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-600">{conversionRate}%</p>
          <p className="text-xs text-gray-500">conversión</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-500">{cohort.churnedCount}</p>
          <p className="text-xs text-gray-500">churn</p>
        </div>
      </div>

      {/* Funnel bar */}
      {cohort.memberCount > 0 && (
        <div className="mt-3 space-y-1">
          <FunnelBar
            label="Activos"
            count={cohort.memberCount - cohort.convertedCount - cohort.churnedCount}
            total={cohort.memberCount}
            color="bg-blue-400"
          />
          <FunnelBar
            label="Convertidos"
            count={cohort.convertedCount}
            total={cohort.memberCount}
            color="bg-emerald-500"
          />
          <FunnelBar
            label="Churn"
            count={cohort.churnedCount}
            total={cohort.memberCount}
            color="bg-red-400"
          />
        </div>
      )}

      {/* Broadcast button */}
      {cohort.memberCount > 0 && (
        <div className="mt-3">
          <button
            onClick={broadcast}
            disabled={broadcasting}
            className="w-full rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {broadcasting
              ? "Enviando…"
              : `Enviar mensaje a ${cohort.memberCount} pacientes`}
          </button>
          {broadcastResult && (
            <p className="mt-1 text-center text-xs text-gray-500">{broadcastResult}</p>
          )}
        </div>
      )}

      {/* Expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 w-full text-left text-xs text-gray-400 hover:text-gray-600"
      >
        {expanded ? "▲ Ocultar detalle" : "▼ Ver detalle"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700">Comportamiento</p>
            <p className="text-gray-500 text-xs">{cohort.behavioral_description}</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">Punto de dolor</p>
            <p className="text-gray-500 text-xs">{cohort.pain_point}</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-700">Plantilla de mensaje</p>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-indigo-500 hover:underline"
                >
                  Editar
                </button>
              )}
            </div>
            {editing ? (
              <div className="mt-1 space-y-2">
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={4}
                  className="w-full rounded border p-2 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    onClick={() => {
                      setTemplate(cohort.message_template);
                      setEditing(false);
                    }}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 rounded bg-gray-50 p-2 text-xs text-gray-600 italic">
                {template}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
