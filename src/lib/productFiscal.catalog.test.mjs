import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const calls=[];
let saved={cest:'0000000',icmsCst:'00',ncm:'00000000'};
const api={put:async(path,data)=>{const json=JSON.parse(JSON.stringify(data));calls.push(json);saved={...saved,...json};return {data:{productId:'synthetic-product',fiscalData:saved}};},get:async()=>({data:{productId:'synthetic-product',fiscalData:saved}}),post:async(path,data)=>{calls.push(data);return {data:{updated:true}};}};
globalThis.__fiscalCatalogTest={api,endpoints:{adminProductFiscal:{get:id=>id,save:id=>id},adminProductBling:{sync:id=>id}}};
const source=fs.readFileSync(new URL('./productFiscal.ts',import.meta.url),'utf8').replace(/^import .* from "@\/lib\/(api|endpoints)";\n/gm,'');
const js=ts.transpileModule('const {api,endpoints}=globalThis.__fiscalCatalogTest;\n'+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const fiscal=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('clearing one optional field survives save/reload and keeps omitted CST/leading zeros',async()=>{
 await fiscal.updateAdminProductFiscal('synthetic-product',{cest:''});const loaded=await fiscal.getAdminProductFiscal('synthetic-product');
 assert.equal(loaded.fiscalData.cest,null);assert.equal(loaded.fiscalData.icmsCst,'00');assert.equal(loaded.fiscalData.ncm,'00000000');assert.deepEqual(calls.at(-1),{cest:null});
});
test('null is an explicit removal and omitted properties remain omitted',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(fiscal.normalizeFiscalInput({ipiCst:null,unit:' un '}))),{ipiCst:null,unit:'UN'});
});
test('changed synchronization requires explicit approved server revision',async()=>{
 await assert.rejects(fiscal.syncAdminProductToBling('synthetic-product',{blocked:false,requiresRevision:true,legacyRevision:2},false));
 await fiscal.syncAdminProductToBling('synthetic-product',{blocked:false,requiresRevision:true,legacyRevision:2},true);assert.deepEqual(calls.at(-1),{legacyRevision:2});
});
test('uncertain operation or unavailable plan never reaches POST',async()=>{
 for(const plan of [undefined,{blocked:true,requiresRevision:false,legacyRevision:null},{blocked:false,requiresRevision:true,legacyRevision:0}]){
 const count=calls.length;await assert.rejects(fiscal.syncAdminProductToBling('synthetic-product',plan,true));assert.equal(calls.length,count);
 }
});
test('editing a loaded form sends only changed fields, not blank values for untouched data',async()=>{
 calls.length=0;
 const baseline={ncm:'00000000',origin:'0',unit:'UN',cest:'0000000',icmsCst:'00',ipiCst:null};
 await fiscal.updateAdminProductFiscal('synthetic-product',{...baseline,cest:'',unit:'un',ipiCst:''},baseline);
 assert.deepEqual(calls.at(-1),{cest:null});
});
