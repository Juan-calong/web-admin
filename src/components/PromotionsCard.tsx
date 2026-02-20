"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/apiError";
import { fromInputDateTimeLocal, toInputDateTimeLocal } from "@/lib/datetime";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export type Promo = {
    id: string;
    productId: string;
    appliesTo: "BOTH" | "PRODUCT" | "SHIPPING" | string;
    type: "PCT" | "FIXED" | "PRICE" | string;
    value: string | number;
    active: boolean;
    startsAt: string;
    endsAt?: string | null;
    priority: number;
    isActiveNow?: boolean;
};

export type PromoStatus = "ALL" | "ACTIVE_NOW" | "SCHEDULED" | "EXPIRED" | "INACTIVE";

export type PromoCreatePayload = {
    appliesTo?: "BOTH" | "PRODUCT" | "SHIPPING";
    type: "PCT" | "FIXED" | "PRICE";
    value: number;
    active?: boolean;
    startsAt: string;
    endsAt?: string | null;
    priority?: number;
};

export type PromoPatchPayload = Partial<PromoCreatePayload> & { endsAt?: string | null };

export default function PromotionsCard({
    productPrice,
    promos,
    loading,
    error,
    status,
    setStatus,
    creating,
    busy,
    onCreate,
    onPatch,
    onDisable,
}: {
    productPrice: number;
    promos: Promo[];
    loading: boolean;
    error: unknown;
    status: PromoStatus;
    setStatus: (v: PromoStatus) => void;
    creating: boolean;
    busy: boolean;
    onCreate: (payload: PromoCreatePayload) => void;
    onPatch: (promoId: string, patch: PromoPatchPayload) => void;
    onDisable: (promoId: string) => void;
}) {
    // create form
    const [appliesTo, setAppliesTo] = useState<"BOTH" | "PRODUCT" | "SHIPPING">("BOTH");
    const [type, setType] = useState<"PCT" | "FIXED" | "PRICE">("PCT");
    const [value, setValue] = useState<string>("10");
    const [active, setActive] = useState(true);

    const [startsAt, setStartsAt] = useState<string>(() => {
        const d = new Date();
        d.setSeconds(0, 0);
        return toInputDateTimeLocal(d.toISOString());
    });

    const [endsAt, setEndsAt] = useState<string>("");
    const [priority, setPriority] = useState<string>("0");

    const list = promos ?? [];

    const preview = useMemo(() => {
        const v = Number(String(value).replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) return null;

        if (type === "PCT") return Math.max(0, productPrice * (1 - v / 100));
        if (type === "FIXED") return Math.max(0, productPrice - v);
        if (type === "PRICE") return Math.max(0, v);
        return null;
    }, [value, type, productPrice]);

    function create() {
        const v = Number(String(value).replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) {
            toast.error("Value inválido.");
            return;
        }
        if (type === "PCT" && v > 100) {
            toast.error("Para PCT, value deve ser <= 100.");
            return;
        }

        const startsIso = fromInputDateTimeLocal(startsAt);
        if (!startsIso) {
            toast.error("startsAt inválido.");
            return;
        }

        const endsIso = endsAt ? fromInputDateTimeLocal(endsAt) : null;
        if (endsAt && !endsIso) {
            toast.error("endsAt inválido.");
            return;
        }
        if (endsIso && new Date(endsIso) <= new Date(startsIso)) {
            toast.error("endsAt deve ser maior que startsAt.");
            return;
        }

        onCreate({
            appliesTo,
            type,
            value: v,
            active,
            startsAt: startsIso,
            endsAt: endsAt ? endsIso : undefined,
            priority: Number(priority || 0),
        });
    }

    return (
        <Card className="rounded-2xl">
            <CardHeader>
                <CardTitle>Promoções</CardTitle>
                <CardDescription>Descontos e preços promocionais deste produto</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="grid gap-2">
                        <Label>Status</Label>
                        <select
                            className="h-10 rounded-xl border bg-white px-3 text-sm"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as PromoStatus)}
                        >
                            <option value="ALL">Todas</option>
                            <option value="ACTIVE_NOW">Ativas agora</option>
                            <option value="SCHEDULED">Agendadas</option>
                            <option value="EXPIRED">Expiradas</option>
                            <option value="INACTIVE">Inativas</option>
                        </select>
                    </div>

                    <Badge variant="secondary" className="rounded-full">
                        {loading ? "Carregando…" : `${list.length} item(ns)`}
                    </Badge>
                </div>

                <Separator />

                <div className="rounded-2xl border bg-white p-4 space-y-3">
                    <div className="font-semibold">Criar promoção</div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Aplica em</Label>
                            <select
                                className="h-10 rounded-xl border bg-white px-3 text-sm"
                                value={appliesTo}
                                onChange={(e) => setAppliesTo(e.target.value as "BOTH" | "PRODUCT" | "SHIPPING")}
                            >
                                <option value="BOTH">BOTH</option>
                                <option value="PRODUCT">PRODUCT</option>
                                <option value="SHIPPING">SHIPPING</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Tipo</Label>
                            <select
                                className="h-10 rounded-xl border bg-white px-3 text-sm"
                                value={type}
                                onChange={(e) => setType(e.target.value as "PCT" | "FIXED" | "PRICE")}
                            >
                                <option value="PCT">PCT (%)</option>
                                <option value="FIXED">FIXED (R$ off)</option>
                                <option value="PRICE">PRICE (preço final)</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Value</Label>
                            <Input className="rounded-xl" value={value} onChange={(e) => setValue(e.target.value)} placeholder="10" />
                            <div className="text-[11px] text-black/50">
                                {type === "PCT" ? "1–100" : type === "FIXED" ? "valor em R$" : "preço final em R$"}
                                {preview != null ? (
                                    <>
                                        {" • "}prévia:{" "}
                                        <span className="font-semibold">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(preview)}
                                        </span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Início</Label>
                            <Input className="rounded-xl" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Fim (opcional)</Label>
                            <Input className="rounded-xl" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                            <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setEndsAt("")} disabled={creating}>
                                Sem fim
                            </Button>
                        </div>

                        <div className="grid gap-2">
                            <Label>Prioridade</Label>
                            <Input className="rounded-xl" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="0" />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                        Ativa
                    </label>

                    <div className="flex justify-end">
                        <Button className="rounded-xl" onClick={create} disabled={creating}>
                            {creating ? "Criando…" : "Criar promoção"}
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-sm">Carregando…</div>
                ) : error ? (
                    <div className="text-sm text-red-600">{apiErrorMessage(error, "Erro ao carregar promoções.")}</div>
                ) : list.length === 0 ? (
                    <div className="text-sm text-black/70">Nenhuma promoção.</div>
                ) : (
                    <div className="grid gap-3">
                        {list.map((p) => (
                            <PromoRow key={p.id} p={p} busy={busy} onPatch={onPatch} onDisable={onDisable} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function PromoRow({
    p,
    busy,
    onPatch,
    onDisable,
}: {
    p: Promo;
    busy: boolean;
    onPatch: (promoId: string, patch: PromoPatchPayload) => void;
    onDisable: (promoId: string) => void;
}) {
    const [editing, setEditing] = useState(false);

    const [appliesTo, setAppliesTo] = useState<"BOTH" | "PRODUCT" | "SHIPPING">(
        p.appliesTo === "PRODUCT" || p.appliesTo === "SHIPPING" ? p.appliesTo : "BOTH"
    );
    const [type, setType] = useState<"PCT" | "FIXED" | "PRICE">(
        p.type === "FIXED" || p.type === "PRICE" ? p.type : "PCT"
    );
    const [value, setValue] = useState(String(p.value ?? ""));
    const [active, setActive] = useState(Boolean(p.active));
    const [startsAt, setStartsAt] = useState(toInputDateTimeLocal(p.startsAt));
    const [endsAt, setEndsAt] = useState(p.endsAt ? toInputDateTimeLocal(p.endsAt) : "");
    const [priority, setPriority] = useState(String(p.priority ?? 0));

    function save() {
        const patch: PromoPatchPayload = {};

        patch.appliesTo = appliesTo;
        patch.type = type;

        const v = Number(String(value).replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) {
            toast.error("Value inválido.");
            return;
        }
        if (type === "PCT" && v > 100) {
            toast.error("Para PCT, value deve ser <= 100.");
            return;
        }
        patch.value = v;

        patch.active = Boolean(active);

        const sIso = fromInputDateTimeLocal(startsAt);
        if (!sIso) {
            toast.error("startsAt inválido.");
            return;
        }
        patch.startsAt = sIso;

        if (!endsAt) patch.endsAt = null;
        else {
            const eIso = fromInputDateTimeLocal(endsAt);
            if (!eIso) {
                toast.error("endsAt inválido.");
                return;
            }
            if (new Date(eIso) <= new Date(sIso)) {
                toast.error("endsAt deve ser maior que startsAt.");
                return;
            }
            patch.endsAt = eIso;
        }

        patch.priority = Number(priority || 0);

        onPatch(p.id, patch);
        setEditing(false);
    }

    return (
        <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="font-semibold">
                        {p.type} • {p.appliesTo} • value: <span className="font-mono">{String(p.value)}</span>
                    </div>

                    <div className="text-sm text-black/60 flex flex-wrap gap-2 items-center">
                        {p.isActiveNow ? (
                            <Badge className="rounded-full">ATIVA AGORA</Badge>
                        ) : (
                            <Badge variant="outline" className="rounded-full bg-white">—</Badge>
                        )}

                        <Badge variant={p.active ? "default" : "secondary"} className="rounded-full">
                            {p.active ? "ATIVA" : "INATIVA"}
                        </Badge>

                        <span className="font-mono text-xs text-black/50">{p.id}</span>
                    </div>

                    <div className="text-xs text-black/50">
                        início: {new Date(p.startsAt).toLocaleString("pt-BR")} • fim:{" "}
                        {p.endsAt ? new Date(p.endsAt).toLocaleString("pt-BR") : "sem fim"} • prioridade: {p.priority}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {!editing ? (
                        <Button variant="outline" className="rounded-xl" onClick={() => setEditing(true)} disabled={busy}>
                            Editar
                        </Button>
                    ) : null}

                    <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                            if (confirm("Desativar esta promoção?")) onDisable(p.id);
                        }}
                        disabled={busy || p.active === false}
                    >
                        Desativar
                    </Button>
                </div>
            </div>

            {editing ? (
                <div className="mt-4 space-y-3">
                    <Separator />

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Aplica em</Label>
                            <select
                                className="h-10 rounded-xl border bg-white px-3 text-sm"
                                value={appliesTo}
                                onChange={(e) => setAppliesTo(e.target.value as "BOTH" | "PRODUCT" | "SHIPPING")}                            >
                                <option value="BOTH">BOTH</option>
                                <option value="PRODUCT">PRODUCT</option>
                                <option value="SHIPPING">SHIPPING</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Tipo</Label>
                            <select
                                className="h-10 rounded-xl border bg-white px-3 text-sm"
                                value={type}
                                onChange={(e) => setType(e.target.value as "PCT" | "FIXED" | "PRICE")}                            >
                                <option value="PCT">PCT</option>
                                <option value="FIXED">FIXED</option>
                                <option value="PRICE">PRICE</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Value</Label>
                            <Input className="rounded-xl" value={value} onChange={(e) => setValue(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Início</Label>
                            <Input className="rounded-xl" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Fim (opcional)</Label>
                            <Input className="rounded-xl" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                            <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setEndsAt("")} disabled={busy}>
                                Sem fim
                            </Button>
                        </div>

                        <div className="grid gap-2">
                            <Label>Prioridade</Label>
                            <Input className="rounded-xl" value={priority} onChange={(e) => setPriority(e.target.value)} />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                        Ativa
                    </label>

                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button variant="outline" className="rounded-xl" onClick={() => setEditing(false)} disabled={busy}>
                            Cancelar
                        </Button>

                        <Button className="rounded-xl" onClick={save} disabled={busy}>
                            Salvar alterações
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
