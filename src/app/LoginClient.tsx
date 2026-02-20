"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { authStore } from "@/lib/auth";
import { toast } from "sonner";
import type { AxiosError } from "axios";

function isEmail(v: string) {
  const s = v.trim().toLowerCase();
  return s.includes("@") && s.includes(".");
}

function humanLoginError(e: unknown) {
  const err = e as AxiosError<{ error?: string; message?: string }>;
  const status = err.response?.status;

  const code = err.code;
  if (code === "ECONNABORTED") return "Tempo esgotado. Tente novamente.";
  if (!status) return "Sem conexão com o servidor. Verifique sua internet.";

  if (status === 401) return "E-mail ou senha incorretos.";
  if (status === 403) return "Acesso negado. Sua conta pode estar bloqueada.";
  if (status === 429) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (status >= 500) return "Servidor indisponível no momento. Tente novamente em instantes.";

  const backendMsg =
    err.response?.data?.error ||
    err.response?.data?.message ||
    err.message;

  return backendMsg || "Falha no login.";
}

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
    const nextParam = sp.get("next");

  function safeNext(target: string | null) {
    if (!target) return "/admin";
    if (!target.startsWith("/")) return "/admin";
    if (target.startsWith("//")) return "/admin";
    return target;
  }

  const next = safeNext(nextParam);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const eOk = isEmail(email);
    const pOk = password.trim().length >= 1;
    return eOk && pOk && !loading;
  }, [email, password, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const emailN = email.trim().toLowerCase();
    const passN = password;

    if (!emailN) {
      const msg = "Informe seu e-mail.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    if (!isEmail(emailN)) {
      const msg = "E-mail inválido.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    if (!passN) {
      const msg = "Informe sua senha.";
      setErr(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        endpoints.auth.login,
        { email: emailN, password: passN },
        { timeout: 15_000 }
      );

      const token = res.data?.accessToken ?? res.data?.token;
      const user = res.data?.user ?? res.data?.me ?? null;

      if (!token) throw new Error("Login OK mas não veio accessToken.");

      authStore.setAccessToken(token);
      authStore.setMe(user);

      toast.success("Bem-vindo!");
      router.replace(next);
    } catch (e2: unknown) {
      const msg = humanLoginError(e2);
      setErr(msg);
      toast.error(msg);

      const err = e2 as AxiosError;
      if (err.response?.status === 401) setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-3 border rounded-2xl p-5 bg-white shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Admin • Login</h1>
          <p className="text-sm text-zinc-500">Entre para acessar o painel.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">E-mail</label>
          <input
            className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            inputMode="email"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Senha</label>
          <input
            className="w-full border rounded-xl p-3 outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "w-full rounded-xl p-3 border transition",
            loading ? "opacity-80 cursor-wait" : "",
            canSubmit
              ? "bg-black text-white border-black hover:bg-black/90"
              : "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed",
          ].join(" ")}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
