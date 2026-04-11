"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Store,
  UserRound,
  Wallet,
  Clock3,
  Package2,
  ShieldCheck,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Order = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  paymentStatus?: string;
  adminApprovalStatus?: string;
  orderStatus?: string;
  status?: string;
  total?: string | number;
  salonName?: string;
  customerName?: string;
};

function fmtDate(iso?: string) {
  if (!iso) return "Não informado";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function brl(v?: string | number) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function idempotencyKey(orderId: string, action: string) {
  return `admin-order:${orderId}:${action}`;
}

function prettyStatus(value?: string | null) {
  if (!value) return "Não informado";
  return String(value).replaceAll("_", " ").toUpperCase();
}

function getStatusMeta(value?: string | null) {
  const normalized = String(value ?? "").toUpperCase();

  if (
    [
      "PAID",
      "APPROVED",
      "SUCCESS",
      "COMPLETED",
      "DONE",
      "DELIVERED",
    ].includes(normalized)
  ) {
    return {
      chip: "bg-emerald-600/10 text-emerald-700 ring-emerald-200",
      border: "border-emerald-200/80",
      soft: "bg-emerald-50/80",
    };
  }

  if (
    ["PENDING", "WAITING", "PROCESSING", "AWAITING", "UNDER_REVIEW"].includes(
      normalized
    )
  ) {
    return {
      chip: "bg-amber-600/10 text-amber-700 ring-amber-200",
      border: "border-amber-200/80",
      soft: "bg-amber-50/80",
    };
  }

  if (
    [
      "REJECTED",
      "FAILED",
      "CANCELED",
      "CANCELLED",
      "DENIED",
      "EXPIRED",
    ].includes(normalized)
  ) {
    return {
      chip: "bg-red-600/10 text-red-700 ring-red-200",
      border: "border-red-200/80",
      soft: "bg-red-50/80",
    };
  }

  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(normalized)) {
    return {
      chip: "bg-slate-600/10 text-slate-700 ring-slate-200",
      border: "border-slate-200/80",
      soft: "bg-slate-100/80",
    };
  }

  return {
    chip: "bg-zinc-600/10 text-zinc-700 ring-zinc-200",
    border: "border-zinc-200/80",
    soft: "bg-zinc-50/80",
  };
}

function StatusBadge({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: string | null;
  icon: ComponentType<{ className?: string }>;
}) {
  const meta = getStatusMeta(value);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3",
        meta.border,
        meta.soft
      )}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </div>
        <div
          className={cn(
            "mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
            meta.chip
          )}
        >
          {prettyStatus(value)}
        </div>
      </div>

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function MiniInfo({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  const hasValue =
    value !== undefined && value !== null && String(value).trim() !== "";

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-zinc-500">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>

      <div
        className={cn(
          "break-words text-sm text-zinc-900",
          !hasValue && "text-zinc-400",
          strong && "text-lg font-black"
        )}
      >
        {hasValue ? String(value) : "Não informado"}
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [recentActions, setRecentActions] = useState<
    Record<string, { action: "approve" | "reject"; at: number; order: Order }>
  >({});
  const ordersQ = useQuery({
    queryKey: ["orders", { take: 100 }],
    queryFn: async () => {
      const res = await api.get(endpoints.orders.list, { params: { take: 100 } });
      return (res.data?.items ?? []) as Order[];
    },
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

  const pending = useMemo(() => {
    return (ordersQ.data ?? []).filter((o) => {
      if (o.paymentStatus !== "PAID" || o.adminApprovalStatus !== "PENDING") return false;
      const recentAction = recentActions[o.id];
      return !recentAction || Date.now() - recentAction.at > 10 * 60_000;
    });
  }, [ordersQ.data, recentActions]);

  const approvedRecent = useMemo(() => {
    const fromBackend = (ordersQ.data ?? []).filter((o) => o.adminApprovalStatus === "APPROVED");
    const fromLocal = Object.values(recentActions)
      .filter((entry) => entry.action === "approve")
      .map((entry) => entry.order);

    const merged = [...fromLocal, ...fromBackend].reduce<Record<string, Order>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    return Object.values(merged)
      .sort((a, b) => {
        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return db - da;
      })
      .slice(0, 30);
  }, [ordersQ.data, recentActions]);

  const rejectedRecent = useMemo(() => {
    const fromBackend = (ordersQ.data ?? []).filter((o) => o.adminApprovalStatus === "REJECTED");
    const fromLocal = Object.values(recentActions)
      .filter((entry) => entry.action === "reject")
      .map((entry) => entry.order);

    const merged = [...fromLocal, ...fromBackend].reduce<Record<string, Order>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    return Object.values(merged)
      .sort((a, b) => {
        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return db - da;
      })
      .slice(0, 30);
  }, [ordersQ.data, recentActions]);

  const pendingTotal = useMemo(() => {
    const total = pending.reduce((acc, order) => {
      const value =
        typeof order.total === "string" ? Number(order.total) : order.total ?? 0;
      return Number.isFinite(value) ? acc + Number(value) : acc;
    }, 0);

    return brl(total) ?? "R$ 0,00";
  }, [pending]);

  const decideM = useMutation({
    mutationFn: async (vars: { orderId: string; action: "approve" | "reject" }) => {
      const { orderId, action } = vars;
      await api.patch(
        endpoints.adminOrders.decide(orderId),
        { action },
        { headers: { "Idempotency-Key": idempotencyKey(orderId, action) } }
      );
    },
    onSuccess: async (_data, vars) => {
      const sourceOrder = (ordersQ.data ?? []).find((order) => order.id === vars.orderId);
      if (sourceOrder) {
        setRecentActions((prev) => ({
          ...prev,
          [vars.orderId]: {
            action: vars.action,
            at: Date.now(),
            order: {
              ...sourceOrder,
              adminApprovalStatus: vars.action === "approve" ? "APPROVED" : "REJECTED",
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      }

      toast.success(
        vars.action === "approve"
          ? "Pedido aprovado. Agora ele está em Aprovados recentemente."
          : "Pedido reprovado. Agora ele está em Reprovados recentemente."
      );
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await ordersQ.refetch();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar/reprovar.")),
  });

  const actingOrderId = (decideM.variables as { orderId?: string } | undefined)?.orderId;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_45%,#f4f4f5_100%)]">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Aprovação de pedidos
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Acompanhe pendentes, aprovados e reprovados sem perder contexto
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full rounded-2xl border-zinc-200 bg-white sm:w-auto"
            onClick={() => ordersQ.refetch()}
            disabled={ordersQ.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", ordersQ.isFetching && "animate-spin")} />
            {ordersQ.isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <CardTitle className="text-xl font-bold text-zinc-950">
                Fila de aprovação
              </CardTitle>
              <CardDescription className="text-sm text-zinc-500">
                {ordersQ.isLoading ? "Carregando pedidos…" : "Tudo no mesmo lugar: Pendentes, Aprovados e Reprovados recentes."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
                            <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "pending" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("pending")}
                >
                  Pendentes ({pending.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "approved" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("approved")}
                >
                  Aprovados recentemente ({approvedRecent.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "rejected" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("rejected")}
                >
                  Reprovados recentemente ({rejectedRecent.length})
                </Button>
              </div>

              {ordersQ.isLoading ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  Carregando pedidos…
                </div>
              ) : ordersQ.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                  {apiErrorMessage(ordersQ.error, "Erro ao carregar pedidos.")}
                </div>
              ) : activeTab === "pending" && pending.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                  Nenhum pedido pendente no momento. Confira as abas de Aprovados/Reprovados recentes para rastrear movimentações.
                </div>
              ) : activeTab === "approved" && approvedRecent.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                  Ainda não há pedidos em Aprovados recentemente.
                </div>
              ) : activeTab === "rejected" && rejectedRecent.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                  Ainda não há pedidos em Reprovados recentemente.
                </div>
              ) : (
                <div className="space-y-3">
                  {(activeTab === "pending" ? pending : activeTab === "approved" ? approvedRecent : rejectedRecent).map((o) => {
                    const total = brl(o.total);
                    const busyThis = decideM.isPending && actingOrderId === o.id;
                    const orderStatus = o.orderStatus ?? o.status ?? null;

                    return (
                      <div
                        key={o.id}
                        className="overflow-hidden rounded-[28px] border border-zinc-200/80 bg-zinc-50/85 shadow-sm"
                      >
                        <div className="h-1 w-full bg-gradient-to-r from-zinc-950 via-zinc-700 to-zinc-400" />

                        <div className="space-y-4 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-black tracking-tight text-zinc-950">
                                  Pedido #{o.id.slice(0, 8)}
                                </h2>

                                {busyThis ? (
                                  <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                                    Processando…
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-1 text-sm text-zinc-500">
                                Criado em {fmtDate(o.createdAt)}
                              </div>

                              <div className="mt-1 break-all font-mono text-[12px] text-zinc-400">
                                ID completo: {o.id}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm">
                              <Clock3 className="h-4 w-4" />
                              <span>
                                {activeTab === "pending"
                                  ? "Pronto para decisão"
                                  : activeTab === "approved"
                                    ? "Movido para aprovados"
                                    : "Movido para reprovados"}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <MiniInfo icon={Store} label="Salão" value={o.salonName ?? null} />
                            <MiniInfo icon={UserRound} label="Cliente" value={o.customerName ?? null} />
                            <MiniInfo icon={Wallet} label="Total" value={total ?? null} strong />
                          </div>

                          <div className="grid gap-3 lg:grid-cols-3">
                            <StatusBadge
                              label="Pagamento"
                              value={o.paymentStatus}
                              icon={Wallet}
                            />
                            <StatusBadge
                              label="Pedido"
                              value={orderStatus}
                              icon={Package2}
                            />
                            <StatusBadge
                              label="Aprovação do admin"
                              value={o.adminApprovalStatus}
                              icon={ShieldCheck}
                            />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            {activeTab === "pending" ? (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="h-10 rounded-2xl border-zinc-200 bg-white"
                                      disabled={decideM.isPending}
                                    >
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Reprovar
                                    </Button>
                                  </AlertDialogTrigger>

                                  <AlertDialogContent className="rounded-[28px]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação altera apenas a aprovação do admin.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-2xl">
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl"
                                        onClick={() =>
                                          decideM.mutate({ orderId: o.id, action: "reject" })
                                        }
                                      >
                                        Confirmar reprovação
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      className="h-10 rounded-2xl"
                                      disabled={decideM.isPending}
                                    >
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Aprovar
                                    </Button>
                                  </AlertDialogTrigger>

                                  <AlertDialogContent className="rounded-[28px]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação libera o pedido para seguir o fluxo.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-2xl">
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl"
                                        onClick={() =>
                                          decideM.mutate({ orderId: o.id, action: "approve" })
                                        }
                                      >
                                        Confirmar aprovação
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            ) : activeTab === "approved" ? (
                              <>
                                <Link href={`/admin/orders/${o.id}`} className="block">
                                  <Button
                                    variant="outline"
                                    className="h-10 w-full rounded-2xl border-zinc-200 bg-white"
                                    disabled={decideM.isPending}
                                  >
                                    Abrir pedido
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href={`/admin/orders/${o.id}`} className="block">
                                  <Button className="h-10 w-full rounded-2xl" disabled={decideM.isPending}>
                                    Ir para expedição
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                  </Button>
                                </Link>
                              </>
                            ) : (
                              <div className="sm:col-span-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-600">
                                Pedido reprovado recentemente. Abra o detalhe para revisar contexto e histórico.
                              </div>
                            )}

                            <Link href={`/admin/orders/${o.id}`} className="block">
                              <Button
                                variant="outline"
                                className="h-10 w-full rounded-2xl border-zinc-200 bg-white"
                                disabled={decideM.isPending}
                              >
                                {activeTab === "pending" ? "Abrir detalhe" : "Abrir pedido"}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <CardTitle className="text-lg font-bold text-zinc-950">
                Resumo rápido
              </CardTitle>
              <CardDescription className="text-sm text-zinc-500">
                Visão geral da fila atual
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 p-4 sm:p-5">
              <MiniInfo icon={Clock3} label="Pendentes" value={String(pending.length)} strong />
              <MiniInfo icon={CheckCircle2} label="Aprovados recentes" value={String(approvedRecent.length)} />
              <MiniInfo icon={XCircle} label="Reprovados recentes" value={String(rejectedRecent.length)} />
              <MiniInfo icon={Wallet} label="Total em análise" value={pendingTotal} strong />
              <MiniInfo
                icon={ShieldCheck}
                label="Critério"
                value="PAID + admin PENDING (Pendentes)"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}