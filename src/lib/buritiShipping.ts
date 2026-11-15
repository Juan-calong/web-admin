export const BURITI_ORDER_ID='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
type Action='PREPOST'|'LABEL';
type Marker={state?:string;transportPhase?:string;prePostagemId?:string;idRecibo?:string;fiscalDocumentDigest?:string;payloadDigest?:string};
type LabelProof={source?:string;acceptedAsPdf?:boolean;idRecibo?:string;fiscalDocumentDigest?:string;contentDigest?:string};
type Shipment={shipmentStatus?:string;prePostagemId?:string|null;labelUrl?:string|null;labelFileKey?:string|null;isGenerating?:boolean|null;raw?:{passiveP3PrePost?:Marker;passiveP3Receipt?:Marker;effectiveLabelDownload?:LabelProof}};
type Approval={approvalId:string;action:Action;expiresAt:string};
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Options={orderId:string;now?:()=>number;storage?:StorageLike;post:(path:string,body:unknown,config:{skipAuthRetry:true})=>Promise<unknown>};
export function buritiStage(shipment:Shipment|null|undefined):'PREPOST'|'LABEL'|'POLL'|'READY'|'BLOCKED'{
 if(!shipment)return 'PREPOST';
 const pre=shipment.raw?.passiveP3PrePost,receipt=shipment.raw?.passiveP3Receipt;
 if(shipment.isGenerating||['ERROR','CANCELED'].includes(shipment.shipmentStatus??''))return 'BLOCKED';
 if(!pre&&!receipt&&!shipment.prePostagemId&&(!shipment.shipmentStatus||shipment.shipmentStatus==='NOT_CREATED'))return 'PREPOST';
 if(!shipment.prePostagemId||pre?.state!=='CONFIRMED'||pre.prePostagemId!==shipment.prePostagemId||pre.transportPhase!=='CONFIRMED'||!pre.fiscalDocumentDigest||!pre.payloadDigest)return 'BLOCKED';
 if(!receipt)return ['LABEL_READY','POSTED'].includes(shipment.shipmentStatus??'')?'BLOCKED':'LABEL';
 if(receipt.state!=='CONFIRMED'||!receipt.idRecibo||receipt.prePostagemId!==shipment.prePostagemId||receipt.transportPhase!=='CONFIRMED')return 'BLOCKED';
 if(['LABEL_READY','POSTED'].includes(shipment.shipmentStatus??'')){
  const proof=shipment.raw?.effectiveLabelDownload;
  return typeof shipment.labelUrl==='string'&&shipment.labelUrl.startsWith('data:application/pdf;base64,')&&proof?.source==='CORREIOS_API_DOWNLOAD'&&proof.acceptedAsPdf===true&&proof.idRecibo===receipt.idRecibo&&proof.fiscalDocumentDigest===pre.fiscalDocumentDigest&&Boolean(proof.contentDigest)?'READY':'BLOCKED';
 }
 return 'POLL';
}
export function createBuritiShippingClient({orderId,post,storage,now=Date.now}:Options){
 if(orderId!==BURITI_ORDER_ID)throw Error('BURITI_ORDER_SCOPE_INVALID');
 const storageKey=`buriti-shipping-uncertain:${orderId}`;
 let busy=false,approval:Approval|null=null,kind=storage?.getItem(storageKey)??null;
 function markUncertain(next:Action|'FISCAL_READ'|'POLL_READ'){storage?.setItem(storageKey,next);kind=next;}
 function clearUncertain(){storage?.removeItem(storageKey);kind=null;}
 const base=`/admin/orders/${orderId}/shipping/correios`;
 async function run<T>(work:()=>Promise<T>,recoverable?:'FISCAL_READ'|'POLL_READ'):Promise<T>{if(busy||(kind!==null&&(!recoverable||kind!==recoverable)))throw Error('BURITI_ACTION_BLOCKED');busy=true;try{return await work();}finally{busy=false;}}
 return {
  isUncertain(){return kind!==null;},
  uncertainKind(){return kind;},
  resolveConfirmed(stage:ReturnType<typeof buritiStage>){const action=kind;const resolved=(action==='PREPOST'&&['LABEL','POLL','READY'].includes(stage))||(action==='LABEL'&&['POLL','READY'].includes(stage));if(resolved)clearUncertain();return resolved;},
  async approve(action:Action){return run(async()=>{approval=null;const data=await post(`${base}/approvals`,{action,confirmation:'AUTHORIZE_ORD_L3F0HN_CORREIOS'},{skipAuthRetry:true}) as Approval;if(!data?.approvalId||data.action!==action||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now())throw Error('BURITI_APPROVAL_INVALID');approval=data;return data;});},
  async execute(action:Action){return run(async()=>{const saved=approval;approval=null;if(!saved||saved.action!==action||Date.parse(saved.expiresAt)<=now())throw Error('BURITI_APPROVAL_INVALID');markUncertain(action);return post(action==='PREPOST'?`${base}/generate-label`:`${base}/refresh-label`,{approvalId:saved.approvalId},{skipAuthRetry:true});});},
  async refreshAuthorization(){return run(async()=>{approval=null;markUncertain('FISCAL_READ');const result=await post(`/admin/orders/${orderId}/bling/nfe/sync`,{},{skipAuthRetry:true}) as {status?:string;reconciliationRequired?:boolean};if(result?.status!=='AUTHORIZED'||result.reconciliationRequired!==false)throw Error('BURITI_NFE_STATUS_UNCONFIRMED');clearUncertain();return result;},'FISCAL_READ');},
  async poll(){return run(async()=>{markUncertain('POLL_READ');const result=await post(`${base}/refresh-label`,{consultOnly:true,approvalId:'READ_ONLY_RECEIPT'},{skipAuthRetry:true}) as {shipment?:Shipment};if(!['POLL','READY'].includes(buritiStage(result?.shipment)))throw Error('BURITI_RECEIPT_READ_UNCONFIRMED');clearUncertain();return result;},'POLL_READ');},
 };
}
