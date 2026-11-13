"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {api} from '@/lib/api';
import {authStore} from '@/lib/auth';
import {fiscalNoAuthRetryConfig} from '@/lib/fiscalNoAuthRetry';
import {createUmbrellaRegularizationClient,UMBRELLA_PRODUCT_ID,type UmbrellaMode,type UmbrellaInspection} from '@/lib/umbrellaRegularization';

type Props={productId:string;disabled:boolean;linked?:boolean;onChanged:()=>Promise<void>;onBusyChange?:(value:boolean)=>void};
const hex=/^[a-f0-9]{64}$/;
export function UmbrellaProductRegularization({productId,disabled,linked,onChanged,onBusyChange}:Props){
 const [client]=useState(()=>createUmbrellaRegularizationClient({authorized:()=>authStore.getMe()?.role==='ADMIN',post:async(path,body)=>(await api.post(path,body,fiscalNoAuthRetryConfig)).data}));
 const busyRef=useRef(false);
 const [inspection,setInspection]=useState<UmbrellaInspection|null>(null),[busy,setBusy]=useState(false),[mode,setMode]=useState<UmbrellaMode|''>('');
 const [reviewed,setReviewed]=useState(false),[refs,setRefs]=useState<Record<string,string>>({}),[approval,setApproval]=useState<{authorizationId:string;expiresAt:string}|null>(null),[message,setMessage]=useState('');
 const [approvalExpired,setApprovalExpired]=useState(false);
 useEffect(()=>{if(!approval)return;const timer=setTimeout(()=>setApprovalExpired(true),Math.max(0,Date.parse(approval.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[approval]);
 if(productId!==UMBRELLA_PRODUCT_ID||linked)return null;
 const field=(key:string,label:string,type='text')=><label key={key} className="block text-sm">{label}<input type={type} value={refs[key]??''} onChange={e=>setRefs({...refs,[key]:e.target.value})} className="mt-1 block w-full rounded border p-2" autoComplete="off" /></label>;
 async function run(work:()=>Promise<void>){
  if(busyRef.current||disabled)return;busyRef.current=true;setBusy(true);onBusyChange?.(true);setMessage('');
  try{await work();}catch(error){
   const value=error as {response?:{data?:{code?:string;blingHttpStatus?:number}}};const code=value?.response?.data?.code,status=value?.response?.data?.blingHttpStatus;
   setMessage('Solicitação bloqueada ou resultado não confirmado. Não repita uma criação incerta. '+(/^[A-Z_]+$/.test(code??'')?code:'')+(typeof status==='number'&&Number.isInteger(status)&&status>=400&&status<=599?' — leitura Bling HTTP '+status:''));
  }finally{busyRef.current=false;setBusy(false);onBusyChange?.(false);}
 }
 const valid=reviewed&&(mode==='RISK_RESIDUAL_ACCEPTANCE'?
  Boolean(refs.supportRef)&&hex.test(refs.supportSha??'')&&Boolean(refs.supportThrough):
  mode==='TECHNICAL_NON_SEND'&&['configuration','deployment','controlFlow'].every(k=>Boolean(refs[k+'Ref'])&&hex.test(refs[k+'Sha']??'')));
 function evidence():Record<string,unknown>{
  if(mode==='RISK_RESIDUAL_ACCEPTANCE')return {category:mode,support:{classification:'REMOTE_REGISTRATION_ABSENCE_REPORTED',ref:refs.supportRef,sha256:refs.supportSha,reportedFrom:'2026-11-09',reportedThrough:refs.supportThrough},historicalTransportUndetermined:true,duplicateRiskCannotBeExcluded:true,noReplayOfHistoricalAttempt:true,stopAfterNewUnknown:true};
  return {category:mode,sourceCommit:'ba8c658dd409bd292a9682d0b34bbe364838e881',...Object.fromEntries(['configuration','deployment','controlFlow'].map(k=>[k,{ref:refs[k+'Ref'],sha256:refs[k+'Sha']}])),effectiveFlagFalse:true,sameProcess:true,normalRouteNoIndividualCapability:true,completeConfigurationWindow:true,noContradictoryTransportEvidence:true};
 }
 return <section aria-label="Regularização supervisionada do Umbrella" className="space-y-3 rounded border border-amber-300 p-3">
  <p className="text-sm">A ausência de cadastro informada pelo suporte não comprova NOT_SENT. Esta ação não emite NF-e e preserva o UNKNOWN histórico.</p>
  <p className="text-sm">A revisão usa os dados salvos no servidor. Salve alterações do cadastro antes de revisar.</p>
  <Button type="button" variant="outline" disabled={disabled||busy} onClick={()=>void run(async()=>{setApproval(null);setInspection(null);setReviewed(false);setApprovalExpired(false);setInspection(await client.inspect(productId));})}>Revisar regularização supervisionada</Button>
  {inspection&&<>
   <p className="text-sm">Conta Bling confirmada: {inspection.companyIdentity.enterpriseId}. Conexão OAuth vinculada, sem exposição de credenciais.</p>
   <fieldset disabled={disabled||busy||Boolean(approval)} className="space-y-3">
    <label className="block text-sm">Modalidade de autorização<select value={mode} onChange={e=>{setMode(e.target.value as UmbrellaMode|'');setReviewed(false);}} className="ml-2 rounded border p-2">
     <option value="">Selecione explicitamente</option><option value="TECHNICAL_NON_SEND">Evidência técnica de não envio</option><option value="RISK_RESIDUAL_ACCEPTANCE">Aceitação explícita de risco residual</option>
    </select></label>
    {mode==='RISK_RESIDUAL_ACCEPTANCE'&&<>{field('supportRef','Referência do chamado/documento oficial')}{field('supportSha','SHA-256 do documento oficial')}{field('supportThrough','Data final informada pelo suporte','date')}<p className="text-sm">O transporte original permanece indeterminado. Pode existir duplicidade não detectada pelas consultas. Uma nova operação será interrompida se o resultado for incerto.</p></>}
    {mode==='TECHNICAL_NON_SEND'&&['configuration','deployment','controlFlow'].map(k=><div key={k}>{field(k+'Ref','Referência técnica: '+k)}{field(k+'Sha','SHA-256: '+k)}</div>)}
    {mode&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} />{mode==='RISK_RESIDUAL_ACCEPTANCE'?'Revisei a resposta oficial e aceito explicitamente o risco residual para uma única nova operação deste produto, sem declarar NOT_SENT.':'Revisei os artefatos originais: flag efetiva desabilitada na janela completa, mesmo processo, rota sem capability individual e ausência de evidência contraditória.'}</label>}
    <Button type="button" disabled={!valid||disabled||busy} onClick={()=>void run(async()=>{setApprovalExpired(false);setApproval(await client.authorize({mode:mode as UmbrellaMode,evidence:evidence(),reviewConfirmed:reviewed}));})}>Registrar autorização de uso único — não sincroniza</Button>
   </fieldset>
   {approval&&<div className="space-y-2"><p className="text-sm">Autorização válida até {approval.expiresAt}. Prioriza associação; se não houver candidato compatível, poderá criar um produto. Nenhuma NF-e será emitida.</p>
    <Button type="button" disabled={disabled||busy||approvalExpired} onClick={()=>{
     if(!window.confirm('Confirmar uma única sincronização supervisionada do Umbrella 60 ml? Pode criar um produto no Bling. A tentativa antiga e o UNKNOWN serão preservados. Não haverá repetição automática nem emissão de NF-e.'))return;
     void run(async()=>{try{const result=await client.execute(true);await onChanged();setMessage('Vínculo confirmado: '+result.blingProductId);}finally{setApproval(null);setInspection(null);}});
    }}>Confirmar sincronização deste produto</Button>
   </div>}
  </>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
