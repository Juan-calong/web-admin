// src/lib/apiError.ts
type ApiErrorShape = {
    message?: unknown;
    response?: {
        data?: {
            error?: unknown;
            message?: unknown;
            issues?: Array<{ message?: unknown; msg?: unknown }>;
        } | string;
    };
};

export function apiErrorMessage(err: unknown, fallback = "Ocorreu um erro") {
    const parsed = (err ?? {}) as ApiErrorShape;
    const data = parsed.response?.data;

    if (typeof data === "string") return data;
    if (data?.error) return String(data.error);
    if (data?.message) return String(data.message);

    if (Array.isArray(data?.issues)) {
        const first = data.issues[0];
        if (first?.message) return String(first.message);
        if (first?.msg) return String(first.msg);
    }

    return parsed.message ? String(parsed.message) : fallback;
}
