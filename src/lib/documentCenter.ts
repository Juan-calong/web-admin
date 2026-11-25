export const DOCUMENT_BATCH_LIMIT=5;
export function documentAvailabilityMessage(row:{danfeExternalOnly?:boolean},kind:string):string {
 if(row.danfeExternalOnly && kind!=='LABEL')return 'DANFE externa: download em lote indisponível. Abra o pedido para acessar o link original do Bling pelo fluxo autorizado.';
 return '';
}
export function businessDateBoundary(value: string, nextDay = false): string | undefined {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    const target = Date.UTC(year, month - 1, day + (nextDay ? 1 : 0));
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', timeZoneName: 'longOffset' }).formatToParts(new Date(target + 12 * 3600000)).find(p => p.type === 'timeZoneName')!.value;
    const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1) : 0;
    return new Date(target - minutes * 60000).toISOString();
}
export function eligibleSelection(selected: string[], rows: Array<{id:string;eligible:boolean}>, unavailable = false): string[] {
    if (unavailable) return [];
    const eligible = new Set(rows.filter(row => row.eligible).map(row => row.id));
    return [...new Set(selected)].filter(id => eligible.has(id));
}
export async function documentDownloadError(error: unknown): Promise<string> {
    const response = (error as {response?:{status?:number;data?:unknown}})?.response;
    if (response?.status === 401) return 'Sessão expirada. Entre novamente para baixar os documentos.';
    if (response?.status === 403) return 'Você não tem permissão para baixar estes documentos.';
    let data = response?.data;
    if (data instanceof Blob) { try { data = JSON.parse(await data.text()); } catch { data = null; } }
    const code = (data as {code?:string})?.code;
    if (code === 'EXPORT_TIMEOUT') return 'O tempo máximo de 20 segundos foi atingido. Reduza o lote e tente novamente; nenhum ZIP foi produzido.';
    if (code === 'EXPORT_MEMORY_LIMIT') return 'A memória disponível está abaixo do limite seguro. Aguarde e tente um lote menor; nenhum ZIP foi produzido.';
    if (code === 'EXPORT_ZIP_LIMIT') return 'O ZIP excede o limite seguro. Reduza o lote; nenhum arquivo parcial foi produzido.';
    if (['EXPORT_TOO_LARGE','DOCUMENT_TOO_LARGE','DOCUMENT_SIZE_INVALID','DOCUMENT_PROCESSING_LIMIT','DOCUMENT_INLINE_INVALID','INVALID_ORDER_IDS'].includes(code||'')) return 'O arquivo ou lote excede os limites: até 5 pedidos, 1 MiB e 100 páginas por PDF e 4 MiB no total. Reduza a seleção; o lote inteiro foi bloqueado.';
    if (response?.status === 429 || code === 'EXPORT_BUSY') return 'Há exportações em andamento. Aguarde e tente novamente.';
    if (code === 'DOCUMENTS_CHANGED') return 'O pedido foi atualizado durante o download. Atualize a lista e selecione novamente.';
    if (code === 'DOCUMENT_CORRUPT') return 'Um documento está inválido. O lote inteiro foi bloqueado; confira os arquivos do pedido.';
    return 'Download recusado. Atualize a lista e confira os documentos; nenhum arquivo foi substituído.';
}
