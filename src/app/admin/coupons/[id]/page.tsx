//src\app\admin\coupons\[id]\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type PromoAppliesTo = "SELLER" | "SALON" | "BOTH";
type DiscountType = "PCT" | "FIXED";

type Coupon = {
  id: string;
  code: string;
  appliesTo: PromoAppliesTo;
  type: DiscountType | string;
  value: string | number;
  active: boolean;

  startsAt: string;
  endsAt?: string | null;

  minSubtotal?: string | number | null;
  maxDiscount?: string | number | null;

  maxRedemptions?: number | null;
  maxPerUser?: number | null;

  redemptionsCount?: number;
  isActiveNow?: boolean;

  createdAt?: string;
  updatedAt?: string;

  [k: string]: unknown;
};

function parseNumberBR(s: string) {
  const raw = String(s ?? "").trim();
  if (!raw) return NaN;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function parseIntPos(s: string) {
  const raw = String(s ?? "").trim();
  if (!raw) return NaN;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function toDatetimeLocalValue(v?: string | Date | null) {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function datetimeLocalToISO(local: string) {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stableIdemForPatch(id: string, payload: Record<string, unknown>) {
  const keys = Object.keys(payload).sort();
  const flat = keys.map((k) => `${k}=${String(payload[k])}`).join("&");
  return `admin-coupon-patch:${id}:${flat}`;
}

function sanitizeMoneyInput(v: string) {
  let s = String(v ?? "").replace(/[^\d.,]/g, "");
  const firstSepIndex = s.search(/[.,]/);
  if (firstSepIndex >= 0) {
    const head = s.slice(0, firstSepIndex);
    const tail = s.slice(firstSepIndex + 1).replace(/[.,]/g, "");
    s = head + s[firstSepIndex] + tail;
  }
  s = s.replace(/^[.,]/, "");
  return s;
}

function sanitizeIntInput(v: string) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

export default function EditCouponPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const couponQ = useQuery({
    queryKey: ["admin-coupon", id],
    queryFn: async () => {
      const res = await api.get(endpoints.adminCoupons.byId(id));
      return (res.data?.coupon ?? res.data) as Coupon;
    },
    retry: false,
  });

  const coupon = couponQ.data ?? null;

  const [code, setCode] = useState("");
  const [appliesTo, setAppliesTo] = useState<PromoAppliesTo>("BOTH");
  const [type, setType] = useState<DiscountType>("PCT");
  const [value, setValue] = useState("");

  const [active, setActive] = useState(true);

  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [maxPerUser, setMaxPerUser] = useState("");

  useEffect(() => {
    if (!coupon) return;

    const timer = setTimeout(() => {
      setCode(coupon.code ?? "");
      setAppliesTo((coupon.appliesTo ?? "BOTH") as PromoAppliesTo);

      const t = String(coupon.type ?? "PCT").toUpperCase();
      setType((t === "FIXED" ? "FIXED" : "PCT") as DiscountType);

      setValue(coupon.value != null ? String(coupon.value) : "");
      setActive(Boolean(coupon.active));

      setStartsAt(coupon.startsAt ? toDatetimeLocalValue(coupon.startsAt) : "");
      setEndsAt(coupon.endsAt ? toDatetimeLocalValue(coupon.endsAt) : "");

      setMinSubtotal(coupon.minSubtotal != null ? String(coupon.minSubtotal) : "");
      setMaxDiscount(coupon.maxDiscount != null ? String(coupon.maxDiscount) : "");
      setMaxRedemptions(coupon.maxRedemptions != null ? String(coupon.maxRedemptions) : "");
      setMaxPerUser(coupon.maxPerUser != null ? String(coupon.maxPerUser) : "");
    }, 0);

    return () => clearTimeout(timer);
  }, [coupon]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload: {
        code?: string;
        appliesTo?: PromoAppliesTo;
        type?: DiscountType;
        value?: number;
        active?: boolean;
        startsAt?: string;
        endsAt?: string | null;
        minSubtotal?: number | null;
        maxDiscount?: number | null;
        maxRedemptions?: number | null;
        maxPerUser?: number | null;
      } = {};

      const codeUp = code.trim().toUpperCase();
      if (!codeUp) throw new Error("Informe o código do cupom.");
      if (codeUp && codeUp !== coupon?.code) payload.code = codeUp;

      payload.appliesTo = appliesTo;
      payload.type = type;
      payload.active = Boolean(active);

      const valueNum = parseNumberBR(value);
      if (!Number.isFinite(valueNum)) throw new Error("Valor inválido.");

      if (type === "PCT" && (valueNum <= 0 || valueNum > 100))
        throw new Error("Percentual deve ser > 0 e <= 100.");
      if (type === "FIXED" && valueNum <= 0)
        throw new Error("Desconto em R$ deve ser > 0.");
      payload.value = valueNum;

      if (!startsAt) throw new Error("Informe a data/hora de início.");
      const startsISO = datetimeLocalToISO(startsAt);
      if (!startsISO) throw new Error("Início inválido.");
      payload.startsAt = startsISO;

      const endsISO = endsAt ? datetimeLocalToISO(endsAt) : null;
      payload.endsAt = endsAt ? endsISO : null;

      if (endsAt) {
        const s = new Date(startsAt);
        const e = new Date(endsAt);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()))
          throw new Error("Datas inválidas.");
        if (e <= s) throw new Error("Fim deve ser maior que o início.");
      }

      payload.minSubtotal = minSubtotal.trim() ? parseNumberBR(minSubtotal) : null;
      if (payload.minSubtotal != null && !Number.isFinite(payload.minSubtotal))
        throw new Error("Pedido mínimo inválido.");

      payload.maxDiscount = maxDiscount.trim() ? parseNumberBR(maxDiscount) : null;
      if (payload.maxDiscount != null && !Number.isFinite(payload.maxDiscount))
        throw new Error("Desconto máximo inválido.");

      payload.maxRedemptions = maxRedemptions.trim()
        ? parseIntPos(maxRedemptions)
        : null;
      if (payload.maxRedemptions != null && !Number.isFinite(payload.maxRedemptions)) {
        throw new Error("Limite total de usos inválido (inteiro > 0).");
      }

      payload.maxPerUser = maxPerUser.trim() ? parseIntPos(maxPerUser) : null;
      if (payload.maxPerUser != null && !Number.isFinite(payload.maxPerUser)) {
        throw new Error("Limite por usuário inválido (inteiro > 0).");
      }

      const idem = stableIdemForPatch(id, payload);

      await api.patch(endpoints.adminCoupons.patch(id), payload, {
        headers: { "Idempotency-Key": idem },
      });
    },
    onSuccess: async () => {
      toast.success("Cupom salvo.");
      await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      await qc.invalidateQueries({ queryKey: ["admin-coupon", id] });
      router.replace("/admin/coupons");
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e, "Falha ao salvar."));
    },
  });

  const headerStatus = useMemo(() => {
    if (!coupon) return null;
    return coupon.active === false ? "INATIVO" : "ATIVO";
  }, [coupon]);

  if (couponQ.isLoading) return <div className="rounded-2xl border p-4">Carregando…</div>;
  if (couponQ.isError)
    return (
      <div className="rounded-2xl border p-4 text-red-600">
        {apiErrorMessage(couponQ.error, "Erro ao carregar cupom.")}
      </div>
    );

  if (!coupon) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border p-4">Cupom não encontrado.</div>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => router.replace("/admin/coupons")}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 lg:px-6">
      {/* Header responsivo (evita corte) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black break-words">Editar cupom</h1>
          <p className="text-sm text-black/60 break-all">
            ID: <span className="font-mono">{id}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            Admin
          </Badge>
          <Badge
            variant={coupon.active === false ? "secondary" : "default"}
            className={cn("rounded-full")}
          >
            {headerStatus}
          </Badge>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4">
        <CardHeader>
          <CardTitle>Dados do cupom</CardTitle>
          <CardDescription>Edite e clique em “Salvar”.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* IMPORTANTE: grid só vira 12 colunas no LG, pq com sidebar o md fica estreito e corta */}
          <div className="grid gap-4 lg:grid-cols-12 items-start">
            <div className="grid gap-2 lg:col-span-7">
              <Label>Código</Label>
              <Input
                className="rounded-xl h-10"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="text-xs text-black/50">
                Sem espaços. Ex.: TERCA60, FRETEGRATIS
              </div>
            </div>

            <div className="grid gap-2 lg:col-span-5">
              <Label>Quem pode usar</Label>
              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as PromoAppliesTo)}
              >
                <option value="BOTH">Ambos (Salão + Vendedor)</option>
                <option value="SELLER">Somente Vendedor</option>
                <option value="SALON">Somente Salão</option>
              </select>
            </div>

            <div className="grid gap-2 lg:col-span-4">
              <Label>Tipo de desconto</Label>
              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as DiscountType)}
              >
                <option value="PCT">Percentual (%)</option>
                <option value="FIXED">Desconto (R$)</option>
              </select>
            </div>

            <div className="grid gap-2 lg:col-span-4">
              <Label>Valor</Label>
              <Input
                className="rounded-xl h-10"
                value={value}
                onChange={(e) => setValue(sanitizeMoneyInput(e.target.value))}
                placeholder={type === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                inputMode="decimal"
              />
              <div className="text-xs text-black/50">
                {type === "PCT" ? "0 < valor ≤ 100" : "valor > 0"}
              </div>
            </div>

            <div className="grid gap-2 lg:col-span-4">
              <Label>Status</Label>
              <label className="h-10 rounded-xl border bg-white px-3 flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
                <span className="text-sm">Ativo</span>
              </label>
            </div>

            <div className="grid gap-2 lg:col-span-6">
              <Label>Início (data e hora)</Label>
              <Input
                type="datetime-local"
                className="rounded-xl h-10"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div className="grid gap-2 lg:col-span-6">
              <Label>Fim (opcional)</Label>
              <Input
                type="datetime-local"
                className="rounded-xl h-10"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Avançado recolhível */}
          <div className="rounded-2xl border p-4">
            <Accordion type="single" collapsible>
              <AccordionItem value="advanced" className="border-0">
                <AccordionTrigger className="py-0 hover:no-underline">
                  Configurações avançadas
                </AccordionTrigger>

                <AccordionContent className="pt-4">
                  {/* empilha por padrão; só vira 2 colunas em sm e 4 em xl (evita corte com sidebar) */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 items-start">
                    <div className="grid gap-2">
                      <Label>Pedido mínimo (R$)</Label>
                      <Input
                        className="rounded-xl h-10"
                        value={minSubtotal}
                        onChange={(e) => setMinSubtotal(sanitizeMoneyInput(e.target.value))}
                        placeholder="Ex.: 100,00"
                        inputMode="decimal"
                      />
                      <div className="text-xs text-black/50">
                        Aplicar só se total ≥ esse valor.
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Desconto máximo (R$)</Label>
                      <Input
                        className="rounded-xl h-10"
                        value={maxDiscount}
                        onChange={(e) => setMaxDiscount(sanitizeMoneyInput(e.target.value))}
                        placeholder="Ex.: 30,00"
                        inputMode="decimal"
                      />
                      <div className="text-xs text-black/50">
                        Limita o desconto máximo.
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Limite total de usos</Label>
                      <Input
                        className="rounded-xl h-10"
                        value={maxRedemptions}
                        onChange={(e) => setMaxRedemptions(sanitizeIntInput(e.target.value))}
                        placeholder="Ex.: 200"
                        inputMode="numeric"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Limite por usuário</Label>
                      <Input
                        className="rounded-xl h-10"
                        value={maxPerUser}
                        onChange={(e) => setMaxPerUser(sanitizeIntInput(e.target.value))}
                        placeholder="Ex.: 1"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <Separator />

          {/* botões responsivos (mobile empilha) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="w-full rounded-xl sm:w-auto" disabled={saveM.isPending}>
              <Link href="/admin/coupons">Cancelar</Link>
            </Button>

            <Button className="w-full rounded-xl sm:w-auto" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
              {saveM.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
