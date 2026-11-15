import test from 'node:test';
import assert from 'node:assert/strict';
import {buritiStage,createBuritiShippingClient} from './buritiShipping.ts';
const id='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
test('determines safe actions only from durable markers',()=>{
 assert.equal(buritiStage(null),'PREPOST');
 assert.equal(buritiStage({raw:{passiveP3PrePost:{state:'REQUESTED',transportPhase:'UNKNOWN'}}}),'BLOCKED');
 assert.equal(buritiStage({prePostagemId:'p',raw:{passiveP3PrePost:{state:'CONFIRMED',prePostagemId:'p'}}}),'LABEL');
 assert.equal(buritiStage({prePostagemId:'p',raw:{passiveP3PrePost:{state:'CONFIRMED',prePostagemId:'p'},passiveP3Receipt:{state:'REQUESTED',transportPhase:'UNKNOWN'}}}),'BLOCKED');
 assert.equal(buritiStage({prePostagemId:'p',raw:{passiveP3PrePost:{state:'CONFIRMED',prePostagemId:'p'},passiveP3Receipt:{state:'CONFIRMED',prePostagemId:'p',idRecibo:'r'}}}),'POLL');
 assert.equal(buritiStage({shipmentStatus:'LABEL_READY',labelUrl:'data:application/pdf;base64,eA=='}),'READY');
});
test('requires explicit scoped approval, expires and never repeats or replays POST',async()=>{
 const calls=[];let clock=1000;const client=createBuritiShippingClient({orderId:id,now:()=>clock,post:async(path,body,config)=>{calls.push({path,body,config});if(path.endsWith('/approvals'))return {approvalId:'a',action:body.action,expiresAt:new Date(clock+120000).toISOString()};return {ok:true};}});
 await assert.rejects(client.execute('PREPOST'));await client.approve('PREPOST');assert.equal(calls.length,1);assert.equal(calls[0].config.skipAuthRetry,true);
 await client.execute('PREPOST');assert.equal(calls.length,2);assert.equal(calls[1].body.approvalId,'a');assert.equal(calls[1].config.skipAuthRetry,true);
 await assert.rejects(client.execute('PREPOST'));assert.equal(calls.length,2);
 await client.approve('LABEL');clock+=120001;await assert.rejects(client.execute('LABEL'));assert.equal(calls.length,3);
});
test('failed or concurrent execution is never automatically repeated',async()=>{
 let calls=0;let release;const pending=new Promise(r=>release=r);const client=createBuritiShippingClient({orderId:id,post:async(path)=>{calls++;if(path.endsWith('/approvals'))return {approvalId:'a',action:'PREPOST',expiresAt:new Date(Date.now()+100000).toISOString()};await pending;throw Error('timeout');}});
 await client.approve('PREPOST');const one=client.execute('PREPOST');await assert.rejects(client.execute('PREPOST'));release();await assert.rejects(one);await assert.rejects(client.execute('PREPOST'));assert.equal(calls,2);
});
test('rejects other orders before any request',()=>{assert.throws(()=>createBuritiShippingClient({orderId:'other',post:async()=>{throw Error('unexpected');}}));});
test('401 on approval or execution is propagated without a replay',async()=>{
 for(const failApproval of [true,false]){let calls=0;const c=createBuritiShippingClient({orderId:id,post:async(path)=>{calls++;if(failApproval||!path.endsWith('/approvals'))throw Object.assign(Error('unauthorized'),{status:401});return {approvalId:'a',action:'PREPOST',expiresAt:new Date(Date.now()+60000).toISOString()};}});
  if(!failApproval)await c.approve('PREPOST');await assert.rejects(failApproval?c.approve('PREPOST'):c.execute('PREPOST'));assert.equal(calls,failApproval?1:2);
 }
});
test('poll is explicit and is never retried after timeout',async()=>{let calls=0;const c=createBuritiShippingClient({orderId:id,post:async(_p,_b,config)=>{calls++;assert.equal(config.skipAuthRetry,true);throw Error('timeout');}});await assert.rejects(c.poll());await assert.rejects(c.poll());assert.equal(calls,1);});
test('authorization proof refresh is explicit and does not send a fiscal operation',async()=>{const calls=[];const c=createBuritiShippingClient({orderId:id,post:async(path,body,config)=>{calls.push({path,body,config});return {status:'AUTHORIZED',reconciliationRequired:false};}});await c.refreshAuthorization();assert.equal(calls.length,1);assert.equal(calls[0].path,`/admin/orders/${id}/bling/nfe/sync`);assert.equal(calls[0].config.skipAuthRetry,true);});

test('a non-authorized or unreconciled NF-e blocks further actions',async()=>{for(const data of [{status:'PENDING'},{status:'AUTHORIZED',reconciliationRequired:true},{}]){let calls=0;const c=createBuritiShippingClient({orderId:id,post:async()=>{calls++;return data;}});await assert.rejects(c.refreshAuthorization());await assert.rejects(c.approve('PREPOST'));assert.equal(calls,1);}});
test('uncertain transport survives a page reload and unlocks only after confirmed reconciliation',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let calls=0;
 const opts={orderId:id,storage,post:async(path)=>{calls++;if(path.endsWith('/approvals'))return {approvalId:'a',action:'PREPOST',expiresAt:new Date(Date.now()+60000).toISOString()};throw Error('timeout');}};
 const first=createBuritiShippingClient(opts);await first.approve('PREPOST');await assert.rejects(first.execute('PREPOST'));const next=createBuritiShippingClient(opts);assert.equal(next.isUncertain(),true);await assert.rejects(next.approve('PREPOST'));assert.equal(next.resolveConfirmed('PREPOST'),false);assert.equal(next.resolveConfirmed('LABEL'),true);assert.equal(next.isUncertain(),false);assert.equal(calls,2);
});
