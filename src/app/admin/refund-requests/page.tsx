"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { authStore, hasScope } from "@/lib/auth";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RefundStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "REFUNDED"
  | "FAILED";

type RefundRequest = {
  id: string;
  orderId?: string;
  requestedByUserId?: string;
  requestedByRole?: string;
  reason?: string;
  description?: string;
  status?: RefundStatus | string;
  requestedAt?: string;
  reviewedAt?: string;
  resolvedAt?: string;
  adminNote?: string;
  paymentId?: string;
  eligibilitySnapshot?: Record<string, unknown>;
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Aguardando análise",
  UNDER_REVIEW: "Em análise",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado",
  FAILED: "Falhou",
};

const STATUS_CLASS: Record<string, string> = {
  REQUESTED: "border-amber-200 bg-amber-50 text-amber-800",
  UNDER_REVIEW: "border-blue-200 bg-blue-50 text-blue-800",
  APPROVED: "border-sky-200 bg-sky-50 text-sky-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
  CANCELED: "border-zinc-200 bg-zinc-50 text-zinc-700",
  REFUNDED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
};

const REASON_LABEL: Record<string, string> = {
  PRODUCT_DAMAGED: "Produto danificado",
  WRONG_PRODUCT: "Produto errado",
  MISSING_ITEM: "Item faltando",
  DELIVERY_PROBLEM: "Problema na entrega",
  OTHER: "Outro motivo",
};

const SOURCE_LABEL: Record<string, string> = {
  LOCAL_DELIVERY: "Entrega local",
  SHIPMENT: "Correios/envio",
  FALLBACK_LOCAL: "Entrega local",
  FALLBACK_SHIPMENT: "Correios/envio",
};

const POST_DELIVERY_REASON_LABEL: Record<string, string> = {
  WITHIN_WINDOW: "Dentro do prazo",
  WINDOW_EXPIRED: "Prazo expirado",
  NOT_DELIVERED: "Pedido não entregue",
};

const REJECTABLE = new Set(["REQUESTED", "UNDER_REVIEW"]);
const APPROVABLE = new Set(["REQUESTED"]);

const ERROR_LABEL: Record<string, string> = {
  ORDER_NOT_DELIVERED: "Pedido ainda não foi entregue.",
  POST_DELIVERY_WINDOW_EXPIRED: "Prazo pós-entrega expirado.",
  ORDER_NOT_PAID: "Pedido não está pago.",
  ORDER_CANCELED: "Pedido cancelado.",
  ORDER_ALREADY_REFUNDED_OR_PENDING: "Pedido já está reembolsado ou pendente.",
  COMMISSION_ALREADY_AVAILABLE_OR_PAID: "Comissão já disponibilizada/paga.",
  ORDER_NOT_OWNED: "Solicitação não pertence ao usuário informado.",
  OPEN_REQUEST_ALREADY_EXISTS: "Já existe solicitação aberta.",
  REFUND_IN_PROGRESS: "Já existe refund em processamento.",
  DOMAIN_FINALIZATION_FAILED: "Verificação manual necessária.",
};

function fmtDate(v?: string | unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function shortId(id?: string | null, size = 8) {
  if (!id) return "-";
  return String(id).slice(0, size);
}

function normalizeKey(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function statusLabel(status?: string) {
  const key = normalizeKey(status);
  return STATUS_LABEL[key] ?? status ?? "-";
}

function reasonLabel(reason?: string) {
  const key = normalizeKey(reason);
  return REASON_LABEL[key] ?? reason ?? "-";
}

function sourceLabel(source?: unknown) {
  const key = normalizeKey(String(source ?? ""));
  return SOURCE_LABEL[key] ?? String(source ?? "-");
}

function postDeliveryReasonLabel(reason?: unknown) {
  const key = normalizeKey(String(reason ?? ""));
  return POST_DELIVERY_REASON_LABEL[key] ?? String(reason ?? "-");
}

function getFriendlyError(error: unknown) {
  const raw = apiErrorMessage(error, "Falha ao processar solicitação.");
  const key = Object.keys(ERROR_LABEL).find((k) => raw.toUpperCase().includes(k));
  return key ? ERROR_LABEL[key] : raw;
}

function StatusBadge({ status }: { status?: string }) {
  const key = normalizeKey(status);
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold",
        STATUS_CLASS[key] ?? "border-zinc-200 bg-zinc-50 text-zinc-700",
      ].join(" ")}
    >
      {statusLabel(status)}
    </span>
  );
}

function InfoItem({
  label,
  value,
  title,
}: {
  label: string;
  value?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-foreground" title={title}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function SnapshotGrid({ snapshot }: { snapshot?: Record<string, unknown> }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
        Sem snapshot de elegibilidade.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <InfoItem label="Criado em" value={fmtDate(snapshot.createdAt)} />
        <InfoItem label="Entregue em" value={fmtDate(snapshot.deliveredAt)} />
        <InfoItem label="Prazo final" value={fmtDate(snapshot.deadlineAt)} />
        <InfoItem label="Fonte da entrega" value={sourceLabel(snapshot.postDeliverySource)} />
        <InfoItem label="Janela pós-entrega" value={postDeliveryReasonLabel(snapshot.postDeliveryReason)} />
        <InfoItem label="Status do pedido" value={String(snapshot.orderStatus ?? "-")} />
        <InfoItem label="Status do pagamento" value={String(snapshot.paymentStatus ?? "-")} />
        <InfoItem label="Provider" value={String(snapshot.paymentProvider ?? "-")} />
        <InfoItem label="Refund status" value={String(snapshot.refundStatus ?? "-")} />
        <InfoItem label="Payment ID" value={shortId(String(snapshot.paymentId ?? ""), 12)} title={String(snapshot.paymentId ?? "")} />
      </div>

      <details className="rounded-xl border bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-bold text-foreground">
          Dados técnicos
        </summary>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function AdminRefundRequestsPage() {
  const me = authStore.getMe();
  const canManageOrders = hasScope(me, "admin:orders:manage") || me?.role === "ADMIN";

  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("ALL");
  const [orderId, setOrderId] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveConfirmText, setApproveConfirmText] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const list = useQuery({
    queryKey: ["admin-refund-requests", status, page, limit],
    queryFn: async () => {
      const { data } = await api.get(endpoints.adminRefundRequests.list, {
        params: {
          status: status === "ALL" ? undefined : status,
          page,
          limit,
        },
      });

      return data;
    },
    enabled: canManageOrders,
  });

  const rawItems = useMemo(() => {
    const data = list.data as unknown;

    if (Array.isArray(data)) return data as RefundRequest[];

    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { items?: unknown[] }).items)
    ) {
      return (data as { items: RefundRequest[] }).items;
    }

    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { data?: unknown[] }).data)
    ) {
      return (data as { data: RefundRequest[] }).data;
    }

    return [] as RefundRequest[];
  }, [list.data]);

  const items = useMemo(() => {
    const term = orderId.trim();

    if (!term) return rawItems;

    return rawItems.filter((r) => String(r.orderId ?? "").includes(term));
  }, [rawItems, orderId]);

  const details = useQuery({
    queryKey: ["admin-refund-requests-detail", detailId],
    queryFn: async () => {
      const { data } = await api.get<RefundRequest>(
        endpoints.adminRefundRequests.byId(detailId!)
      );

      return data;
    },
    enabled: !!detailId,
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectId) throw new Error("ID inválido");

      return api.post(endpoints.adminRefundRequests.reject(rejectId), {
        adminNote: rejectNote || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Solicitação rejeitada com sucesso.");
      setRejectId(null);
      setRejectNote("");
      qc.invalidateQueries({ queryKey: ["admin-refund-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-refund-requests-detail"] });
    },
    onError: (error) => {
      console.error("reject_refund_request_error", error);
      toast.error(getFriendlyError(error));
    },
  });

  const detailRequest = details.data;
  const rejectRequest = useMemo(
    () => rawItems.find((item) => item.id === rejectId) ?? null,
    [rawItems, rejectId]
  );

    const approveRequest = useMemo(
    () => rawItems.find((item) => item.id === approveId) ?? null,
    [rawItems, approveId]
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approveId) throw new Error("ID inválido");
      if (approveConfirmText !== "APROVAR REEMBOLSO") {
        throw new Error("Confirmação inválida");
      }

      return api.post(endpoints.adminRefundRequests.approve(approveId), {
        adminNote: approveNote || undefined,
      });
    },
    onSuccess: (response) => {
      const body = response?.data as
        | { status?: string; state?: string }
        | undefined;
      const normalizedStatus = normalizeKey(body?.status);
      const normalizedState = normalizeKey(body?.state);
      const isPending =
        response.status === 202 ||
        normalizedStatus === "PENDING" ||
        normalizedState === "PENDING";

      toast.success(
        isPending
          ? "Reembolso pendente no provedor. Verifique novamente mais tarde."
          : "Reembolso aprovado/processado com sucesso."
      );
      setApproveId(null);
      setApproveConfirmText("");
      setApproveNote("");
      qc.invalidateQueries({ queryKey: ["admin-refund-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-refund-requests-detail"] });
    },
    onError: (error) => {
      console.error("approve_refund_request_error", error);
      const raw = apiErrorMessage(error, "");
      const normalizedRaw = raw.toUpperCase();
      if (normalizedRaw.includes("INVALID_REQUEST_STATUS")) {
        toast.error("Esta solicitação não está mais em status permitido para aprovação.");
        return;
      }
      if (normalizedRaw.includes("DOMAIN_FINALIZATION_FAILED")) {
        toast.error(
          "Reembolso externo pode ter sido confirmado, mas a finalização interna falhou. Verificação manual necessária."
        );
        return;
      }
      toast.error(getFriendlyError(error));
    },
  });

  if (!canManageOrders) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso negado</CardTitle>
        </CardHeader>
        <CardContent>Escopo admin:orders:manage é necessário.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Solicitações de reembolso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analise solicitações criadas pelo app com confirmação forte para evitar ações acidentais.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[280px_1fr]">
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Buscar por orderId</Label>
              <Input
                className="mt-1"
                value={orderId}
                onChange={(event) => {
                  setOrderId(event.target.value);
                  setPage(1);
                }}
                placeholder="Cole o orderId ou parte dele"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {list.isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Carregando solicitações...
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma solicitação encontrada.
            </CardContent>
          </Card>
        ) : (
          items.map((request) => {
            const currentStatus = normalizeKey(request.status);
            const canReject = REJECTABLE.has(currentStatus);
            const canApprove = APPROVABLE.has(currentStatus);

            return (
              <Card key={request.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-black text-foreground">
                          Pedido #{shortId(request.orderId)}
                        </div>
                        <StatusBadge status={request.status} />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <InfoItem
                          label="Usuário"
                          value={shortId(request.requestedByUserId, 12)}
                          title={request.requestedByUserId}
                        />
                        <InfoItem label="Role" value={request.requestedByRole ?? "-"} />
                        <InfoItem label="Motivo" value={reasonLabel(request.reason)} />
                        <InfoItem label="Solicitado em" value={fmtDate(request.requestedAt)} />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <InfoItem
                          label="Payment ID"
                          value={shortId(request.paymentId, 12)}
                          title={request.paymentId}
                        />
                        <InfoItem label="ReviewedAt" value={fmtDate(request.reviewedAt)} />
                        <InfoItem label="ResolvedAt" value={fmtDate(request.resolvedAt)} />
                      </div>

                      {request.description ? (
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Descrição
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {request.description}
                          </div>
                        </div>
                      ) : null}

                      {request.adminNote ? (
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="text-xs font-semibold text-muted-foreground">
                            Nota administrativa
                          </div>
                          <div className="mt-1 text-sm text-foreground">
                            {request.adminNote}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-2 md:flex-col">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(request.id)}
                      >
                        Detalhes
                      </Button>

                      {canReject ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejectId(request.id)}
                        >
                          Rejeitar
                        </Button>
                      ) : null}
                        {canApprove ? (
                        <Button size="sm" onClick={() => setApproveId(request.id)}>
                          Aprovar reembolso
                        </Button>
                      ) : null}
                          {currentStatus === "UNDER_REVIEW" ? (
                        <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                          Reembolso em processamento no provedor
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
        >
          Anterior
        </Button>

        <span className="text-sm text-muted-foreground">Página {page}</span>

        <Button
          variant="outline"
          disabled={items.length < limit}
          onClick={() => setPage((current) => current + 1)}
        >
          Próxima
        </Button>
      </div>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhe da solicitação</DialogTitle>
            <DialogDescription>
              Dados completos do pedido de reembolso.
            </DialogDescription>
          </DialogHeader>

          {details.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando...</div>
          ) : !detailRequest ? (
            <div className="py-8 text-sm text-muted-foreground">
              Solicitação não encontrada.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-black">
                  Pedido #{shortId(detailRequest.orderId)}
                </div>
                <StatusBadge status={detailRequest.status} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InfoItem
                  label="orderId"
                  value={shortId(detailRequest.orderId, 12)}
                  title={detailRequest.orderId}
                />
                <InfoItem
                  label="paymentId"
                  value={shortId(detailRequest.paymentId, 12)}
                  title={detailRequest.paymentId}
                />
                <InfoItem
                  label="requestedByUserId"
                  value={shortId(detailRequest.requestedByUserId, 12)}
                  title={detailRequest.requestedByUserId}
                />
                <InfoItem label="requestedByRole" value={detailRequest.requestedByRole ?? "-"} />
                <InfoItem label="Motivo" value={reasonLabel(detailRequest.reason)} />
                <InfoItem label="Solicitado em" value={fmtDate(detailRequest.requestedAt)} />
                <InfoItem label="ReviewedAt" value={fmtDate(detailRequest.reviewedAt)} />
                <InfoItem label="ResolvedAt" value={fmtDate(detailRequest.resolvedAt)} />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Descrição
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    {detailRequest.description || "-"}
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Nota administrativa
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    {detailRequest.adminNote || "-"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-black">Elegibilidade</div>
                <SnapshotGrid snapshot={detailRequest.eligibilitySnapshot} />
              </div>
            </div>
          )}

          <DialogFooter>
              {detailRequest ? (
              <>
                {REJECTABLE.has(normalizeKey(detailRequest.status)) ? (
                  <Button
                    variant="destructive"
                    onClick={() => setRejectId(detailRequest.id)}
                  >
                    Rejeitar
                  </Button>
                ) : null}
                {APPROVABLE.has(normalizeKey(detailRequest.status)) ? (
                  <Button onClick={() => setApproveId(detailRequest.id)}>
                    Aprovar reembolso
                  </Button>
                ) : normalizeKey(detailRequest.status) === "UNDER_REVIEW" ? (
                  <Button variant="secondary" disabled>
                    Reembolso em processamento no provedor
                  </Button>
                ) : (
                  <Button variant="secondary" disabled>
                    Status atual: {statusLabel(detailRequest?.status)}
                  </Button>
                )}
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveId} onOpenChange={(open) => !open && setApproveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar reembolso</DialogTitle>
            <DialogDescription>
              Esta ação pode devolver dinheiro via BB/Mercado Pago. Confirme apenas se a solicitação foi analisada.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-2">
            <InfoItem
              label="Pedido"
              value={`#${shortId(approveRequest?.orderId)}`}
              title={approveRequest?.orderId}
            />
            <InfoItem label="Motivo" value={reasonLabel(approveRequest?.reason)} />
            <InfoItem
              label="Usuário"
              value={shortId(approveRequest?.requestedByUserId, 12)}
              title={approveRequest?.requestedByUserId}
            />
            <InfoItem
              label="Payment ID"
              value={shortId(approveRequest?.paymentId, 12)}
              title={approveRequest?.paymentId}
            />
            <InfoItem label="Status atual" value={statusLabel(approveRequest?.status)} />
          </div>

          <div className="space-y-2">
            <Label>Observação administrativa (opcional)</Label>
            <Textarea
              value={approveNote}
              onChange={(event) => setApproveNote(event.target.value)}
              placeholder="Observação administrativa opcional"
            />
          </div>

          <div className="space-y-2">
            <Label>Digite APROVAR REEMBOLSO para confirmar</Label>
            <Input
              value={approveConfirmText}
              onChange={(event) => setApproveConfirmText(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveId(null);
                setApproveConfirmText("");
                setApproveNote("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={
                approveConfirmText !== "APROVAR REEMBOLSO" ||
                approveMutation.isPending
              }
            >
              {approveMutation.isPending ? "Aprovando..." : "Confirmar aprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectId} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar solicitação</DialogTitle>
            <DialogDescription>
              Informe uma observação administrativa para auditoria.
              {rejectRequest?.orderId ? (
                <span className="mt-2 block font-semibold text-foreground">
                  Pedido #{shortId(rejectRequest.orderId)}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            placeholder="Motivo da rejeição"
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectId(null);
                setRejectNote("");
              }}
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejeitando..." : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}