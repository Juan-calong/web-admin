"use client";
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {approvalUsable,fiscalActionLabels,safeFiscalUrl,type FiscalAction,type FiscalApproval,type FiscalSnapshot} from '@/lib/supervisedFiscal';

type Props={snapshot:FiscalSnapshot;action:FiscalAction|null;reason:string;approval:FiscalApproval|null;busy:boolean;now:number;onPrepare:()=>void;onApprove:(a:Exclude<FiscalAction,'PREPARE'>)=>void;onExecute:()=>void};
export function SupervisedFiscalActions({snapshot:s,action,reason,approval,busy,now,onPrepare,onApprove,onExecute}:Props){
  const d=s.document,valid=approvalUsable(approval,action,now)&&s.approvedId===approval?.approvalId;
  return <div className="space-y-4">
    <dl className="grid gap-2 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Venda Bling</dt><dd>{d?.blingOrderId??'Não criada'}</dd></div>
      <div><dt className="font-semibold">NF-e Bling</dt><dd>{d?.blingNfeId??'Não criada'}</dd></div>
      <div><dt className="font-semibold">Número / série</dt><dd>{d?.number??'—'} / {d?.series??'—'}</dd></div>
      <div><dt className="font-semibold">Situação</dt><dd>{d?.status??'Não preparada'} · {s.automation?.automationStatus??'Sem automação'}</dd></div>
      {d?.accessKey?<div className="break-all"><dt className="font-semibold">Chave de acesso</dt><dd>{d.accessKey}</dd></div>:null}
      {d?.protocol?<div className="break-all"><dt className="font-semibold">Protocolo</dt><dd>{d.protocol}</dd></div>:null}
    </dl>
    {s.missing?.length?<div className="rounded-xl bg-amber-50 p-3 text-sm"><strong>Impedimentos</strong><ul className="list-inside list-disc">{s.missing.map((m,i)=><li key={i}>{m}</li>)}</ul></div>:null}
    {reason?<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{reason}</p>:null}
    {s.automation?.lastErrorCode?<p className="text-sm text-red-700">Erro operacional: {s.automation.lastErrorCode}</p>:null}
    {approval?<p role="status" className="text-sm">Aprovação: {fiscalActionLabels[approval.action]}. Expira em {new Date(approval.expiresAt).toLocaleString('pt-BR')}. {!valid?'Expirada ou incompatível; solicite nova aprovação.':''}</p>:null}
    <div className="space-y-2">{(Object.keys(fiscalActionLabels) as FiscalAction[]).map(a=>{
      const enabled=action===a&&!busy;
      const execute=a!=='PREPARE'&&enabled&&valid;
      const label=a==='PREPARE'?fiscalActionLabels[a]:execute?'Executar: '+fiscalActionLabels[a]:'Solicitar aprovação: '+fiscalActionLabels[a];
      return <div key={a} className="flex flex-wrap items-center gap-2"><AlertDialog>
        <AlertDialogTrigger asChild><Button type="button" variant={a==='SEND_NFE'?'destructive':'outline'} disabled={!enabled} title={!enabled?(reason||'Conclua a etapa anterior.'):undefined}>{label}</Button></AlertDialogTrigger>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{a==='SEND_NFE'&&execute?'Confirmar envio fiscal real à SEFAZ?':label+'?'}</AlertDialogTitle>
          <AlertDialogDescription>{a==='PREPARE'?'Cria somente o documento e a automação locais, sujeitos aos gates e à revisão já configurada.':execute?'Executa uma única etapa com aprovação válida. Não haverá repetição automática.':'Registra uma aprovação administrativa limitada e de uso único. Esta confirmação ainda não executa a etapa.'}
            {a==='SEND_NFE'&&execute?` NF-e ${d?.number??'sem número'} (Bling ${d?.blingNfeId??'—'}). Confirme produtos, valores e revisão fiscal do pedido antes de enviar.`:''}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={()=>a==='PREPARE'?onPrepare():execute?onExecute():onApprove(a)}>{a==='SEND_NFE'&&execute?'Confirmar envio à SEFAZ':execute?'Confirmar execução':'Confirmar'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent></AlertDialog><span className="text-xs text-zinc-600">{enabled?(execute?'Aprovação válida':'Confirmação necessária'):(reason||'Etapa anterior pendente')}</span></div>;
    })}</div>
    <div className="flex gap-3">{(['danfeUrl','xmlUrl'] as const).map(k=>{const url=safeFiscalUrl(s[k]);return url?<a key={k} href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-sm font-semibold">Abrir {k==='danfeUrl'?'DANFE':'XML'} existente</a>:null;})}</div>
    {s.danfeStored&&!s.danfeUrl?<p className="text-sm">DANFE arquivado; link de abertura indisponível. Não será baixado novamente.</p>:null}
    {s.xmlStored&&!s.xmlUrl?<p className="text-sm">XML arquivado; link de abertura indisponível. Não será baixado novamente.</p>:null}
    <p className="text-xs text-zinc-500">Sem Worker e sem habilitar escritas globais. Cada aprovação e execução exige uma confirmação. A API revalida os gates, o pedido e a evidência fiscal.</p>
  </div>;
}
