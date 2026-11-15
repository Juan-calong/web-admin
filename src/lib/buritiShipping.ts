export const BURITI_ORDER_ID='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
type Action='PREPOST'|'LABEL';
type Marker={state?:string;transportPhase?:string;prePostagemId?:string;idRecibo?:string};
type Shipment={shipmentStatus?:string;prePostagemId?:string|null;labelUrl?:string|null;labelFileKey?:string|null;isGenerating?:boolean|null;raw?:{passiveP3PrePost?:Marker;passiveP3Receipt?:Marker}};
type Approval={approvalId:string;action:Action;expiresAt:string};
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Options={orderId:string;now?:()=>number;storage?:StorageLike;post:(path:string,body:unknown,config:{skipAuthRetry:true})=>Promise<unknown>};
export function buritiStage(shipment:Shipment|null|undefined):'PREPOST'|'LABEL'|'POLL'|'READY'|'BLOCKED'{
 if(!shipment)return 'PREPOST';
 const pre=shipment.raw?.passiveP3PrePost,receipt=shipment.raw?.passiveP3Receipt;
 if(shipment.shipmentStatus==='LABEL_READY'&&(shipment.labelUrl||shipment.labelFileKey))return 'READY';
 if(shipment.isGenerating||['ERROR','CANCELED','POSTED'].includes(shipment.shipmentStatus??''))return 'BLOCKED';
 if(!pre&&!receipt&&!shipment.prePostagemId&&(!shipment.shipmentStatus||shipment.shipmentStatus==='NOT_CREATED'))return 'PREPOST';
 if(!shipment.prePostagemId||pre?.state!=='CONFIRMED'||pre.prePostagemId!==shipment.prePostagemId||pre.transportPhase==='UNKNOWN')return 'BLOCKED';
 if(!receipt)return 'LABEL';
 return receipt.state==='CONFIRMED'&&receipt.idRecibo&&receipt.prePostagemId===shipment.prePostagemId&&receipt.transportPhase!=='UNKNOWN'?'POLL':'BLOCKED';
}
export function createBuritiShippingClient({orderId,post,storage,now=Date.now}:Options){
 if(orderId!==BURITI_ORDER_ID)throw Error('BURITI_ORDER_SCOPE_INVALID');
 const storageKey=`buriti-shipping-uncertain:${orderId}`;
 let busy=false,approval:Approval|null=null,uncertain=Boolean(storage?.getItem(storageKey));
 function markUncertain(action:Action){uncertain=true;storage?.setItem(storageKey,action);}
 const base=`/admin/orders/${orderId}/shipping/correios`;
 async function run<T>(work:()=>Promise<T>):Promise<T>{if(busy||uncertain)throw Error('BURITI_ACTION_BLOCKED');busy=true;try{return await work();}finally{busy=false;}}
 return {
  isUncertain(){return uncertain;},
  resolveConfirmed(stage:ReturnType<typeof buritiStage>){const action=storage?.getItem(storageKey);const resolved=(action==='PREPOST'&&['LABEL','POLL','READY'].includes(stage))||(action==='LABEL'&&['POLL','READY'].includes(stage));if(resolved){storage?.removeItem(storageKey);uncertain=false;}return resolved;},
  async approve(action:Action){return run(async()=>{approval=null;const data=await post(`${base}/approvals`,{action,confirmation:'AUTHORIZE_ORD_L3F0HN_CORREIOS'},{skipAuthRetry:true}) as Approval;if(!data?.approvalId||data.action!==action||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now())throw Error('BURITI_APPROVAL_INVALID');approval=data;return data;});},
  async execute(action:Action){return run(async()=>{const saved=approval;approval=null;if(!saved||saved.action!==action||Date.parse(saved.expiresAt)<=now())throw Error('BURITI_APPROVAL_INVALID');try{return await post(action==='PREPOST'?`${base}/generate-label`:`${base}/refresh-label`,{approvalId:saved.approvalId},{skipAuthRetry:true});}catch(error){markUncertain(action);throw error;}});},
  async refreshAuthorization(){return run(async()=>{approval=null;try{const result=await post(`/admin/orders/${orderId}/bling/nfe/sync`,{},{skipAuthRetry:true}) as {status?:string;reconciliationRequired?:boolean};if(result?.status!=='AUTHORIZED'||result.reconciliationRequired===true)throw Error('BURITI_NFE_STATUS_UNCONFIRMED');return result;}catch(error){uncertain=true;throw error;}});},
  async poll(){return run(async()=>{try{return await post(`${base}/refresh-label`,{},{skipAuthRetry:true});}catch(error){uncertain=true;throw error;}});},
 };
}
