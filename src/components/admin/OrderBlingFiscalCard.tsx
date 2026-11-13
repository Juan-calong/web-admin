"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {authStore} from '@/lib/auth';
import {supervisedFiscalApi} from '@/lib/supervisedFiscalApi';
import {approvalUsable,fiscalErrorMessage,fiscalStage,isFiscalAdmin,sendRecoveryErrorMessage,type FiscalAction,type FiscalApproval} from '@/lib/supervisedFiscal';
import type {FiscalAutomationProjection} from '@/lib/fiscalAutomationPresentation';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {NfeSendRecoveryAction} from '@/components/admin/NfeSendRecoveryAction';
import {SupervisedFiscalActions} from '@/components/admin/SupervisedFiscalActions';

function Panel({orderId}:{orderId:string}){
  const client=useMemo(()=>supervisedFiscalApi(),[]);
  const [recoveryMessage,setRecoveryMessage]=useState<string|null>(null);
  const [approval,setApproval]=useState<FiscalApproval|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[now,setNow]=useState(()=>Date.now());
  const queries=useQueryClient();
  const pending=useRef(false);
  const admin=isFiscalAdmin(authStore.getMe());
  const state=useQuery({queryKey:['admin-supervised-fiscal',orderId],queryFn:()=>client.read(orderId),enabled:admin,retry:false,refetchOnWindowFocus:false});
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  async function refresh(){try{await state.refetch({throwOnError:true});await queries.invalidateQueries({queryKey:['admin-order-details',orderId]});}catch{setError('Não foi possível atualizar o estado fiscal. Nenhuma repetição foi realizada.');}}
  async function run(kind:'prepare'|'approve'|'execute',action?:Exclude<FiscalAction,'PREPARE'>){
    if(pending.current||!admin)return;
    pending.current=true;setBusy(true);setError(null);setRecoveryMessage(null);
    try{
      if(kind==='prepare'){await client.prepare(orderId);setApproval(null);}
      else if(kind==='approve'&&action)setApproval(await client.approve(orderId,action));
      else if(kind==='execute'&&approval){const current=approval;setApproval(null);if(!approvalUsable(current,current.action))throw new Error('expired');await client.execute(orderId,current);}
    }catch(e){setApproval(null);setError(fiscalErrorMessage(e));}
    finally{await refresh();pending.current=false;setBusy(false);}
  }
  async function recoverSend(){
    if(pending.current||!isFiscalAdmin(authStore.getMe()))return;
    pending.current=true;setBusy(true);setError(null);setRecoveryMessage(null);setApproval(null);
    try{
      const result=await client.recoverSend(orderId);
      setRecoveryMessage(result.accountBlocked
        ?'A API confirmou a recuperação deste envio; a conta continua bloqueada por pendências. Nenhum envio foi repetido.'
        :'A API confirmou a recuperação deste envio e informou a conta liberada da reconciliação. Os demais gates fiscais continuam válidos. Nenhum envio foi repetido.');
    }catch(e){setError(sendRecoveryErrorMessage(e));}
    finally{await refresh();pending.current=false;setBusy(false);}
  }
  const s=state.data;
  const stage=s?fiscalStage(s,client.binding(orderId),now):null;
  const uncertain=typeof window!=='undefined'&&client.isUncertain(orderId);
  const reason=!admin?'Acesso ADMIN com escopo de pedidos necessário.':state.isError?'Não foi possível confirmar o estado atual. Nenhuma operação permitida.':uncertain?'Resultado anterior não confirmado. Atualize e reconcilie antes de qualquer novo POST.':stage?.reason??'';
  const enabled=admin&&!state.isFetching&&!state.isError&&!uncertain&&!busy;
  return <Card className="rounded-[28px] border-zinc-200 bg-white">
    <CardHeader><CardTitle>Fiscal / Bling — emissão supervisionada</CardTitle><p className="text-sm text-zinc-600">Use sua sessão administrativa. Nenhum token precisa ser copiado.</p></CardHeader>
    <CardContent className="space-y-4">
      <Button type="button" variant="outline" disabled={busy||state.isFetching||!admin} onClick={()=>{void refresh();}}>Atualizar situação fiscal</Button>
      {state.isLoading?<p role="status">Consultando situação fiscal…</p>:null}
      {error?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
      {recoveryMessage?<p role="status" className="rounded-xl bg-zinc-50 p-3 text-sm">{recoveryMessage}</p>:null}
      {s?<NfeSendRecoveryAction snapshot={s} binding={client.binding(orderId)} disabled={!admin||busy||state.isFetching||state.isError} onRecover={()=>{void recoverSend();}}/>:null}
      {!s&&reason?<p role="alert">{reason}</p>:null}
      {s?<SupervisedFiscalActions snapshot={s} action={enabled?(stage?.action??null):null} reason={reason} approval={approval} busy={busy||state.isFetching} now={now}
        onPrepare={()=>{void run('prepare');}} onApprove={action=>{void run('approve',action);}} onExecute={()=>{void run('execute');}}/>:null}
    </CardContent>
  </Card>;
}
export function OrderBlingFiscalCard({orderId}:{orderId?:string;fiscalAutomation?:FiscalAutomationProjection|null}){
  return orderId?<Panel key={orderId} orderId={orderId}/>:null;
}
