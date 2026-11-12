// src/lib/auth.ts
export type MeUser = {
    id: string;
    email: string;
    role: "ADMIN" | "SELLER" | "SALON_OWNER" | "PENDING" | string;
    scopes?: string[];
    onboardingStatus?: string;
};

const ACCESS_TOKEN_KEY = "accessToken";
const ME_KEY = "me";
let accessToken: string | null = null;

export const authStore = {
    getAccessToken(): string | null {
        if (typeof window === "undefined") return null;
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        return accessToken;
    },

    setAccessToken(token: string) {
        if (typeof window === "undefined") return;
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        accessToken = token;
    },

    clearAccessToken() {
        accessToken = null;
        if (typeof window === "undefined") return;
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    },

    getMe(): MeUser | null {
        if (typeof window === "undefined") return null;
        const raw = localStorage.getItem(ME_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as MeUser;
        } catch {
            return null;
        }
    },

    setMe(me: MeUser | null) {
        if (typeof window === "undefined") return;
        if (!me) localStorage.removeItem(ME_KEY);
        else localStorage.setItem(ME_KEY, JSON.stringify(me));
    },

    clearAll() {
        accessToken = null;
        if (typeof window === "undefined") return;
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(ME_KEY);
    },
};

export function hasScope(me: MeUser | null, scope: string) {
    return !!me?.scopes?.includes(scope);
}
