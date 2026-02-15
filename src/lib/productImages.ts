export type ProductImage = {
    id: string;
    url: string;
    key?: string;
    isPrimary?: boolean | null;
    sort?: number | null;
    mime?: string | null;
    size?: number | null;
};

export function pickPrimaryImage(images?: ProductImage[] | null) {
    if (!images?.length) return null;

    const sorted = [...images].sort((a, b) => {
        const ap = a.isPrimary ? 1 : 0;
        const bp = b.isPrimary ? 1 : 0;
        if (bp !== ap) return bp - ap;
        return (a.sort ?? 0) - (b.sort ?? 0);
    });

    return sorted[0]?.url ?? null;
}
