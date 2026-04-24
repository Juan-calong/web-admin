"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock3,
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
  deliveryType?: "LOCAL" | "CORREIOS" | "UNKNOWN" | string | null;
  shippingCarrier?: string | null;
  shippingServiceCode?: string | null;
  shippingServiceName?: string | null;
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

function normalizeDeliveryValue(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function resolveDeliveryType(order: Order): "LOCAL" | "CORREIOS" | "UNKNOWN" {
  const candidates = [
    order.deliveryType,
    order.shippingCarrier,
    order.shippingServiceName,
    order.shippingServiceCode,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDeliveryValue(candidate);
    if (!normalized) continue;

    if (
      ["LOCAL", "ENTREGA_LOCAL", "LOCAL_DELIVERY"].some(
        (token) => normalized === token || normalized.includes(token)
      )
    ) {
      return "LOCAL";
    }

    if (normalized === "CORREIOS" || normalized.includes("CORREIOS")) {
      return "CORREIOS";
    }
  }

  return "UNKNOWN";
}

function getDeliveryBadgeMeta(deliveryType: "LOCAL" | "CORREIOS" | "UNKNOWN") {
  if (deliveryType === "LOCAL") {
    return {
      label: "Entrega local",
      classes:
        "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 ring-emerald-200",
    };
  }

  if (deliveryType === "CORREIOS") {
    return {
      label: "Correios",
      classes: "border-sky-200/80 bg-sky-50/90 text-sky-700 ring-sky-200",
    };
  }

  return {
    label: "Entrega não identificada",
    classes: "border-zinc-200/80 bg-zinc-50/90 text-zinc-700 ring-zinc-200",
  };
}


function StatusBadge({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const meta = getStatusMeta(value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        meta.border,
        meta.soft,
        meta.chip
      )}
    >
           <span className="uppercase tracking-[0.14em] text-[10px] text-zinc-500">{label}</span>
      <span>{prettyStatus(value)}</span>
    </span>
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
                    const deliveryType = resolveDeliveryType(o);
                    const deliveryBadge = getDeliveryBadgeMeta(deliveryType);

                    return (
                      <div
                        key={o.id}
                        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/85 p-3 shadow-sm"                      >
                        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-sm font-black tracking-tight text-zinc-950">
                                Pedido #{o.id.slice(0, 8)}
                              </h2>
                              <span className="text-xs text-zinc-500">Criado em {fmtDate(o.createdAt)}</span>

                              {busyThis ? (
                                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Processando…
                                </span>
                              ) : null}
                            </div>

                            <div className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-3 sm:gap-3">
                              <div className="min-w-0 truncate">
                                <span className="text-zinc-500">Cliente:</span>{" "}
                                <span className="font-medium text-zinc-900">{o.customerName ?? "Não informado"}</span>
                              </div>
                              <div className="min-w-0 truncate">
                                <span className="text-zinc-500">Salão:</span>{" "}
                                <span className="font-medium text-zinc-900">{o.salonName ?? "Não informado"}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-zinc-500">Total:</span>{" "}
                                <span className="font-bold text-zinc-950">{total ?? "Não informado"}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge label="Pagamento" value={o.paymentStatus} />
                              <StatusBadge label="Pedido" value={orderStatus} />
                              <StatusBadge label="Admin" value={o.adminApprovalStatus} />
                                <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                  deliveryBadge.classes
                                )}
                              >
                                <span className="uppercase tracking-[0.14em] text-[10px] text-zinc-500">
                                  Entrega
                                </span>
                                <span>{deliveryBadge.label}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {activeTab === "pending"
                                  ? "Pronto para decisão"
                                  : activeTab === "approved"
                                    ? "Movido para aprovados"
                                    : "Movido para reprovados"}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[360px]">
                            {activeTab === "pending" ? (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 rounded-xl border-zinc-200 bg-white px-3 text-xs"
                                      disabled={decideM.isPending}
                                    >
                                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
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
                                      size="sm"
                                      className="h-8 rounded-xl px-3 text-xs"
                                      disabled={decideM.isPending}
                                    >
                                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
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
                              <div className="sm:col-span-3">
                                <Link href={`/admin/orders/${o.id}`} className="block">
                                  <Button
                                    size="sm"
                                    className="h-8 w-full rounded-xl px-3 text-xs"
                                    disabled={decideM.isPending}
                                  >
                                    Abrir pedido
                                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            ) : (
                              <div className="sm:col-span-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs text-zinc-600">                                Pedido reprovado recentemente. Abra o detalhe para revisar contexto e histórico.
                              </div>
                            )}

                            {activeTab !== "approved" ? (
                              <Link href={`/admin/orders/${o.id}`} className="block">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-full rounded-xl border-zinc-200 bg-white px-3 text-xs"
                                  disabled={decideM.isPending}
                                >
                                  {activeTab === "pending" ? "Abrir detalhe" : "Abrir pedido"}
                                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            ) : null}
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
              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Pendentes</span>
                  <span className="font-bold text-zinc-950">{pending.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Aprovados recentes</span>
                  <span className="font-semibold text-zinc-900">{approvedRecent.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Reprovados recentes</span>
                  <span className="font-semibold text-zinc-900">{rejectedRecent.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Total em análise</span>
                  <span className="font-bold text-zinc-950">{pendingTotal}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-xs text-zinc-600">
                Critério de Pendentes: paymentStatus = PAID e adminApprovalStatus = PENDING.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}