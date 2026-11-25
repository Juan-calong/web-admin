"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { businessDateBoundary, eligibleSelection, documentDownloadError, documentAvailabilityMessage, DOCUMENT_BATCH_LIMIT } from "@/lib/documentCenter";
import { toast } from "sonner";
type Row = {
    id: string;
    code?: string;
    createdAt: string;
    state: string;
    eligible: boolean;
    danfeExternalOnly?:boolean;
};
export default function DocumentsPage() {
    const [view, setView] = useState("ready"), [kind, setKind] = useState("KIT"), [q, setQ] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
    const [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
    const reset = () => { setCursor(null); setSelected([]); };
    const query = useQuery({ queryKey: ["document-center", view, kind, q, from, to, cursor], queryFn: async () => { const { data } = await api.get('/admin/documents', { params: { view, kind, q, from: businessDateBoundary(from), to: businessDateBoundary(to,true), cursor } }); return data as {
            items: Row[];
            nextCursor: string | null;
        }; }, retry: false });
    const exportIds = eligibleSelection(selected,query.data?.items ?? [],query.isError || query.isFetching);
    async function download(ids: string[], format = "zip") { setBusy(true); try {
        const response = await api.post('/admin/documents/export', { orderIds: ids, kind, format }, { responseType: 'blob', timeout: 25000 });
        const url = URL.createObjectURL(response.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'pdf' ? `${ids[0]}_${kind.toLowerCase()}.pdf` : 'keyfi-documents.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    catch (error) {
        toast.error(await documentDownloadError(error));
    }
    finally {
        setBusy(false);
    } }
    return <main className="mx-auto max-w-6xl space-y-5 p-6 [&_button]:rounded-lg [&_button]:border [&_button]:border-zinc-300 [&_button]:bg-white [&_button]:px-3 [&_button]:py-2 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-40 [&_select]:rounded-lg [&_select]:border [&_select]:border-zinc-300 [&_select]:bg-white [&_select]:p-2"><Link href="/admin/orders">Voltar aos pedidos</Link><h1 className="text-2xl font-bold">Central de documentos</h1><p>Baixe documentos existentes. Limites: 5 pedidos, 1 MiB por PDF, 4 MiB no total e 20 segundos por exportação. O ZIP mantém a sequência por pedido e inclui um manifesto. Confira o tamanho original: DANFE e etiqueta podem exigir papéis diferentes. Imprima separadamente e confirme A4 ou 100 × 150 mm conforme o PDF.</p><div className="flex flex-wrap gap-3">
 <select aria-label="Situação" value={view} onChange={e => { setView(e.target.value); reset(); }}>{[['ready', 'Prontos'], ['pending', 'Pendentes'], ['error', 'Erros'], ['all', 'Histórico']].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
 <select aria-label="Documentos" value={kind} onChange={e => { setKind(e.target.value); reset(); }}><option value="KIT">DANFE + etiqueta</option><option value="DANFE">DANFE</option><option value="LABEL">Etiqueta</option></select>
 <input aria-label="Buscar pedido" placeholder="Código ou ID do pedido" value={q} onChange={e => { setQ(e.target.value); reset(); }}/>
 <span>Período em São Paulo</span><label>De <input type="date" value={from} onChange={e => { setFrom(e.target.value); reset(); }}/></label><label>Até <input type="date" value={to} onChange={e => { setTo(e.target.value); reset(); }}/></label></div>
 <button disabled={busy || !exportIds.length || query.isFetching || query.isError} onClick={() => download(exportIds)}>Baixar ZIP ({exportIds.length}/{DOCUMENT_BATCH_LIMIT})</button>
 {selected.length > exportIds.length && !query.isFetching ? <p role="status">Seleções indisponíveis foram excluídas do download. <button onClick={()=>setSelected(exportIds)}>Limpar seleção indisponível</button></p> : null}
 {query.isPending ? <p>Carregando…</p> : null}{query.isError ? <p role="alert">Falha ao consultar documentos. <button onClick={() => query.refetch()}>Tentar novamente</button></p> : null}
 <table className="w-full text-left"><thead><tr><th>Selecionar</th><th>Pedido</th><th>Criado</th><th>Situação</th><th>Download</th></tr></thead><tbody>{query.data?.items.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Selecionar ${row.code || row.id}`} disabled={!row.eligible || busy || query.isFetching || query.isError || (!selected.includes(row.id) && selected.length >= DOCUMENT_BATCH_LIMIT)} checked={exportIds.includes(row.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))}/></td><td><Link href={`/admin/orders/${row.id}`}>{row.code || row.id}</Link></td><td>{new Date(row.createdAt).toLocaleString('pt-BR')}</td><td>{({ ready: 'Pronto', pending: 'Pendente', error: 'Erro' } as Record<string, string>)[row.state]}{documentAvailabilityMessage(row,kind) ? <p className="max-w-sm text-sm text-amber-800">{documentAvailabilityMessage(row,kind)} <Link href={`/admin/orders/${row.id}`}>Abrir pedido / Bling</Link></p> : null}</td><td><button disabled={!row.eligible || busy || query.isFetching || query.isError} onClick={() => download([row.id], kind === 'KIT' ? 'zip' : 'pdf')}>Baixar</button></td></tr>)}</tbody></table>
 {!query.isPending && !query.data?.items.length ? <p>Nenhum pedido nesta página.</p> : null}<div className="flex gap-4"><button disabled={!cursor || query.isFetching} onClick={() => { reset(); }}>Primeira página</button><button disabled={!query.data?.nextCursor || query.isFetching} onClick={() => { setCursor(query.data!.nextCursor); setSelected([]); }}>Próxima página</button></div><p>Arquivos ausentes, links externos sem cópia armazenada e documentos com erro exigem verificação. Baixar não prepara nem emite documentos.</p></main>;
}
