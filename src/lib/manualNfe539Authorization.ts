import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import { authStore } from "@/lib/auth";
import { endpoints } from "@/lib/endpoints";
import { fiscalNoAuthRetryConfig } from "@/lib/fiscalNoAuthRetry";
import { isFiscalAdmin, type FiscalBinding } from "@/lib/supervisedFiscal";

const maxXmlBytes = 96 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/i;

export type DraftNfeXml = { text: string; sha256: string };
type ManualNfe539Error = { http: number | null; error: string; uncertain?: boolean };
export type ManualNfe539Result =
  | { http: number; authorizationId: string; expiresAt: string; transportAuthorized: false }
  | ManualNfe539Error;
const manualConfirmation = "TRANSMIT_ONCE_IN_BLING_PANEL";
const consumptionStatus = "AWAITING_CANONICAL_RECONCILIATION";
export type ManualNfe539ConsumptionResult =
  | { consumptionId: string; status: typeof consumptionStatus; transportAuthorized: false }
  | ManualNfe539Error;

export function hasManualNfe539Session() {
  return isFiscalAdmin(authStore.getMe()) && Boolean(authStore.getAccessToken());
}

export async function readDraftNfeXml(file: Blob): Promise<DraftNfeXml> {
  if (!file.size || file.size > maxXmlBytes) throw new Error("Invalid XML size");
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""),
  };
}

export function verifiedManualNfe539Input(reviewId: string, xml: DraftNfeXml | null, expectedHash: string) {
  return uuid.test(reviewId.trim()) && Boolean(
    xml?.text && sha256.test(expectedHash.trim()) && xml.sha256 === expectedHash.trim().toLowerCase(),
  );
}

function rejectionMessage(status: number) {
  if (status === 401) return "Sessão inválida ou expirada. Entre novamente.";
  if (status === 403) return "A sessão não tem permissão para esta autorização.";
  if (status === 409) return "A API bloqueou a autorização. Confira a revisão e a situação fiscal do pedido.";
  return "A API recusou a autorização. Confira os dados e o estado fiscal do pedido.";
}

const uncertainMessage = "Resultado não confirmado. Verifique a autorização no registro fiscal antes de prosseguir.";
const definitiveRejections = [400, 401, 403, 404, 409, 413, 422];

export function createManualNfe539Authorization(binding: FiscalBinding) {
  const key = `keyfi-manual-nfe-539:${binding.orderId}:${binding.automationId}:pending`;
  const consumeKey = `${key}:consume`;
  let started = false;
  let approved: { id: string; expiresAt: number; draftXml: string; adminId: string; sessionVersion: number } | null = null;

  async function authorize(input: {
    reviewId: string;
    xml: DraftNfeXml | null;
    expectedHash: string;
    confirmed: boolean;
  }): Promise<ManualNfe539Result> {
    if (!hasManualNfe539Session()) return { http: null, error: "Sessão ADMIN necessária." };
    if (started || !input.confirmed || !input.xml ||
        !verifiedManualNfe539Input(input.reviewId, input.xml, input.expectedHash)) {
      return { http: null, error: "Confira a revisão e o SHA-256 do XML antes de confirmar." };
    }

    try {
      if (localStorage.getItem(key)) return { http: null, error: uncertainMessage, uncertain: true };
      // Keep only a pending marker. A reload or uncertain response must not invite a second POST.
      localStorage.setItem(key, "1");
    } catch {
      return { http: null, error: "Não foi possível proteger a operação contra repetição." };
    }
    started = true;
    const draftXml = input.xml.text;
    const adminId = authStore.getMe()?.id;
    const sessionVersion = authStore.getSessionVersion();

    let http: number | null = null;
    try {
      const response = await api.post(
        endpoints.adminOrderFiscal.authorizeManualNfe539(binding.orderId, binding.automationId),
        { reviewId: input.reviewId.trim(), draftXml },
        fiscalNoAuthRetryConfig,
      );
      http = response.status;
      const { authorizationId, expiresAt, transportAuthorized } = response.data ?? {};
      if (http !== 200 || typeof authorizationId !== "string" || !uuid.test(authorizationId) ||
          typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || transportAuthorized !== false) {
        return { http, error: uncertainMessage, uncertain: true };
      }
      localStorage.removeItem(key);
      if (adminId) approved = { id: authorizationId, expiresAt: Date.parse(expiresAt), draftXml, adminId, sessionVersion };
      return { http, authorizationId, expiresAt, transportAuthorized };
    } catch (error) {
      http = isAxiosError(error) ? error.response?.status ?? http : http;
      if (http !== null && definitiveRejections.includes(http)) {
        try {
          localStorage.removeItem(key);
          started = false;
          return { http, error: rejectionMessage(http) };
        } catch {
          // Retain the conservative block if storage is unavailable.
        }
      }
      return { http, error: uncertainMessage, uncertain: true };
    }
  }

  async function consume(confirmed: boolean): Promise<ManualNfe539ConsumptionResult> {
    if (!confirmed || !approved) return { http: null, error: "Confirme o consumo de uma autorização registrada nesta tela." };
    if (!hasManualNfe539Session() || authStore.getMe()?.id !== approved.adminId ||
        authStore.getSessionVersion() !== approved.sessionVersion) {
      return { http: null, error: "Use a mesma sessão ADMIN da autorização." };
    }
    if (Date.now() >= approved.expiresAt) return { http: null, error: "A autorização expirou." };

    const uncertain = "Consumo não confirmado. Confira o registro fiscal antes de prosseguir.";
    try {
      if (localStorage.getItem(consumeKey)) return { http: null, error: uncertain, uncertain: true };
      localStorage.setItem(consumeKey, "1");
    } catch {
      return { http: null, error: "Não foi possível proteger o consumo contra repetição." };
    }
    const { id, draftXml } = approved;
    approved = null;

    let http: number | null = null;
    try {
      const response = await api.post(
        endpoints.adminOrderFiscal.consumeManualNfe539(binding.orderId, binding.automationId),
        { authorizationId: id, draftXml, confirmation: manualConfirmation },
        fiscalNoAuthRetryConfig,
      );
      http = response.status;
      const { consumptionId, status, transportAuthorized } = response.data ?? {};
      if (http === 200 && typeof consumptionId === "string" && uuid.test(consumptionId) &&
          status === consumptionStatus && transportAuthorized === false) {
        return { consumptionId, status, transportAuthorized };
      }
    } catch (error) {
      http = isAxiosError(error) ? error.response?.status ?? http : http;
      if (http !== null && definitiveRejections.includes(http)) {
        // A definitive rejection can release the browser marker for a future authorization.
        // This authorization remains unavailable for a second dispatch.
        try {
          localStorage.removeItem(consumeKey);
          return { http, error: "A API recusou o consumo. Confira a sessão, a validade e o registro fiscal." };
        } catch {
          // Retain the conservative block if storage is unavailable.
        }
      }
    }
    return { http, error: uncertain, uncertain: true };
  }

  return { authorize, consume };
}
