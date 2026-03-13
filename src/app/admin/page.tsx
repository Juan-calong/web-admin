"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package2,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
  Wallet,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function brl(v: number) {
  return (v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type Range = "today" | "7d" | "30d";

type DashResponse = {
  ok: boolean;
  range: Range;

  userRoleCounts: {
    salon: number;
    seller: number;
    customer: number;
    total: number;
  };

  revenueSeries: Array<{ date: string; revenue: number }>;

  kpis: {
    revenue: number;
    ordersCount: number;
    itemsSold: number;
    avgTicket: number;
  };

  kpisDelta: {
    revenuePct: number;
    ordersPct: number;
    itemsPct: number;
    avgTicketPct: number;
  };

  lastOrders: Array<{
    id: string;
    code: string;
    total: number;
    createdAt: string;
    statusLabel?: string;
  }>;

  topProducts: Array<{
    productId: string;
    name: string;
    qty: number;
  }>;
};

function StatusChip({ label }: { label: string }) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold";

  if (label === "Pago") {
    return (
      <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        Pago
      </span>
    );
  }

  if (label === "Pendente") {
    return (
      <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>
        Pendente
      </span>
    );
  }

  return (
    <span className={`${base} border-slate-200 bg-slate-100 text-slate-700`}>
      {label}
    </span>
  );
}

function RangeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn(
        "h-9 rounded-lg px-4 text-sm font-semibold",
        active
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function RoleStatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "dark";
}) {
  const dark = tone === "dark";

  return (
    <Card
      className={cn(
        "rounded-2xl border shadow-sm transition-all",
        dark
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white"
      )}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                dark ? "text-slate-200" : "text-slate-600"
              )}
            >
              {title}
            </p>

            <div className="mt-3 text-3xl font-black tracking-tight md:text-[2rem]">
              {value}
            </div>
          </div>

          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              dark
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-200 bg-slate-50 text-slate-700"
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({
  title,
  value,
  delta,
  icon: Icon,
}: {
  title: string;
  value: string;
  delta: number;
  icon: LucideIcon;
}) {
  const up = delta >= 0;

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-600">{title}</p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="text-2xl font-black tracking-tight text-slate-950 md:text-[2rem]">
            {value}
          </div>

          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-bold",
              up
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            )}
          >
            {up ? "+" : ""}
            {Number(delta || 0).toFixed(1)}%
          </span>
        </div>

        <p className="mt-2 text-xs text-slate-500">vs período anterior</p>
      </CardContent>
    </Card>
  );
}

function RevenueLineChart({
  range,
  series,
}: {
  range: Range;
  series: Array<{ date: string; revenue: number }>;
}) {
  const rangeLabel =
    range === "today" ? "Hoje" : range === "7d" ? "7 dias" : "30 dias";

  const W = 900;
  const H = 260;
  const PAD_X = 24;
  const PAD_TOP = 22;
  const PAD_BOTTOM = 34;

  const safe = series ?? [];
  const values = safe.map((x) => Number(x.revenue || 0));
  const hasData = safe.some((x) => Number(x.revenue || 0) > 0);

  const maxValue = hasData ? Math.max(...values) : 0;
  const max = Math.max(1, maxValue);
  const min = 0;

  const n = Math.max(1, safe.length);
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const xStep = n <= 1 ? 0 : chartW / (n - 1);

  function x(i: number) {
    return PAD_X + i * xStep;
  }

  function y(v: number) {
    const t = (Number(v) - min) / (max - min || 1);
    return PAD_TOP + chartH * (1 - t);
  }

  const points = safe.map((p, i) => [x(i), y(p.revenue)] as const);

  const lineD =
    points.length <= 1
      ? `M ${PAD_X} ${y(values[0] ?? 0)}`
      : `M ${points[0][0]} ${points[0][1]} ` +
        points
          .slice(1)
          .map(([px, py]) => `L ${px} ${py}`)
          .join(" ");

  const areaD =
    points.length <= 1
      ? `${lineD} L ${PAD_X} ${H - PAD_BOTTOM} Z`
      : `${lineD} L ${points[points.length - 1][0]} ${H - PAD_BOTTOM} L ${points[0][0]} ${H - PAD_BOTTOM} Z`;

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            Receita do período
          </CardTitle>
          <CardDescription className="mt-1">
            {hasData ? "Baseado em pedidos pagos e aprovados" : "Sem receita no período"}
          </CardDescription>
        </div>

        <Badge className="rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
          {rangeLabel}
        </Badge>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="relative h-[260px] w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          <div className="absolute inset-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-slate-200"
                style={{ top: `${22 + i * 22}%` }}
              />
            ))}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="revenueArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.03" />
              </linearGradient>
            </defs>

            <path d={areaD} fill="url(#revenueArea)" />
            <path
              d={lineD}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="absolute left-4 top-3 text-[11px] font-medium text-slate-500">
            {brl(maxValue)}
          </div>
          <div className="absolute bottom-3 left-4 text-[11px] font-medium text-slate-500">
            Início
          </div>
          <div className="absolute bottom-3 right-4 text-[11px] font-medium text-slate-500">
            Hoje
          </div>

          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-500">
                Nenhuma movimentação no período
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TopProductsBars({ rows }: { rows: Array<{ name: string; qty: number }> }) {
  const safe = rows ?? [];
  const max = Math.max(1, ...safe.map((r) => r.qty || 0));

  return (
    <Card className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold text-slate-900">
          Top 5 Produtos
        </CardTitle>
        <CardDescription>Mais vendidos no período</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {safe.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Sem dados no período.
          </div>
        ) : (
          safe.map((r) => {
            const w = Math.max(8, Math.round(((r.qty || 0) / max) * 100));

            return (
              <div key={r.name} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-slate-700">{r.name}</p>
                  <span className="text-sm font-bold text-slate-900">{r.qty}</span>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminHome() {
  const [range, setRange] = useState<Range>("30d");
  const [search, setSearch] = useState("");

  const dashQ = useQuery({
    queryKey: ["admin-dashboard-summary", range],
    queryFn: async () => {
      const { data } = await api.get(endpoints.adminDashboard.summary, {
        params: { range },
      });
      return data as DashResponse;
    },
    retry: false,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  useEffect(() => {
    if (dashQ.isError) {
      toast.error(apiErrorMessage(dashQ.error, "Erro ao carregar dashboard."));
    }
  }, [dashQ.isError, dashQ.error]);

  const topRows = useMemo(() => {
    return (dashQ.data?.topProducts ?? []).map((x) => ({
      name: x.name,
      qty: x.qty,
    }));
  }, [dashQ.data?.topProducts]);

  const filteredOrders = useMemo(() => {
    const rows = dashQ.data?.lastOrders ?? [];
    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((o) => {
      return (
        o.code?.toLowerCase().includes(q) ||
        o.statusLabel?.toLowerCase().includes(q) ||
        o.id?.toLowerCase().includes(q)
      );
    });
  }, [dashQ.data?.lastOrders, search]);

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-slate-100/70">
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
        <main className="space-y-5">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                      <LayoutDashboard className="h-5 w-5" />
                    </div>

                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                        Painel do Admin
                      </h1>
                      <p className="mt-1 text-sm text-slate-500">
                        Resumo geral da operação e pedidos contabilizados
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
                  <div className="relative w-full xl:w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Buscar pedido..."
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-slate-300"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-1 xl:w-auto xl:justify-start">
                    <RangeButton active={range === "today"} onClick={() => setRange("today")}>
                      Hoje
                    </RangeButton>
                    <RangeButton active={range === "7d"} onClick={() => setRange("7d")}>
                      7 dias
                    </RangeButton>
                    <RangeButton active={range === "30d"} onClick={() => setRange("30d")}>
                      30 dias
                    </RangeButton>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <RoleStatCard
              title="Salões"
              value={dashQ.data?.userRoleCounts.salon ?? 0}
              icon={Store}
            />
            <RoleStatCard
              title="Vendedores"
              value={dashQ.data?.userRoleCounts.seller ?? 0}
              icon={ShoppingBag}
            />
            <RoleStatCard
              title="Clientes"
              value={dashQ.data?.userRoleCounts.customer ?? 0}
              icon={Users}
            />
            <RoleStatCard
              title="Total"
              value={dashQ.data?.userRoleCounts.total ?? 0}
              icon={LayoutDashboard}
              tone="dark"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Receita"
              value={brl(dashQ.data?.kpis.revenue ?? 0)}
              delta={dashQ.data?.kpisDelta.revenuePct ?? 0}
              icon={Wallet}
            />
            <KpiCard
              title="Pedidos"
              value={String(dashQ.data?.kpis.ordersCount ?? 0)}
              delta={dashQ.data?.kpisDelta.ordersPct ?? 0}
              icon={ShoppingCart}
            />
            <KpiCard
              title="Itens vendidos"
              value={String(dashQ.data?.kpis.itemsSold ?? 0)}
              delta={dashQ.data?.kpisDelta.itemsPct ?? 0}
              icon={Package2}
            />
            <KpiCard
              title="Ticket médio"
              value={brl(dashQ.data?.kpis.avgTicket ?? 0)}
              delta={dashQ.data?.kpisDelta.avgTicketPct ?? 0}
              icon={Wallet}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_360px]">
            <RevenueLineChart
              range={range}
              series={dashQ.data?.revenueSeries ?? []}
            />

            <TopProductsBars rows={topRows} />
          </div>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900">
                Últimos pedidos
              </CardTitle>
              <CardDescription>Somente os contabilizados</CardDescription>
            </CardHeader>

            <CardContent>
              {dashQ.isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                  Carregando dashboard...
                </div>
              ) : dashQ.isError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-sm text-rose-700">
                  {apiErrorMessage(dashQ.error, "Erro ao carregar dashboard.")}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="font-semibold text-slate-600">Código</TableHead>
                          <TableHead className="font-semibold text-slate-600">Total</TableHead>
                          <TableHead className="font-semibold text-slate-600">Status</TableHead>
                          <TableHead className="font-semibold text-slate-600">Data</TableHead>
                          <TableHead className="text-right font-semibold text-slate-600">
                            Ações
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                              Nenhum pedido encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredOrders.map((o) => (
                            <TableRow key={o.id} className="hover:bg-slate-50/70">
                              <TableCell className="font-semibold text-slate-900">
                                <div className="flex flex-col">
                                  <span>{o.code}</span>
                                  <span className="mt-1 font-mono text-[10px] text-slate-400">
                                    {o.id}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="font-semibold text-slate-900">
                                {brl(o.total)}
                              </TableCell>

                              <TableCell>
                                <StatusChip label={o.statusLabel ?? "Pago"} />
                              </TableCell>

                              <TableCell className="text-slate-600">
                                {new Date(o.createdAt).toLocaleString("pt-BR")}
                              </TableCell>

                              <TableCell className="text-right">
                                <Button
                                  asChild
                                  variant="outline"
                                  className="rounded-xl border-slate-200"
                                >
                                  <Link href={`/admin/orders?code=${encodeURIComponent(o.code)}`}>
                                    Ver
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button asChild className="rounded-xl bg-slate-900 hover:bg-slate-800">
                      <Link href="/admin/orders" className="text-white">Ver pedidos</Link>
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl border-slate-200"
                      onClick={() => dashQ.refetch()}
                      disabled={dashQ.isFetching}
                    >
                      {dashQ.isFetching ? "Atualizando..." : "Atualizar"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}