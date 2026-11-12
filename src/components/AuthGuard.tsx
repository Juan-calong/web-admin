"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authStore } from "@/lib/auth";
import { refreshAccessToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [ok, setOk] = useState(false);

    useEffect(() => {
        let alive = true;

        async function run() {
            setOk(false);

            const next = `/login?next=${encodeURIComponent(pathname || "/admin")}`;

            const version = authStore.getSessionVersion();

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
                await refreshAccessToken();
                if (!alive || authStore.getSessionVersion() !== version) return;

                const me = authStore.getMe();
                if (me?.role && me.role !== "ADMIN") {
                    authStore.clearAll();
                    router.replace("/login");
                    return;
                }

                if (alive) setOk(true);
            } catch {
                if (!alive || authStore.getSessionVersion() !== version) return;
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
