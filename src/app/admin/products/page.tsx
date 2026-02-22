"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Search, Plus, RefreshCw, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react";

type ProductImage = {
  id: string;
  url: string;
  sort?: number | null;
  isPrimary?: boolean | null;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  price: string; 
  customerPrice?: string | null;
effectivePrice?: string | null;
  description?: string | null;
  active: boolean;
  categoryId?: string | null;
  stock?: number | null;
  images?: ProductImage[];

  promoNow?: boolean;
  promoScheduled?: boolean;
};

function pickPrimaryImage(images?: ProductImage[] | null) {
  if (!images?.length) return null;

  const sorted = [...images].sort((a, b) => {
    const ap = a.isPrimary ? 1 : 0;
    const bp = b.isPrimary ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return (a.sort ?? 0) - (b.sort ?? 0);
  });

  return sorted[0]?.url ?? null;
}

function brl(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function statusBadgeClass(active: boolean) {
  return active
    ? "bg-emerald-600 text-white border-transparent"
    : "bg-zinc-300 text-zinc-900 border-transparent";
}

export default function AdminProductsPage() {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [promoFilter, setPromoFilter] = useState<"all" | "now" | "scheduled" | "none">("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const productsQ = useQuery({
    queryKey: ["products", { take: 300 }],
    queryFn: async () => {
      const res = await api.get(endpoints.products.list, { params: { take: 300 } });
      return (res.data?.items ?? []) as Product[];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (productsQ.isError) {
      toast.error(apiErrorMessage(productsQ.error, "Erro ao carregar produtos."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQ.isError]);

  useEffect(() => {
    setPage(1);
  }, [q, activeFilter, promoFilter]);

  const filtered = useMemo(() => {
    const items = productsQ.data ?? [];
    const qq = q.trim().toLowerCase();

    return items
      .filter((p) => {
        if (activeFilter === "active") return p.active === true;
        if (activeFilter === "inactive") return p.active === false;
        return true;
      })
      .filter((p) => {
        if (promoFilter === "now") return p.promoNow === true;
        if (promoFilter === "scheduled") return p.promoScheduled === true;
        if (promoFilter === "none") return !p.promoNow && !p.promoScheduled;
        return true; // all
      })
      .filter((p) => {
        if (!qq) return true;
        return (
          p.name?.toLowerCase().includes(qq) ||
          p.sku?.toLowerCase().includes(qq) ||
          p.id?.toLowerCase().includes(qq)
        );
      });
  }, [productsQ.data, q, activeFilter, promoFilter]);

  const total = productsQ.data?.length ?? 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filtered.slice(start, end);

  const summary = useMemo(() => {
    const items = productsQ.data ?? [];
    let active = 0;
    let inactive = 0;
    let out = 0;
    let low = 0;

    let promoNow = 0;
    let promoScheduled = 0;
    let promoNone = 0;

    for (const p of items) {
      if (p.active) active++;
      else inactive++;

      const s = Number(p.stock ?? 0);
      if (s <= 0) out++;
      else if (s <= 5) low++;

      const now = !!p.promoNow;
      const sch = !!p.promoScheduled;
      if (now) promoNow++;
      if (sch) promoScheduled++;
      if (!now && !sch) promoNone++;
    }

    return { total: items.length, active, inactive, out, low, promoNow, promoScheduled, promoNone };
  }, [productsQ.data]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 rounded-3xl border bg-slate-50/60 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-2xl font-black">Produtos</div>
          <div className="text-sm text-black/60">Catálogo</div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge className="rounded-full bg-slate-200/70 text-slate-900 border-transparent">
              Total: {summary.total}
            </Badge>
            <Badge className="rounded-full bg-emerald-600 text-white border-transparent">
              Ativos: {summary.active}
            </Badge>
            <Badge className="rounded-full bg-zinc-300 text-zinc-900 border-transparent">
              Inativos: {summary.inactive}
            </Badge>
            <Badge className="rounded-full bg-rose-600 text-white border-transparent">
              Sem estoque: {summary.out}
            </Badge>
            <Badge className="rounded-full bg-amber-500 text-white border-transparent">
              Pouco: {summary.low}
            </Badge>

            {/* ✅ Promo summary */}
            <Badge className="rounded-full bg-indigo-600 text-white border-transparent">
              Promo ativa: {summary.promoNow}
            </Badge>
            <Badge className="rounded-full bg-sky-600 text-white border-transparent">
              Agendada: {summary.promoScheduled}
            </Badge>
            <Badge className="rounded-full bg-slate-300 text-slate-900 border-transparent">
              Sem promo: {summary.promoNone}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl bg-white hover:bg-slate-50"
            onClick={() => productsQ.refetch()}
            disabled={productsQ.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", productsQ.isFetching ? "animate-spin" : "")} />
            {productsQ.isFetching ? "Atualizando…" : "Atualizar"}
          </Button>

          <Button asChild className="rounded-xl">
            <Link href="/admin/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo produto
            </Link>
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-sky-500/70">
        <CardHeader className="rounded-t-2xl border-b border-slate-200/60 bg-slate-50/50">
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            {filtered.length} de {total} produto(s)
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pt-5">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="grid gap-2 sm:col-span-3">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50" />
                <Input
                  className="h-10 rounded-xl pl-9 pr-9"
                  placeholder="Nome, SKU ou ID…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
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

            <div className="grid gap-2 sm:col-span-2">
              <Label>Status</Label>
              <select
                className="h-10 rounded-xl border bg-white px-3 text-sm"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
              >
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div className="grid gap-2 sm:col-span-1">
              <Label>Promo</Label>
              <select
                className="h-10 rounded-xl border bg-white px-3 text-sm"
                value={promoFilter}
                onChange={(e) => setPromoFilter(e.target.value as "all" | "now" | "scheduled" | "none")}
              >
                <option value="all">Todas</option>
                <option value="now">Ativa agora</option>
                <option value="scheduled">Agendada</option>
                <option value="none">Sem promo</option>
              </select>
            </div>
          </div>

          <Separator />

          <div className="text-xs text-black/50">
            “Promo ativa” aparece mesmo se o produto estiver INATIVO
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-indigo-500/70">
        <CardHeader className="rounded-t-2xl border-b border-slate-200/60 bg-slate-50/50">
          <CardTitle>Lista</CardTitle>
          <CardDescription>Gerencie seus produtos</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pt-5">
          {productsQ.isLoading ? (
            <div className="text-sm">Carregando…</div>
          ) : productsQ.isError ? (
            <div className="text-sm text-red-600">{apiErrorMessage(productsQ.error, "Erro ao carregar produtos.")}</div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200/70">
                <Table>
                  <TableHeader className="bg-slate-50/70">
                    <TableRow>
                      <TableHead className="w-[70px]">Foto</TableHead>
                      <TableHead className="w-[170px] hidden md:table-cell">SKU</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-[140px]">Preço</TableHead>
                      <TableHead className="w-[120px]">Promo</TableHead>
                      <TableHead className="w-[120px]">Estoque</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[140px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-sm text-black/60">
                          Nenhum produto encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageItems.map((p) => <ProductRow key={p.id} p={p} />)
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-black/60">
                  Página {safePage} de {pageCount} • mostrando {start + 1}-{Math.min(end, filtered.length)} de{" "}
                  {filtered.length}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl bg-white hover:bg-slate-50"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Anterior
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-xl bg-white hover:bg-slate-50"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                  >
                    Próxima
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductRow({ p }: { p: Product }) {
  const img = pickPrimaryImage(p.images);
  const stock = Number(p.stock ?? 0);

  const [broken, setBroken] = useState(false);
  const showImg = !!img && !broken;

  const desc = (p.description ?? "").trim();

  const stockLabel = stock <= 0 ? "Sem estoque" : stock <= 5 ? "Pouco" : null;

  const stockBadgeClass =
    stock <= 0 ? "bg-rose-600 text-white border-transparent" : "bg-amber-500 text-white border-transparent";

  const statusCls = statusBadgeClass(p.active);

  // ✅ Promo badge (prioriza “ativa agora”)
  const promoNow = !!p.promoNow;
  const promoScheduled = !!p.promoScheduled;

  const promoBadge = promoNow ? (
    <Badge className="rounded-full bg-indigo-600 text-white border-transparent">PROMO ATIVA</Badge>
  ) : promoScheduled ? (
    <Badge className="rounded-full bg-sky-600 text-white border-transparent">AGENDADA</Badge>
  ) : (
    <Badge className="rounded-full bg-slate-200 text-slate-900 border-transparent">SEM PROMO</Badge>
  );

  return (
    <TableRow className="hover:bg-slate-50/70 [&>td]:border-b [&>td]:border-slate-100">
      {/* FOTO */}
      <TableCell className="align-middle">
        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200/70 bg-white">
          {showImg ? (
            <Image
              src={img!}
              alt={p.name}
              fill
              className="object-cover"
              sizes="48px"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] text-black/40">sem</div>
          )}
        </div>
      </TableCell>

      {/* SKU + ID */}
      <TableCell className="align-middle hidden md:table-cell">
        <div className="font-mono text-xs text-black/70">{p.sku}</div>
        <div className="mt-1 font-mono text-[10px] text-black/40">{p.id}</div>
      </TableCell>

      {/* PRODUTO */}
      <TableCell className="align-middle">
        <div className="font-semibold text-[14px] leading-5">{p.name}</div>

        {desc ? (
          <div className="mt-1 text-xs text-black/60 line-clamp-2 max-w-[520px]" title={desc}>
            {desc}
          </div>
        ) : (
          <div className="mt-1 text-xs text-black/40">Sem descrição</div>
        )}

        {/* ID no mobile */}
        <div className="mt-2 font-mono text-[10px] text-black/40 md:hidden">{p.id}</div>
      </TableCell>

      {/* PREÇO */}
<TableCell className="align-middle whitespace-nowrap">
  <div className="font-semibold leading-5">
    {brl((p.effectivePrice ?? p.price) as string)}
  </div>

  {p.customerPrice ? (
    <div className="text-[11px] text-black/60 leading-4">
      Cliente: {brl(p.customerPrice)}
    </div>
  ) : (
    <div className="text-[11px] text-black/40 leading-4">Cliente: padrão</div>
  )}
</TableCell>

      {/* PROMO */}
      <TableCell className="align-middle">{promoBadge}</TableCell>

      {/* ESTOQUE */}
      <TableCell className="align-middle">
        <div className="flex flex-col items-start gap-1">
          <div className="font-semibold leading-5">{stock}</div>

          {stockLabel ? (
            <Badge className={`rounded-full px-2 py-0.5 text-[11px] ${stockBadgeClass}`}>{stockLabel}</Badge>
          ) : (
            <div className="h-[18px]" />
          )}
        </div>
      </TableCell>

      {/* STATUS */}
      <TableCell className="align-middle">
        <Badge className={`rounded-full ${statusCls}`}>{p.active ? "ATIVO" : "INATIVO"}</Badge>
      </TableCell>

      {/* AÇÕES */}
      <TableCell className="align-middle text-right">
        <Button asChild variant="outline" className="rounded-xl bg-white hover:bg-slate-50">
          <Link href={`/admin/products/${p.id}`}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
