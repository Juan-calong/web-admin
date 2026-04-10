"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ArrowRight } from "lucide-react";

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

function formatStatus(value?: string | null) {
  if (!value) return "Não informado";
  return String(value).toUpperCase();
}

function badgeClasses(value?: string | null) {
  const v = String(value ?? "").toUpperCase();

  if (["PAID", "APPROVED", "SUCCESS"].includes(v)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["PENDING", "WAITING", "PROCESSING"].includes(v)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (["REJECTED", "FAILED", "CANCELED", "CANCELLED", "DENIED"].includes(v)) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(v)) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (!value) {
    return "border-dashed border-black/15 bg-black/[0.03] text-black/45";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const hasValue =
    value !== undefined && value !== null && String(value).trim() !== "";

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </div>
      <div className={cn("mt-1 text-sm", hasValue ? "text-black" : "text-black/45")}>
        {hasValue ? String(value) : "Não informado"}
      </div>
    </div>
  );
}

function LabeledStatus({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </div>
      <span
        className={cn(
          "mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
          badgeClasses(value)
        )}
      >
        {formatStatus(value)}
      </span>
    </div>
  );
}

export default function AdminOrdersPage() {
  const qc = useQueryClient();

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
    return (ordersQ.data ?? []).filter(
      (o) => o.paymentStatus === "PAID" && o.adminApprovalStatus === "PENDING"
    );
  }, [ordersQ.data]);

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
      toast.success(vars.action === "approve" ? "Pedido aprovado." : "Pedido reprovado.");
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await ordersQ.refetch();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar/reprovar.")),
  });

  const actingOrderId = (decideM.variables as { orderId?: string } | undefined)?.orderId;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Pedidos pendentes</h1>
          <p className="text-sm text-black/60">
            Pagamentos já confirmados e aguardando decisão do admin
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full rounded-xl sm:w-auto"
          onClick={() => ordersQ.refetch()}
          disabled={ordersQ.isFetching}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", ordersQ.isFetching ? "animate-spin" : "")} />
          {ordersQ.isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      <Card className="rounded-2xl border-black/10 shadow-sm">
        <CardHeader>
          <CardTitle>Fila de aprovação</CardTitle>
          <CardDescription>
            {ordersQ.isLoading ? "Carregando…" : `${pending.length} pedido(s) aguardando aprovação`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {ordersQ.isLoading ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-black/60">
              Carregando pedidos…
            </div>
          ) : ordersQ.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {apiErrorMessage(ordersQ.error, "Erro ao carregar pedidos.")}
            </div>
          ) : pending.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-sm text-black/60">
              Nenhum pedido pendente no momento.
            </div>
          ) : (
            <div className="grid gap-4">
              {pending.map((o) => {
                const total = brl(o.total);
                const busyThis = decideM.isPending && actingOrderId === o.id;
                const orderStatus = o.orderStatus ?? o.status ?? null;

                return (
                  <div
                    key={o.id}
                    className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="break-words text-base font-bold">
                              Pedido #{o.id.slice(0, 8)}
                            </div>
                            {busyThis ? (
                              <span className="text-xs font-medium text-black/45">
                                Processando…
                              </span>
                            ) : null}
                          </div>

                          <div className="text-sm text-black/60">
                            Criado em {fmtDate(o.createdAt)}
                          </div>

                          <div className="break-all text-xs text-black/45">
                            ID completo: <span className="font-mono">{o.id}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[420px]">
                          <LabeledStatus label="Pagamento" value={o.paymentStatus} />
                          <LabeledStatus label="Pedido" value={orderStatus} />
                          <LabeledStatus
                            label="Aprovação do admin"
                            value={o.adminApprovalStatus}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <InfoField label="Salão" value={o.salonName ?? null} />
                        <InfoField label="Cliente" value={o.customerName ?? null} />
                        <InfoField label="Total" value={total ?? null} />
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:justify-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full rounded-xl"
                              disabled={decideM.isPending}
                            >
                              Reprovar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação altera apenas a aprovação do admin.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl"
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
                              className="w-full rounded-xl"
                              disabled={decideM.isPending}
                            >
                              Aprovar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação libera o pedido para seguir o fluxo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl"
                                onClick={() =>
                                  decideM.mutate({ orderId: o.id, action: "approve" })
                                }
                              >
                                Confirmar aprovação
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <Link href={`/admin/orders/${o.id}`}>
                          <Button
                            variant="outline"
                            className="w-full rounded-xl"
                            disabled={decideM.isPending}
                          >
                            Abrir detalhe
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
    </div>
  );
}