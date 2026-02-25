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
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const authApi = axios.create({
    baseURL,
    withCredentials: true,
});

let refreshing: Promise<string> | null = null;

function extractAccessToken(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const payload = data as {
        accessToken?: string;
        token?: string;
        data?: { accessToken?: string; token?: string };
    };

    return payload.accessToken ?? payload.token ?? payload.data?.accessToken ?? payload.data?.token ?? null;
}

async function refreshAccessToken(): Promise<string> {
    if (!refreshing) {
        refreshing = (async () => {
            const res = await authApi.post(endpoints.auth.refresh, {});
            const token = extractAccessToken(res.data);

            if (!token) throw new Error("Refresh OK mas não retornou accessToken");

            authStore.setAccessToken(token);
            return token;
        })().finally(() => {
            refreshing = null;
        });
    }

    return refreshing;
}

api.interceptors.request.use((config) => {
    const token = authStore.getAccessToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    async (err: AxiosError) => {
        const status = err.response?.status;
        const original = err.config as RetryableRequestConfig | undefined;

        if (status !== 401 || !original) return Promise.reject(err);

        const reqUrl = original.url ?? "";
        if (reqUrl.includes(endpoints.auth.refresh)) return Promise.reject(err);

        if (original._retry) return Promise.reject(err);
        original._retry = true;

        try {
            const newToken = await refreshAccessToken();
            original.headers = original.headers ?? {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
        } catch (e) {
            authStore.clearAll();
            if (typeof window !== "undefined") {
                const next = window.location.pathname + window.location.search;
                window.location.href = `/login?next=${encodeURIComponent(next || "/admin")}`;
            }
            return Promise.reject(e);
        }
    }
);
if (typeof window !== "undefined") {
    console.log("[api] baseURL =", api.defaults.baseURL);
}
