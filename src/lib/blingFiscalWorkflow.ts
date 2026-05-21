import { api } from "@/lib/api";

export type FiscalWorkflowActionMethod = "POST" | "GET_EXTERNAL";

export type FiscalWorkflowAction = {
  id: string;
  label: string;
  method: FiscalWorkflowActionMethod;
  endpoint: string;
  enabled: boolean;
  reason?: string | null;
};

export type FiscalWorkflowSummary = {
  paymentStatus?: string | null;
  orderStatus?: string | null;
  readyForFiscal?: boolean;
  blingOrderId?: string | null;
  blingNfeId?: string | null;
  nfeNumber?: string | null;
  nfeSeries?: string | null;
  nfeStatus?: string | null;
  accessKey?: string | null;
  protocol?: string | null;
  lastSyncAt?: string | null;
  danfeAvailable?: boolean;
  danfeStored?: boolean;
  danfeExternalUrl?: boolean;
  xmlAvailable?: boolean;
  xmlStored?: boolean;
};

export type FiscalWorkflowDocuments = {
  danfe?: {
    available?: boolean;
    stored?: boolean;
    url?: string | null;
    key?: string | null;
    source?: string | null;
    canDownload?: boolean;
    downloadEndpoint?: string | null;
    message?: string | null;
  };
  xml?: {
    available?: boolean;
    stored?: boolean;
    url?: string | null;
    key?: string | null;
    canDownload?: boolean;
    downloadEndpoint?: string | null;
    message?: string | null;
  };
};

export type FiscalWorkflowResponse = {
  orderId: string;
  environment?: string | null;
  overallStatus?: string | null;
  summary?: FiscalWorkflowSummary;
  readiness?: Record<string, unknown>;
  documents?: FiscalWorkflowDocuments;
  actions?: FiscalWorkflowAction[];
  warnings?: string[];
  nextRecommendedAction?: string | null;
};

function orderPath(orderId: string) {
  return `/admin/orders/${orderId}/bling/fiscal-workflow`;
}

export async function getOrderBlingFiscalWorkflow(orderId: string) {
  const { data } = await api.get(orderPath(orderId));
  return data as FiscalWorkflowResponse;
}

export async function runOrderBlingFiscalAction(
  orderId: string,
  action: FiscalWorkflowAction
) {
  const endpoint = action.endpoint.replace(":orderId", orderId);
  const { data } = await api.post(endpoint, {});
  return data as { message?: string };
}
