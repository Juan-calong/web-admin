"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Search } from "lucide-react";

function brl(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Range = "today" | "7d" | "30d";

type DashResponse = {
  ok: boolean;
  range: Range;
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
    "rounded-full px-2.5 py-1 text-xs font-medium border inline-flex items-center";

  if (label === "Pago") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>
        Pago
      </span>
    );
  }
  if (label === "Pendente") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>
        Pendente
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-100 text-slate-700 border-slate-200`}>
      {label}
    </span>
  );
}

function KpiCard({
  title,
  value,
  delta,
}: {
  title: string;
  value: string;
  delta: number;
}) {
  const up = delta >= 0;
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div className="text-2xl font-black tracking-tight">{value}</div>
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-semibold border",
              up
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200",
            ].join(" ")}
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

/** Mini gráfico (mock) — depois você liga com série real se quiser */
function RevenueLineChart({
  range,
  series,
}: {
  range: Range;
  series: Array<{ date: string; revenue: number }>;
}) {
  const rangeLabel = range === "today" ? "Hoje" : range === "7d" ? "7 dias" : "30 dias";

  const W = 620;
  const H = 160;
  const PAD = 10;

  const safe = series ?? [];
  const values = safe.map((x) => Number(x.revenue || 0));
  const max = Math.max(1, ...values);
  const min = 0;

  const n = Math.max(1, safe.length);
  const xStep = n <= 1 ? 0 : (W - PAD * 2) / (n - 1);

  function x(i: number) {
    return PAD + i * xStep;
  }

  function y(v: number) {
    const t = (Number(v) - min) / (max - min || 1);
    // invertendo (0 embaixo, max em cima)
    return PAD + (H - PAD * 2) * (1 - t);
  }

  const points = safe.map((p, i) => [x(i), y(p.revenue)]);

  const lineD =
    points.length <= 1
      ? `M ${PAD} ${y(values[0] ?? 0)}`
      : `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(([px, py]) => `L ${px} ${py}`).join(" ");

  const areaD =
    points.length <= 1
      ? `${lineD} L ${PAD} ${H - PAD} Z`
      : `${lineD} L ${points[points.length - 1][0]} ${H - PAD} L ${points[0][0]} ${H - PAD} Z`;

  const hasData = safe.some((x) => (x.revenue || 0) > 0);

  return (
    <div className="h-72 w-full rounded-xl border bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Receita do período</p>
          <p className="text-xs text-slate-500">
            {hasData ? "Baseado em pedidos pagos" : "Sem receita no período"}
          </p>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {rangeLabel}
        </Badge>
      </div>

      <div className="px-4 pb-4">
        <div className="relative h-52 w-full overflow-hidden rounded-lg bg-slate-50">
          {/* grid */}
          <div className="absolute inset-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-slate-200/70"
                style={{ top: `${(i + 1) * 20}%` }}
              />
            ))}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
            <path d={areaD} fill="rgba(59, 130, 246, 0.10)" />
            <path d={lineD} fill="none" stroke="#3b82f6" strokeWidth="3" />
          </svg>

          <div className="absolute bottom-2 left-3 text-[11px] text-slate-500">Início</div>
          <div className="absolute bottom-2 right-3 text-[11px] text-slate-500">Hoje</div>
          <div className="absolute left-3 top-3 text-[11px] text-slate-500">{brl(max)}</div>
        </div>
      </div>
    </div>
  );
}

function TopProductsBars({ rows }: { rows: Array<{ name: string; qty: number }> }) {
  const safe = rows ?? [];
  const max = Math.max(1, ...safe.map((r) => r.qty || 0));

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Top 5 Produtos</CardTitle>
        <CardDescription>Mais vendidos no período</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {safe.length === 0 ? (
          <div className="text-sm text-slate-600">Sem dados no período.</div>
        ) : (
          safe.map((r) => {
            const w = Math.round(((r.qty || 0) / max) * 100);
            return (
              <div key={r.name} className="grid grid-cols-[1fr_120px_42px] items-center gap-3">
                <p className="truncate text-sm text-slate-700">{r.name}</p>
                <div className="h-8 rounded-lg bg-slate-100 p-1">
                  <div className="h-full rounded-md bg-blue-400/90" style={{ width: `${w}%` }} />
                </div>
                <p className="text-sm font-semibold text-slate-800">{r.qty}</p>
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
      const { data } = await api.get(endpoints.adminDashboard.summary, { params: { range } });
      return data as DashResponse;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ✅ não pode dar toast no render
  useEffect(() => {
    if (dashQ.isError) {
      toast.error(apiErrorMessage(dashQ.error, "Erro ao carregar dashboard."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashQ.isError]);

  const topRows = useMemo(() => {
    return (dashQ.data?.topProducts ?? []).map((x) => ({ name: x.name, qty: x.qty }));
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
    <div className="min-h-[calc(100vh-2rem)] bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <main className="space-y-6">
          {/* Top bar */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-black">Painel do Admin</h1>
                <p className="text-sm text-slate-600">
                  Somente pedidos contabilizados (pagos e aprovados)
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar pedido..."
                    className="h-10 w-full rounded-xl pl-9 sm:w-72"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2 rounded-xl border bg-white p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "rounded-lg",
                      range === "today" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : ""
                    )}
                    onClick={() => setRange("today")}
                  >
                    Hoje
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "rounded-lg",
                      range === "7d" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : ""
                    )}
                    onClick={() => setRange("7d")}
                  >
                    7 dias
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "rounded-lg",
                      range === "30d" ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : ""
                    )}
                    onClick={() => setRange("30d")}
                  >
                    30 dias
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Receita"
              value={brl(dashQ.data?.kpis.revenue ?? 0)}
              delta={dashQ.data?.kpisDelta.revenuePct ?? 0}
            />
            <KpiCard
              title="Pedidos"
              value={String(dashQ.data?.kpis.ordersCount ?? 0)}
              delta={dashQ.data?.kpisDelta.ordersPct ?? 0}
            />
            <KpiCard
              title="Itens vendidos"
              value={String(dashQ.data?.kpis.itemsSold ?? 0)}
              delta={dashQ.data?.kpisDelta.itemsPct ?? 0}
            />
            <KpiCard
              title="Ticket médio"
              value={brl(dashQ.data?.kpis.avgTicket ?? 0)}
              delta={dashQ.data?.kpisDelta.avgTicketPct ?? 0}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RevenueLineChart
                range={range}
                series={dashQ.data?.revenueSeries ?? []}
                />
            </div>
            <TopProductsBars rows={topRows} />
          </div>

          {/* Table */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Últimos pedidos</CardTitle>
              <CardDescription>Somente os contabilizados</CardDescription>
            </CardHeader>
            <CardContent>
              {dashQ.isLoading ? (
                <div className="text-sm text-slate-700">Carregando…</div>
              ) : dashQ.isError ? (
                <div className="text-sm text-rose-700">
                  {apiErrorMessage(dashQ.error, "Erro ao carregar dashboard.")}
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-[220px]">Código</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[220px]">Data</TableHead>
                          <TableHead className="w-[140px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-sm text-slate-600">
                              Nenhum pedido encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredOrders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell className="font-semibold text-slate-800">
                                {o.code}
                                <div className="mt-1 font-mono text-[10px] text-slate-400">{o.id}</div>
                              </TableCell>
                              <TableCell className="font-semibold">{brl(o.total)}</TableCell>
                              <TableCell>
                                <StatusChip label={o.statusLabel ?? "Pago"} />
                              </TableCell>
                              <TableCell className="text-slate-600">
                                {new Date(o.createdAt).toLocaleString("pt-BR")}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild variant="outline" className="rounded-xl">
                                  <Link href={`/admin/orders?code=${encodeURIComponent(o.code)}`}>Ver</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button asChild className="rounded-xl">
                      <Link href="/admin/orders">Ver pedidos</Link>
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => dashQ.refetch()}
                      disabled={dashQ.isFetching}
                    >
                      {dashQ.isFetching ? "Atualizando…" : "Atualizar"}
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
