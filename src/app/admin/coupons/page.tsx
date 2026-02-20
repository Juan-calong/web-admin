"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Plus, Search, X, MoreHorizontal, Copy, Link2 } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type PromoAppliesTo = "SELLER" | "SALON" | "BOTH";
type DiscountType = "PCT" | "FIXED";

type Coupon = {
  id: string;
  code: string;
  active: boolean;
  appliesTo: PromoAppliesTo;
  type: DiscountType | string;
  value: string | number;

  startsAt: string;
  endsAt?: string | null;

  redemptionsCount?: number;
  isActiveNow?: boolean;

  [k: string]: unknown;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function safeDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseNumberBR(s: string) {
  const raw = String(s ?? "").trim();
  if (!raw) return NaN;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
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

function appliesToLabel(v: PromoAppliesTo) {
  if (v === "BOTH") return "Salão + Vendedor";
  if (v === "SALON") return "Somente Salão";
  return "Somente Vendedor";
}

function typeLabel(v: string) {
  const t = String(v ?? "").toUpperCase();
  if (t === "PCT") return "Percentual (%)";
  if (t === "FIXED") return "Desconto (R$)";
  if (t === "PRICE") return "Preço final (legado)";
  return t || "-";
}

function formatBRL(n: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatValue(c: Coupon) {
  const t = String(c.type ?? "").toUpperCase();
  const v = Number(String(c.value ?? "").replace(",", "."));
  if (!Number.isFinite(v)) return String(c.value ?? "-");
  if (t === "PCT") return `${v}%`;
  if (t === "FIXED") return formatBRL(v);
  return String(c.value ?? "-");
}

function humanWindowHint(c: Coupon, now = new Date()) {
  const s = safeDate(c.startsAt);
  const e = safeDate(c.endsAt ?? null);

  if (!s) return "Data inválida";
  if (!c.active) return "Desativado";

  if (now < s) return `Começa em ${fmtDate(c.startsAt)}`;
  if (e && now >= e) return `Expirou em ${fmtDate(c.endsAt ?? null)}`;
  if (e) return `Expira em ${fmtDate(c.endsAt ?? null)}`;
  return "Sem data final";
}

type UiStatus = "ACTIVE_NOW" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | "INVALID";

function computeStatus(c: Coupon, now = new Date()): { key: UiStatus; label: string } {
  const s = safeDate(c.startsAt);
  const e = safeDate(c.endsAt ?? null);

  if (!s) return { key: "INVALID", label: "DATA INVÁLIDA" };
  if (c.active === false) return { key: "INACTIVE", label: "INATIVO" };
  if (now < s) return { key: "SCHEDULED", label: "AGENDADO" };
  if (e && now >= e) return { key: "EXPIRED", label: "EXPIRADO" };
  return { key: "ACTIVE_NOW", label: "ATIVO AGORA" };
}

function statusBadgeClass(key: UiStatus) {
  if (key === "ACTIVE_NOW") return "bg-emerald-600 text-white border-transparent";
  if (key === "SCHEDULED") return "bg-amber-500 text-white border-transparent";
  if (key === "EXPIRED") return "bg-zinc-200 text-zinc-900 border-transparent";
  if (key === "INACTIVE") return "bg-zinc-300 text-zinc-900 border-transparent";
  return "bg-rose-600 text-white border-transparent";
}

function statusDotClass(key: UiStatus) {
  if (key === "ACTIVE_NOW") return "bg-emerald-300";
  if (key === "SCHEDULED") return "bg-amber-200";
  if (key === "EXPIRED") return "bg-zinc-400";
  if (key === "INACTIVE") return "bg-zinc-500";
  return "bg-rose-300";
}

function stableIdemForCreateCoupon(args: {
  code: string;
  appliesTo: PromoAppliesTo;
  type: DiscountType;
  value: number;
  startsAtISO: string;
  endsAtISO?: string | null;
}) {
  const parts = [
    "admin-coupon-create",
    args.code,
    args.appliesTo,
    args.type,
    String(args.value),
    args.startsAtISO,
    args.endsAtISO ?? "no-end",
  ];
  return parts.join(":");
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

export default function AdminCouponsPage() {
  const qc = useQueryClient();

  const [q, setQ] = useState("");

  // Create form (básico)
  const [newCode, setNewCode] = useState("");
  const [newAppliesTo, setNewAppliesTo] = useState<PromoAppliesTo>("BOTH");
  const [newType, setNewType] = useState<DiscountType>("PCT");
  const [newValue, setNewValue] = useState("");

  const [newStartsAt, setNewStartsAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [newEndsAt, setNewEndsAt] = useState<string>("");

  const couponsQ = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const res = await api.get(endpoints.adminCoupons.list);
      return (res.data?.items ?? res.data ?? []) as Coupon[];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  const items = useMemo(() => {
    const list = couponsQ.data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;

    return list.filter((c) => {
      const hay = `${c.id} ${c.code ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [couponsQ.data, q]);

  const itemsSorted = useMemo(() => {
    const now = new Date();
    const arr = [...items];

    const rank = (s: UiStatus) => {
      if (s === "ACTIVE_NOW") return 0;
      if (s === "SCHEDULED") return 1;
      if (s === "EXPIRED") return 2;
      if (s === "INACTIVE") return 3;
      return 4;
    };

    arr.sort((a, b) => {
      const sa = computeStatus(a, now).key;
      const sb = computeStatus(b, now).key;

      const ra = rank(sa);
      const rb = rank(sb);
      if (ra !== rb) return ra - rb;

      const da = safeDate(a.startsAt)?.getTime() ?? 0;
      const db = safeDate(b.startsAt)?.getTime() ?? 0;
      return db - da;
    });

    return arr;
  }, [items]);

  const summary = useMemo(() => {
    const now = new Date();
    const list = couponsQ.data ?? [];
    const count = {
      activeNow: 0,
      scheduled: 0,
      expired: 0,
      inactive: 0,
      invalid: 0,
      total: list.length,
    };

    for (const c of list) {
      const k = computeStatus(c, now).key;
      if (k === "ACTIVE_NOW") count.activeNow++;
      else if (k === "SCHEDULED") count.scheduled++;
      else if (k === "EXPIRED") count.expired++;
      else if (k === "INACTIVE") count.inactive++;
      else count.invalid++;
    }
    return count;
  }, [couponsQ.data]);

  const createM = useMutation({
    mutationFn: async () => {
      const code = newCode.trim().toUpperCase();
      if (!code) throw new Error("Informe o código do cupom.");

      const valueNum = parseNumberBR(newValue);
      if (!Number.isFinite(valueNum)) throw new Error("Informe um valor numérico válido.");

      if (newType === "PCT" && (valueNum <= 0 || valueNum > 100))
        throw new Error('Percentual deve ser > 0 e <= 100.');
      if (newType === "FIXED" && valueNum <= 0)
        throw new Error("Desconto em R$ deve ser > 0.");

      if (!newStartsAt) throw new Error("Informe a data/hora de início.");
      const startsISO = datetimeLocalToISO(newStartsAt);
      if (!startsISO) throw new Error("Início inválido.");

      const endsISO = newEndsAt ? datetimeLocalToISO(newEndsAt) : null;
      if (newEndsAt && !endsISO) throw new Error("Fim inválido.");

      if (newEndsAt) {
        const s = new Date(newStartsAt);
        const e = new Date(newEndsAt);
        if (e <= s) throw new Error("O fim deve ser maior que o início.");
      }

      const payload: {
        code: string;
        appliesTo: PromoAppliesTo;
        type: DiscountType;
        value: number;
        startsAt: string;
        endsAt?: string;
      } = {
        code,
        appliesTo: newAppliesTo,
        type: newType,
        value: valueNum,
        startsAt: startsISO,
      };
      if (endsISO) payload.endsAt = endsISO;

      const idem = stableIdemForCreateCoupon({
        code,
        appliesTo: newAppliesTo,
        type: newType,
        value: valueNum,
        startsAtISO: startsISO,
        endsAtISO: endsISO,
      });

      await api.post(endpoints.adminCoupons.create, payload, {
        headers: { "Idempotency-Key": idem },
      });
    },
    onSuccess: async () => {
      toast.success("Cupom criado.");

      setNewCode("");
      setNewAppliesTo("BOTH");
      setNewType("PCT");
      setNewValue("");
      setNewStartsAt(toDatetimeLocalValue(new Date()));
      setNewEndsAt("");

      await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      await couponsQ.refetch();
    },
    onError: (e: unknown) => {
      const apiErr = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      if (String(apiErr || "").includes("Já existe cupom com esse code")) {
        toast.error("Esse código já existe. Edite o cupom existente ou use outro (ex.: FRIDAY20-2).");
        return;
      }
      toast.error(apiErrorMessage(e, "Falha ao criar cupom."));
    },
  });

  const disableM = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(
        endpoints.adminCoupons.disable(id),
        {},
        { headers: { "Idempotency-Key": `admin-coupon-disable:${id}` } }
      );
    },
    onSuccess: async () => {
      toast.success("Cupom desativado.");
      await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      await couponsQ.refetch();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Falha ao desativar.")),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="text-xl sm:text-2xl font-black">Cupons</div>
          <div className="text-sm text-black/60">Crie e gerencie cupons de desconto</div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge className="rounded-full bg-slate-200/70 text-slate-900 border-transparent">
              Total: {summary.total}
            </Badge>

            <Badge className="rounded-full bg-emerald-600 text-white border-transparent">
              Ativos agora: {summary.activeNow}
            </Badge>

            <Badge className="rounded-full bg-amber-500 text-white border-transparent">
              Agendados: {summary.scheduled}
            </Badge>

            <Badge className="rounded-full bg-zinc-200 text-zinc-900 border-transparent">
              Expirados: {summary.expired}
            </Badge>

            <Badge className="rounded-full bg-zinc-300 text-zinc-900 border-transparent">
              Inativos: {summary.inactive}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Badge variant="secondary" className="rounded-full w-fit">
            Admin
          </Badge>

          <Button
            variant="outline"
            className="rounded-xl w-full sm:w-auto"
            onClick={() => couponsQ.refetch()}
            disabled={couponsQ.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", couponsQ.isFetching ? "animate-spin" : "")} />
            {couponsQ.isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* CREATE */}
      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-sky-500/70">
        <CardHeader className="rounded-t-2xl border-b border-slate-200/60 bg-slate-50/50">
          <CardTitle>Criar cupom</CardTitle>
          <CardDescription>Preencha o básico. O restante é opcional.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-12 items-start">
            <div className="grid gap-2 lg:col-span-4">
              <Label>Código</Label>
              <Input
                className="rounded-xl h-10"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Ex.: FRIDAY20"
              />
              <div className="text-xs text-black/50">Sem espaços. Letras/números. Ex.: TERCA60</div>
            </div>

            <div className="grid gap-2 lg:col-span-4">
              <Label>Quem pode usar</Label>
              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                value={newAppliesTo}
                onChange={(e) => setNewAppliesTo(e.target.value as PromoAppliesTo)}
              >
                <option value="BOTH">Salão + Vendedor</option>
                <option value="SALON">Somente Salão</option>
                <option value="SELLER">Somente Vendedor</option>
              </select>
            </div>

            <div className="grid gap-2 lg:col-span-2">
              <Label>Tipo</Label>
              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value as DiscountType)}
              >
                <option value="PCT">Percentual (%)</option>
                <option value="FIXED">Desconto (R$)</option>
              </select>
            </div>

            <div className="grid gap-2 lg:col-span-2">
              <Label>Valor</Label>
              <Input
                className="rounded-xl h-10"
                value={newValue}
                onChange={(e) => setNewValue(sanitizeMoneyInput(e.target.value))}
                placeholder={newType === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                inputMode={newType === "PCT" ? "numeric" : "decimal"}
              />
              <div className="text-xs text-black/50">{newType === "PCT" ? "0 < valor ≤ 100" : "Valor > 0"}</div>
            </div>

            <div className="grid gap-2 lg:col-span-6">
              <Label>Início</Label>
              <Input
                type="datetime-local"
                className="rounded-xl h-10"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
              />
            </div>

            {/* fim opcional: ocupa linha inteira em mobile, metade no LG */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border p-4">
                <Accordion type="single" collapsible>
                  <AccordionItem value="end" className="border-0">
                    <AccordionTrigger className="py-0 hover:no-underline">
                      Fim (opcional)
                    </AccordionTrigger>
                    <AccordionContent className="pt-3">
                      <div className="grid gap-2">
                        <Label className="text-xs text-black/60">Data e hora de expiração</Label>
                        <Input
                          type="datetime-local"
                          className="rounded-xl h-10"
                          value={newEndsAt}
                          onChange={(e) => setNewEndsAt(e.target.value)}
                        />
                        <div className="text-xs text-black/50">Se vazio, fica sem expiração.</div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end">
            <Button className="rounded-xl w-full sm:w-auto" onClick={() => createM.mutate()} disabled={createM.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createM.isPending ? "Criando…" : "Criar cupom"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* LIST */}
      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-indigo-500/70">
        <CardHeader className="rounded-t-2xl border-b border-slate-200/60 bg-slate-50/50">
          <CardTitle>Lista</CardTitle>
          <CardDescription>{itemsSorted.length} cupom(ns) encontrado(s)</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:max-w-md">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50" />
              <Input
                className="rounded-xl h-10 pl-9 pr-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="por código ou id…"
              />
              {q.trim() ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-black/5"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4 text-black/60" />
                </button>
              ) : null}
            </div>
          </div>

          <Separator />

          {couponsQ.isLoading ? (
            <div className="text-sm">Carregando…</div>
          ) : couponsQ.isError ? (
            <div className="text-sm text-red-600">{apiErrorMessage(couponsQ.error, "Erro ao carregar cupons.")}</div>
          ) : (
            <>
              {/* ===== TABLE: só em LG+ (evita corte com sidebar) ===== */}
              <div className="hidden lg:block overflow-x-auto rounded-2xl border">
                <Table className="min-w-[860px]">
                  <TableHeader className="bg-slate-50/70">
                    <TableRow>
                      <TableHead>Cupom</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {itemsSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-sm text-black/60">
                          Nenhum cupom.
                        </TableCell>
                      </TableRow>
                    ) : (
                      itemsSorted.map((c) => {
                        const now = new Date();
                        const st = computeStatus(c, now);
                        const hint = humanWindowHint(c, now);

                        return (
                          <TableRow key={c.id} className="hover:bg-slate-50/70 [&>td]:border-b [&>td]:border-slate-100">
                            <TableCell className="align-top whitespace-normal">
                              <div className="font-semibold">{c.code ?? "-"}</div>
                              <div className="text-xs text-black/60">{appliesToLabel(c.appliesTo)}</div>
                              <div className="text-[10px] text-black/50 font-mono break-all">{c.id}</div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <Badge className={cn("rounded-full gap-2", statusBadgeClass(st.key))}>
                                  <span className={cn("inline-block h-2 w-2 rounded-full", statusDotClass(st.key))} />
                                  {st.label}
                                </Badge>
                                <div className="text-[11px] text-black/50">{hint}</div>
                              </div>
                            </TableCell>

                            <TableCell className="align-top whitespace-normal">
                              <div className="text-sm">{typeLabel(c.type)}</div>
                              <div className="text-xs text-black/60">{formatValue(c)}</div>
                            </TableCell>

                            <TableCell className="align-top whitespace-normal text-xs text-black/60">
                              <div>Início: {fmtDate(c.startsAt)}</div>
                              <div>Fim: {fmtDate(c.endsAt ?? null)}</div>
                            </TableCell>

                            <TableCell className="text-right align-top">
                              <div className="flex justify-end gap-2">
                                <Button asChild variant="outline" className="rounded-xl">
                                  <Link href={`/admin/coupons/${c.id}`}>Editar</Link>
                                </Button>

                                <AlertDialog>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        className="rounded-xl bg-white hover:bg-slate-50"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-200 bg-white shadow-lg">
                                      <DropdownMenuItem
                                        onSelect={async (e) => {
                                          e.preventDefault();
                                          const ok = await copyToClipboard(c.code ?? "");
                                          toast[ok ? "success" : "error"](ok ? "Código copiado." : "Não foi possível copiar.");
                                        }}
                                      >
                                        <Copy className="h-4 w-4" />
                                        Copiar código
                                      </DropdownMenuItem>

                                      <DropdownMenuItem
                                        onSelect={async (e) => {
                                          e.preventDefault();
                                          const url = `${window.location.origin}/admin/coupons/${c.id}`;
                                          const ok = await copyToClipboard(url);
                                          toast[ok ? "success" : "error"](ok ? "Link copiado." : "Não foi possível copiar.");
                                        }}
                                      >
                                        <Link2 className="h-4 w-4" />
                                        Copiar link
                                      </DropdownMenuItem>

                                      <DropdownMenuSeparator />

                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem variant="destructive" disabled={disableM.isPending || c.active === false}>
                                          Desativar
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                    </DropdownMenuContent>
                                  </DropdownMenu>

                                  <AlertDialogContent className="rounded-2xl">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Desativar este cupom?</AlertDialogTitle>
                                      <AlertDialogDescription>Ele não poderá mais ser aplicado no checkout.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                      <AlertDialogAction className="rounded-xl" onClick={() => disableM.mutate(c.id)}>
                                        Confirmar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* ===== MOBILE: cards ===== */}
              <div className="lg:hidden space-y-3">
                {itemsSorted.length === 0 ? (
                  <div className="rounded-2xl border p-4 text-sm text-black/60">Nenhum cupom.</div>
                ) : (
                  itemsSorted.map((c) => {
                    const now = new Date();
                    const st = computeStatus(c, now);
                    const hint = humanWindowHint(c, now);

                    return (
                      <div key={c.id} className="rounded-2xl border bg-white p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold break-words">{c.code ?? "-"}</div>
                            <div className="text-xs text-black/60">{appliesToLabel(c.appliesTo)}</div>
                            <div className="text-[10px] text-black/50 font-mono break-all mt-1">{c.id}</div>
                          </div>

                          <Badge className={cn("rounded-full gap-2 shrink-0", statusBadgeClass(st.key))}>
                            <span className={cn("inline-block h-2 w-2 rounded-full", statusDotClass(st.key))} />
                            {st.label}
                          </Badge>
                        </div>

                        <div className="grid gap-2">
                          <div className="rounded-xl border bg-slate-50/60 p-3">
                            <div className="text-xs text-black/60">Desconto</div>
                            <div className="text-sm font-medium">{typeLabel(c.type)}</div>
                            <div className="text-xs text-black/60">{formatValue(c)}</div>
                          </div>

                          <div className="rounded-xl border bg-slate-50/60 p-3">
                            <div className="text-xs text-black/60">Validade</div>
                            <div className="text-xs text-black/70">{hint}</div>
                            <div className="text-[11px] text-black/60 mt-1">
                              Início: {fmtDate(c.startsAt)} • Fim: {fmtDate(c.endsAt ?? null)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button asChild variant="outline" className="rounded-xl">
                            <Link href={`/admin/coupons/${c.id}`}>Editar</Link>
                          </Button>

                          <AlertDialog>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="rounded-xl">
                                  <MoreHorizontal className="mr-2 h-4 w-4" />
                                  Mais
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end" className="rounded-xl border-slate-200 bg-white shadow-lg">
                                <DropdownMenuItem
                                  onSelect={async (e) => {
                                    e.preventDefault();
                                    const ok = await copyToClipboard(c.code ?? "");
                                    toast[ok ? "success" : "error"](ok ? "Código copiado." : "Não foi possível copiar.");
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                  Copiar código
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onSelect={async (e) => {
                                    e.preventDefault();
                                    const url = `${window.location.origin}/admin/coupons/${c.id}`;
                                    const ok = await copyToClipboard(url);
                                    toast[ok ? "success" : "error"](ok ? "Link copiado." : "Não foi possível copiar.");
                                  }}
                                >
                                  <Link2 className="h-4 w-4" />
                                  Copiar link
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem variant="destructive" disabled={disableM.isPending || c.active === false}>
                                    Desativar
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <AlertDialogContent className="rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Desativar este cupom?</AlertDialogTitle>
                                <AlertDialogDescription>Ele não poderá mais ser aplicado no checkout.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                <AlertDialogAction className="rounded-xl" onClick={() => disableM.mutate(c.id)}>
                                  Confirmar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        <div className="text-[11px] text-black/50">
                          Dica: {hint}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
