const LABELS: Record<string, string> = {
  sku: 'SKU', name: 'Nome', description: 'Descrição do produto', fullDescription: 'Descrição completa',
  effects: 'Benefício', benefits: 'Ativos e funções', howToUse: 'Modo de uso', highlights: 'Destaques',
  price: 'Preço', customerPrice: 'Preço cliente final', stock: 'Estoque', brand: 'Marca', line: 'Linha / Família',
  volume: 'Volume', weightKg: 'Peso da embalagem', heightCm: 'Altura da caixa', widthCm: 'Largura da caixa',
  lengthCm: 'Comprimento da caixa', packageVolumes: 'Quantidade de volumes', categoryId: 'Categoria principal',
  categoryIds: 'Categorias', audience: 'Audiência', ncm: 'NCM', cest: 'CEST', unit: 'Unidade comercial',
  tributaryUnit: 'Unidade tributável', fiscalDescription: 'Descrição fiscal', gtin: 'GTIN/EAN', origin: 'Origem',
  itemType: 'Tipo do item', defaultCfop: 'CFOP padrão', icmsCst: 'ICMS CST', icmsCsosn: 'ICMS CSOSN',
  pisCst: 'PIS CST', cofinsCst: 'COFINS CST', ipiCst: 'IPI CST',
};
type Issue = { path?: (string | number)[]; msg?: string; message?: string };
export function formatProductIssues(data: unknown) {
  const response = (data && typeof data === 'object' ? data : {}) as { error?: string; issues?: Issue[] };
  const fields: Record<string, string> = {};
  const messages: string[] = [];
  for (const issue of response.issues ?? []) {
    const key = typeof issue.path?.[0] === 'string' ? issue.path[0] : '';
    const label = LABELS[key] ?? key;
    const index = typeof issue.path?.[1] === 'number' ? ` — item ${issue.path[1] + 1}` : '';
    const raw = issue.msg ?? issue.message ?? '';
    const max = raw.match(/<=\s*(\d+)|maximum of (\d+)|no máximo (\d+)/i);
    const min = raw.match(/>=\s*(\d+)|at least (\d+)|no mínimo (\d+)/i);
    const reason = (key === 'ncm' && /pattern|regex/i.test(raw)) ? 'deve conter exatamente 8 dígitos.'
      : (key === 'cest' && /pattern|regex/i.test(raw)) ? 'deve conter exatamente 7 dígitos.'
      : ((key === 'unit' || key === 'tributaryUnit') && /pattern|regex/i.test(raw)) ? 'use de 2 a 6 letras.'
      : max ? `máximo de ${max[1] ?? max[2] ?? max[3]} ${/array|items/i.test(raw) ? 'itens' : 'caracteres'}.`
      : min ? `mínimo de ${min[1] ?? min[2] ?? min[3]} caracteres.`
      : raw || 'Valor inválido.';
    const message = `${label || 'Campo'}${index}: ${reason}`;
    messages.push(message);
    if (key && !fields[key]) fields[key] = message;
  }
  return { message: messages[0] ?? response.error ?? 'Dados inválidos', fields };
}
