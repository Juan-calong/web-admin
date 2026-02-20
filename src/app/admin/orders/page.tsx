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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  total?: string | number;
  salonName?: string;
};

function fmtDate(iso?: string) {
  if (!iso) return "";
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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function idempotencyKey(orderId: string, action: string) {
  return `admin-order:${orderId}:${action}`;
}

function StatusBadge({ value }: { value?: string }) {
  return (
    <Badge variant="outline" className="rounded-full bg-white">
      {value ?? "-"}
    </Badge>
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
    refetchOnWindowFocus: false,
    retry: false,
  });

  const pending = useMemo(() => {
    return (ordersQ.data ?? []).filter((o) => o.paymentStatus === "PAID" && o.adminApprovalStatus === "PENDING");
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
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black">Pedidos pendentes</h1>
          <p className="text-sm text-black/60">Pagos (PAID) aguardando aprovação (PENDING)</p>
        </div>

        <Button
          variant="outline"
          className="rounded-xl w-full sm:w-auto"
          onClick={() => ordersQ.refetch()}
          disabled={ordersQ.isFetching}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", ordersQ.isFetching ? "animate-spin" : "")} />
          {ordersQ.isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Fila</CardTitle>
          <CardDescription>{ordersQ.isLoading ? "Carregando…" : `${pending.length} pendente(s)`}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {ordersQ.isLoading ? (
            <div className="text-sm">Carregando…</div>
          ) : ordersQ.isError ? (
            <div className="text-sm text-red-600">{apiErrorMessage(ordersQ.error, "Erro ao carregar pedidos.")}</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-black/70">Nenhum pedido pendente 🎉</div>
          ) : (
            <div className="grid gap-3">
              {pending.map((o) => {
                const total = brl(o.total);
                const busyThis = decideM.isPending && actingOrderId === o.id;

                return (
                  <div key={o.id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {/* Info */}
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold break-words">
                          Pedido #{o.id.slice(0, 8)}{" "}
                          {busyThis ? <span className="text-xs text-black/50">• Processando…</span> : null}
                        </div>

                        <div className="text-sm text-black/60 break-words">
                          {o.salonName ? `Salão: ${o.salonName} • ` : ""}
                          {fmtDate(o.createdAt)}
                          {total ? ` • ${total}` : ""}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatusBadge value={o.paymentStatus} />
                          <StatusBadge value={o.adminApprovalStatus} />
                        </div>

                        <div className="pt-1 text-xs text-black/50 break-all">
                          ID completo: <span className="font-mono">{o.id}</span>
                        </div>
                      </div>

                      {/* Actions: grid on mobile, row on desktop */}
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" className="rounded-xl w-full" disabled={decideM.isPending}>
                              Reprovar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação muda o status de aprovação do admin.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl"
                                onClick={() => decideM.mutate({ orderId: o.id, action: "reject" })}
                              >
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button className="rounded-xl w-full" disabled={decideM.isPending}>
                              Aprovar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação libera o pedido para seguir o fluxo.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl"
                                onClick={() => decideM.mutate({ orderId: o.id, action: "approve" })}
                              >
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        {/* "Abrir" full width on mobile (spans 2 cols) */}
                        <Link href={`/admin/orders/${o.id}`} className="col-span-2 sm:col-span-1">
                          <Button variant="outline" className="rounded-xl w-full" disabled={decideM.isPending}>
                            Abrir
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
