import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const calls=[];
globalThis.__sped={api:{put:async(_p,data)=>{calls.push(JSON.parse(JSON.stringify(data)));return {data:{}};}},endpoints:{adminProductFiscal:{save:id=>id}}};
const source=fs.readFileSync(new URL('./productFiscal.ts',import.meta.url),'utf8').replace(/^import .* from "@\/lib\/(api|endpoints)";\n/gm,'');
const js=ts.transpileModule('const {api,endpoints}=globalThis.__sped;\n'+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const fiscal=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('invalid changed SPED labels never reach save; no automatic conversion',async()=>{
 for(const itemType of ['PERODUTO_REVENDA','PRODUTO_REVENDA','MERCADORIA_REVENDA','0','11']){
  const before=calls.length;await assert.rejects(()=>fiscal.updateAdminProductFiscal('synthetic',{itemType}));assert.equal(calls.length,before);
 }
});
test('legacy label remains visible and unchanged while a different field is edited',async()=>{
 const saved={itemType:'PERODUTO_REVENDA',fiscalDescription:'Before'};
 assert.equal(fiscal.normalizeFiscalInput(saved).itemType,saved.itemType);
 await fiscal.updateAdminProductFiscal('synthetic',{...saved,fiscalDescription:'After'},saved);
 assert.deepEqual(calls.at(-1),{fiscalDescription:'After'});assert.equal(saved.itemType,'PERODUTO_REVENDA');
});
test('explicit approved code or explicit removal is sent without classification defaults',async()=>{
 for(const itemType of ['00','99',null]){
  await fiscal.updateAdminProductFiscal('synthetic',{itemType});assert.deepEqual(calls.at(-1),{itemType});
 }
});
test('product form does not suggest or assign a textual SPED classification',()=>{
 for(const path of ['../app/admin/products/[id]/page.tsx','../app/admin/products/new/page.tsx']){
  const page=fs.readFileSync(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(page,/MERCADORIA_REVENDA/);assert.match(page,/Código SPED/);
 }
});
