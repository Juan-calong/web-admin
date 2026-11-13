import test from 'node:test';
import assert from 'node:assert/strict';
import {createUmbrellaRegularizationClient,UMBRELLA_PRODUCT_ID as id} from './umbrellaRegularization.ts';
import {api} from './api.ts';
import {authStore} from './auth.ts';
import {AxiosError} from 'axios';
const authorizationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(failure){
 const calls=[];const client=createUmbrellaRegularizationClient({authorized:()=>true,post:async(path,body,config)=>{
  calls.push({path,body,config});assert.equal(config.skipAuthRetry,true);assert.equal(body.legacyRevision,0);
  const action=body.regularization.action;
  if(action==='INSPECT')return {snapshot:'a'.repeat(64),companyIdentity:{enterpriseId:'7001',credentialId:'synthetic',connectedAt:'2026-11-01T00:00:00Z'}};
  if(action==='AUTHORIZE')return {authorizationId,expiresAt:new Date(Date.now()+300000).toISOString(),transportAuthorized:false};
  if(failure)throw Object.assign(Error('synthetic'),{response:failure===401?{status:401}:undefined,code:failure==='timeout'?'ECONNABORTED':undefined});
  return {blingProductId:'900060',created:true};
 }});return {client,calls};
}
const review={mode:'RISK_RESIDUAL_ACCEPTANCE',evidence:{category:'RISK_RESIDUAL_ACCEPTANCE'},reviewConfirmed:true};
test('inspect and explicit approval never execute implicitly',async()=>{
 const {client,calls}=fixture();await client.inspect(id);await assert.rejects(client.authorize({...review,reviewConfirmed:false}));await client.authorize(review);
 assert.deepEqual(calls.map(c=>c.body.regularization.action),['INSPECT','AUTHORIZE']);
 assert.match(calls[1].body.regularization.reviewRef,/^UMBRELLA-/);
 await assert.rejects(client.execute(false));await client.execute(true);assert.equal(calls.length,3);assert.equal(calls[2].body.regularization.confirmation,'EXECUTE_UMBRELLA_SUPERVISED_PRODUCT_SYNC');
});
for(const failure of [401,'timeout'])test(`${failure}: fiscal POST is never retried or replayed`,async()=>{
 const {client,calls}=fixture(failure);await client.inspect(id);await client.authorize(review);await assert.rejects(client.execute(true));await assert.rejects(client.execute(true));assert.equal(calls.filter(c=>c.body.regularization.action==='EXECUTE').length,1);
 assert.equal(calls.some(c=>c.path.includes('/auth/refresh')),false);
});
test('double click and unauthenticated actor never dispatch duplicate POST',async()=>{
 let finish;let calls=0;
 const client=createUmbrellaRegularizationClient({authorized:()=>true,post:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=client.inspect(id);await assert.rejects(client.inspect(id));assert.equal(calls,1);finish({snapshot:'a'.repeat(64),companyIdentity:{enterpriseId:'7001',credentialId:'x',connectedAt:'2026-11-01T00:00:00Z'}});await first;
 const forbidden=createUmbrellaRegularizationClient({authorized:()=>false,post:async()=>{throw Error('must not dispatch');}});await assert.rejects(forbidden.inspect(id));
});
test('wrong product and unconfirmed company are rejected',async()=>{
 const {client,calls}=fixture();await assert.rejects(client.inspect('another'));assert.equal(calls.length,0);
 const bad=createUmbrellaRegularizationClient({authorized:()=>true,post:async()=>({snapshot:'a'.repeat(64)})});await assert.rejects(bad.inspect(id));
});
test('expired authorization is never executed',async t=>{
 const {client,calls}=fixture();await client.inspect(id);await client.authorize(review);
 const later=Date.now()+300001;t.mock.method(Date,'now',()=>later);
 await assert.rejects(client.execute(true));assert.equal(calls.filter(c=>c.body.regularization.action==='EXECUTE').length,0);
});
test('existing Axios authentication interceptor does not refresh/replay EXECUTE after HTTP 401',async()=>{
 const previous=api.defaults.adapter,calls=[];authStore.setMe({id:'synthetic',role:'ADMIN'});
 api.defaults.adapter=async config=>{
  calls.push(config);const action=JSON.parse(config.data).regularization.action;
  const data=action==='INSPECT'?{snapshot:'a'.repeat(64),companyIdentity:{enterpriseId:'7001',credentialId:'synthetic',connectedAt:'2026-11-01T00:00:00Z'}}:{authorizationId,expiresAt:new Date(Date.now()+300000).toISOString()};
  if(action==='EXECUTE')throw new AxiosError('synthetic','ERR_BAD_REQUEST',config,undefined,{status:401,statusText:'Unauthorized',headers:{},config,data:{code:'AUTHENTICATION_REQUIRED'}});
  return {status:200,statusText:'OK',headers:{},config,data};
 };
 try{
  const client=createUmbrellaRegularizationClient({authorized:()=>true,post:async(path,body,config)=>(await api.post(path,body,config)).data});
  await client.inspect(id);await client.authorize(review);await assert.rejects(client.execute(true));await new Promise(r=>setImmediate(r));
  assert.equal(calls.filter(c=>JSON.parse(c.data).regularization.action==='EXECUTE').length,1);assert.equal(calls.some(c=>c.url.includes('/auth/refresh')),false);
 }finally{api.defaults.adapter=previous;authStore.clearAll();}
});

for(const enterpriseId of ['7001','436c56a5679921f5f13a3d6433561773'])test(`official company ID remains a string: ${enterpriseId}`,async()=>{
 const client=createUmbrellaRegularizationClient({authorized:()=>true,post:async()=>({snapshot:'a'.repeat(64),companyIdentity:{enterpriseId,credentialId:'synthetic',connectedAt:'2026-11-01T00:00:00Z'}})});
 assert.equal((await client.inspect(id)).companyIdentity.enterpriseId,enterpriseId);
});
for(const enterpriseId of ['',null,7001,{},'   '])test(`incomplete enterprise ID is rejected: ${JSON.stringify(enterpriseId)}`,async()=>{
 const client=createUmbrellaRegularizationClient({authorized:()=>true,post:async()=>({snapshot:'a'.repeat(64),companyIdentity:{enterpriseId,credentialId:'synthetic',connectedAt:'2026-11-01T00:00:00Z'}})});
 await assert.rejects(client.inspect(id));
});
