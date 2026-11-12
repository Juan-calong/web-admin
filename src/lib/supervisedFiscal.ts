export type FiscalAction = 'PREPARE' | 'CREATE_SALES_ORDER' | 'CREATE_NFE' | 'SEND_NFE' | 'SYNC_NFE' | 'DOWNLOAD_DANFE' | 'DOWNLOAD_XML';
export type FiscalApproval = {approvalId:string; action:Exclude<FiscalAction,'PREPARE'>; expiresAt:string; transportAuthorized:false};
export type FiscalBinding = {orderId:string; documentId:string; automationId:string};
export type FiscalSnapshot = {
  orderId:string; environment?:string|null; ready:boolean; authority?:string; reconciliation:boolean;
  individualBinding?:FiscalBinding|null;
  automation:{automationStatus:string|null; isProcessing?:boolean; nextAttemptAt?:string|null; lastErrorCode?:string|null}|null|undefined;
  document:{id:string; status:string; blingOrderId?:string|null; blingNfeId?:string|null; number?:string|null; series?:string|null; accessKey?:string|null; protocol?:string|null; sent?:boolean}|null;
  danfeUrl:string|null; xmlUrl:string|null; danfeStored?:boolean; xmlStored?:boolean; approvedId?:string|null; missing?:string[];
};
export const fiscalActionLabels:Record<FiscalAction,string>={PREPARE:'Preparar individualmente',CREATE_SALES_ORDER:'Criar venda no Bling',CREATE_NFE:'Criar NF-e',SEND_NFE:'Enviar NF-e à SEFAZ',SYNC_NFE:'Sincronizar autorização',DOWNLOAD_DANFE:'Salvar DANFE',DOWNLOAD_XML:'Salvar XML'};
export const BURITI_ORDER='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
const HISTORICAL_ORDER='88b8867c-ee9a-4091-9969-b631aa616869';
const idPattern=/^[A-Za-z0-9:_-]{1,160}$/;
const busy=new Set<string>(), consumed=new Set<string>();
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
export function isFiscalAdmin(me:{role?:string;scopes?:string[]}|null){return me?.role==='ADMIN'&&(!me.scopes||me.scopes.includes('admin:orders:manage'));}
export function safeFiscalUrl(value:unknown){try{if(typeof value!=='string')return null;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function fiscalErrorMessage(error:unknown){const e=error as {response?:{status?:number;data?:{code?:unknown}}};const code=e?.response?.data?.code;if(typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,99}$/.test(code))return code;if(e?.response?.status===401)return 'Sessão expirada. Entre novamente antes de confirmar outra operação.';return 'Resultado não confirmado. Não repita a operação; atualize o estado e verifique a reconciliação.';}
export function fiscalStage(s:FiscalSnapshot,b:FiscalBinding|null,now=Date.now()):{action:FiscalAction|null;reason:string}{
  const no=(reason:string)=>({action:null,reason});const yes=(action:FiscalAction)=>({action,reason:''});
  if(s.reconciliation)return no('Reconciliação necessária. Nenhum novo transporte permitido.');
  if(s.environment!=='PRODUCTION'||s.authority!=='LEGACY')return no('Ambiente ou autoridade individual não confirmados.');
  const d=s.document,a=s.automation;
  if(d&&['CANCELED','CANCELLED','REJECTED','DENIED','ERROR','UNKNOWN'].includes(d.status))return no('Estado fiscal bloqueado: '+d.status+'. Revisão necessária.');
  if(d?.status==='AUTHORIZED'&&(!a||a.automationStatus==='COMPLETED'))return no('NF-e autorizada. Novo envio bloqueado.');
  if(a&&(!['QUEUED','RETRY_SCHEDULED'].includes(a.automationStatus??'')||a.isProcessing||a.lastErrorCode==='NFE_SEND_RECONCILIATION_PENDING'))return no('Automação indisponível: '+a.automationStatus+'.');
  if(a?.nextAttemptAt&&Date.parse(a.nextAttemptAt)>now)return no('Aguardando o prazo de uma tentativa anterior.');
  if(!s.ready)return no('Pré-condições fiscais pendentes. Consulte os impedimentos.');
  if(!a){
    if(d?.blingOrderId||d?.blingNfeId)return no('Documento existente sem automação individual identificada.');
    return [BURITI_ORDER,HISTORICAL_ORDER].includes(s.orderId)?yes('PREPARE'):no('O backend não disponibiliza preparação individual para este pedido.');
  }
  if(!d||!b||b.orderId!==s.orderId||b.documentId!==d.id||!idPattern.test(b.automationId))return no('Vínculo da automação não confirmado pelo servidor. Não prepare novamente nem informe IDs manualmente.');
  if(d.status==='AUTHORIZED'){
    if(!s.danfeUrl&&!s.danfeStored)return yes('DOWNLOAD_DANFE');
    if(!s.xmlUrl&&!s.xmlStored)return yes('DOWNLOAD_XML');
    return no('NF-e autorizada. Novo envio bloqueado.');
  }
  if(!d.blingOrderId)return yes('CREATE_SALES_ORDER');
  if(!d.blingNfeId)return yes('CREATE_NFE');
  if(d.status==='PENDING')return yes('SYNC_NFE');
  if(d.sent)return no('Envio já registrado. Reconcilie o estado; não envie novamente.');
  return d.status==='DRAFT'?yes('SEND_NFE'):no('Estado da NF-e ainda não confirmado.');
}
export function approvalUsable(a:FiscalApproval|null,action:FiscalAction|null,now=Date.now()){return Boolean(a&&a.action===action&&a.transportAuthorized===false&&idPattern.test(a.approvalId)&&Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now);}
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function createSupervisedFiscalClient({read,post,storage,now=Date.now,id=()=>crypto.randomUUID(),authorized=()=>false}:{
  read:(orderId:string)=>Promise<FiscalSnapshot>;post:(path:string,body:unknown,config:{skipAuthRetry:true})=>Promise<unknown>;storage:StorageLike;
  now?:()=>number;id?:()=>string;authorized?:()=>boolean;
}){
  const key=(orderId:string)=>'keyfi-fiscal:'+orderId;
  const uncertain=(orderId:string)=>key(orderId)+':uncertain';
  const verifiedBindings=new Map<string,FiscalBinding>();
  function binding(orderId:string):FiscalBinding|null{return verifiedBindings.get(orderId)??null;}
  async function refresh(orderId:string){
    verifiedBindings.delete(orderId);
    const s=await read(orderId);check(s.orderId===orderId,'Pedido divergente.');
    const b=s.individualBinding;
    if(s.automation&&s.document&&b&&b.orderId===orderId&&b.documentId===s.document.id&&idPattern.test(b.documentId)&&idPattern.test(b.automationId)){
      verifiedBindings.set(orderId,{orderId,documentId:b.documentId,automationId:b.automationId});
    }
    // Legacy session IDs are never an authority, including after reload or a lost response.
    storage.removeItem(key(orderId));
    const prior=storage.getItem(uncertain(orderId));
    if(prior){let action;try{action=JSON.parse(prior).action;}catch{action=null;}
      const confirmed=(action==='PREPARE'&&binding(orderId)&&s.document?.status==='NOT_CREATED'&&!s.document.blingOrderId&&!s.document.blingNfeId&&!s.automation?.isProcessing&&s.automation?.automationStatus==='QUEUED')||(action==='CREATE_SALES_ORDER'&&s.document?.blingOrderId)||(action==='CREATE_NFE'&&s.document?.blingNfeId)||(action==='SEND_NFE'&&['PENDING','AUTHORIZED'].includes(s.document?.status??''))||(action==='DOWNLOAD_DANFE'&&(s.danfeUrl||s.danfeStored))||(action==='DOWNLOAD_XML'&&(s.xmlUrl||s.xmlStored));
      if(confirmed&&!s.reconciliation)storage.removeItem(uncertain(orderId));
    }
    return s;
  }
  async function once<T>(orderId:string,work:()=>Promise<T>){
    check(authorized(),'Acesso administrativo necessário.');check(!busy.has(orderId),'Já existe uma operação em andamento.');
    check(!storage.getItem(uncertain(orderId)),'Resultado anterior não confirmado. Reconciliação necessária.');busy.add(orderId);
    try{return await work();}finally{busy.delete(orderId);}
  }
  async function submit(orderId:string,action:string,path:string,body:unknown){
    try{return await post(path,body,{skipAuthRetry:true});}
    catch(e){const status=(e as {response?:{status?:number}})?.response?.status;const code=(e as {response?:{data?:{code?:string}}})?.response?.data?.code;
      if(!status||status>=500||/UNKNOWN|PERSISTENCE_UNCONFIRMED|RECONCILIATION/.test(code??''))storage.setItem(uncertain(orderId),JSON.stringify({action,at:now()}));throw e;}
  }
  async function approve(orderId:string,action:Exclude<FiscalAction,'PREPARE'>){return once(orderId,async()=>{
    const s=await refresh(orderId),b=binding(orderId);check(b&&fiscalStage(s,b,now()).action===action,'Etapa fiscal indisponível.');
    const a=await submit(orderId,'APPROVE',`/admin/orders/${encodeURIComponent(orderId)}/fiscal/automations/${encodeURIComponent(b.automationId)}/approvals`,{action,approvalRef:`ADMIN_UI_${action}_${id()}`}) as FiscalApproval;
    check(approvalUsable(a,action,now()),'Aprovação inválida ou expirada.');return a;
  });}
  async function execute(orderId:string,a:FiscalApproval){return once(orderId,async()=>{
    check(approvalUsable(a,a.action,now())&&!consumed.has(a.approvalId),'Aprovação expirada ou já utilizada.');
    const s=await refresh(orderId),b=binding(orderId);check(b&&fiscalStage(s,b,now()).action===a.action&&s.approvedId===a.approvalId,'Estado ou aprovação alterados. Execução bloqueada.');
    check(approvalUsable(a,a.action,now()),'Aprovação expirada.');consumed.add(a.approvalId);
    return submit(orderId,a.action,`/admin/orders/${encodeURIComponent(orderId)}/fiscal/automations/${encodeURIComponent(b.automationId)}/approvals/${encodeURIComponent(a.approvalId)}/execute`,{});
  });}
  async function prepare(orderId:string){return once(orderId,async()=>{
    const s=await refresh(orderId);check(fiscalStage(s,binding(orderId),now()).action==='PREPARE','Preparação indisponível.');
    const body=orderId===BURITI_ORDER?{confirmation:'PREPARE_ORD_L3F0HN_BEFORE_LABEL_LOCAL_ONLY'}:{};
    const r=await submit(orderId,'PREPARE',`/admin/orders/${encodeURIComponent(orderId)}/fiscal/individual/prepare`,body) as {automationId:string;documentId:string;transportAuthorized:boolean};
    check(r&&idPattern.test(r.automationId)&&idPattern.test(r.documentId)&&r.transportAuthorized===false,'Preparação não confirmada.');
    return r; // The next GET must independently prove the persisted binding.
  });}
  return {read:refresh,prepare,approve,execute,binding,isUncertain:(orderId:string)=>{try{return Boolean(storage.getItem(uncertain(orderId)));}catch{return true;}}};
}
