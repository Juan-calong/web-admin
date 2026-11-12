import {fiscalNoAuthRetryConfig} from '@/lib/fiscalNoAuthRetry';
import {api} from '@/lib/api';
import {authStore} from '@/lib/auth';
import {getOrderBlingFiscalWorkflow} from '@/lib/blingFiscalWorkflow';
import {createSupervisedFiscalClient,isFiscalAdmin,safeFiscalUrl,type FiscalSnapshot} from '@/lib/supervisedFiscal';

async function read(orderId:string):Promise<FiscalSnapshot>{
  const [w,{data}]=await Promise.all([getOrderBlingFiscalWorkflow(orderId),api.get(`/admin/orders/${encodeURIComponent(orderId)}/fiscal`)]);
  if(w.orderId!==orderId||data.orderId!==orderId)throw new Error('Pedido divergente.');
  type Doc={id:string;provider:string;environment:string;type:string;status:string;blingOrderId?:string;blingNfeId?:string;number?:string;series?:string;accessKey?:string;protocol?:string;raw?:{nfeSend?:{ok?:boolean;transportAcceptedNfeId?:string};fiscalReconciliation?:{required?:boolean}}};
  const docs=(data.documents as Doc[]).filter(d=>d.provider==='BLING'&&d.type==='NFE'&&d.environment===w.environment);
  if(docs.length>1)throw new Error('Documentos divergentes.');
  const d=docs[0],r=w.readiness as {order?:{ready?:boolean;missing?:string[]};fiscalConfig?:{ready?:boolean;missing?:string[]}}|undefined;
  if(d&&w.summary?.nfeStatus&&d.status!==w.summary.nfeStatus)throw new Error('Estado alterado durante a leitura. Atualize.');
  return {orderId,environment:w.environment,ready:r?.order?.ready===true&&r?.fiscalConfig?.ready===true,
    authority:w.writeSafety?.authorityOwner,reconciliation:w.writeSafety?.requiresReconciliation===true||d?.raw?.fiscalReconciliation?.required===true,
    automation:w.automation,document:d?{id:d.id,status:d.status,blingOrderId:d.blingOrderId,blingNfeId:d.blingNfeId,number:d.number,series:d.series,accessKey:d.accessKey,protocol:d.protocol,sent:d.raw?.nfeSend?.ok===true||Boolean(d.raw?.nfeSend?.transportAcceptedNfeId)}:null,
    danfeUrl:safeFiscalUrl(w.documents?.danfe?.url),xmlUrl:safeFiscalUrl(w.documents?.xml?.url),danfeStored:w.documents?.danfe?.stored===true,xmlStored:w.documents?.xml?.stored===true,approvedId:w.writeSafety?.individualAuthorization?.approvalId,missing:[...(r?.order?.missing??[]),...(r?.fiscalConfig?.missing??[])]};
}
export function supervisedFiscalApi(){return createSupervisedFiscalClient({read,post:async(path,body,config)=>(await api.post(path,body,{...fiscalNoAuthRetryConfig,...config})).data,
  authorized:()=>isFiscalAdmin(authStore.getMe()),storage:{getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value),removeItem:key=>sessionStorage.removeItem(key)}});}
