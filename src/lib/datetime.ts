export function toInputDateTimeLocal(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
    )}:${pad(d.getMinutes())}`;
}

export function fromInputDateTimeLocal(v: string) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}
