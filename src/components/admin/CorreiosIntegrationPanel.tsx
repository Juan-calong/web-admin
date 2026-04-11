"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Siren,
  Wrench,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AuthStatus = "OK" | "FAILED" | "PENDING";
type CapabilityStatus = "AVAILABLE" | "NOT_CONFIGURED" | "NOT_VALIDATED" | "FAILED";
type Severity = "warning" | "error";

type CorreiosCredentialField = {
  key: string;
  label: string;
  required: boolean;
  present: boolean;
  maskedPreview?: string | null;
};

type CorreiosCapability = {
  key: "FREIGHT_QUOTE" | "PRE_POSTING" | "LABEL_GENERATION";
  label: string;
  status: CapabilityStatus;
  detail?: string | null;
};

type CorreiosDiagnostic = {
  code: string;
  message: string;
  severity: Severity;
  nextStep?: string | null;
};

type CorreiosIntegrationStatusResponse = {
  provider: "CORREIOS" | string;
  configured: boolean;
  authStatus: AuthStatus;
  checkedAt?: string | null;
  credentials?: CorreiosCredentialField[] | null;
  capabilities?: CorreiosCapability[] | null;
  diagnostics?: CorreiosDiagnostic[] | null;
  nextSteps?: string[] | null;
};

type KnownHttpError = "UNAUTHORIZED" | "FORBIDDEN" | "TIMEOUT" | "SERVER_ERROR" | "UNAVAILABLE" | "UNKNOWN";

type ErrorDetails = {
  title: string;
  summary: string;
  type: KnownHttpError;
  technical?: string;
};

const capabilityOrder: Array<CorreiosCapability["key"]> = [
  "FREIGHT_QUOTE",
  "PRE_POSTING",
  "LABEL_GENERATION",
];

const capabilityFallbackLabels: Record<CorreiosCapability["key"], string> = {
  FREIGHT_QUOTE: "Cotação de frete",
  PRE_POSTING: "Pré-Postagem",
  LABEL_GENERATION: "Geração de etiqueta/rótulo",
};

const credentialFallbacks: CorreiosCredentialField[] = [
  { key: "contract", label: "Contrato", required: true, present: false },
  { key: "postingCard", label: "Cartão de postagem", required: true, present: false },
  { key: "username", label: "Usuário/API key", required: true, present: false },
  { key: "password", label: "Senha/Token", required: true, present: false },
];

async function fetchCorreiosStatus(): Promise<CorreiosIntegrationStatusResponse> {
  const { data } = await api.get(endpoints.adminCorreiosIntegration.status);
  return (data?.item ?? data) as CorreiosIntegrationStatusResponse;
}

async function verifyCorreiosIntegration(): Promise<CorreiosIntegrationStatusResponse> {
  const { data } = await api.post(endpoints.adminCorreiosIntegration.verify, {});
  return (data?.item ?? data) as CorreiosIntegrationStatusResponse;
}

function maskPreview(value?: string | null) {
  if (!value) return "Não informado";
  return value;
}

function statusBadgeClass(status: AuthStatus | CapabilityStatus | "YES" | "NO") {
  switch (status) {
    case "OK":
    case "AVAILABLE":
    case "YES":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PENDING":
    case "NOT_VALIDATED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "FAILED":
    case "NO":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "NOT_CONFIGURED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function humanAuthLabel(status: AuthStatus) {
  if (status === "OK") return "OK";
  if (status === "FAILED") return "Falhou";
  return "Pendente";
}

function humanCapabilityStatus(status: CapabilityStatus) {
  if (status === "AVAILABLE") return "Disponível";
  if (status === "NOT_CONFIGURED") return "Não configurada";
  if (status === "NOT_VALIDATED") return "Não validada";
  return "Falhou";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Ainda não verificado";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Data inválida";

  return dt.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function technicalErrorInfo(err: AxiosError) {
  const status = err.response?.status;
  const requestMethod = err.config?.method?.toUpperCase() ?? "GET";
  const requestPath = err.config?.url ?? "(url desconhecida)";
  const payload =
    typeof err.response?.data === "string"
      ? err.response.data
      : JSON.stringify(err.response?.data ?? {}, null, 2);

  return `status=${status ?? "sem status"}; request=${requestMethod} ${requestPath}; payload=${payload}`;
}

function mapError(err: unknown, fallback: string): ErrorDetails {
  const fallbackMsg = apiErrorMessage(err, fallback);

  if (typeof err === "object" && err && "code" in err && (err as { code?: string }).code === "ECONNABORTED") {
    return {
      type: "TIMEOUT",
      title: "Tempo de resposta excedido",
      summary: "O backend demorou para responder. Tente novamente em instantes.",
      technical: fallbackMsg,
    };
  }

  if (typeof err === "object" && err && "isAxiosError" in err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;

    if (status === 401) {
      return {
        type: "UNAUTHORIZED",
        title: "Sessão sem autorização",
        summary: "Sua sessão não está autorizada para consultar a integração dos Correios.",
        technical: technicalErrorInfo(axiosErr),
      };
    }

    if (status === 403) {
      return {
        type: "FORBIDDEN",
        title: "Acesso negado",
        summary: "Seu usuário não tem permissão para esta operação administrativa.",
        technical: technicalErrorInfo(axiosErr),
      };
    }

    if (status && status >= 500) {
      return {
        type: "SERVER_ERROR",
        title: "Falha interna no servidor",
        summary: "O servidor retornou um erro interno ao verificar a integração.",
        technical: technicalErrorInfo(axiosErr),
      };
    }

    if (!status) {
      return {
        type: "UNAVAILABLE",
        title: "Backend indisponível",
        summary: "Não foi possível conectar ao backend agora. Verifique disponibilidade e rede.",
        technical: technicalErrorInfo(axiosErr),
      };
    }
  }

  return {
    type: "UNKNOWN",
    title: "Não foi possível concluir a operação",
    summary: fallbackMsg,
    technical: fallbackMsg,
  };
}

function authChip(status: AuthStatus) {
  return (
    <Badge className={`rounded-full border px-3 py-1 ${statusBadgeClass(status)}`}>
      {humanAuthLabel(status)}
    </Badge>
  );
}

export function CorreiosIntegrationPanel() {
  const statusQ = useQuery({
    queryKey: ["admin-correios-integration-status"],
    queryFn: fetchCorreiosStatus,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const verifyM = useMutation({
    mutationFn: verifyCorreiosIntegration,
    onSuccess: (data) => {
      statusQ.refetch();
      if (data.authStatus === "OK") {
        // noop toast aqui para evitar ruído visual em refresh automático
      }
    },
  });

  const errorDetails = useMemo(() => {
    if (verifyM.isError) return mapError(verifyM.error, "Falha ao verificar integração dos Correios.");
    if (statusQ.isError) return mapError(statusQ.error, "Falha ao carregar status da integração dos Correios.");
    return null;
  }, [statusQ.error, statusQ.isError, verifyM.error, verifyM.isError]);

  const data = verifyM.data ?? statusQ.data ?? null;

  const capabilities = useMemo(() => {
    const map = new Map((data?.capabilities ?? []).map((c) => [c.key, c]));
    return capabilityOrder.map((key) => {
      const current = map.get(key);
      return {
        key,
        label: current?.label || capabilityFallbackLabels[key],
        status: current?.status ?? "NOT_CONFIGURED",
        detail: current?.detail ?? null,
      };
    });
  }, [data?.capabilities]);

  const credentials = data?.credentials?.length ? data.credentials : credentialFallbacks;

  const diagnostics = data?.diagnostics ?? [];
  const warnings = diagnostics.filter((item) => item.severity === "warning");
  const errors = diagnostics.filter((item) => item.severity === "error");

  return (
    <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-4 border-b border-slate-100 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
              Integração Correios
            </Badge>
            <CardTitle className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Verificação e diagnóstico da integração
            </CardTitle>
            <p className="text-sm text-slate-500">
              Painel de status para configuração, autenticação e capacidades. Sem exposição de segredos.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => statusQ.refetch()}
              disabled={statusQ.isFetching || verifyM.isPending}
            >
              {statusQ.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar status
            </Button>

            <Button
              type="button"
              className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => verifyM.mutate()}
              disabled={verifyM.isPending || statusQ.isFetching}
            >
              {verifyM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Verificar integração
            </Button>
          </div>
        </div>

        {!data && !statusQ.isLoading ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Ainda não há dados de integração disponíveis. Clique em <strong>Verificar integração</strong>.
          </div>
        ) : null}

        {errorDetails ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="flex items-center gap-2 font-semibold">
              <Siren className="h-4 w-4" />
              {errorDetails.title}
            </div>
            <p className="mt-1 text-sm">{errorDetails.summary}</p>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Integração</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{data?.provider ?? "Correios"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Configurado</div>
            <div className="mt-2">
              <Badge className={`rounded-full border px-3 py-1 ${statusBadgeClass(data?.configured ? "YES" : "NO")}`}>
                {data?.configured ? "Sim" : "Não"}
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Autenticação</div>
            <div className="mt-2">{authChip(data?.authStatus ?? "PENDING")}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Última verificação</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(data?.checkedAt)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Credenciais</h3>
          <p className="mt-1 text-xs text-slate-500">Prévia mascarada apenas. Segredos completos nunca são exibidos.</p>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {credentials.map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                  <Badge
                    className={`rounded-full border px-2.5 py-0.5 ${statusBadgeClass(item.present ? "YES" : "NO")}`}
                  >
                    {item.present ? "Presente" : "Ausente"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.required ? "Obrigatório" : "Opcional"}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-700">{maskPreview(item.maskedPreview)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Capacidades</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {capabilities.map((cap) => (
              <div key={cap.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{cap.label}</div>
                  <Badge className={`rounded-full border px-2.5 py-0.5 ${statusBadgeClass(cap.status)}`}>
                    {humanCapabilityStatus(cap.status)}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">{cap.detail || "Sem detalhes adicionais no momento."}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900">Diagnóstico</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Warnings
              </div>
              {warnings.length ? (
                <ul className="space-y-2 text-sm text-amber-900">
                  {warnings.map((item) => (
                    <li key={item.code}>
                      <div className="font-medium">{item.message}</div>
                      {item.nextStep ? <div className="text-xs text-amber-800">Próximo passo: {item.nextStep}</div> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-amber-900/80">Nenhum warning reportado.</p>
              )}
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-800">
                <XCircle className="h-4 w-4" /> Errors
              </div>
              {errors.length ? (
                <ul className="space-y-2 text-sm text-rose-900">
                  {errors.map((item) => (
                    <li key={item.code}>
                      <div className="font-medium">{item.message}</div>
                      {item.nextStep ? <div className="text-xs text-rose-800">Próximo passo: {item.nextStep}</div> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-rose-900/80">Nenhum erro reportado.</p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-sm font-semibold text-slate-900">Próximos passos</div>
            {(data?.nextSteps?.length ?? 0) > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {(data?.nextSteps ?? []).map((step, idx) => (
                  <li key={`${step}-${idx}`}>{step}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">Sem pendências informadas no momento.</p>
            )}
          </div>
        </section>

        {(errorDetails?.technical || diagnostics.length) ? (
          <Accordion type="single" collapsible className="rounded-2xl border border-slate-200 px-4">
            <AccordionItem value="tech-details" className="border-0">
              <AccordionTrigger className="py-3 text-sm font-semibold text-slate-900">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Ver detalhes técnicos
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {errorDetails?.technical ? (
                    <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      {errorDetails.technical}
                    </pre>
                  ) : null}

                  {diagnostics.length ? (
                    <div className="space-y-2">
                      {diagnostics.map((item) => (
                        <div key={item.code} className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                          <div className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                            {item.severity === "warning" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <CircleSlash className="h-4 w-4 text-rose-600" />
                            )}
                            {item.code}
                          </div>
                          <div>{item.message}</div>
                          {item.nextStep ? <div className="mt-1 text-slate-500">nextStep: {item.nextStep}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}

        {(statusQ.isLoading || verifyM.isPending) ? (
          <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <Loader2 className="h-4 w-4 animate-spin" /> Validando dados da integração dos Correios...
          </div>
        ) : null}

        {!statusQ.isLoading && !verifyM.isPending && !errorDetails && data ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Status carregado com sucesso.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
