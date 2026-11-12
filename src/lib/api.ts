// src/lib/api.ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { authStore } from "@/lib/auth";
import { endpoints } from "@/lib/endpoints";

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

if (!baseURL && process.env.NODE_ENV !== "production") {
  console.warn("[api] NEXT_PUBLIC_API_BASE_URL não está definido. Usando URL relativa.");
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30000,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRetry?: boolean;
};

const authApi = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 5000,
});

let refreshing: { version:number; promise:Promise<string> } | null = null;

function extractAccessToken(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as {
    accessToken?: string;
    token?: string;
    data?: {
      accessToken?: string;
      token?: string;
    };
  };

  return (
    payload.accessToken ??
    payload.token ??
    payload.data?.accessToken ??
    payload.data?.token ??
    null
  );
}

function readErrorText(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const obj = data as Record<string, unknown>;
  const parts = [
    obj.error,
    obj.message,
    obj.details,
    (obj.data as Record<string, unknown> | undefined)?.error,
    (obj.data as Record<string, unknown> | undefined)?.message,
    (obj.data as Record<string, unknown> | undefined)?.details,
  ];

  return parts
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function isAuthRefreshCandidate(err: AxiosError): boolean {
  const status = err.response?.status;
  if (status !== 401) return false;

  const reqUrl = err.config?.url ?? "";

  // nunca tentar refresh em rotas de auth
  if (
    reqUrl.includes(endpoints.auth.login) ||
    reqUrl.includes(endpoints.auth.refresh)
  ) {
    return false;
  }

  const text = readErrorText(err.response?.data);

  // só tenta refresh quando a mensagem realmente parecer auth da SUA API
  const authHints = [
    "não autenticado",
    "nao autenticado",
    "token inválido",
    "token invalido",
    "token inválido/expirado",
    "token invalido/expirado",
    "usuário não encontrado",
    "usuario não encontrado",
    "jwt",
    "unauthorized",
    "access token",
    "sem refresh token",
    "refresh inválido",
    "refresh invalido",
    "refresh expirado",
    "refresh reuse detectado",
  ];

  return authHints.some((hint) => text.includes(hint));
}

export function refreshAccessToken(): Promise<string> {
  const version = authStore.getSessionVersion();
  if (refreshing?.version === version) return refreshing.promise;

  const flight = {version, promise: (async () => {
    const res = await authApi.post(endpoints.auth.refresh, {});
    const token = extractAccessToken(res.data);
    if (!token) throw new Error("Refresh OK mas não retornou accessToken");
    if (authStore.getSessionVersion() !== version) throw new Error("Sessão alterada durante o refresh");
    authStore.setAccessToken(token);
    const user = res.data?.user ?? res.data?.data?.user;
    if (user) authStore.setMe(user);
    return token;
  })()};
  flight.promise = flight.promise.finally(() => {
    if (refreshing === flight) refreshing = null;
  });
  refreshing = flight;
  return flight.promise;
}

api.interceptors.request.use((config) => {
  const token = authStore.getAccessToken();
  const reqUrl = config.url ?? "";

  const isAuthRoute =
    reqUrl.includes(endpoints.auth.login) ||
    reqUrl.includes(endpoints.auth.refresh);

  if (token && !isAuthRoute) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (err: AxiosError) => {
    const original = err.config as RetryableRequestConfig | undefined;

    if (!original) {
      return Promise.reject(err);
    }

    if (original.skipAuthRetry || !isAuthRefreshCandidate(err)) {
      return Promise.reject(err);
    }

    if (original._retry) {
      return Promise.reject(err);
    }

    original._retry = true;
    const version = authStore.getSessionVersion();

    try {
      const newToken = await refreshAccessToken();
      if (authStore.getSessionVersion() !== version) throw new Error("Sessão alterada");

      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${newToken}`;

      return api(original);
    } catch (refreshErr) {
      if (authStore.getSessionVersion() !== version) return Promise.reject(refreshErr);
      authStore.clearAll();

      if (typeof window !== "undefined") {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(next || "/admin")}`;
      }

      return Promise.reject(refreshErr);
    }
  }
);

if (typeof window !== "undefined") {
  console.log("[api] baseURL =", api.defaults.baseURL);
}
