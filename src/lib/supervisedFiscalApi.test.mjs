import test from 'node:test';import assert from 'node:assert/strict';
import {api} from './api.ts';import {authStore} from './auth.ts';import {supervisedFiscalApi} from './supervisedFiscalApi.ts';
const ORDER='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
const binding={orderId:ORDER,documentId:'document',automationId:'automation'};
const workflow=()=>({orderId:ORDER,environment:'PRODUCTION',individualBinding:binding,automation:{automationStatus:'QUEUED'},writeSafety:{authorityOwner:'LEGACY'},summary:{nfeStatus:'AUTHORIZED'},readiness:{order:{ready:true},fiscalConfig:{ready:true}},documents:{danfe:{stored:true,url:'https://example.test/danfe'},xml:{stored:true,url:'https://example.test/xml'}}});
const document=()=>({id:'document',orderId:ORDER,environment:'PRODUCTION',provider:'BLING',type:'NFE',status:'AUTHORIZED',number:'395',blingOrderId:'sale',blingNfeId:'27392288224'});
const data=new Map();globalThis.window={};globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};globalThis.sessionStorage=globalThis.localStorage;
async function scenario(w,d,run){const previous=api.defaults.adapter,calls=[];authStore.setMe({id:'synthetic',email:'synthetic@example.test',role:'ADMIN'});
  api.defaults.adapter=async config=>{calls.push(config);assert.equal(config.method,'get');return {status:200,statusText:'OK',headers:{},config,data:config.url.endsWith('/fiscal-workflow')?w:{orderId:ORDER,documents:d}};};
  try{await run(supervisedFiscalApi(),calls);}finally{api.defaults.adapter=previous;authStore.clearAll();data.clear();}}
test('actual GET adapter recovers authorized NFe 395 and its exact document binding',async()=>{await scenario(workflow(),[document()],async(c,calls)=>{const s=await c.read(ORDER);assert.equal(s.document.number,'395');assert.equal(s.document.status,'AUTHORIZED');assert.deepEqual(c.binding(ORDER),binding);assert.equal(calls.length,2);});});
test('actual GET adapter rejects a binding or document belonging to another order/document',async()=>{
  for(const [w,d] of [[{...workflow(),individualBinding:{...binding,orderId:'other'}},document()],[{...workflow(),individualBinding:{...binding,documentId:'other'}},document()],[workflow(),{...document(),orderId:'other'}]])await scenario(w,[d],async c=>{await assert.rejects(()=>c.read(ORDER));assert.equal(c.binding(ORDER),null);});
});
test('older backend without binding permits reading but never guesses an automation ID',async()=>{await scenario({...workflow(),individualBinding:undefined},[document()],async(c,calls)=>{await c.read(ORDER);assert.equal(c.binding(ORDER),null);await assert.rejects(()=>c.approve(ORDER,'CREATE_NFE'));assert.equal(calls.every(r=>r.method==='get'),true);});});
