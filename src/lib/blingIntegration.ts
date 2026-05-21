import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export type BlingIntegrationStatus = {
  provider: string;
  configured: boolean;
  connected: boolean;
  expiresAt?: string | null;
  connectedAt?: string | null;
  lastRefreshAt?: string | null;
  missingEnv?: string[];
};

export type BlingApiStatus = {
  ok: boolean;
  message?: string;
  environment?: string | null;
  provider?: string;
  connected?: boolean;
  apiReachable?: boolean;
};

export type BlingFiscalConfigInput = {
  natureOperationId: string;
  natureOperationName: string;
  series: string;
  finality: string;
  storeId: string;
  storeName: string;
  defaultIssueType: string;
  defaultSituation: number;
};

export type BlingFiscalConfigRawResponse = {
  environment?: string | null;
  config?:
    | (Partial<BlingFiscalConfigInput> & {
        id?: string | null;
        environment?: string | null;
      })
    | null;
  readiness?: {
    ready?: boolean;
    missing?: string[];
    warnings?: string[];
  } | null;
};

export type BlingFiscalConfigResponse = BlingFiscalConfigInput & {
  environment?: string | null;
  ready: boolean;
  missing: string[];
  warnings: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toBooleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeFiscalConfigResponse(raw: unknown): BlingFiscalConfigResponse {
  const payload = asRecord(raw);
  const configCandidate = asRecord(payload.config);
  const readinessCandidate = asRecord(payload.readiness);

  const hasNestedConfig = payload.config && typeof payload.config === "object";
  const hasNestedReadiness = payload.readiness && typeof payload.readiness === "object";

  const sourceConfig = hasNestedConfig ? configCandidate : payload;
  const sourceReadiness = hasNestedReadiness ? readinessCandidate : payload;

  const environmentFromRoot = payload.environment;
  const environmentFromConfig = sourceConfig.environment;

  return {
    environment:
      typeof environmentFromRoot === "string"
        ? environmentFromRoot
        : typeof environmentFromConfig === "string"
          ? environmentFromConfig
          : null,
    natureOperationId: toStringValue(sourceConfig.natureOperationId, ""),
    natureOperationName: toStringValue(sourceConfig.natureOperationName, ""),
    series: toStringValue(sourceConfig.series, ""),
    finality: toStringValue(sourceConfig.finality, ""),
    storeId: toStringValue(sourceConfig.storeId, ""),
    storeName: toStringValue(sourceConfig.storeName, ""),
    defaultIssueType: toStringValue(sourceConfig.defaultIssueType, "S"),
    defaultSituation: toNumberValue(sourceConfig.defaultSituation, 1),
    ready: toBooleanValue(sourceReadiness.ready, false),
    missing: toStringArray(sourceReadiness.missing),
    warnings: toStringArray(sourceReadiness.warnings),
  };
}

export async function getBlingIntegrationStatus() {
  const { data } = await api.get(endpoints.adminBlingIntegration.status);
  return (data?.item ?? data) as BlingIntegrationStatus;
}

export async function getBlingApiStatus() {
  const { data } = await api.get(endpoints.adminBlingIntegration.apiStatus);
  return (data?.item ?? data) as BlingApiStatus;
}

export async function startBlingOAuth() {
  const { data } = await api.get(endpoints.adminBlingIntegration.oauthStart);
  return (data?.item ?? data) as { url: string };
}

export async function refreshBlingOAuth() {
  const { data } = await api.post(endpoints.adminBlingIntegration.oauthRefresh, {});
  return (data?.item ?? data) as BlingIntegrationStatus;
}

export async function getBlingFiscalConfig() {
  const { data } = await api.get(endpoints.adminBlingIntegration.fiscalConfig);
  return normalizeFiscalConfigResponse(data?.item ?? data);
}

export async function updateBlingFiscalConfig(input: BlingFiscalConfigInput) {
  const { data } = await api.put(endpoints.adminBlingIntegration.fiscalConfig, input);
  return normalizeFiscalConfigResponse(data?.item ?? data);
}
