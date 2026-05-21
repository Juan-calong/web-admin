"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/apiError";
import {
  getBlingApiStatus,
  getBlingFiscalConfig,
  getBlingIntegrationStatus,
  refreshBlingOAuth,
  startBlingOAuth,
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

export default function AdminBlingIntegrationPage() {
  const statusQ = useQuery({ queryKey: ["bling-status"], queryFn: getBlingIntegrationStatus, retry: false });
  const fiscalQ = useQuery({ queryKey: ["bling-fiscal"], queryFn: getBlingFiscalConfig, retry: false });

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
