// src/lib/apiError.ts
export function apiErrorMessage(err: any, fallback = "Ocorreu um erro") {
    const data = err?.response?.data;

    if (typeof data === "string") return data;
    if (data?.error) return String(data.error);
    if (data?.message) return String(data.message);

    if (Array.isArray(data?.issues)) {
        const first = data.issues[0];
        if (first?.message) return String(first.message);
        if (first?.msg) return String(first.msg);
    }

    return err?.message ? String(err.message) : fallback;
}
