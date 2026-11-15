"use client";
import {useEffect,useMemo,useState} from 'react';
import {api} from '@/lib/api';
import {createBuritiShippingClient,buritiStage} from '@/lib/buritiShipping';
import {fiscalNoAuthRetryConfig} from '@/lib/fiscalNoAuthRetry';
type Action='PREPOST'|'LABEL';
type Approval={approvalId:string;action:Action;expiresAt:string};
type Stage=ReturnType<typeof buritiStage>;
type Props={stage:Stage;approval:Approval|null;busy:boolean;uncertain:boolean;recoveryKind:string|null;error:string|null;notice:string|null;now:number;onApprove:(a:Action)=>void;onExecute:(a:Action)=>void;onPoll:()=>void;onRefreshAuthorization:()=>void;onResolve:()=>void};
export function BuritiShippingActionsView({stage,approval,busy,uncertain,recoveryKind,error,notice,now,onApprove,onExecute,onPoll,onRefreshAuthorization,onResolve}:Props){
 const action=stage==='PREPOST'||stage==='LABEL'?stage:null;
 const label=action==='PREPOST'?'pré-postagem':'etiqueta';
 const valid=!!action&&approval?.action===action&&Date.parse(approval.expiresAt)>now;
 return <div className="space-y-3 rounded-xl border p-4" aria-label="Expedição supervisionada Buriti">
  <p>Operação individual dos Correios. Confira a NF-e autorizada, o valor líquido e os dados de entrega antes de prosseguir.</p>
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {(uncertain||stage==='BLOCKED')&&<p role="alert">{recoveryKind==='FISCAL_READ'?'Confirmação fiscal não concluída. Repita somente a consulta fiscal.':recoveryKind==='POLL_READ'?'Consulta do recibo não concluída. Repita somente a consulta do recibo confirmado.':'Resultado pendente ou incerto. Não repita; verifique e reconcilie o estado antes de continuar.'}</p>}
  {uncertain&&((recoveryKind==='PREPOST'&&['LABEL','POLL','READY'].includes(stage))||(recoveryKind==='LABEL'&&['POLL','READY'].includes(stage)))&&<button type="button" disabled={busy} onClick={onResolve}>Confirmar estado reconciliado</button>}
  {stage==='READY'&&<p>Etiqueta pronta. Use Imprimir etiqueta para abrir o documento existente.</p>}
  {approval&&<p>Aprovação expira em {new Date(approval.expiresAt).toLocaleString('pt-BR')}. {!valid&&'Aprovação expirada ou incompatível.'}</p>}
  {action&&!uncertain&&(!valid?<button type="button" disabled={busy} onClick={()=>onApprove(action)}>Aprovar {label}</button>:<button type="button" disabled={busy} onClick={()=>onExecute(action)}>Executar {label}</button>)}
  {((action&&!uncertain)||recoveryKind==='FISCAL_READ')&&<button type="button" disabled={busy} onClick={onRefreshAuthorization}>Atualizar confirmação da NF-e</button>}
  {stage==='POLL'&&(!uncertain||recoveryKind==='POLL_READ')&&<button type="button" disabled={busy} onClick={onPoll}>Consultar etiqueta existente</button>}
 </div>;
}
export function BuritiShippingActions({orderId,shipment,disabled,onUpdated}:{orderId:string;shipment:Parameters<typeof buritiStage>[0];disabled:boolean;onUpdated:()=>Promise<void>}){
 const client=useMemo(()=>createBuritiShippingClient({orderId,storage:typeof window==='undefined'?undefined:window.sessionStorage,post:async(path,body)=>{const response=await api.post(path,body,fiscalNoAuthRetryConfig);return response.data;}}),[orderId]);
 const [approval,setApproval]=useState<Approval|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[recoveryKind,setRecoveryKind]=useState<string|null>(null);
 useEffect(()=>{const timer=window.setTimeout(()=>{setUncertain(client.isUncertain());setRecoveryKind(client.uncertainKind());},0);return()=>window.clearTimeout(timer);},[client]);
 const [now,setNow]=useState(0);
 useEffect(()=>{if(!approval)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[approval]);
 const stage=buritiStage(shipment);
 async function act(work:()=>Promise<unknown>,transport:boolean,message?:string){
  setBusy(true);setError(null);setNotice(null);try{await work();if(message)setNotice(message);}catch(e){const code=(e as {response?:{data?:{code?:unknown}}})?.response?.data?.code;setError(typeof code==='string'&&/^[A-Z_0-9]+$/.test(code)?`Bloqueio: ${code}`:'Falha ou resposta incerta. Consulte o estado antes de repetir.');if(transport)setUncertain(client.isUncertain());}finally{setUncertain(client.isUncertain());setRecoveryKind(client.uncertainKind());setBusy(false);await onUpdated();}
 }
 return <BuritiShippingActionsView stage={stage} approval={approval} busy={busy||disabled} uncertain={uncertain} recoveryKind={recoveryKind} error={error} notice={notice} now={now}
  onApprove={action=>{if(window.confirm(`Autorizar ${action==='PREPOST'?'a pré-postagem':'a etiqueta'} deste pedido? A aprovação não envia dados aos Correios.`))void act(async()=>{const next=await client.approve(action);setNow(Date.now());setApproval(next);},false);}}
  onExecute={action=>{if(window.confirm(`Executar ${action==='PREPOST'?'a pré-postagem':'a solicitação de etiqueta'} nos Correios? Em caso de falha ou timeout, não repita.`)){setApproval(null);void act(()=>client.execute(action),true,'Solicitação concluída; confira o estado atualizado abaixo.');}}}
  onRefreshAuthorization={()=>{if(window.confirm('Consultar a NF-e existente e atualizar sua confirmação local? Nenhuma NF-e será criada ou enviada.')){setApproval(null);void act(()=>client.refreshAuthorization(),true,'Sincronização concluída; a aprovação verificará novamente a prova fiscal.');}}}
  onResolve={()=>{if(window.confirm('Confirmar que o estado atual dos Correios foi reconciliado?')&&client.resolveConfirmed(stage)){setUncertain(false);setRecoveryKind(null);setError(null);}}}
  onPoll={()=>{if(window.confirm('Consultar o recibo de etiqueta já existente? Nenhuma nova solicitação será autorizada.'))void act(()=>client.poll(),true,'Consulta concluída; confira o estado atualizado abaixo.');}}/>;
}
