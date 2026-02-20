export function stableKey(...parts: Array<string | number | boolean | null | undefined | Array<string | number | boolean | null | undefined>>) {
    const raw = parts
        .flat()
        .map((p) => String(p ?? ""))
        .join(":")
        .trim();

    return raw.replace(/\s+/g, "_").slice(0, 160);
}

export function idemHeader(...parts: Array<string | number | boolean | null | undefined | Array<string | number | boolean | null | undefined>>) {
    return { "Idempotency-Key": stableKey(...parts) };
}
