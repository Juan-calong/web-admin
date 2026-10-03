export type FiscalRecoveryResult =
  | { status: 'complete'; productId: string; createdNow: boolean; fiscalSaved: boolean; mediaPending: boolean }
  | { status: 'fiscal-recovery'; productId: string; createdNow: boolean; error: unknown; mediaPending: boolean }
  | { status: 'media-error'; productId: string; createdNow: true; error: unknown; mediaPending: true }
  | { status: 'open-product'; productId: string; createdNow: false; mediaPending: boolean };

export function postCreationAction({ mediaError, fiscalError, hasFiscalCurrent }: {
  mediaError: boolean;
  fiscalError: boolean;
  hasFiscalCurrent: boolean;
}): 'open-product' | 'save-fiscal-and-open' | 'retry-fiscal' {
  if (!hasFiscalCurrent) return 'open-product';
  if (fiscalError) return 'retry-fiscal';
  if (mediaError) return 'save-fiscal-and-open';
  return 'retry-fiscal';
}

export async function submitProductWithFiscalRecovery<T>({
  createdProductId,
  fiscalValues,
  createProduct,
  onCreated,
  afterCreate,
  saveFiscal,
  mediaPending = false,
}: {
  createdProductId: string | null;
  fiscalValues: T;
  createProduct: () => Promise<string>;
  onCreated: (productId: string) => void;
  afterCreate?: (productId: string) => Promise<void>;
  saveFiscal: ((productId: string, values: T) => Promise<void>) | null;
  mediaPending?: boolean;
}): Promise<FiscalRecoveryResult> {
  const createdNow = createdProductId === null;
  const productId = createdProductId ?? await createProduct();
  if (!productId) throw new Error('Produto criado, mas a resposta não informou o ID.');

  if (createdNow) {
    onCreated(productId);
    try {
      await afterCreate?.(productId);
    } catch (error) {
      return { status: 'media-error', productId, createdNow: true, error, mediaPending: true };
    }
  }

  if (!saveFiscal) return { status: 'complete', productId, createdNow, fiscalSaved: false, mediaPending };
  try {
    await saveFiscal(productId, fiscalValues);
    return { status: 'complete', productId, createdNow, fiscalSaved: true, mediaPending };
  } catch (error) {
    return { status: 'fiscal-recovery', productId, createdNow, error, mediaPending };
  }
}
