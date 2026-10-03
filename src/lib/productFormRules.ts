export const PRODUCT_FORM_LIMITS = {
  description: 2000, fullDescription: 5000,
  effects: 500, benefits: 500, howToUse: 1000, highlights: 60,
  effectsItems: 20, benefitsItems: 20, howToUseItems: 20, highlightsItems: 10,
  brand: 80, line: 80, volume: 20, categories: 20,
} as const;

export type ProductListField = 'effects' | 'benefits' | 'howToUse' | 'highlights';

export const PRODUCT_LIST_LABELS: Record<ProductListField, string> = {
  effects: 'Benefício', benefits: 'Ativos e funções', howToUse: 'Modo de uso', highlights: 'Destaques',
};

export function parseProductList(text: string, field: ProductListField = 'benefits'): string[] {
  const parts = field === 'highlights' ? String(text ?? '').split(/\r?\n/) : String(text ?? '').split(/\r?\n|;/g);
  return parts.map((s) => field === 'highlights'
    ? s.trim().replace(/\s+/g, ' ')
    : s.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter(Boolean);
}

export function checkListChange(text: string, field: ProductListField) {
  const items = parseProductList(text, field);
  const itemMax = PRODUCT_FORM_LIMITS[field];
  const countMax = PRODUCT_FORM_LIMITS[`${field}Items`];
  const invalidIndex = items.findIndex((item) => item.length > itemMax);
  if (invalidIndex >= 0) return { ok: false, items, message: `${PRODUCT_LIST_LABELS[field]} — item ${invalidIndex + 1}: máximo de ${itemMax} caracteres.` };
  if (items.length > countMax) return { ok: false, items, message: `${PRODUCT_LIST_LABELS[field]} permite no máximo ${countMax} itens.` };
  return { ok: true, items, message: '' };
}
export function clearCorrectedListError(errors: Record<string, string>, field: ProductListField, value: string): Record<string, string> {
  if (!checkListChange(value, field).ok || !errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

export function checkDecimal(value: string, scale: number, optional = false): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return optional;
  return new RegExp(`^\\d+(?:[.,]\\d{1,${scale}})?$`).test(raw);
}
export function validProductPrice(value: string): boolean {
  return checkDecimal(value, 2);
}
export function checkDecimalDraft(value: string, scale: number): boolean {
  return value === '' || new RegExp(`^\\d+(?:[.,]\\d{0,${scale}})?$`).test(value);
}

export const FISCAL_LIMITS: Record<string, number> = {
  origin: 5, gtin: 30, itemType: 120, fiscalDescription: 500,
  defaultCfop: 10, icmsCst: 10, icmsCsosn: 10, pisCst: 10, cofinsCst: 10, ipiCst: 10,
};
const FISCAL_FIELDS = new Set([
  'blingProductId', 'fiscalDescription', 'unit', 'tributaryUnit', 'gtin', 'ncm', 'cest',
  'origin', 'itemType', 'defaultCfop', 'icmsCst', 'icmsCsosn', 'pisCst', 'cofinsCst', 'ipiCst',
]);
export function replaceScopedProductErrors(current: Record<string, string>, nextErrors: Record<string, string>, scope: 'product' | 'fiscal'): Record<string, string> {
  const result = { ...current };
  const belongs = (key: string) => scope === 'fiscal' ? FISCAL_FIELDS.has(key) : !FISCAL_FIELDS.has(key);
  for (const key of Object.keys(result)) if (belongs(key)) delete result[key];
  for (const [key, message] of Object.entries(nextErrors)) if (belongs(key)) result[key] = message;
  return result;
}

export function fiscalPasteError(field: string, current: string, start: number, end: number, insert: string): string {
  const max = field === 'ncm' ? 8 : field === 'cest' ? 7 : field === 'unit' || field === 'tributaryUnit' ? 6 : FISCAL_LIMITS[field];
  if (max == null || !wouldExceedTextLimit(current, start, end, insert, max)) return '';
  if (field === 'ncm') return 'NCM: máximo de 8 dígitos. A colagem foi recusada.';
  if (field === 'cest') return 'CEST: máximo de 7 dígitos. A colagem foi recusada.';
  if (field === 'unit' || field === 'tributaryUnit') return 'Unidade: máximo de 6 letras. A colagem foi recusada.';
  return `Máximo de ${max} caracteres. A colagem foi recusada.`;
}

export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export function productImageContentType(type: string): string {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(type as typeof PRODUCT_IMAGE_MIME_TYPES[number])) {
    throw new Error('Cada imagem deve ser JPG, PNG ou WEBP.');
  }
  return type;
}
export function resolveImageSelection<T extends { type: string; size: number }>(files: T[]): { files: T[]; error: string } {
  const invalid = files.some((file) => !PRODUCT_IMAGE_MIME_TYPES.includes(file.type as typeof PRODUCT_IMAGE_MIME_TYPES[number]) || file.size < 1 || file.size > 5 * 1024 * 1024);
  return invalid ? { files: [], error: 'Cada imagem deve ser JPG, PNG ou WEBP e ter entre 1 byte e 5 MB.' } : { files, error: '' };
}
export function resolveVideoSelection<T extends { type: string }>(file: T | null): { file: T | null; error: string } {
  return file && !file.type.startsWith('video/') ? { file: null, error: 'Selecione um arquivo de vídeo válido.' } : { file, error: '' };
}

export function checkFiscal(field: string, value: string): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return true;
  if (field === 'ncm') return /^\d{8}$/.test(raw);
  if (field === 'cest') return /^\d{7}$/.test(raw);
  if (field === 'unit' || field === 'tributaryUnit') return /^[A-Z]{2,6}$/.test(raw.toUpperCase());
  const max = FISCAL_LIMITS[field];
  return max == null || raw.length <= max;
}
export function fiscalErrorMessage(field: string, label: string): string {
  if (field === 'ncm') return `${label} deve conter exatamente 8 dígitos.`;
  if (field === 'cest') return `${label} deve conter exatamente 7 dígitos.`;
  if (field === 'unit' || field === 'tributaryUnit') return `${label} deve conter de 2 a 6 letras.`;
  return `${label} pode ter no máximo ${FISCAL_LIMITS[field]} caracteres.`;
}

export function checkWholeNumber(value: string, minimum: number) {
  return /^\d+$/.test(value.trim()) && Number(value) >= minimum && Number.isSafeInteger(Number(value));
}
export function checkInteger(value: string): boolean {
  const number = Number(value);
  return /^-?\d+$/.test(value.trim()) && Number.isInteger(number) && number >= -2147483648 && number <= 2147483647;
}
export function wouldExceedTextLimit(current: string, start: number, end: number, insert: string, max: number): boolean {
  return current.length - (end - start) + insert.length > max;
}
