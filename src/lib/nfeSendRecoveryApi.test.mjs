import test from 'node:test';
import assert from 'node:assert/strict';
import {AxiosError} from 'axios';
import {api} from './api.ts';
import {authStore} from './auth.ts';
import {supervisedFiscalApi} from './supervisedFiscalApi.ts';
const ORDER='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
const binding={orderId:ORDER,documentId:'document',automationId:'automation'};
const data=new Map();globalThis.window={};globalThis.sessionStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
globalThis.localStorage=globalThis.sessionStorage;
async function scenario(failure,run){
 const previous=api.defaults.adapter,calls=[];let recovered=false;
 authStore.setMe({id:'synthetic',role:'ADMIN'});
 api.defaults.adapter=async config=>{
  calls.push(config);
  if(config.method==='post'){
   assert.equal(config.skipAuthRetry,true);
   assert.equal(config.url,`/admin/orders/${ORDER}/fiscal/automations/automation/recover-nfe-send`);
   const body=JSON.parse(config.data);assert.match(body.requestId,/^[a-f\d-]{36}$/i);assert.match(body.reviewRef,/^[A-Za-z0-9:_-]{1,160}$/);assert.equal(body.confirmation,'RECOVER_UNKNOWN_NFE_SEND_READ_ONLY');
   if(failure)throw new AxiosError('sanitized',failure===401?'ERR_BAD_REQUEST':'ECONNABORTED',config,undefined,failure===401?{status:401,statusText:'Unauthorized',headers:{},config,data:{message:'token expirado'}}:undefined);
   recovered=true;return {status:200,statusText:'OK',headers:{},config,data:{auditId:'audit',status:'AUTHORIZED',accountBlocked:false,reused:false,transportAuthorized:false}};
  }
  assert.equal(config.method,'get');
  const workflow={orderId:ORDER,environment:'PRODUCTION',individualBinding:binding,automation:{automationStatus:'QUEUED',lastErrorCode:recovered?null:'NFE_SEND_RECONCILIATION_PENDING'},writeSafety:{authorityOwner:'LEGACY',requiresReconciliation:!recovered},summary:{nfeStatus:recovered?'AUTHORIZED':'DRAFT'}};
  const document={id:'document',orderId:ORDER,environment:'PRODUCTION',provider:'BLING',type:'NFE',status:recovered?'AUTHORIZED':'DRAFT',blingOrderId:'sale',blingNfeId:'nfe'};
  return {status:200,statusText:'OK',headers:{},config,data:config.url.endsWith('/fiscal-workflow')?workflow:{orderId:ORDER,documents:[document]}};
 };
 try{await run(supervisedFiscalApi(),calls);}finally{api.defaults.adapter=previous;authStore.clearAll();data.clear();}
}
test('existing authenticated HTTP client recovers and GET reads the actual new state',async()=>scenario(null,async(client,calls)=>{await client.read(ORDER);assert.equal((await client.recoverSend(ORDER)).accountBlocked,false);const state=await client.read(ORDER);assert.equal(state.document.status,'AUTHORIZED');assert.equal(state.automation.lastErrorCode,null);assert.equal(calls.filter(c=>c.method==='post').length,1);assert.equal(calls.filter(c=>c.method==='get').length,6);}));
for(const failure of [401,'timeout'])test(`HTTP ${failure} never refreshes or replays the fiscal POST`,async()=>scenario(failure,async(client,calls)=>{await assert.rejects(client.recoverSend(ORDER));await new Promise(r=>setImmediate(r));assert.equal(calls.filter(c=>c.method==='post').length,1);assert.equal(calls.some(c=>c.url.includes('/auth/refresh')),false);}));
