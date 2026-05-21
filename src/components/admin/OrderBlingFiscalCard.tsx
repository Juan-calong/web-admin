"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/apiError";
import {
  getOrderBlingFiscalWorkflow,
  runOrderBlingFiscalAction,
  type FiscalWorkflowAction,
} from "@/lib/blingFiscalWorkflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusLabel: Record<string, string> = {
  NOT_READY: "Não pronto",
  READY_FOR_SALES_ORDER: "Pronto para criar pedido Bling",
  SALES_ORDER_CREATED: "Pedido Bling criado",
  READY_FOR_NFE_CREATE: "Pronto para criar NF-e",
  NFE_DRAFT: "NF-e em rascunho",
  NFE_PENDING: "NF-e pendente",
  NFE_AUTHORIZED: "NF-e autorizada",
  NFE_REJECTED: "NF-e rejeitada",
  NFE_ERROR: "Erro na NF-e",
  DOCUMENTS_PARTIAL: "Documentos parciais",
  DOCUMENTS_READY: "Documentos prontos",
};

const toLabel = (v?: string | null) => (v ? statusLabel[v] ?? v : "Não informado");

export function OrderBlingFiscalCard({ orderId }: { orderId?: string }) {
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  const workflowQ = useQuery({
    queryKey: ["admin-order-bling-fiscal", orderId],
    queryFn: () => getOrderBlingFiscalWorkflow(orderId as string),
    enabled: Boolean(orderId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const runActionM = useMutation({
    mutationFn: async (action: FiscalWorkflowAction) => {
      setRunningActionId(action.id);
      if (action.method === "GET_EXTERNAL") {
        window.open(action.endpoint, "_blank", "noreferrer");
        return { message: "DANFE aberto em nova aba." };
      }
      return runOrderBlingFiscalAction(orderId as string, action);
    },
    onSuccess: async (data) => {
      toast.success(data?.message ?? "Ação executada com sucesso.");
      await workflowQ.refetch();
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Não foi possível executar a ação fiscal."));
    },
    onSettled: () => setRunningActionId(null),
  });

  return (
    <Card className="overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <CardTitle className="text-lg font-bold text-zinc-950">Fiscal / Bling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {workflowQ.isLoading ? <p className="text-sm text-zinc-500">Carregando workflow fiscal...</p> : null}

        {workflowQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>Não foi possível carregar o workflow fiscal.</p>
            <Button className="mt-3" variant="outline" onClick={() => workflowQ.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {workflowQ.data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{toLabel(workflowQ.data.overallStatus)}</Badge>
              <Badge variant="outline">{workflowQ.data.environment ?? "Ambiente não informado"}</Badge>
              <Badge variant="outline">{toLabel(workflowQ.data.summary?.nfeStatus)}</Badge>
            </div>

            <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <p><strong>Pedido Bling:</strong> {workflowQ.data.summary?.blingOrderId ?? "Não criado"}</p>
              <p><strong>NF-e:</strong> {workflowQ.data.summary?.blingNfeId ?? "Não criada"}</p>
              <p><strong>Número/Série:</strong> {workflowQ.data.summary?.nfeNumber ?? "-"} / {workflowQ.data.summary?.nfeSeries ?? "-"}</p>
              <p><strong>Status NF-e:</strong> {toLabel(workflowQ.data.summary?.nfeStatus)}</p>
              <p><strong>DANFE:</strong> {workflowQ.data.documents?.danfe?.available ? "Disponível" : "Não disponível"}</p>
              <p><strong>XML:</strong> {workflowQ.data.documents?.xml?.available ? "Disponível" : "Não disponível"}</p>
              <p><strong>Próxima ação recomendada:</strong> {toLabel(workflowQ.data.nextRecommendedAction)}</p>
            </div>

            {(workflowQ.data.warnings?.length ?? 0) > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <strong>Warnings:</strong> {workflowQ.data.warnings?.join(", ")}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {(workflowQ.data.actions ?? []).map((action) => {
                const isPrimary = action.id === workflowQ.data?.nextRecommendedAction;
                const isLoading = runningActionId === action.id && runActionM.isPending;

                if (action.method === "GET_EXTERNAL") {
                  return (
                    <a key={action.id} href={action.endpoint} target="_blank" rel="noreferrer" title={action.reason ?? undefined}>
                      <Button type="button" variant={isPrimary ? "default" : "outline"} disabled={!action.enabled}>
                        {action.label}
                      </Button>
                    </a>
                  );
                }

                return (
                  <Button
                    key={action.id}
                    type="button"
                    variant={isPrimary ? "default" : "outline"}
                    disabled={!action.enabled || isLoading}
                    title={action.reason ?? undefined}
                    onClick={() => runActionM.mutate(action)}
                  >
                    {isLoading ? "Processando..." : action.label}
                  </Button>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
