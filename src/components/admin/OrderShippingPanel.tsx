"use client";

import { useEffect, useMemo, type ReactNode } from "react";
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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  | "PRE_POST_CREATED"
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

function normalizedShipment(
  data: ShipmentResponse | ShipmentDetails | null | undefined
): ShipmentDetails | null {
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

function isPrintableLabel(shipment?: ShipmentDetails | null) {
  return Boolean(
    shipment?.labelUrl || (shipment?.labelFileKey && shipment?.generatedAt)
  );
}

function badgeClass(status: ShipmentStatus) {
  if (status === "POSTED" || status === "LABEL_READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "PRE_POST_CREATED" || status === "PRE_POSTED") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "ERROR" || status === "CANCELED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function shipmentLabel(status?: ShipmentStatus | null) {
  if (!status || status === "NOT_CREATED") return "Etiqueta ainda não gerada";
  if (status === "PRE_POST_CREATED") return "Etiqueta em processamento";
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
    if (status === 403)
      return "Seu usuário não tem permissão para operar expedição.";
    if (status === 409)
      return "A etiqueta não está disponível para este pedido no momento.";
    if (status === 422)
      return "Não foi possível concluir esta etapa da expedição.";
    if (status && status >= 500)
      return "Serviço indisponível no momento. Tente novamente.";
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

    if (errorCode === "LABEL_ASYNC_PENDING") {
    return "A pré-postagem foi criada e o Correios ainda está finalizando o rótulo.";
  }

  if (!lastError) return null;
  return "Não foi possível processar a expedição deste pedido no momento.";
}

function isAsyncLabelPending(shipment?: ShipmentDetails | null) {
  return (
    shipment?.shipmentStatus === "PRE_POST_CREATED" &&
    normalizeShippingErrorCode(shipment?.lastError) === "LABEL_ASYNC_PENDING"
  );
}

async function fetchShipping(orderId: string): Promise<ShipmentDetails | null> {
  const { data } = await api.get(endpoints.adminOrderShipping.byOrder(orderId));
  return normalizedShipment(data as ShipmentResponse);
}

async function refreshPendingShipping(
  orderId: string
): Promise<ShipmentDetails | null> {
  const { data } = await api.post(
    endpoints.adminOrderShipping.refreshLabel(orderId),
    {}
  );
  return normalizedShipment(data as ShipmentResponse);
}

function buildEligibility({
  paymentStatus,
  adminApprovalStatus,
  orderStatus,
  shipmentStatus,
  hasPrintableLabel,
}: {
  paymentStatus?: string | null;
  adminApprovalStatus?: string | null;
  orderStatus?: string | null;
  shipmentStatus?: ShipmentStatus | null;
  hasPrintableLabel: boolean;
}): Eligibility {
  if (String(paymentStatus ?? "").toUpperCase() !== "PAID") {
    return {
      ok: false,
      reason: "Pagamento ainda não confirmado para expedição.",
    };
  }

  if (String(adminApprovalStatus ?? "").toUpperCase() !== "APPROVED") {
    return {
      ok: false,
      reason: "Pedido ainda não aprovado para expedição.",
    };
  }

  if (isCanceledOrder(orderStatus)) {
    return {
      ok: false,
      reason: "Pedido cancelado não é elegível para expedição.",
    };
  }

  if (String(shipmentStatus ?? "").toUpperCase() === "POSTED") {
    return {
      ok: false,
      reason: "Pedido já foi marcado como postado.",
    };
  }

  if (hasPrintableLabel) {
    return {
      ok: false,
      reason: "Etiqueta já gerada. Use imprimir ou reimprimir.",
    };
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
  const asyncLabelPending = isAsyncLabelPending(shipment);
  const printableLabelAvailable = isPrintableLabel(shipment);
  const hasPartialShipmentRecord = Boolean(
    shipment &&
      !printableLabelAvailable &&
      (shipment.prePostagemId ||
        shipment.labelFileKey ||
        shipment.generatedAt ||
        shipmentStatus === "PRE_POST_CREATED" ||
        shipmentStatus === "PRE_POSTED" ||
        shipmentStatus === "LABEL_READY" ||
        shipmentStatus === "ERROR")
  );

  const eligibility = useMemo(
    () =>
      buildEligibility({
        paymentStatus,
        adminApprovalStatus,
        orderStatus,
        shipmentStatus,
        hasPrintableLabel: printableLabelAvailable,
      }),
    [
      adminApprovalStatus,
      orderStatus,
      paymentStatus,
      printableLabelAvailable,
      shipmentStatus,
    ]
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
        {
          headers: {
            "Idempotency-Key": `admin-shipping:${orderId}:generate-label`,
          },
        }
      );
      return normalizedShipment(data as ShipmentResponse);
    },
    onSuccess: async (nextShipment) => {
      await syncShippingQueries();

      if (isPrintableLabel(nextShipment)) {
        toast.success("Etiqueta pronta para impressão.");
        return;
      }

            if (isAsyncLabelPending(nextShipment)) {
        toast.success(
          "Pré-postagem criada. O Correios está finalizando o rótulo e vamos atualizar automaticamente."
        );
        return;
      }

      toast.success(
        "Solicitação recebida. Se a etiqueta não aparecer, atualize ou tente novamente."
      );
    },
    onError: async (err) => {
      toast.error(classifyError(err));
      await syncShippingQueries();
    },
  });

  const refreshPendingM = useMutation({
  mutationFn: async () => {
    return refreshPendingShipping(orderId);
  },
  onSuccess: async (nextShipment) => {
    await syncShippingQueries();

    if (isPrintableLabel(nextShipment)) {
      toast.success("Etiqueta pronta para impressão.");
    }
  },
  onError: async (err) => {
    toast.error(classifyError(err));
    await syncShippingQueries();
  },
});

  const reprintM = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        endpoints.adminOrderShipping.reprintLabel(orderId),
        {},
        {
          headers: {
            "Idempotency-Key": `admin-shipping:${orderId}:reprint-label`,
          },
        }
      );
      return normalizedShipment(data as ShipmentResponse);
    },
    onSuccess: async (nextShipment) => {
      await syncShippingQueries();

      if (isPrintableLabel(nextShipment)) {
        toast.success("Etiqueta preparada para reimpressão.");
        return;
      }

      toast.success(
        "Solicitação de reimpressão enviada. Atualize se necessário."
      );
    },
    onError: async (err) => {
      toast.error(classifyError(err));
      await syncShippingQueries();
    },
  });

  const printedM = useMutation({
    mutationFn: async () => {
      await api.post(endpoints.adminOrderShipping.markPrinted(orderId), {});
    },
    onSuccess: async () => {
      await syncShippingQueries();
    },
    onError: async (err) => {
      toast.error(classifyError(err));
      await syncShippingQueries();
    },
  });

  const postedM = useMutation({
    mutationFn: async () => {
      await api.post(
        endpoints.adminOrderShipping.markPosted(orderId),
        {},
        {
          headers: {
            "Idempotency-Key": `admin-shipping:${orderId}:mark-posted`,
          },
        }
      );
    },
    onSuccess: async () => {
      toast.success("Pedido marcado como postado.");
      await syncShippingQueries();
    },
    onError: async (err) => {
      toast.error(classifyError(err));
      await syncShippingQueries();
    },
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
    onError: async (err) => {
      toast.error(classifyError(err));
      await syncShippingQueries();
    },
  });

  useEffect(() => {
  if (!orderId || !asyncLabelPending) return;

  const timer = window.setInterval(() => {
    if (!refreshPendingM.isPending) {
      refreshPendingM.mutate();
    }
  }, 10_000);

  return () => window.clearInterval(timer);
}, [orderId, asyncLabelPending, refreshPendingM]);

const busy =
  shippingQ.isFetching ||
  generateM.isPending ||
  refreshPendingM.isPending ||
  reprintM.isPending ||
  printM.isPending ||
  postedM.isPending ||
  printedM.isPending;

  const canGenerate = eligibility.ok && !busy && !asyncLabelPending;
  const canPrint = printableLabelAvailable && !busy;
  const canReprint = printableLabelAvailable && !busy && !asyncLabelPending;
  const canMarkPosted =
    printableLabelAvailable &&
    (shipmentStatus === "PRE_POST_CREATED" ||
      shipmentStatus === "PRE_POSTED" ||
      shipmentStatus === "LABEL_READY") &&
    !busy &&
    !asyncLabelPending;

  const markPostedDisabledReason = (() => {
    if (shipmentStatus === "POSTED") return "Pedido já marcado como postado.";
        if (asyncLabelPending)
      return "Aguarde a finalização da etiqueta antes de marcar como postado.";
    if (!printableLabelAvailable)
      return "Gere uma etiqueta válida antes de marcar como postado.";
    if (!canMarkPosted)
      return "A postagem só pode ser confirmada após pré-postagem ou etiqueta pronta.";
    return null;
  })();

  const friendlyLastError = friendlyShipmentErrorMessage({
    lastError: shipment?.lastError,
    deliveryMethod,
    shipment,
  });

  const technicalErrorCode = normalizeShippingErrorCode(shipment?.lastError);

  const generateButtonLabel = (() => {
    if (asyncLabelPending) return "Etiqueta em processamento";
    if (
      hasPartialShipmentRecord ||
      shipment?.lastError ||
      shipmentStatus === "PRE_POST_CREATED" ||
      shipmentStatus === "PRE_POSTED" ||
      shipmentStatus === "ERROR"
    ) {
      return "Tentar gerar novamente";
    }

    return "Gerar etiqueta";
  })();

  const summaryMessage = (() => {
    if (shippingQ.isLoading) return "Carregando dados de expedição...";
    if (shippingQ.isError) return "Não foi possível carregar a expedição.";
    if (!shipment) return "Etiqueta ainda não gerada.";
    if (asyncLabelPending) {
      return "A pré-postagem foi criada e o Correios ainda está finalizando o rótulo.";
    }

    if (shipment?.lastError) {
      return (
        friendlyLastError ??
        "Não foi possível processar a expedição deste pedido no momento."
      );
    }

    if (shipmentStatus === "POSTED") return "Pedido marcado como postado.";

    if (printableLabelAvailable && shipmentStatus === "LABEL_READY") {
      return "Etiqueta pronta para impressão.";
    }

    if (printableLabelAvailable) {
      return "Etiqueta disponível para impressão.";
    }

    if (hasPartialShipmentRecord) {
      return "Existe um registro parcial de expedição, mas ainda não há etiqueta disponível para impressão.";
    }

    if (!eligibility.ok) return eligibility.reason;

    return "Painel de expedição sincronizado.";
  })();

  return (
    <Card className="overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-950">
              Correios / Expedição
            </CardTitle>
            <p className="mt-1 text-sm text-zinc-500">
              Fluxo por pedido: gerar etiqueta, imprimir e confirmar postagem.
            </p>
          </div>

<Button
  type="button"
  variant="outline"
  className="rounded-2xl border-zinc-200"
  onClick={() => {
    if (asyncLabelPending) {
      refreshPendingM.mutate();
      return;
    }
    shippingQ.refetch();
  }}
  disabled={busy}
>
  <RefreshCw
    className={`mr-2 h-4 w-4 ${
      shippingQ.isFetching || refreshPendingM.isPending ? "animate-spin" : ""
    }`}
  />
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
          <InfoCard
            label="Transportadora"
            value={shipment?.provider ?? "CORREIOS"}
          />
          <InfoCard
            label="Status da expedição"
            value={
              <Badge
                className={`rounded-full border px-2.5 py-0.5 ${badgeClass(
                  shipmentStatus
                )}`}
              >
                {shipmentLabel(shipmentStatus)}
              </Badge>
            }
          />
          <InfoCard
            label="Código de rastreio"
            value={shipment?.trackingCode || "Não informado"}
            mono
          />
          <InfoCard
            label="Serviço"
            value={shipment?.serviceName || shipment?.serviceCode || "Não informado"}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard label="Data de geração" value={fmtDate(shipment?.generatedAt)} />
          <InfoCard label="Data de impressão" value={fmtDate(shipment?.printedAt)} />
          <InfoCard label="Data de postagem" value={fmtDate(shipment?.postedAt)} />
        </div>

        {!eligibility.ok && !printableLabelAvailable ? (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">
                Pedido não elegível para gerar etiqueta
              </div>
              <div>{eligibility.reason}</div>
            </div>
          </div>
        ) : null}

        {hasPartialShipmentRecord && !shipment?.lastError && !asyncLabelPending ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Há um registro parcial de expedição, mas nenhuma etiqueta válida foi encontrada
            para impressão. Você pode tentar gerar novamente.
          </div>
        ) : null}

        {asyncLabelPending ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            <div className="font-semibold">Etiqueta em processamento</div>
            <div>
              A pré-postagem foi criada e o Correios ainda está finalizando o
              rótulo. O painel atualiza automaticamente a cada 10 segundos.
            </div>
          </div>
        ) : shipment?.lastError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="font-semibold">Último erro de expedição</div>
            <div>{friendlyLastError}</div>
            {technicalErrorCode ? (
              <div className="mt-1 text-xs text-red-600/80">
                Código técnico: {technicalErrorCode}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button
            type="button"
            className="rounded-2xl"
            onClick={() => generateM.mutate()}
            disabled={!canGenerate}
           title={asyncLabelPending ? "Aguarde a etiqueta terminar de processar." : undefined}
          >
            {generateM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {generateButtonLabel}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl border-zinc-200"
            onClick={() => printM.mutate()}
            disabled={!canPrint}
          >
            {printM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Imprimir etiqueta
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-2xl border-zinc-200"
            onClick={() => reprintM.mutate()}
            disabled={!canReprint}
            title={asyncLabelPending ? "Reimpressão disponível quando a etiqueta estiver pronta." : undefined}
          >
            {reprintM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Reimprimir etiqueta
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-zinc-200"
                disabled={!canMarkPosted}
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
                <AlertDialogCancel className="rounded-2xl">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-2xl"
                  onClick={() => postedM.mutate()}
                >
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

        {shipment?.prePostagemId ||
        shipment?.labelFileKey ||
        shipment?.diagnostics?.length ? (
          <Accordion
            type="single"
            collapsible
            className="rounded-2xl border border-zinc-200 px-4"
          >
            <AccordionItem value="shipment-tech" className="border-0">
              <AccordionTrigger className="py-3 text-sm font-semibold text-zinc-900">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Detalhes técnicos
                </span>
              </AccordionTrigger>

              <AccordionContent>
                <div className="space-y-2 text-xs text-zinc-700">
                  <div>
                    prePostagemId: {shipment?.prePostagemId || "não informado"}
                  </div>
                  <div>
                    labelFileKey: {shipment?.labelFileKey || "não informado"}
                  </div>
                  <div>
                    labelFormat: {shipment?.labelFormat || "não informado"}
                  </div>

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
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-2 break-all text-sm text-zinc-900 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}