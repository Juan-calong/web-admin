import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const calls=[],configs=[];let postWait=null,postError=null;
let currentUser={role:"ADMIN"};
const currentPlan={blocked:false,requiresRevision:false,legacyRevision:null,status:"NOT_SYNCED",action:"SYNC",snapshotHash:"a".repeat(64),identityConfirmationRequired:true};
let saved={cest:'0000000',icmsCst:'00',ncm:'00000000'};
const api={put:async(path,data)=>{const json=JSON.parse(JSON.stringify(data));calls.push(json);saved={...saved,...json};return {data:{productId:'synthetic-product',fiscalData:saved}};},get:async()=>({data:{productId:'synthetic-product',fiscalData:saved}}),post:async(path,data,config)=>{calls.push(data);configs.push(config);if(postWait)await postWait;if(postError)throw postError;return {data:{updated:true}};}};
globalThis.__fiscalCatalogTest={api,getMe:()=>currentUser,endpoints:{adminProductFiscal:{get:id=>id,save:id=>id},adminProductBling:{sync:id=>id}}};
const source=fs.readFileSync(new URL('./productFiscal.ts',import.meta.url),'utf8').replace(/^import .* from "@\/lib\/(api|endpoints|auth|fiscalNoAuthRetry)";\n/gm,'');
const js=ts.transpileModule('const authStore={getMe:()=>globalThis.__fiscalCatalogTest.getMe()}; const fiscalNoAuthRetryConfig={skipAuthRetry:true}; const {api,endpoints}=globalThis.__fiscalCatalogTest;\n'+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const fiscal=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('clearing one optional field survives save/reload and keeps omitted CST/leading zeros',async()=>{
 await fiscal.updateAdminProductFiscal('synthetic-product',{cest:''});const loaded=await fiscal.getAdminProductFiscal('synthetic-product');
 assert.equal(loaded.fiscalData.cest,null);assert.equal(loaded.fiscalData.icmsCst,'00');assert.equal(loaded.fiscalData.ncm,'00000000');assert.deepEqual(calls.at(-1),{cest:null});
});
test('null is an explicit removal and omitted properties remain omitted',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(fiscal.normalizeFiscalInput({ipiCst:null,unit:' un '}))),{ipiCst:null,unit:'UN'});
});
test('changed synchronization requires explicit approved server revision',async()=>{
 await assert.rejects(fiscal.syncAdminProductToBling('synthetic-product',{...currentPlan,requiresRevision:true,legacyRevision:2},false,true));
 await fiscal.syncAdminProductToBling('synthetic-product',{...currentPlan,requiresRevision:true,legacyRevision:2},true,true);assert.equal(calls.at(-1).legacyRevision,2);
});
test('uncertain operation or unavailable plan never reaches POST',async()=>{
 for(const plan of [undefined,{blocked:true,requiresRevision:false,legacyRevision:null},{blocked:false,requiresRevision:true,legacyRevision:0}]){
 const count=calls.length;await assert.rejects(fiscal.syncAdminProductToBling('synthetic-product',plan,true,true));assert.equal(calls.length,count);
 }
});
test('editing a loaded form sends only changed fields, not blank values for untouched data',async()=>{
 calls.length=0;
 const baseline={ncm:'00000000',origin:'0',unit:'UN',cest:'0000000',icmsCst:'00',ipiCst:null};
 await fiscal.updateAdminProductFiscal('synthetic-product',{...baseline,cest:'',unit:'un',ipiCst:''},baseline);
 assert.deepEqual(calls.at(-1),{cest:null});
});

 test('product sync requires explicit confirmation and server snapshot before POST',async()=>{
  for(const [plan,confirmed] of [[currentPlan,false],[{...currentPlan,snapshotHash:''},true],[{...currentPlan,status:'UNKNOWN'},true],[{...currentPlan,action:undefined},true],[{...currentPlan,blocked:undefined},true],[{...currentPlan,requiresRevision:undefined},true]]){
   const before=calls.length;await assert.rejects(fiscal.syncAdminProductToBling('product',plan,false,confirmed));assert.equal(calls.length,before);
  }
 });
 test('confirmed synchronization and read-only recovery use bound payload and no auth replay',async()=>{
  await fiscal.syncAdminProductToBling('product',currentPlan,false,true);
  assert.equal(calls.at(-1).confirmation,'SYNC_PRODUCT_WITH_BLING');assert.equal(calls.at(-1).identityConfirmed,true);assert.equal(calls.at(-1).snapshotHash,currentPlan.snapshotHash);assert.match(calls.at(-1).requestId,/^[0-9a-f-]{36}$/);assert.equal(configs.at(-1).skipAuthRetry,true);
  await fiscal.syncAdminProductToBling('product',{...currentPlan,status:'UNKNOWN',action:'RECONCILE'},false,true);
  assert.equal(calls.at(-1).confirmation,'RECONCILE_PRODUCT_READ_ONLY');assert.equal(configs.at(-1).skipAuthRetry,true);
 });
 test('duplicate product sync clicks share one pending guard without replay',async()=>{
  let resolve;postWait=new Promise(r=>{resolve=r;});const pending=fiscal.syncAdminProductToBling('product',currentPlan,false,true);const before=calls.length;
  await assert.rejects(fiscal.syncAdminProductToBling('product',currentPlan,false,true));assert.equal(calls.length,before);resolve();await pending;postWait=null;
 });
 test('sync presentation uses server proof and identifies the confirmed product',()=>{
  assert.equal(fiscal.productSyncStatus(undefined),'Situação não confirmada');
  for(const [status,label] of [['NOT_SYNCED','Não sincronizado'],['SYNCED','Sincronizado'],['ERROR','Erro na sincronização'],['UNKNOWN','Resultado desconhecido — reconciliação necessária']])assert.equal(fiscal.productSyncStatus({...currentPlan,status}),label);
  const text=fiscal.productSyncConfirmation({name:'Produto atual',sku:'SKU-1',gtin:'123',plan:{...currentPlan,proposedName:'Apresentação proposta'}});
  for(const part of ['Produto atual','SKU-1','123','Apresentação proposta','unidades já vendidas'])assert.ok(text.includes(part));
  assert.match(fiscal.productSyncConfirmation({name:'Atual',sku:'SKU',plan:{...currentPlan,requiresRevision:true,legacyRevision:2}}),/revisão 2/);
  assert.match(fiscal.productSyncConfirmation({name:'Atual',sku:'SKU',plan:{...currentPlan,status:'UNKNOWN',action:'RECONCILE'}}),/somente leitura/);
 });

 test('non-ADMIN product sync never posts even with explicit confirmation',async()=>{
  const before=calls.length;
  try {for(const user of [null,{role:'SELLER'}]) {currentUser=user;await assert.rejects(fiscal.syncAdminProductToBling('product',currentPlan,false,true));}assert.equal(calls.length,before);}
  finally {currentUser={role:'ADMIN'};}
 });
 test('failed product sync is surfaced once without automatic retry',async()=>{
  postError=new Error('409 stale snapshot');const before=calls.length;
  try {await assert.rejects(fiscal.syncAdminProductToBling('product',currentPlan,false,true),/409 stale snapshot/);assert.equal(calls.length,before+1);}
  finally {postError=null;}
 });
