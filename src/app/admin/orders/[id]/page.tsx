"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, CreditCard } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

type OrderDetails = {
  order: {
    id: string;
    code?: string | null;
    createdAt?: string;
    paymentStatus?: string;
    adminApprovalStatus?: string;
    totalAmount?: string | number;
    total?: string | number;

    salon?: {
      name?: string | null;
      email?: string | null;
      cnpj?: string | null;
      cep?: string | null;
      street?: string | null;
      number?: string | null;
      district?: string | null;
      city?: string | null;
      state?: string | null;
      complement?: string | null;
    } | null;

    items?: Array<{
      id: string;
      qty?: number | null;
      unitPrice?: string | number | null;
      product?: { name?: string | null; sku?: string | null } | null;
    }>;
  };
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

function formatAddress(salon?: OrderDetails["order"]["salon"] | null) {
  if (!salon) return "-";
  const line1 = [salon.street, salon.number].filter(Boolean).join(", ");
  const line2 = [salon.district, salon.city, salon.state].filter(Boolean).join(" • ");
  const line3 = [salon.cep, salon.complement].filter(Boolean).join(" • ");
  return [line1, line2, line3].filter(Boolean).join("\n");
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

export default function AdminOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const router = useRouter();
  const qc = useQueryClient();

  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const detailsQ = useQuery({
    queryKey: ["admin-order-details", id],
    queryFn: async () => {
      const res = await api.get(endpoints.adminOrders.details(id));
      return res.data as OrderDetails;
    },
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const order = detailsQ.data?.order;

  const decideM = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      await api.patch(
        endpoints.adminOrders.decide(id),
        { action, note: note?.trim() || undefined },
        { headers: { "Idempotency-Key": idempotencyKey(id, action) } }
      );
    },
    onSuccess: async (_d, action) => {
      toast.success(action === "approve" ? "Pedido aprovado." : "Pedido reprovado.");
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["admin-order-details", id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar/reprovar.")),
  });

  const refundM = useMutation({
    mutationFn: async () => {
      await api.post(
        endpoints.adminOrders.refund(id),
        { amount: refundAmount || undefined, reason: refundReason || undefined },
        { headers: { "Idempotency-Key": idempotencyKey(id, "refund") } }
      );
    },
    onSuccess: async () => {
      toast.success("Reembolso solicitado.");
      setRefundAmount("");
      setRefundReason("");
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["admin-order-details", id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao reembolsar.")),
  });

  const total = useMemo(() => brl(order?.totalAmount ?? order?.total), [order?.totalAmount, order?.total]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>

            <Link href="/admin/orders" className="text-sm text-black/60 hover:text-black">
              Pedidos
            </Link>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black break-words">
              Pedido {order?.code ? `#${order.code}` : `#${id.slice(0, 8)}`}
            </h1>

            <p className="text-sm text-black/60 break-words">
              {order?.createdAt ? fmtDate(order.createdAt) : ""}
              {total ? ` • ${total}` : ""}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge value={order?.paymentStatus} />
              <StatusBadge value={order?.adminApprovalStatus} />
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="rounded-xl w-full sm:w-auto"
          onClick={() => detailsQ.refetch()}
          disabled={detailsQ.isFetching}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", detailsQ.isFetching ? "animate-spin" : "")} />
          Atualizar
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Detalhes</CardTitle>
          <CardDescription>{detailsQ.isLoading ? "Carregando…" : "Informações do pedido e ações do admin."}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {detailsQ.isError ? (
            <div className="text-sm text-red-600">{apiErrorMessage(detailsQ.error, "Erro ao carregar detalhes.")}</div>
          ) : null}

          {order ? (
            <>
              {/* Two columns only on md+; mobile is single column */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Salon */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Salão</div>
                  <div className="rounded-xl border bg-white p-3 text-sm">
                    <div className="font-medium break-words">{order.salon?.name ?? "-"}</div>
                    <div className="text-black/60 break-all">{order.salon?.email ?? ""}</div>

                    <div className="mt-2">
                      <div className="text-xs text-black/60">Endereço</div>
                      <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/5 p-3 text-sm mt-1">
                        {formatAddress(order.salon)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Ações do Admin</div>

                  <div className="space-y-2">
                    <Label>Observação (opcional)</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota interna…"
                      className="min-h-[90px] rounded-xl"
                    />
                  </div>

                  {/* Approve/Reject: stack on mobile */}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button className="rounded-xl w-full sm:w-auto" disabled={decideM.isPending}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Aprovar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                          <AlertDialogDescription>A observação (se preenchida) será enviada junto.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="rounded-xl" onClick={() => decideM.mutate("approve")}>
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="rounded-xl w-full sm:w-auto" disabled={decideM.isPending}>
                          <XCircle className="mr-2 h-4 w-4" />
                          Reprovar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                          <AlertDialogDescription>A observação (se preenchida) será enviada junto.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="rounded-xl" onClick={() => decideM.mutate("reject")}>
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <Separator />

                  {/* Refund */}
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Reembolso</div>

                    <div className="grid gap-2">
                      <div className="grid gap-2">
                        <Label>Valor (opcional)</Label>
                        <Input
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder='Ex.: "10.00" (vazio = total)'
                          className="rounded-xl"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label>Motivo (opcional)</Label>
                        <Textarea
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          placeholder="Motivo do reembolso…"
                          className="min-h-[70px] rounded-xl"
                        />
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="rounded-xl w-full sm:w-auto" disabled={refundM.isPending}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Reembolsar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar reembolso?</AlertDialogTitle>
                            <AlertDialogDescription>Você está prestes a solicitar o reembolso deste pedido.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                            <AlertDialogAction className="rounded-xl" onClick={() => refundM.mutate()}>
                              Confirmar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Items */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Itens</div>

                <div className="space-y-2">
                  {(order.items ?? []).length ? (
                    (order.items ?? []).map((it) => (
                      <div
                        key={it.id}
                        className="rounded-xl border bg-white p-3 text-sm"
                      >
                        {/* mobile: coluna; sm+: linha */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium break-words">{it.product?.name ?? "Produto"}</div>
                            {it.product?.sku ? (
                              <div className="text-xs text-black/60 break-all">SKU: {it.product.sku}</div>
                            ) : null}
                          </div>

                          <div className="shrink-0 text-left sm:text-right">
                            <div>Qtd: {it.qty ?? "-"}</div>
                            {it.unitPrice != null ? (
                              <div className="text-xs text-black/60">
                                Unit: {brl(it.unitPrice) ?? String(it.unitPrice)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-black/60">Sem itens.</div>
                  )}
                </div>
              </div>

              <div className="text-xs text-black/50 break-all">
                ID completo: <span className="font-mono">{order.id}</span>
              </div>
            </>
          ) : detailsQ.isLoading ? (
            <div className="text-sm text-black/60">Carregando…</div>
          ) : (
            <div className="text-sm text-black/60">Sem detalhes.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
