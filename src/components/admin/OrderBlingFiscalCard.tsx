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

const overallStatusLabel: Record<string, string> = {
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

const environmentLabel: Record<string, string> = {
  HOMOLOGATION: "Homologação",
  PRODUCTION: "Produção",
};

const nfeStatusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  AUTHORIZED: "Autorizada",
  REJECTED: "Rejeitada",
  CANCELED: "Cancelada",
  ERROR: "Erro",
};

const actionLabel: Record<string, string> = {
  CREATE_SALES_ORDER: "Criar pedido no Bling",
  CREATE_NFE: "Criar NF-e no Bling",
  SYNC_NFE: "Sincronizar NF-e",
  DOWNLOAD_DANFE: "Baixar/Salvar DANFE",
  DOWNLOAD_XML: "Baixar/Salvar XML",
  OPEN_DANFE: "Abrir DANFE",
};

const warningLabel: Record<string, string> = {
  "fiscalConfig:storeId": "Loja Bling não configurada. Não bloqueia este fluxo.",
};

const labelFromMap = (value: string | null | undefined, map: Record<string, string>, fallback = "Não informado") =>
  value ? map[value] ?? value : fallback;

const getDanfeLabel = (
  danfe: { available?: boolean; source?: string | null } | undefined
) => {
  if (!danfe?.available) return "Ainda não disponível";
  if (danfe.source === "bling-json-link") return "Disponível via link do Bling";
  return "Disponível via Bling";
};

const getXmlLabel = (xml: { available?: boolean } | undefined) =>
  xml?.available ? "Disponível" : "Ainda não disponível";

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
        <p className="mt-1 text-sm text-zinc-600">Integração fiscal do pedido com Bling/NF-e.</p>
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
              <Badge variant="outline">{labelFromMap(workflowQ.data.overallStatus, overallStatusLabel)}</Badge>
              <Badge variant="outline">{labelFromMap(workflowQ.data.environment, environmentLabel, "Ambiente não informado")}</Badge>
              <Badge variant="outline">{labelFromMap(workflowQ.data.summary?.nfeStatus, nfeStatusLabel)}</Badge>
            </div>

            <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-2">
              <p><strong>Pedido Bling:</strong> {workflowQ.data.summary?.blingOrderId ?? "Não criado"}</p>
              <p><strong>NF-e:</strong> {workflowQ.data.summary?.blingNfeId ?? "Não criada"}</p>
              <p><strong>Número/Série:</strong> {workflowQ.data.summary?.nfeNumber ?? "-"} / {workflowQ.data.summary?.nfeSeries ?? "-"}</p>
              <p><strong>Status NF-e:</strong> {labelFromMap(workflowQ.data.summary?.nfeStatus, nfeStatusLabel)}</p>
              <p><strong>DANFE:</strong> {getDanfeLabel(workflowQ.data.documents?.danfe)}</p>
              <div>
                <p><strong>XML:</strong> {getXmlLabel(workflowQ.data.documents?.xml)}</p>
                {workflowQ.data.documents?.xml?.message ? (
                  <p className="text-xs text-zinc-500">{workflowQ.data.documents.xml.message}</p>
                ) : null}
              </div>
              <p><strong>Próxima ação recomendada:</strong> {labelFromMap(workflowQ.data.nextRecommendedAction, actionLabel)}</p>
            </div>

            {(workflowQ.data.warnings?.length ?? 0) > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <strong>Atenção:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {workflowQ.data.warnings?.map((warning) => (
                    <li key={warning}>{warningLabel[warning] ?? warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {(workflowQ.data.actions ?? []).map((action) => {
                const isPrimary = action.id === workflowQ.data?.nextRecommendedAction;
                const isLoading = runningActionId === action.id && runActionM.isPending;

                if (action.method === "GET_EXTERNAL") {
                  const label = actionLabel[action.id] ?? action.label;
                  if (!action.enabled) {
                    return (
                      <Button
                        key={action.id}
                        type="button"
                        variant={isPrimary ? "default" : "outline"}
                        disabled
                        title={action.reason ?? undefined}
                      >
                        {label}
                      </Button>
                    );
                  }
                  return (
                    <a key={action.id} href={action.endpoint} target="_blank" rel="noreferrer" title={action.reason ?? undefined}>
                      <Button type="button" variant={isPrimary ? "default" : "outline"}>
                        {label}
                        {isPrimary ? <span className="ml-2 text-xs font-medium opacity-90">Recomendado</span> : null}
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
                    {isLoading ? "Processando..." : (actionLabel[action.id] ?? action.label)}
                    {isPrimary && !isLoading ? <span className="ml-2 text-xs font-medium opacity-90">Recomendado</span> : null}
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
