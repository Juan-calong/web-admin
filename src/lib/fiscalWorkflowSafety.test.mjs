import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('./fiscalWorkflowSafety.ts').catch(()=>({}));
const actions=[{id:'CREATE_SALES_ORDER',enabled:true},{id:'SEND_NFE',enabled:true},{id:'SYNC_NFE',enabled:true},{id:'DOWNLOAD_XML',enabled:true}];
test('account safety overrides enabled mutation buttons while preserving queries and downloads',()=>{
 assert.equal(typeof mod.applyFiscalWorkflowSafety,'function');
 const result=mod.applyFiscalWorkflowSafety({actions,writeSafety:{writesAllowed:false,requiresReconciliation:true,reason:'Reconciliação fiscal necessária — operação anterior com resultado não confirmado.'}});
 assert.deepEqual(result.map(a=>a.enabled),[false,false,true,true]);assert.match(result[0].reason,/Reconciliação fiscal necessária/);
});
test('explicitly open safety preserves eligibility and does not enable other disabled actions',()=>{
 assert.equal(typeof mod.applyFiscalWorkflowSafety,'function');
 assert.deepEqual(mod.applyFiscalWorkflowSafety({actions:[...actions,{id:'CREATE_NFE',enabled:false}],writeSafety:{writesAllowed:true}}).map(a=>a.enabled),[true,true,true,true,false]);
});
test('individual approval never bypasses normal writes or missing safety projection',()=>{
 assert.equal(typeof mod.applyFiscalWorkflowSafety,'function');
 for(const writeSafety of [undefined,{writesAllowed:false,individualAuthorization:{action:'SEND_NFE'}}]){
 assert.deepEqual(mod.applyFiscalWorkflowSafety({actions,writeSafety}).map(a=>a.enabled),[false,false,true,true]);
 }
});
