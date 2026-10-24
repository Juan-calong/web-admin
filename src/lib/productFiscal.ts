import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export type ProductFiscalData = {
  blingProductId?: string | null;
  fiscalDescription?: string | null;
  unit?: string | null;
  tributaryUnit?: string | null;
  gtin?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origin?: string | null;
  itemType?: string | null;
  defaultCfop?: string | null;
  icmsCst?: string | null;
  icmsCsosn?: string | null;
  pisCst?: string | null;
  cofinsCst?: string | null;
  ipiCst?: string | null;
};

export type ProductFiscalReadiness = {
  ready: boolean;
  missing: string[];
  warnings: string[];
};

export type ProductFiscalResponse = {
  productId: string;
  fiscalData: ProductFiscalData | null;
  readiness: ProductFiscalReadiness;
  syncPlan?: ProductFiscalSyncPlan;
};

export type ProductFiscalInput = ProductFiscalData;
export type ProductFiscalSyncPlan = { blocked: boolean; reason?: string | null; legacyRevision: number | null; requiresRevision: boolean };

export async function getAdminProductFiscal(productId: string) {
  const { data } = await api.get(endpoints.adminProductFiscal.get(productId));
  return (data?.item ?? data) as ProductFiscalResponse;
}

function cleanField(value?: string | null, options?: { uppercase?: boolean }) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return options?.uppercase ? trimmed.toUpperCase() : trimmed;
}

export function normalizeFiscalInput(input: ProductFiscalInput): ProductFiscalInput {
  return {
    blingProductId: cleanField(input.blingProductId),
    fiscalDescription: cleanField(input.fiscalDescription),
    unit: cleanField(input.unit, { uppercase: true }),
    tributaryUnit: cleanField(input.tributaryUnit, { uppercase: true }),
    gtin: cleanField(input.gtin),
    ncm: cleanField(input.ncm),
    cest: cleanField(input.cest),
    origin: cleanField(input.origin),
    itemType: cleanField(input.itemType),
    defaultCfop: cleanField(input.defaultCfop),
    icmsCst: cleanField(input.icmsCst),
    icmsCsosn: cleanField(input.icmsCsosn),
    pisCst: cleanField(input.pisCst),
    cofinsCst: cleanField(input.cofinsCst),
    ipiCst: cleanField(input.ipiCst),
  };
}

export async function updateAdminProductFiscal(productId: string, input: ProductFiscalInput, saved?: ProductFiscalData | null) {
  let payload = normalizeFiscalInput(input);
  if (saved) {
    const baseline = normalizeFiscalInput(saved);
    payload = Object.fromEntries(Object.entries(payload).filter(([field, value]) =>
      value !== undefined && (value ?? null) !== (baseline[field as keyof ProductFiscalData] ?? null)
    ));
  }
  if (payload.itemType != null && payload.itemType !== "" && !/^(?:0[0-9]|10|99)$/.test(payload.itemType)) {
    throw new Error("Informe o código SPED aprovado pela responsável fiscal; rótulos legados precisam de revisão.");
  }
  const { data } = await api.put(endpoints.adminProductFiscal.save(productId), payload);
  return (data?.item ?? data) as ProductFiscalResponse;
}
export type ProductBlingSyncResponse = {
  productId: string;
  sku?: string | null;
  name?: string | null;
  readiness?: ProductFiscalReadiness;
  blingProductId?: string | null;
  created?: boolean;
  updated?: boolean;
  existing?: boolean;
  source?: "db" | "bling-search" | "created" | string;
  syncedAt?: string;
};

export async function syncAdminProductToBling(productId: string, plan?: ProductFiscalSyncPlan, confirmedRevision = false) {
  if (!plan || plan.blocked) throw new Error("Sincronização indisponível: atualize o cadastro e verifique pendências de reconciliação.");
  if (plan.requiresRevision && (!confirmedRevision || !Number.isSafeInteger(plan.legacyRevision) || (plan.legacyRevision ?? 0) < 1)) {
    throw new Error("Confirme explicitamente a revisão fiscal proposta antes de sincronizar.");
  }
  const { data } = await api.post(endpoints.adminProductBling.sync(productId), plan.requiresRevision ? { legacyRevision: plan.legacyRevision } : {});
  return (data?.item ?? data) as ProductBlingSyncResponse;
}
