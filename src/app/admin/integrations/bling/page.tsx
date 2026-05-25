"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/apiError";
import {
  getBlingApiStatus,
  getBlingFiscalConfig,
  getBlingIntegrationStatus,
  getBlingProductionReadiness,
  refreshBlingOAuth,
  startBlingOAuth,
  type BlingProductionReadinessSection,
  updateBlingFiscalConfig,
  type BlingFiscalConfigInput,
} from "@/lib/blingIntegration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const missingLabel: Record<string, string> = {
  natureOperationId: "Natureza da operação",
  series: "Série",
  finality: "Finalidade",
  storeId: "Loja Bling",
};

function formatDate(value?: string | null) {
  if (!value) return "Não informado";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "BLOCKED") return "destructive";
  if (status === "WARNING") return "secondary";
  if (status === "OK") return "default";
  return "outline";
}

function booleanText(value: unknown, yes = "Sim", no = "Não") {
  return value === true ? yes : no;
}

function renderSectionSummary(section: BlingProductionReadinessSection) {
  switch (section.key) {
    case "environment":
      return <p>Ambiente fiscal: <strong>{String(section.fiscalEnvironment ?? "Não informado")}</strong></p>;
    case "oauth-api":
      return (
        <div className="space-y-1">
          <p>Configurado: <strong>{booleanText(section.configured)}</strong></p>
          <p>Conectado: <strong>{booleanText(section.connected)}</strong></p>
          <p>API acessível: <strong>{booleanText(section.apiReachable)}</strong></p>
          <p>Variáveis ausentes: <strong>{Array.isArray(section.missingEnv) && section.missingEnv.length ? section.missingEnv.join(", ") : "Nenhuma"}</strong></p>
        </div>
      );
    case "fiscal-config":
      return (
        <div className="space-y-1">
          <p>Natureza da operação: <strong>{String(section.natureOperationId ?? "Não informado")}</strong></p>
          <p>Série: <strong>{String(section.series ?? "Não informado")}</strong></p>
          <p>Finalidade: <strong>{String(section.finality ?? "Não informado")}</strong></p>
          <p>Loja Bling: <strong>{String(section.storeId ?? "Não informado")}</strong></p>
          <p>Tipo emissão padrão: <strong>{String(section.defaultIssueType ?? "Não informado")}</strong></p>
          <p>Situação padrão: <strong>{String(section.defaultSituation ?? "Não informado")}</strong></p>
          <p>Campos faltantes: <strong>{Array.isArray(section.missing) && section.missing.length ? section.missing.join(", ") : "Nenhum"}</strong></p>
          <p>Warnings: <strong>{Array.isArray(section.warnings) && section.warnings.length ? section.warnings.join(", ") : "Nenhum"}</strong></p>
        </div>
      );
    case "products":
      return (
        <div className="space-y-1">
          <p>Total ativos: <strong>{String(section.totalActiveProducts ?? 0)}</strong></p>
          <p>Sem dados fiscais: <strong>{String(section.activeWithoutFiscalData ?? 0)}</strong></p>
          <p>Sem campos fiscais obrigatórios: <strong>{String(section.activeMissingRequiredFiscalFields ?? 0)}</strong></p>
          <p>Sem ID Bling: <strong>{String(section.activeWithoutBlingProductId ?? 0)}</strong></p>
        </div>
      );
    case "business-customers":
      return <p>Definir se a operação começará apenas com CPF ou também CNPJ.</p>;
    case "issuance-authorization":
      return <p>Hoje a KeyFi cria rascunho/nota no Bling, mas a estratégia de autorização ainda precisa ser definida.</p>;
    case "xml-availability":
      return <p>XML depende da NF-e estar autorizada.</p>;
    case "kit-stock-composition":
      return <p>Kits/composição de estoque serão tratados em etapa separada se forem obrigatórios para operação.</p>;
    default:
      return <p>Sem resumo específico para esta seção.</p>;
  }
}

export default function AdminBlingIntegrationPage() {
  const statusQ = useQuery({ queryKey: ["bling-status"], queryFn: getBlingIntegrationStatus, retry: false });
  const fiscalQ = useQuery({ queryKey: ["bling-fiscal"], queryFn: getBlingFiscalConfig, retry: false });
    const readinessQ = useQuery({ queryKey: ["bling-production-readiness"], queryFn: getBlingProductionReadiness, retry: false });

  const [form, setForm] = useState<BlingFiscalConfigInput>({
    natureOperationId: "",
    natureOperationName: "",
    series: "",
    finality: "",
    storeId: "",
    storeName: "",
    defaultIssueType: "",
    defaultSituation: 1,
  });

  useEffect(() => {
    if (!fiscalQ.data) return;
    setForm({
      natureOperationId: fiscalQ.data.natureOperationId ?? "",
      natureOperationName: fiscalQ.data.natureOperationName ?? "",
      series: fiscalQ.data.series ?? "",
      finality: fiscalQ.data.finality ?? "",
      storeId: fiscalQ.data.storeId ?? "",
      storeName: fiscalQ.data.storeName ?? "",
      defaultIssueType: fiscalQ.data.defaultIssueType ?? "",
      defaultSituation: Number(fiscalQ.data.defaultSituation ?? 1),
    });
  }, [fiscalQ.data]);

  const oauthStartM = useMutation({ mutationFn: startBlingOAuth, onSuccess: (data) => {
    window.open(data.url, "_blank", "noopener,noreferrer");
    toast.success("Autorização aberta em nova aba.");
  }, onError: (e) => toast.error(apiErrorMessage(e, "Falha ao iniciar OAuth.")) });

  const refreshOAuthM = useMutation({ mutationFn: refreshBlingOAuth, onSuccess: async () => {
    toast.success("Token renovado.");
    await statusQ.refetch();
  }, onError: (e) => toast.error(apiErrorMessage(e, "Falha ao renovar token.")) });

  const apiStatusM = useMutation({ mutationFn: getBlingApiStatus, onError: (e) => toast.error(apiErrorMessage(e, "Falha ao testar API Bling.")) });

  const saveM = useMutation({ mutationFn: updateBlingFiscalConfig, onSuccess: async () => {
    toast.success("Configuração fiscal salva.");
    await fiscalQ.refetch();
  }, onError: (e) => toast.error(apiErrorMessage(e, "Falha ao salvar configuração fiscal.")) });

  const readinessText = useMemo(() => {
    if (!fiscalQ.data) return "";
    return fiscalQ.data.ready
      ? "Configuração fiscal pronta para criação de NF-e."
      : "Configuração fiscal incompleta.";
  }, [fiscalQ.data]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Integração Bling / NF-e</h1>

            <Card>
        <CardHeader>
          <CardTitle>Checklist de produção fiscal</CardTitle>
          <p className="text-sm text-zinc-600">Diagnóstico para validar se a integração Bling/NF-e está pronta para produção.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {readinessQ.isLoading ? <p>Carregando checklist...</p> : null}
          {readinessQ.isError ? <div className="space-y-2"><p>Erro ao carregar checklist de produção.</p><Button variant="outline" onClick={() => readinessQ.refetch()}>Tentar novamente</Button></div> : null}
          {readinessQ.data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Ambiente: {readinessQ.data.environment === "PRODUCTION" ? "Produção" : "Homologação"}</Badge>
                <Badge variant={readinessQ.data.readyForProduction ? "default" : "secondary"}>{readinessQ.data.readyForProduction ? "Pronto para produção" : "Ainda não pronto para produção"}</Badge>
                <Badge variant={readinessQ.data.readyForProductionSwitch ? "default" : "destructive"}>{readinessQ.data.readyForProductionSwitch ? "Sem bloqueios críticos" : "Com bloqueios críticos"}</Badge>
              </div>

              <div className="space-y-3">
                {readinessQ.data.sections.map((section) => (
                  <div key={section.key} className="rounded-xl border p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-medium">{section.label}</p>
                      <Badge variant={statusVariant(section.status)}>{section.status}</Badge>
                    </div>
                    {renderSectionSummary(section)}
                  </div>
                ))}
              </div>

              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">Bloqueios</p>
                {readinessQ.data.blockers.length === 0 ? <p>Nenhum bloqueio crítico encontrado.</p> : <ul className="list-disc pl-5">{readinessQ.data.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>

              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">Avisos</p>
                {readinessQ.data.warnings.length === 0 ? <p>Nenhum aviso encontrado.</p> : <ul className="list-disc pl-5">{readinessQ.data.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>

              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">Recomendações</p>
                {readinessQ.data.recommendations.length === 0 ? <p>Nenhuma recomendação encontrada.</p> : <ul className="list-disc pl-5">{readinessQ.data.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>
            </div>
          ) : null}

          <Button variant="outline" onClick={() => readinessQ.refetch()} disabled={readinessQ.isFetching}>Atualizar checklist</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Status da conexão</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {statusQ.isLoading ? <p>Carregando status...</p> : null}
          {statusQ.isError ? <div><p>Erro ao carregar status.</p><Button variant="outline" onClick={() => statusQ.refetch()}>Tentar novamente</Button></div> : null}
          {statusQ.data ? <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p><strong>Provider:</strong> {statusQ.data.provider}</p>
            <p><strong>Configured:</strong> {String(statusQ.data.configured)}</p>
            <p><strong>Connected:</strong> {String(statusQ.data.connected)}</p>
            <p><strong>Expires at:</strong> {formatDate(statusQ.data.expiresAt)}</p>
            <p><strong>Connected at:</strong> {formatDate(statusQ.data.connectedAt)}</p>
            <p><strong>Last refresh:</strong> {formatDate(statusQ.data.lastRefreshAt)}</p>
            <p className="sm:col-span-2"><strong>Missing env:</strong> {(statusQ.data.missingEnv ?? []).join(", ") || "Nenhum"}</p>
          </div> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => oauthStartM.mutate()} disabled={oauthStartM.isPending}>Conectar Bling</Button>
            <Button variant="outline" onClick={() => statusQ.refetch()}>Atualizar status</Button>
            <Button variant="outline" onClick={() => apiStatusM.mutate()} disabled={apiStatusM.isPending}>Testar API</Button>
            <Button variant="outline" onClick={() => refreshOAuthM.mutate()} disabled={refreshOAuthM.isPending}>Renovar token</Button>
          </div>
          <p className="text-sm text-zinc-600">Após autorizar no Bling, volte e clique em Atualizar status.</p>
          {apiStatusM.data ? <Badge variant="outline">API Bling: {apiStatusM.data.ok ? "OK" : "Falhou"}{apiStatusM.data.environment ? ` (${apiStatusM.data.environment})` : ""}</Badge> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configuração fiscal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {fiscalQ.isLoading ? <p>Carregando configuração...</p> : null}
          {fiscalQ.isError ? <div><p>Erro ao carregar configuração fiscal.</p><Button variant="outline" onClick={() => fiscalQ.refetch()}>Tentar novamente</Button></div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries({
              natureOperationId: "ID da natureza da operação",
              natureOperationName: "Nome da natureza",
              series: "Série",
              finality: "Finalidade",
              storeId: "ID da loja",
              storeName: "Nome da loja",
              defaultIssueType: "Tipo de emissão padrão",
              defaultSituation: "Situação padrão",
            }).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  value={String(form[key as keyof BlingFiscalConfigInput] ?? "")}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: key === "defaultSituation" ? Number(e.target.value) : e.target.value }))}
                />
              </div>
            ))}
          </div>
          {fiscalQ.data ? (
            <div className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{readinessText}</p>
              <p><strong>Ready:</strong> {String(fiscalQ.data.ready)}</p>
              <p><strong>Missing:</strong> {(fiscalQ.data.missing ?? []).map((i) => missingLabel[i] ?? i).join(", ") || "Nenhum"}</p>
              <p><strong>Warnings:</strong> {(fiscalQ.data.warnings ?? []).map((i) => missingLabel[i] ?? i).join(", ") || "Nenhum"}</p>
            </div>
          ) : null}
          <Button onClick={() => saveM.mutate(form)} disabled={saveM.isPending}>Salvar configuração fiscal</Button>
        </CardContent>
      </Card>
    </div>
  );
}
