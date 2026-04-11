"use client";

import {
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Package2,
  Store,
  UserRound,
  MapPin,
  ReceiptText,
  Wallet,
  ShieldCheck,
  Hash,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OrderShippingPanel } from "@/components/admin/OrderShippingPanel";

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

    deliveryAddress?: {
      cep?: string | null;
      street?: string | null;
      number?: string | null;
      district?: string | null;
      city?: string | null;
      state?: string | null;
      complement?: string | null;
    } | null;

    shippingAddress?: {
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
      card: "border-emerald-200/80 bg-emerald-50/80",
      bar: "bg-emerald-500",
      chip: "bg-emerald-600/10 text-emerald-700 ring-emerald-200",
      icon: "bg-white text-emerald-700",
      hint: "Fluxo confirmado",
    };
  }

  if (
    ["PENDING", "WAITING", "PROCESSING", "AWAITING", "UNDER_REVIEW"].includes(
      normalized
    )
  ) {
    return {
      card: "border-amber-200/80 bg-amber-50/80",
      bar: "bg-amber-500",
      chip: "bg-amber-600/10 text-amber-700 ring-amber-200",
      icon: "bg-white text-amber-700",
      hint: "Aguardando evolução",
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
      card: "border-red-200/80 bg-red-50/80",
      bar: "bg-red-500",
      chip: "bg-red-600/10 text-red-700 ring-red-200",
      icon: "bg-white text-red-700",
      hint: "Exige atenção",
    };
  }

  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(normalized)) {
    return {
      card: "border-slate-200/80 bg-slate-100/80",
      bar: "bg-slate-500",
      chip: "bg-slate-600/10 text-slate-700 ring-slate-200",
      icon: "bg-white text-slate-700",
      hint: "Fluxo financeiro ajustado",
    };
  }

  return {
    card: "border-zinc-200/80 bg-zinc-50/90",
    bar: "bg-zinc-400",
    chip: "bg-zinc-600/10 text-zinc-700 ring-zinc-200",
    icon: "bg-white text-zinc-700",
    hint: "Sem definição clara",
  };
}

function SectionShell({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}

          <div className="min-w-0">
            <CardTitle className="text-lg font-bold text-zinc-950">
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="mt-1 text-sm text-zinc-500">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">{children}</CardContent>
    </Card>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  strong?: boolean;
}) {
  return (
    <div className="rounded-[26px] border border-white/70 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>

      <div
        className={cn(
          "mt-2 break-words text-zinc-950",
          strong ? "text-2xl font-black" : "text-base font-semibold"
        )}
      >
        {value || "Não informado"}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value?: string | null;
  icon: ComponentType<{ className?: string }>;
}) {
  const meta = getStatusMeta(value);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border p-4 shadow-sm",
        meta.card
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1", meta.bar)} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {title}
          </div>

          <div
            className={cn(
              "mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
              meta.chip
            )}
          >
            {prettyStatus(value)}
          </div>

          <div className="mt-3 text-sm text-zinc-600">{meta.hint}</div>
        </div>

        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm",
            meta.icon
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
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

  const text = hasValue ? String(value) : "Não informado";
  const breakAll = mono || text.includes("@");

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>

      <div
        className={cn(
          "mt-1 text-sm text-zinc-900",
          !hasValue && "text-zinc-400",
          breakAll ? "break-all" : "break-words",
          mono && "font-mono text-[13px]"
        )}
      >
        {text}
      </div>
    </div>
  );
}

function InfoGrid({
  rows,
}: {
  rows: Array<{
    label: string;
    value?: string | number | null;
    mono?: boolean;
  }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <InfoField
          key={row.label}
          label={row.label}
          value={row.value}
          mono={row.mono}
        />
      ))}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
      {text}
    </div>
  );
}

function PersonPanel({
  title,
  icon: Icon,
  rows,
  emptyText,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  rows: Array<{
    label: string;
    value?: string | number | null;
    mono?: boolean;
  }>;
  emptyText: string;
}) {
  const hasSomeData = rows.some(
    (row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== ""
  );

  return (
    <div className="rounded-[28px] border border-zinc-200/80 bg-zinc-50/85 p-4">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-bold">{title}</div>
      </div>

      {hasSomeData ? <InfoGrid rows={rows} /> : <EmptyBlock text={emptyText} />}
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
  const line2 = [address.district, address.city, address.state]
    .filter(Boolean)
    .join(" • ");
  const line3 = [address.cep, address.complement].filter(Boolean).join(" • ");

  return [line1, line2, line3].filter(Boolean);
}

function AddressBlock({
  title,
  lines,
  emptyText,
}: {
  title: string;
  lines: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-[28px] border border-zinc-200/80 bg-zinc-50/85 p-4">
      <div className="mb-3 text-sm font-bold text-zinc-900">{title}</div>

      {lines.length ? (
        <div className="space-y-2 text-sm leading-6 text-zinc-700">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 break-words shadow-sm"
            >
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-500">{emptyText}</div>
      )}
    </div>
  );
}

export default function AdminOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const router = useRouter();
  const qc = useQueryClient();

  const [note, setNote] = useState("");

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
      toast.success(
        action === "approve" ? "Pedido aprovado." : "Pedido reprovado."
      );
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["admin-order-details", id] });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, "Falha ao aprovar/reprovar.")),
  });

  const total = useMemo(
    () => brl(order?.totalAmount ?? order?.total),
    [order?.totalAmount, order?.total]
  );

  const orderStatus = order?.orderStatus ?? order?.status ?? null;

  const salonAddressLines = formatAddressLines(order?.salon ?? null);
  const deliveryAddressLines = formatAddressLines(
    order?.deliveryAddress ?? order?.shippingAddress ?? order?.address ?? null
  );

  const customerRows = [
    { label: "Nome", value: order?.customer?.name ?? null },
    { label: "E-mail", value: order?.customer?.email ?? null },
    { label: "Telefone", value: order?.customer?.phone ?? null },
    {
      label: "Documento",
      value: order?.customer?.cpf ?? order?.customer?.cnpj ?? null,
    },
  ];

  const salonRows = [
    { label: "Nome", value: order?.salon?.name ?? null },
    { label: "E-mail", value: order?.salon?.email ?? null },
    { label: "Telefone", value: order?.salon?.phone ?? null },
    { label: "CNPJ", value: order?.salon?.cnpj ?? null },
  ];

  const hasPaymentData = Boolean(
    order?.paymentStatus ||
      order?.payment?.method ||
      order?.payment?.transactionId ||
      order?.payment?.paidAt
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_45%,#f4f4f5_100%)]">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="rounded-2xl border-zinc-200 bg-white"
                onClick={() => router.back()}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>

              <Link
                href="/admin/orders"
                className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
              >
                Pedidos
              </Link>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
                Pedido {order?.code ? `#${order.code}` : `#${id.slice(0, 8)}`}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Visual mais claro, com foco em leitura rápida e decisão do admin
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full rounded-2xl border-zinc-200 bg-white sm:w-auto"
            onClick={() => detailsQ.refetch()}
            disabled={detailsQ.isFetching}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", detailsQ.isFetching && "animate-spin")}
            />
            Atualizar
          </Button>
        </div>

        {detailsQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiErrorMessage(detailsQ.error, "Erro ao carregar detalhes.")}
          </div>
        ) : null}

        {order ? (
          <>
            <Card className="overflow-hidden rounded-[36px] border border-zinc-200/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.98),rgba(250,250,250,0.96),rgba(244,244,245,0.94))] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardContent className="p-4 sm:p-6 lg:p-7">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-zinc-600 shadow-sm">
                      <ReceiptText className="h-4 w-4" />
                      Resumo principal
                    </div>

                    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-sm">
                      <div className="text-sm font-medium text-zinc-500">Código</div>
                      <div className="mt-1 text-3xl font-black tracking-tight text-zinc-950">
                        {order?.code ? `#${order.code}` : `#${id.slice(0, 8)}`}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <SummaryMetric
                        icon={CalendarDays}
                        label="Criado em"
                        value={fmtDate(order?.createdAt)}
                      />
                      <SummaryMetric
                        icon={Wallet}
                        label="Total"
                        value={total ?? "Não informado"}
                        strong
                      />
                      <SummaryMetric
                        icon={Hash}
                        label="ID curto"
                        value={id.slice(0, 8)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
                    <StatusCard
                      title="Pagamento"
                      value={order?.paymentStatus}
                      icon={Wallet}
                    />
                    <StatusCard
                      title="Pedido"
                      value={orderStatus}
                      icon={Package2}
                    />
                    <StatusCard
                      title="Aprovação do admin"
                      value={order?.adminApprovalStatus}
                      icon={ShieldCheck}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <SectionShell
                  title="Cliente e salão"
                  description="Informações principais de quem comprou e de quem recebe o pedido"
                  icon={UserRound}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <PersonPanel
                      title="Cliente"
                      icon={UserRound}
                      rows={customerRows}
                      emptyText="Dados do cliente não informados no payload atual."
                    />

                    <PersonPanel
                      title="Salão"
                      icon={Store}
                      rows={salonRows}
                      emptyText="Dados do salão não informados no payload atual."
                    />
                  </div>
                </SectionShell>

                <SectionShell
                  title="Endereços"
                  description="Origem e destino vinculados ao pedido"
                  icon={MapPin}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <AddressBlock
                      title="Endereço do salão"
                      lines={salonAddressLines}
                      emptyText="Endereço do salão não informado."
                    />

                    <AddressBlock
                      title="Endereço de entrega"
                      lines={deliveryAddressLines}
                      emptyText="Endereço de entrega não informado."
                    />
                  </div>
                </SectionShell>

                <SectionShell
                  title="Itens do pedido"
                  description="Produtos, quantidades e valores em um formato mais limpo"
                  icon={Package2}
                >
                  {(order.items ?? []).length ? (
                    <div className="space-y-3">
                      {(order.items ?? []).map((it, index) => {
                        const itemTotal =
                          it.totalPrice != null && it.totalPrice !== ""
                            ? brl(it.totalPrice)
                            : it.qty != null && it.unitPrice != null
                              ? brl(Number(it.qty) * Number(it.unitPrice))
                              : null;

                        return (
                          <div
                            key={it.id}
                            className="rounded-[28px] border border-zinc-200/80 bg-zinc-50/85 p-4 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                  Item {index + 1}
                                </div>

                                <div className="mt-1 break-words text-lg font-black text-zinc-950">
                                  {it.product?.name ?? "Produto"}
                                </div>

                                <div className="mt-1 text-sm text-zinc-500">
                                  SKU: {it.product?.sku || "Não informado"}
                                </div>
                              </div>

                              <div className="rounded-[22px] border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                  Total do item
                                </div>
                                <div className="mt-1 text-xl font-black text-zinc-950">
                                  {itemTotal ?? "Não informado"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <InfoField
                                label="Quantidade"
                                value={it.qty ?? null}
                              />
                              <InfoField
                                label="Preço unitário"
                                value={brl(it.unitPrice) ?? null}
                              />
                              <InfoField
                                label="ID do item"
                                value={it.id}
                                mono
                              />
                              <InfoField
                                label="SKU"
                                value={it.product?.sku ?? null}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyBlock text="Nenhum item retornado para este pedido." />
                  )}
                </SectionShell>
              </div>

              <div className="space-y-5">
                <SectionShell
                  title="Pagamento"
                  description="Resumo financeiro principal do pedido"
                  icon={Wallet}
                >
                  {hasPaymentData ? (
                    <div className="space-y-3">
                      <StatusCard
                        title="Situação financeira"
                        value={order?.paymentStatus}
                        icon={Wallet}
                      />

                      <InfoGrid
                        rows={[
                          {
                            label: "Método",
                            value: order?.payment?.method ?? null,
                          },
                          {
                            label: "Pago em",
                            value: fmtDate(order?.payment?.paidAt),
                          },
                          {
                            label: "ID da transação",
                            value: order?.payment?.transactionId ?? null,
                            mono: true,
                          },
                          {
                            label: "Valor total",
                            value: total ?? null,
                          },
                        ]}
                      />
                    </div>
                  ) : (
                    <EmptyBlock text="Dados de pagamento ainda não enviados por este payload." />
                  )}
                </SectionShell>

                  <OrderShippingPanel
                  orderId={id}
                  paymentStatus={order?.paymentStatus}
                  adminApprovalStatus={order?.adminApprovalStatus}
                  orderStatus={orderStatus}
                />

                <SectionShell
                  title="Ações do admin"
                  description="Área de aprovação e reprovação com observação interna"
                  icon={ShieldCheck}
                >
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 p-4">
                      <Label className="text-sm font-semibold text-zinc-800">
                        Observação interna
                      </Label>

                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Adicione uma observação para aprovação ou reprovação…"
                        className="mt-3 min-h-[120px] rounded-[22px] border-zinc-200 bg-white"
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className="h-11 rounded-2xl" disabled={decideM.isPending}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Aprovar pedido
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent className="rounded-[28px]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A observação será enviada junto, se estiver preenchida.
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-2xl">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-2xl"
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
                            className="h-11 rounded-2xl border-zinc-200"
                            disabled={decideM.isPending}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reprovar pedido
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent className="rounded-[28px]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A observação será enviada junto, se estiver preenchida.
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-2xl">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="rounded-2xl"
                              onClick={() => decideM.mutate("reject")}
                            >
                              Confirmar reprovação
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </SectionShell>

                <SectionShell
                  title="Identificação técnica"
                  description="Apoio para suporte, rastreio e debug"
                  icon={ReceiptText}
                >
                  <InfoGrid
                    rows={[
                      {
                        label: "ID completo do pedido",
                        value: order.id,
                        mono: true,
                      },
                      {
                        label: "Código exibido",
                        value: order?.code ?? id.slice(0, 8),
                      },
                    ]}
                  />
                </SectionShell>
              </div>
            </div>
          </>
        ) : detailsQ.isLoading ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-600">
            Carregando detalhe do pedido…
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-600">
            Sem detalhes para este pedido.
          </div>
        )}
      </div>
    </div>
  );
}