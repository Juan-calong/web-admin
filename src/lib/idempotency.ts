export function stableKey(...parts: any[]) {
    const raw = parts
        .flat()
        .map((p) => String(p ?? ""))
        .join(":")
        .trim();

    return raw.replace(/\s+/g, "_").slice(0, 160);
}

export function idemHeader(...parts: any[]) {
    return { "Idempotency-Key": stableKey(...parts) };
}
