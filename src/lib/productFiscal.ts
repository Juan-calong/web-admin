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
};

export type ProductFiscalInput = ProductFiscalData;

export async function getAdminProductFiscal(productId: string) {
  const { data } = await api.get(endpoints.adminProductFiscal.get(productId));
  return (data?.item ?? data) as ProductFiscalResponse;
}

function cleanField(value?: string | null, options?: { uppercase?: boolean }) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
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

export async function updateAdminProductFiscal(productId: string, input: ProductFiscalInput) {
  const payload = normalizeFiscalInput(input);
  const { data } = await api.put(endpoints.adminProductFiscal.save(productId), payload);
  return (data?.item ?? data) as ProductFiscalResponse;
}
