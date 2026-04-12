"use client";

import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import {
  Loader2,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
  Wrench,
  CircleDot,
} from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { endpoints } from "@/lib/endpoints";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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


type ShipmentStatus =
  | "NOT_CREATED"
  | "PRE_POSTED"
  | "LABEL_READY"
  | "POSTED"
  | "CANCELED"
  | "ERROR";

type ShipmentProvider = "CORREIOS" | string;

type ShipmentDetails = {
  id?: string;
  provider: ShipmentProvider;
  shipmentStatus: ShipmentStatus;
  orderId: string;
  prePostagemId?: string | null;
  trackingCode?: string | null;
  serviceCode?: string | null;
  serviceName?: string | null;
  labelUrl?: string | null;
  labelFileKey?: string | null;
  labelFormat?: string | null;
  generatedAt?: string | null;
  printedAt?: string | null;
  postedAt?: string | null;
  lastError?: string | null;
  diagnostics?: string[] | null;
};

type ShipmentResponse = {
  shipment?: ShipmentDetails | null;
  item?: ShipmentDetails | null;
} & Partial<ShipmentDetails>;

type Eligibility = {
  ok: boolean;
  reason: string;
};


function fmtDate(value?: string | null) {
  if (!value) return "Não informado";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Data inválida";
  return dt.toLocaleString("pt-BR");
}

function normalizedShipment(data: ShipmentResponse | ShipmentDetails | null | undefined): ShipmentDetails | null {
  if (!data) return null;

  const maybeWrapped = data as ShipmentResponse;
  const item = maybeWrapped.shipment ?? maybeWrapped.item;

  if (item) return item;

  if ((data as ShipmentDetails).shipmentStatus) return data as ShipmentDetails;

  return null;
}

function isCanceledOrder(orderStatus?: string | null) {
  const v = String(orderStatus ?? "").toUpperCase();
  return ["CANCELED", "CANCELLED", "REJECTED", "REFUNDED"].includes(v);
}

function badgeClass(status: ShipmentStatus) {
  if (status === "POSTED" || status === "LABEL_READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "PRE_POSTED") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "ERROR" || status === "CANCELED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function shipmentLabel(status?: ShipmentStatus | null) {
  if (!status || status === "NOT_CREATED") return "Etiqueta ainda não gerada";
  if (status === "PRE_POSTED") return "Pré-postagem criada";
  if (status === "LABEL_READY") return "Etiqueta pronta para impressão";
  if (status === "POSTED") return "Pedido marcado como postado";
  if (status === "CANCELED") return "Expedição cancelada";
  return "Erro na expedição";
}

function classifyError(err: unknown) {
  const msg = apiErrorMessage(err, "Falha na operação de expedição.");

  if (typeof err === "object" && err && "isAxiosError" in err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;

    if (status === 401) return "Sua sessão expirou ou não está autorizada.";
    if (status === 403) return "Seu usuário não tem permissão para operar expedição.";
    if (status && status >= 500) return "Serviço indisponível no momento. Tente novamente.";
  }

  return msg;
}

function normalizeShippingErrorCode(raw?: string | null) {
  if (!raw) return "";
  const direct = String(raw).trim().toUpperCase();
  const match = direct.match(/[A-Z_]{3,}/);
  return (match?.[0] ?? direct).trim();
}

function isLocalDelivery({
  deliveryMethod,
  shipment,
}: {
  deliveryMethod?: string | null;
  shipment?: ShipmentDetails | null;
}) {
  const candidateText = [
    deliveryMethod,
    shipment?.serviceCode,
    shipment?.serviceName,
    shipment?.lastError,
    ...(shipment?.diagnostics ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    candidateText.includes("LOCAL_DELIVERY") ||
    candidateText.includes("ENTREGA_LOCAL") ||
    candidateText.includes("ENTREGA LOCAL")
  );
}

function friendlyShipmentErrorMessage({
  lastError,
  deliveryMethod,
  shipment,
}: {
  lastError?: string | null;
  deliveryMethod?: string | null;
  shipment?: ShipmentDetails | null;
}) {
  const errorCode = normalizeShippingErrorCode(lastError);
  const localDeliveryOrder = isLocalDelivery({ deliveryMethod, shipment });

  if (localDeliveryOrder) {
    return "Este pedido usa entrega local e não pode gerar etiqueta dos Correios.";
  }

  if (errorCode === "SHIPMENT_REQUIRED_FIELDS_MISSING") {
    return "Faltam dados obrigatórios para gerar a etiqueta.";
  }

  if (errorCode === "SERVICE_CODE_MISSING_FOR_SHIPMENT") {
    return "Pedido sem serviço válido dos Correios para expedição.";
  }

  if (errorCode === "SERVICE_CODE_INVALID_FOR_SHIPMENT") {
    return "Serviço dos Correios inválido para gerar a etiqueta deste pedido.";
  }

  if (!lastError) return null;
  return "Não foi possível processar a expedição deste pedido no momento.";
}

async function fetchShipping(orderId: string): Promise<ShipmentDetails | null> {
  const { data } = await api.get(endpoints.adminOrderShipping.byOrder(orderId));
  return normalizedShipment(data as ShipmentResponse);
}

function buildEligibility({
  paymentStatus,
  adminApprovalStatus,
  orderStatus,
  hasLabel,
}: {
  paymentStatus?: string | null;
  adminApprovalStatus?: string | null;
  orderStatus?: string | null;
  hasLabel: boolean;
}): Eligibility {
  if (String(paymentStatus ?? "").toUpperCase() !== "PAID") {
    return { ok: false, reason: "Pagamento ainda não confirmado para expedição." };
  }

  if (String(adminApprovalStatus ?? "").toUpperCase() !== "APPROVED") {
    return { ok: false, reason: "Pedido ainda não aprovado para expedição." };
  }

  if (isCanceledOrder(orderStatus)) {
    return { ok: false, reason: "Pedido cancelado não é elegível para expedição." };
  }

  if (hasLabel) {
    return { ok: false, reason: "Etiqueta já gerada. Use imprimir ou reimprimir." };
  }

  return { ok: true, reason: "Pedido apto para gerar etiqueta." };
}


export function OrderShippingPanel({
  orderId,
  paymentStatus,
  adminApprovalStatus,
  orderStatus,
  deliveryMethod,
}: {
  orderId: string;
  paymentStatus?: string | null;
  adminApprovalStatus?: string | null;
  orderStatus?: string | null;
  deliveryMethod?: string | null;
}) {
  const qc = useQueryClient();

  const shippingQ = useQuery({
    queryKey: ["admin-order-shipping", orderId],
    queryFn: () => fetchShipping(orderId),
    enabled: Boolean(orderId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const shipment = shippingQ.data;
  const shipmentStatus = shipment?.shipmentStatus ?? "NOT_CREATED";
  const hasLabel = Boolean(
    shipment?.labelUrl ||
      shipment?.labelFileKey ||
      shipmentStatus === "LABEL_READY" ||
      shipmentStatus === "POSTED"
  );

  const eligibility = useMemo(
    () => buildEligibility({ paymentStatus, adminApprovalStatus, orderStatus, hasLabel }),
    [adminApprovalStatus, hasLabel, orderStatus, paymentStatus]
  );

  async function syncShippingQueries() {
    await qc.invalidateQueries({ queryKey: ["admin-order-shipping", orderId] });
    await qc.invalidateQueries({ queryKey: ["admin-order-details", orderId] });
    await qc.invalidateQueries({ queryKey: ["orders"] });
  }

  const generateM = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        endpoints.adminOrderShipping.generateLabel(orderId),
        {},
        { headers: { "Idempotency-Key": `admin-shipping:${orderId}:generate-label` } }
      );
      return normalizedShipment(data as ShipmentResponse);
    },
    onSuccess: async () => {
      toast.success("Etiqueta pronta para impressão.");
      await syncShippingQueries();
    },
    onError: (err) => toast.error(classifyError(err)),
  });

  const reprintM = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        endpoints.adminOrderShipping.reprintLabel(orderId),
        {},
        { headers: { "Idempotency-Key": `admin-shipping:${orderId}:reprint-label` } }
      );
      return normalizedShipment(data as ShipmentResponse);
    },
    onSuccess: async () => {
      toast.success("Etiqueta preparada para reimpressão.");
      await syncShippingQueries();
    },
    onError: (err) => toast.error(classifyError(err)),
  });

  const printedM = useMutation({
    mutationFn: async () => {
      await api.post(endpoints.adminOrderShipping.markPrinted(orderId), {});
    },
    onSuccess: async () => {
      await syncShippingQueries();
    },
    onError: (err) => toast.error(classifyError(err)),
  });

  const postedM = useMutation({
    mutationFn: async () => {
      await api.post(
        endpoints.adminOrderShipping.markPosted(orderId),
        {},
        { headers: { "Idempotency-Key": `admin-shipping:${orderId}:mark-posted` } }
      );
    },
    onSuccess: async () => {
      toast.success("Pedido marcado como postado.");
      await syncShippingQueries();
    },
    onError: (err) => toast.error(classifyError(err)),
  });

  const printM = useMutation({
    mutationFn: async () => {
      const response = await api.get(endpoints.adminOrderShipping.label(orderId), {
        responseType: "blob",
      });

      const blob = response.data as Blob;
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("Etiqueta vazia ou inválida retornada pelo backend.");
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onSuccess: async () => {
      toast.success("Etiqueta aberta para impressão no navegador.");
      printedM.mutate();
    },
    onError: (err) => toast.error(classifyError(err)),
  });

  const busy =
    shippingQ.isFetching ||
    generateM.isPending ||
    reprintM.isPending ||
    printM.isPending ||
    postedM.isPending ||
    printedM.isPending;
  const canMarkPosted = hasLabel && (shipmentStatus === "PRE_POSTED" || shipmentStatus === "LABEL_READY");
  const markPostedDisabledReason = (() => {
    if (shipmentStatus === "POSTED") return "Pedido já marcado como postado.";
    if (!hasLabel || shipmentStatus === "NOT_CREATED") return "Gere a etiqueta antes de marcar como postado.";
    if (!canMarkPosted) return "A postagem só pode ser confirmada após pré-postagem ou etiqueta pronta.";
    return null;
  })();
  const friendlyLastError = friendlyShipmentErrorMessage({
    lastError: shipment?.lastError,
    deliveryMethod,
    shipment,
  });
  const technicalErrorCode = normalizeShippingErrorCode(shipment?.lastError);

      const summaryMessage = (() => {
    if (shippingQ.isLoading) return "Carregando dados de expedição...";
    if (shippingQ.isError) return "Não foi possível carregar a expedição.";
    if (!shipment) return "Etiqueta ainda não gerada.";
    if (shipmentStatus === "LABEL_READY") return "Etiqueta pronta para impressão.";
    if (shipmentStatus === "POSTED") return "Pedido marcado como postado.";
    if (!eligibility.ok && !hasLabel) return eligibility.reason;
    return "Painel de expedição sincronizado.";
  })();


  return (
    <Card className="overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-950">Correios / Expedição</CardTitle>
            <p className="mt-1 text-sm text-zinc-500">
              Fluxo por pedido: gerar etiqueta, imprimir e confirmar postagem.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl border-zinc-200"
            onClick={() => shippingQ.refetch()}
            disabled={busy}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${shippingQ.isFetching ? "animate-spin" : ""}`} />
            Atualizar expedição
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        {shippingQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {classifyError(shippingQ.error)}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Transportadora" value={shipment?.provider ?? "CORREIOS"} />
          <InfoCard
            label="Status da expedição"
            value={
              <Badge className={`rounded-full border px-2.5 py-0.5 ${badgeClass(shipmentStatus)}`}>
                {shipmentLabel(shipmentStatus)}
              </Badge>
            }
          />
          <InfoCard label="Código de rastreio" value={shipment?.trackingCode || "Não informado"} mono />
          <InfoCard label="Serviço" value={shipment?.serviceName || shipment?.serviceCode || "Não informado"} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard label="Data de geração" value={fmtDate(shipment?.generatedAt)} />
          <InfoCard label="Data de impressão" value={fmtDate(shipment?.printedAt)} />
          <InfoCard label="Data de postagem" value={fmtDate(shipment?.postedAt)} />
        </div>

        {!eligibility.ok && !hasLabel ? (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Pedido não elegível para gerar etiqueta</div>
              <div>{eligibility.reason}</div>
            </div>
          </div>
        ) : null}

        {shipment?.lastError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="font-semibold">Último erro de expedição</div>
            <div>{friendlyLastError}</div>
{technicalErrorCode ? (
  <div className="mt-1 text-xs text-red-600/80">Código técnico: {technicalErrorCode}</div>
) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button
            type="button"
            className="rounded-2xl"
            onClick={() => generateM.mutate()}
            disabled={!eligibility.ok || busy}
          >
            {generateM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Gerar etiqueta
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl border-zinc-200"
            onClick={() => printM.mutate()}
            disabled={!hasLabel || busy}
          >
            {printM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Imprimir etiqueta
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl border-zinc-200"
            onClick={() => reprintM.mutate()}
            disabled={!hasLabel || busy}
          >
            {reprintM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Reimprimir etiqueta
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
<Button
  type="button"
  variant="outline"
  className="rounded-2xl border-zinc-200"
  disabled={busy || !canMarkPosted}
  title={markPostedDisabledReason ?? undefined}
>
  {postedM.isPending ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : (
    <Truck className="mr-2 h-4 w-4" />
  )}
  Marcar como postado
</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[28px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Marcar pedido como postado?</AlertDialogTitle>
                <AlertDialogDescription>
                  Depois de marcar como postado, esta ação não poderá ser desfeita por esta tela.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction className="rounded-2xl" onClick={() => postedM.mutate()}>
                  Confirmar postagem
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        
        {markPostedDisabledReason && shipmentStatus !== "POSTED" ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-700">
            {markPostedDisabledReason}
          </div>
        ) : null}

        {shipment?.prePostagemId || shipment?.labelFileKey || shipment?.diagnostics?.length ? (
          <Accordion type="single" collapsible className="rounded-2xl border border-zinc-200 px-4">
            <AccordionItem value="shipment-tech" className="border-0">
              <AccordionTrigger className="py-3 text-sm font-semibold text-zinc-900">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Detalhes técnicos
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-xs text-zinc-700">
                  <div>prePostagemId: {shipment?.prePostagemId || "não informado"}</div>
                  <div>labelFileKey: {shipment?.labelFileKey || "não informado"}</div>
                  <div>labelFormat: {shipment?.labelFormat || "não informado"}</div>
                  {(shipment?.diagnostics ?? []).length ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {(shipment?.diagnostics ?? []).map((item, idx) => (
                        <li key={`${item}-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}

        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CircleDot className="h-4 w-4" />
          {summaryMessage}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-2 break-all text-sm text-zinc-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
