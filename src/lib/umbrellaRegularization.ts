export const UMBRELLA_PRODUCT_ID='93d60874-b89b-49cb-bb8d-3b96ecfc6248';
export type UmbrellaMode='TECHNICAL_NON_SEND'|'RISK_RESIDUAL_ACCEPTANCE';
export type UmbrellaInspection={snapshot:string;companyIdentity:{enterpriseId:string;credentialId:string;connectedAt:string}};
type Approval={authorizationId:string;expiresAt:string};
const confirmations:Record<UmbrellaMode,string>={TECHNICAL_NON_SEND:'AUTHORIZE_UMBRELLA_NEW_PRODUCT_OPERATION_WITH_TECHNICAL_NON_SEND_EVIDENCE',RISK_RESIDUAL_ACCEPTANCE:'ACCEPT_UMBRELLA_RESIDUAL_DUPLICATE_RISK_FOR_ONE_NEW_PRODUCT_OPERATION'};
type Options={authorized:()=>boolean;post:(path:string,body:unknown,config:{skipAuthRetry:true})=>Promise<unknown>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createUmbrellaRegularizationClient({authorized,post}:Options){
 let busy=false,inspection:UmbrellaInspection|null=null,approval:Approval|null=null;
 const used=new Set<string>();
 const path=`/admin/products/${UMBRELLA_PRODUCT_ID}/bling/sync`;
 async function once<T>(work:()=>Promise<T>):Promise<T>{
  if(!authorized())throw Error('ADMIN_REQUIRED');if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;
  try{return await work();}finally{busy=false;}
 }
 // Older API versions reject revision 0 instead of treating this as normal sync.
 const dispatch=(regularization:Record<string,unknown>)=>post(path,{legacyRevision:0,regularization},{skipAuthRetry:true});
 return {
  inspect:(productId:string)=>once(async()=>{
   if(productId!==UMBRELLA_PRODUCT_ID)throw Error('UMBRELLA_SCOPE_MISMATCH');inspection=null;approval=null;
   const data=await dispatch({action:'INSPECT'}) as UmbrellaInspection;
   if(!/^[a-f0-9]{64}$/.test(data?.snapshot??'')||(typeof data?.companyIdentity?.enterpriseId!=='string'||!data.companyIdentity.enterpriseId.trim()||data.companyIdentity.enterpriseId!==data.companyIdentity.enterpriseId.trim())||!data.companyIdentity.credentialId||!Number.isFinite(Date.parse(data.companyIdentity.connectedAt)))throw Error('COMPANY_IDENTITY_UNCONFIRMED');
   inspection=data;return data;
  }),
  authorize:({mode,evidence,reviewConfirmed}:{mode:UmbrellaMode;evidence:Record<string,unknown>;reviewConfirmed:boolean})=>once(async()=>{
   if(!inspection||!reviewConfirmed||!Object.hasOwn(confirmations,mode)||evidence.category!==mode)throw Error('EXPLICIT_REVIEW_REQUIRED');
   approval=null;const data=await dispatch({action:'AUTHORIZE',mode,expectedSnapshot:inspection.snapshot,reviewRef:'UMBRELLA-'+crypto.randomUUID(),confirmation:confirmations[mode],evidence}) as Approval;
   if(!uuid.test(data?.authorizationId??'')||!(Date.parse(data.expiresAt)>Date.now()))throw Error('AUTHORIZATION_UNCONFIRMED');
   approval=data;return data;
  }),
  execute:(confirmed:boolean)=>once(async()=>{
   if(!confirmed||!approval||used.has(approval.authorizationId)||Date.parse(approval.expiresAt)<=Date.now())throw Error('EXPLICIT_EXECUTION_REQUIRED');
   const id=approval.authorizationId;used.add(id);approval=null;inspection=null;
   return dispatch({action:'EXECUTE',authorizationId:id,confirmation:'EXECUTE_UMBRELLA_SUPERVISED_PRODUCT_SYNC'}) as Promise<{blingProductId:string;created?:boolean;existing?:boolean}>;
  }),
 };
}
