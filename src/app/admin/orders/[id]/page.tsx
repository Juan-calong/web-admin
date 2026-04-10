"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CreditCard,
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
    orderStatus?: string | null;
    status?: string | null;
    totalAmount?: string | number;
    total?: string | number;

    customer?: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      cpf?: string | null;
      cnpj?: string | null;
    } | null;

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
      phone?: string | null;
    } | null;

    address?: {
      cep?: string | null;
      street?: string | null;
      number?: string | null;
      district?: string | null;
      city?: string | null;
      state?: string | null;
      complement?: string | null;
    } | null;

    payment?: {
      method?: string | null;
      transactionId?: string | null;
      paidAt?: string | null;
      refundedAt?: string | null;
      refundStatus?: string | null;
    } | null;

    refund?: {
      status?: string | null;
      amount?: string | number | null;
      reason?: string | null;
      requestedAt?: string | null;
      refundedAt?: string | null;
    } | null;

    items?: Array<{
      id: string;
      qty?: number | null;
      unitPrice?: string | number | null;
      totalPrice?: string | number | null;
      product?: { name?: string | null; sku?: string | null } | null;
    }>;
  };
};

function fmtDate(iso?: string | null) {
  if (!iso) return "Não informado";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function brl(v?: string | number | null) {
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
  return String(value).toUpperCase();
}

function badgeTone(value?: string | null) {
  const normalized = String(value ?? "").toUpperCase();

  if (["PAID", "APPROVED", "SUCCESS"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["PENDING", "WAITING", "PROCESSING"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (["REJECTED", "FAILED", "CANCELED", "CANCELLED", "DENIED"].includes(normalized)) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(normalized)) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (!value) {
    return "border-dashed border-black/15 bg-black/[0.03] text-black/45";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-black/10 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  const hasValue =
    value !== undefined && value !== null && String(value).trim() !== "";

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm break-words",
          hasValue ? "text-black" : "text-black/45",
          mono ? "font-mono" : ""
        )}
      >
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
      <Badge
        variant="outline"
        className={cn("mt-2 rounded-full bg-white", badgeTone(value))}
      >
        {prettyStatus(value)}
      </Badge>
    </div>
  );
}

function formatAddressLines(address?: {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
  cep?: string | null;
} | null) {
  if (!address) return [];

  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.district, address.city, address.state].filter(Boolean).join(" • ");
  const line3 = [address.cep, address.complement].filter(Boolean).join(" • ");

  return [line1, line2, line3].filter(Boolean);
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

  const total = useMemo(
    () => brl(order?.totalAmount ?? order?.total),
    [order?.totalAmount, order?.total]
  );

  const orderStatus = order?.orderStatus ?? order?.status ?? null;
  const salonAddressLines = formatAddressLines(order?.salon ?? null);
  const deliveryAddressLines = formatAddressLines(order?.address ?? null);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 lg:px-6">
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
            <h1 className="text-xl font-black break-words sm:text-2xl">
              Pedido {order?.code ? `#${order.code}` : `#${id.slice(0, 8)}`}
            </h1>

            <p className="text-sm text-black/60 break-words">
              {fmtDate(order?.createdAt)}
              {total ? ` • ${total}` : ""}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full rounded-xl sm:w-auto"
          onClick={() => detailsQ.refetch()}
          disabled={detailsQ.isFetching}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", detailsQ.isFetching ? "animate-spin" : "")} />
          Atualizar
        </Button>
      </div>

      {detailsQ.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(detailsQ.error, "Erro ao carregar detalhes.")}
        </div>
      ) : null}

      {order ? (
        <>
          <Section
            title="Resumo do pedido"
            description="Status separados por contexto para evitar ambiguidade"
          >
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <LabeledStatus label="Pagamento" value={order?.paymentStatus} />
              <LabeledStatus label="Pedido" value={orderStatus} />
              <LabeledStatus label="Aprovação do admin" value={order?.adminApprovalStatus} />
              <InfoField label="Código do pedido" value={order?.code ?? null} />
              <InfoField label="Criado em" value={fmtDate(order?.createdAt)} />
              <InfoField label="Total" value={total ?? null} />
            </div>
          </Section>

          <div className="grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
            <div className="space-y-4">
              <Section title="Cliente / Salão">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-black/70">Cliente</div>
                    <div className="grid gap-3">
                      <InfoField label="Nome" value={order?.customer?.name ?? null} />
                      <InfoField label="E-mail" value={order?.customer?.email ?? null} />
                      <InfoField label="Telefone" value={order?.customer?.phone ?? null} />
                      <InfoField
                        label="Documento"
                        value={order?.customer?.cpf ?? order?.customer?.cnpj ?? null}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-black/70">Salão</div>
                    <div className="grid gap-3">
                      <InfoField label="Nome" value={order?.salon?.name ?? null} />
                      <InfoField label="E-mail" value={order?.salon?.email ?? null} />
                      <InfoField label="Telefone" value={order?.salon?.phone ?? null} />
                      <InfoField label="CNPJ" value={order?.salon?.cnpj ?? null} />
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Endereço">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-black/70">Endereço do salão</div>
                    {salonAddressLines.length ? (
                      <div className="rounded-xl border bg-white p-3 text-sm whitespace-pre-wrap break-words">
                        {salonAddressLines.join("\n")}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-3 text-sm text-black/45">
                        Endereço do salão não informado.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-black/70">Endereço de entrega</div>
                    {deliveryAddressLines.length ? (
                      <div className="rounded-xl border bg-white p-3 text-sm whitespace-pre-wrap break-words">
                        {deliveryAddressLines.join("\n")}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-3 text-sm text-black/45">
                        Endereço de entrega não informado.
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="Itens">
                {(order.items ?? []).length ? (
                  <div className="space-y-3">
                    {(order.items ?? []).map((it) => {
                      const itemTotal =
                        it.totalPrice != null && it.totalPrice !== ""
                          ? brl(it.totalPrice)
                          : it.qty != null && it.unitPrice != null
                            ? brl(Number(it.qty) * Number(it.unitPrice))
                            : null;

                      return (
                        <div key={it.id} className="rounded-xl border bg-white p-4 text-sm">
                          <div className="grid gap-3 md:grid-cols-4">
                            <InfoField label="Produto" value={it.product?.name ?? "Produto"} />
                            <InfoField label="SKU" value={it.product?.sku ?? null} />
                            <InfoField label="Quantidade" value={it.qty ?? null} />
                            <InfoField
                              label="Preço unitário"
                              value={brl(it.unitPrice) ?? null}
                            />
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <InfoField label="Total do item" value={itemTotal ?? null} />
                            <InfoField label="ID do item" value={it.id} mono />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-black/45">
                    Nenhum item retornado para este pedido.
                  </div>
                )}
              </Section>
            </div>

            <div className="space-y-4">
              <Section title="Pagamento">
                <div className="grid gap-3">
                  <InfoField label="Status do pagamento" value={order?.paymentStatus ?? null} />
                  <InfoField label="Método" value={order?.payment?.method ?? null} />
                  <InfoField
                    label="ID da transação"
                    value={order?.payment?.transactionId ?? null}
                    mono
                  />
                  <InfoField label="Pago em" value={fmtDate(order?.payment?.paidAt)} />
                </div>
              </Section>

              <Section title="Ações do admin">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Observação interna (opcional)</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Adicione uma observação para aprovação ou reprovação…"
                      className="min-h-[90px] rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button className="w-full rounded-xl" disabled={decideM.isPending}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Aprovar pedido
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A observação será enviada junto, se estiver preenchida.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl"
                            onClick={() => decideM.mutate("approve")}
                          >
                            Confirmar aprovação
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full rounded-xl"
                          disabled={decideM.isPending}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reprovar pedido
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A observação será enviada junto, se estiver preenchida.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl"
                            onClick={() => decideM.mutate("reject")}
                          >
                            Confirmar reprovação
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Section>

              <Section title="Reembolso">
                <div className="space-y-3">
                  <div className="grid gap-3">
                    <InfoField
                      label="Status do reembolso"
                      value={order?.refund?.status ?? order?.payment?.refundStatus ?? null}
                    />
                    <InfoField
                      label="Valor reembolsado"
                      value={brl(order?.refund?.amount ?? null) ?? null}
                    />
                    <InfoField
                      label="Solicitado em"
                      value={fmtDate(order?.refund?.requestedAt)}
                    />
                    <InfoField
                      label="Concluído em"
                      value={fmtDate(order?.refund?.refundedAt ?? order?.payment?.refundedAt)}
                    />
                    <InfoField
                      label="Motivo"
                      value={order?.refund?.reason ?? null}
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <div className="grid gap-2">
                      <Label>Valor do reembolso (opcional)</Label>
                      <Input
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder='Ex.: "10.00" (vazio = total)'
                        className="rounded-xl"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Motivo do reembolso (opcional)</Label>
                      <Textarea
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="Explique o motivo do reembolso…"
                        className="min-h-[70px] rounded-xl"
                      />
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full rounded-xl"
                          disabled={refundM.isPending}
                        >
                          <CreditCard className="mr-2 h-4 w-4" />
                          Solicitar reembolso
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar reembolso?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Você está prestes a solicitar o reembolso deste pedido.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl"
                            onClick={() => refundM.mutate()}
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Section>

              <Section title="Identificação técnica">
                <div className="grid gap-3">
                  <InfoField label="ID completo do pedido" value={order.id} mono />
                </div>
              </Section>
            </div>
          </div>
        </>
      ) : detailsQ.isLoading ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-black/60">
          Carregando detalhe do pedido…
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-black/60">
          Sem detalhes para este pedido.
        </div>
      )}
    </div>
  );
}