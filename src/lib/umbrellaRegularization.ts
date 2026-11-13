import {api} from '@/lib/api';
import {fiscalNoAuthRetryConfig} from '@/lib/fiscalNoAuthRetry';
import {authStore} from '@/lib/auth';
import {isFiscalAdmin} from '@/lib/supervisedFiscal';
export const UMBRELLA_ORDER='88b8867c-ee9a-4091-9969-b631aa616869';
export type EvidenceFile={id:string;sha256:string;version:number;contentType:string;size:number;reviewRef:string};
export const UNIT_REVIEW='Conferi documento da unidade efetivamente vendida/separada/entregue: Umbrella 60 ml, GTIN 0631430443749.';
export const ACCOUNT_REVIEW='Conferi a empresa da conta Bling autenticada e sua correspondência com o emitente KeyFi e esta conexão OAuth.';
export type UmbrellaState={orderId:string;productId:string;name:string;proposedName:string;sku:string;gtin:string;evidenceId:string|null;evidence?:{unit:EvidenceFile|null;account:EvidenceFile|null;unitReviewed:boolean;accountReviewed:boolean};regularized:boolean;remoteId:string|null;operationStatus:string|null;prepared:boolean;accountBlocked:boolean;approval:{approvalId:string;expiresAt:string;action:'ASSOCIATE'|'CREATE_PRODUCT';started:boolean}|null};
const prefix=`/admin/orders/${UMBRELLA_ORDER}/fiscal/individual/umbrella-regularization`;
let pending=false;
export function umbrellaClient(){
 const read=async():Promise<UmbrellaState>=>{
  const {data}=await api.get(prefix);
  if(data?.orderId!==UMBRELLA_ORDER||data.productId!=='93d60874-b89b-49cb-bb8d-3b96ecfc6248')throw Error('Vínculo da regularização não confirmado.');
  return data;
 };
 return {read,async view(evidenceId:string){
  if(!isFiscalAdmin(authStore.getMe())||!/^[a-f\d-]{36}$/i.test(evidenceId))throw Error('Evidência indisponível.');
  const response=await api.get(prefix+'/evidence/'+encodeURIComponent(evidenceId),{responseType:'blob'});return response.data as Blob;
 },async post(action:'review'|'evidence'|'approve'|'execute'|'reconcile'|'prepare',body:object){
  if(pending||!isFiscalAdmin(authStore.getMe()))throw Error('Ação indisponível.');
  pending=true;try{return (await api.post(prefix+'/'+action,body,fiscalNoAuthRetryConfig)).data;}finally{pending=false;}
 }};
}

export function evidenceReviewBody(state:UmbrellaState,opened:{file:EvidenceFile;purpose:'UNIT'|'BLING_ACCOUNT'}|null,confirmed:boolean,companyId:string){
 const current=state.evidence?.[opened?.purpose==='UNIT'?'unit':'account'];
 if(!confirmed||!opened||!current||current.id!==opened.file.id||current.sha256!==opened.file.sha256||current.version!==opened.file.version)throw Error('Abra e confira a versão atual do documento antes de aprovar.');
 const id=companyId.replace(/\D/g,'');if(opened.purpose==='BLING_ACCOUNT'&&!/^\d{14}$/.test(id))throw Error('CNPJ da conta autenticada necessário.');
 return {evidenceId:current.id,sha256:current.sha256,version:current.version,statement:opened.purpose==='UNIT'?UNIT_REVIEW:ACCOUNT_REVIEW,source:opened.purpose==='UNIT'?'SOLD_UNIT_DOCUMENT':'AUTHENTICATED_BLING_ACCOUNT_SCREEN',...(opened.purpose==='BLING_ACCOUNT'?{companyId:id}:{})};
}
