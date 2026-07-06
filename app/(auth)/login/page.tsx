"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  }

  // ── Reset sent ───────────────────────────────────────────
  if (resetSent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-3xl">📬</p>
        <h1 className="text-xl font-bold tracking-tight">Revisa tu correo</h1>
        <p className="text-sm text-muted-foreground">
          Enviamos un enlace de recuperación a <strong>{email}</strong>. Úsalo
          para crear una nueva contraseña.
        </p>
        <button
          onClick={() => { setMode("login"); setResetSent(false); }}
          className="text-sm text-primary hover:underline"
        >
          Volver al inicio de sesión
        </button>
      </div>
    );
  }

  // ── Reset form ───────────────────────────────────────────
  if (mode === "reset") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Recuperar contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace a tu correo para crear una nueva.
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] transition-opacity hover:opacity-90"
            disabled={loading}
          >
            {loading ? "Enviando..." : "Enviar enlace de recuperación"}
          </Button>
        </form>

        <button
          onClick={() => setMode("login")}
          className="w-full text-center text-sm text-muted-foreground hover:underline"
        >
          ← Volver al inicio de sesión
        </button>
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Bienvenida de nuevo</h1>
        <p className="text-sm text-muted-foreground">Inicia sesión en tu clínica</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="text-xs text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] transition-opacity hover:opacity-90"
          disabled={loading}
        >
          {loading ? "Ingresando..." : "Iniciar sesión"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Regístrate gratis
        </Link>
      </p>
    </div>
  );
}
