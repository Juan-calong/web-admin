import {api} from '@/lib/api';
import {fiscalNoAuthRetryConfig} from '@/lib/fiscalNoAuthRetry';
import {authStore} from '@/lib/auth';
import {isFiscalAdmin} from '@/lib/supervisedFiscal';
export const UMBRELLA_ORDER='88b8867c-ee9a-4091-9969-b631aa616869';
export type UmbrellaState={orderId:string;productId:string;name:string;proposedName:string;sku:string;gtin:string;evidenceId:string|null;regularized:boolean;remoteId:string|null;operationStatus:string|null;prepared:boolean;accountBlocked:boolean;approval:{approvalId:string;expiresAt:string;action:'ASSOCIATE'|'CREATE_PRODUCT';started:boolean}|null};
const prefix=`/admin/orders/${UMBRELLA_ORDER}/fiscal/individual/umbrella-regularization`;
let pending=false;
export function umbrellaClient(){
 const read=async():Promise<UmbrellaState>=>{
  const {data}=await api.get(prefix);
  if(data?.orderId!==UMBRELLA_ORDER||data.productId!=='93d60874-b89b-49cb-bb8d-3b96ecfc6248')throw Error('Vínculo da regularização não confirmado.');
  return data;
 };
 return {read,async post(action:'evidence'|'approve'|'execute'|'reconcile'|'prepare',body:object){
  if(pending||!isFiscalAdmin(authStore.getMe()))throw Error('Ação indisponível.');
  pending=true;try{return (await api.post(prefix+'/'+action,body,fiscalNoAuthRetryConfig)).data;}finally{pending=false;}
 }};
}
