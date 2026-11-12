import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('./supervisedFiscal.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const ORDER='8ebe6309-8d79-4fd7-82b1-5e55aef5b7c4';
const snap=()=>({orderId:ORDER,environment:'PRODUCTION',ready:true,authority:'LEGACY',reconciliation:false,automation:null,document:null,danfeUrl:null,xmlUrl:null});
const binding={orderId:ORDER,documentId:'document',automationId:'automation'};
const prepared=()=>({...snap(),document:{id:'document',status:'NOT_CREATED'},automation:{automationStatus:'QUEUED'},approvedId:'approval'});
let fixtureNumber=0;
function fixture(){const approvalId='approval-'+(++fixtureNumber);let state={...prepared(),approvedId:approvalId};const calls=[];const data=new Map([['keyfi-fiscal:'+ORDER,JSON.stringify(binding)]]);let post=async()=>({approvalId,action:'CREATE_SALES_ORDER',expiresAt:'2026-11-12T10:05:00Z',transportAuthorized:false});return {calls,data,approvalId,set state(v){state={...v,approvedId:v.approvedId==='approval'?approvalId:v.approvedId};},set post(v){post=v;},client:()=>m.createSupervisedFiscalClient({read:async()=>state,post:async(...args)=>{calls.push(args);return post(...args);},storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},now:()=>Date.parse('2026-11-12T10:00:00Z'),id:()=> 'synthetic',authorized:()=>true})};}
test('global writes false is not required by individual policy',()=>{assert.equal(m.fiscalStage(prepared(),binding).action,'CREATE_SALES_ORDER');});
test('preparation is restricted to backend-supported cases',()=>{assert.equal(m.fiscalStage(snap(),null).action,'PREPARE');assert.equal(m.fiscalStage({...snap(),orderId:'other'},null).action,null);});
for(const status of ['AUTHORIZED','CANCELED','REJECTED','ERROR','UNKNOWN'])test(status+' cannot send/create again',()=>{const s=prepared();s.document={id:'document',status,blingOrderId:'sale',blingNfeId:'nfe'};assert.notEqual(m.fiscalStage(s,binding).action,'SEND_NFE');});
test('pending NFe proposes only synchronization',()=>{const s=prepared();s.document={id:'document',status:'PENDING',blingOrderId:'sale',blingNfeId:'nfe'};assert.equal(m.fiscalStage(s,binding).action,'SYNC_NFE');});
test('unknown and processing states block all execution',()=>{for(const change of [{reconciliation:true},{automation:{automationStatus:'RECONCILIATION_REQUIRED'}},{automation:{automationStatus:'PROCESSING'}}])assert.equal(m.fiscalStage({...prepared(),...change},binding).action,null);});
test('missing/mismatched automation binding blocks instead of guessing IDs',()=>{for(const b of [null,{...binding,documentId:'other'},{...binding,orderId:'other'}])assert.equal(m.fiscalStage(prepared(),b).action,null);});
test('expired approval never reaches POST',async()=>{const f=fixture(),c=f.client();await assert.rejects(()=>c.execute(ORDER,{approvalId:f.approvalId,action:'CREATE_SALES_ORDER',expiresAt:'2026-11-12T09:59:59Z',transportAuthorized:false}));assert.equal(f.calls.length,0);});
test('two concurrent executions dispatch one POST and a consumed approval cannot replay',async()=>{const f=fixture();let release;f.post=()=>new Promise(r=>{release=r;});const c=f.client(),a={approvalId:f.approvalId,action:'CREATE_SALES_ORDER',expiresAt:'2026-11-12T10:05:00Z',transportAuthorized:false};const first=c.execute(ORDER,a);await new Promise(r=>setImmediate(r));await assert.rejects(()=>c.execute(ORDER,a));release({summary:{claimed:1}});await first;await assert.rejects(()=>c.execute(ORDER,a));assert.equal(f.calls.length,1);});
test('timeout is not retried, blocks further POST and permits read reconciliation',async()=>{const f=fixture();f.post=async()=>{throw Object.assign(new Error('synthetic timeout'),{code:'ECONNABORTED'});};const c=f.client();await assert.rejects(()=>c.approve(ORDER,'CREATE_SALES_ORDER'));await assert.rejects(()=>c.approve(ORDER,'CREATE_SALES_ORDER'));assert.equal(f.calls.length,1);assert.equal((await c.read(ORDER)).document.status,'NOT_CREATED');});
test('authorized state observed immediately before execution prevents transport',async()=>{const f=fixture();f.state={...prepared(),document:{id:'document',status:'AUTHORIZED',blingOrderId:'sale',blingNfeId:'nfe'}};await assert.rejects(()=>f.client().execute(ORDER,{approvalId:f.approvalId,action:'SEND_NFE',expiresAt:'2026-11-12T10:05:00Z',transportAuthorized:false}));assert.equal(f.calls.length,0);});
test('approval uses only individual route and disables auth replay',async()=>{const f=fixture(),c=f.client();await c.approve(ORDER,'CREATE_SALES_ORDER');assert.match(f.calls[0][0],/\/fiscal\/automations\/automation\/approvals$/);assert.deepEqual(f.calls[0][2],{skipAuthRetry:true});assert.deepEqual(f.calls[0][1],{action:'CREATE_SALES_ORDER',approvalRef:'ADMIN_UI_CREATE_SALES_ORDER_synthetic'});});
test('errors expose only bounded operational codes, never raw credentials',()=>{assert.equal(m.fiscalErrorMessage({response:{data:{code:'LEGACY_INDIVIDUAL_APPROVAL_EXPIRED'}}}),'LEGACY_INDIVIDUAL_APPROVAL_EXPIRED');assert.doesNotMatch(m.fiscalErrorMessage(new Error('Bearer secret')),/secret|Bearer/);});
test('only safe HTTPS document links are accepted',()=>{assert.equal(m.safeFiscalUrl('javascript:alert(1)'),null);assert.equal(m.safeFiscalUrl('https://user:password@example.test/file'),null);assert.equal(m.safeFiscalUrl('https://example.test/file'),'https://example.test/file');});

test('non-admin or insufficient scope is never presented as authorized',()=>{
  for(const me of [null,{role:'CUSTOMER'},{role:'ADMIN',scopes:['admin:orders:read']}])assert.equal(m.isFiscalAdmin(me),false);
  assert.equal(m.isFiscalAdmin({role:'ADMIN',scopes:['admin:orders:manage']}),true);
});
test('an authorized document with missing remote links never creates or sends a replacement',()=>{
  const s={...prepared(),document:{id:'document',status:'AUTHORIZED'},danfeUrl:'https://example.test/d',xmlUrl:'https://example.test/x'};
  assert.equal(m.fiscalStage(s,binding).action,null);
});

test('approval absent from server validated projection cannot execute',async()=>{const f=fixture();f.state={...prepared(),approvedId:null};await assert.rejects(()=>f.client().execute(ORDER,{approvalId:f.approvalId,action:'CREATE_SALES_ORDER',expiresAt:'2026-11-12T10:05:00Z',transportAuthorized:false}));assert.equal(f.calls.length,0);});
test('archived files without URLs never trigger a second download',()=>{const s={...prepared(),document:{id:'document',status:'AUTHORIZED',blingOrderId:'sale',blingNfeId:'nfe'},danfeStored:true,xmlStored:true};assert.equal(m.fiscalStage(s,binding).action,null);});

test('preparation sends the supported confirmation and stores only order/document/automation IDs',async()=>{
  const f=fixture();f.state=snap();f.post=async()=>({automationId:'created-auto',documentId:'created-doc',transportAuthorized:false});
  await f.client().prepare(ORDER);
  assert.deepEqual(f.calls[0][1],{confirmation:'PREPARE_ORD_L3F0HN_BEFORE_LABEL_LOCAL_ONLY'});
  assert.deepEqual(JSON.parse(f.data.get('keyfi-fiscal:'+ORDER)),{orderId:ORDER,documentId:'created-doc',automationId:'created-auto'});
  assert.equal(f.calls.length,1);
});
test('backend rejection is shown by code and is never retried',async()=>{
  const f=fixture();f.post=async()=>{throw {response:{status:409,data:{code:'LEGACY_INDIVIDUAL_ACTION_CHANGED'}}};};
  await assert.rejects(()=>f.client().approve(ORDER,'CREATE_SALES_ORDER'));
  assert.equal(f.calls.length,1);
});

test('client without an explicit legitimate admin check cannot POST',async()=>{
  let calls=0;const c=m.createSupervisedFiscalClient({read:async()=>prepared(),post:async()=>{calls++;},storage:{getItem:()=>null,setItem(){},removeItem(){}}});
  await assert.rejects(()=>c.prepare(ORDER));assert.equal(calls,0);
});
