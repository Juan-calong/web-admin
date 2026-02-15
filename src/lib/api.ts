// src/lib/api.ts
import axios from "axios";
import { authStore } from "@/lib/auth";
import { endpoints } from "@/lib/endpoints";

export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
    withCredentials: true,
});

let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
    if (!refreshing) {
        refreshing = (async () => {
            const res = await api.post(endpoints.auth.refresh, {});
            const token =
                res.data?.accessToken ??
                res.data?.token ??
                res.data?.data?.accessToken ??
                res.data?.data?.token;

            if (!token) throw new Error("Refresh OK mas não retornou accessToken");

            authStore.setAccessToken(token);
            return token as string;
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
    async (err) => {
        const status = err?.response?.status;
        const original = err?.config;

        // se não for 401 ou não tem request original, só rejeita
        if (status !== 401 || !original) return Promise.reject(err);

        // evita loop infinito
        if ((original as any)._retry) return Promise.reject(err);
        (original as any)._retry = true;

        try {
            const newToken = await refreshAccessToken();
            original.headers = original.headers ?? {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
        } catch (e) {
            // refresh falhou -> limpa e manda pro login
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
