"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authStore } from "@/lib/auth";
import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

function extractToken(res: any): string | null {
    return (
        res?.data?.accessToken ??
        res?.data?.token ??
        res?.data?.data?.accessToken ??
        res?.data?.data?.token ??
        null
    );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [ok, setOk] = useState(false);

    useEffect(() => {
        let alive = true;

        async function run() {
            setOk(false);

            const next = `/login?next=${encodeURIComponent(pathname || "/admin")}`;

            // 1) se já tem token, valida role e segue
            const token = authStore.getAccessToken();
            if (token) {
                const me = authStore.getMe();
                if (me?.role && me.role !== "ADMIN") {
                    authStore.clearAll();
                    router.replace("/login");
                    return;
                }
                if (alive) setOk(true);
                return;
            }

            // 2) sem token: tenta refresh (cookie rt)
            try {
                const res = await api.post(endpoints.auth.refresh, {});
                const newToken = extractToken(res);
                if (!newToken) throw new Error("Refresh não retornou accessToken");

                authStore.setAccessToken(newToken);

                // opcional: se seu refresh também devolve user, salva:
                const user = res?.data?.user ?? res?.data?.data?.user ?? null;
                if (user) authStore.setMe(user);

                const me = authStore.getMe();
                if (me?.role && me.role !== "ADMIN") {
                    authStore.clearAll();
                    router.replace("/login");
                    return;
                }

                if (alive) setOk(true);
            } catch {
                authStore.clearAll();
                router.replace(next);
            }
        }

        run();

        return () => {
            alive = false;
        };
    }, [router, pathname]);

    if (!ok) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <div className="text-sm text-black/60">Verificando sessão…</div>
            </div>
        );
    }

    return <>{children}</>;
}
