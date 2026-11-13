import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {UmbrellaRegularization} from './UmbrellaRegularization.tsx';import {UMBRELLA_ORDER} from '@/lib/umbrellaRegularization';
test('other orders never display this case-specific regularization',()=>assert.equal(renderToStaticMarkup(React.createElement(UmbrellaRegularization,{orderId:'other'})),''));
test('initial read-only panel demands sold-unit documentary evidence and does not offer emission',()=>{const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(UmbrellaRegularization,{orderId:UMBRELLA_ORDER})));assert.match(html,/Exige documento da unidade vendida/);assert.match(html,/60 ml e GTIN 0631430443749/);assert.match(html,/Histórico anterior será preservado/);assert.doesNotMatch(html,/Criar NF-e|Enviar NF-e/);});
test('server-confirmed regularization offers preparation and preserves account-block notice',async()=>{
 const {authStore}=await import('@/lib/auth');const values=new Map();globalThis.window={};globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 authStore.setMe({id:'synthetic',role:'ADMIN'});
 try{
  const client=new QueryClient();client.setQueryData(['umbrella-regularization',UMBRELLA_ORDER],{orderId:UMBRELLA_ORDER,productId:'93d60874-b89b-49cb-bb8d-3b96ecfc6248',name:'UMBRELLA 60ML',proposedName:'UMBRELLA 60ML',sku:'LEAVE UMBRELLA 60ML',gtin:'0631430443749',regularized:true,prepared:false,accountBlocked:true,remoteId:'synthetic',operationStatus:'SUCCEEDED',approval:null});
  const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(UmbrellaRegularization,{orderId:UMBRELLA_ORDER})));
  assert.match(html,/Regularização confirmada/);assert.match(html,/Conta bloqueada/);assert.match(html,/Preparar pedido regularizado/);assert.match(html,/disabled=""[^>]*>Preparar pedido regularizado/);assert.doesNotMatch(html,/Executar regularização aprovada/);
 }finally{authStore.clearAll();}
});

for(const [label,extra]of [
 ['attached unreviewed',{unitReviewed:false,accountReviewed:false}],['unit reviewed but account unproven',{unitReviewed:true,accountReviewed:false}],['all human reviews confirmed',{unitReviewed:true,accountReviewed:true}],
])test('U renders '+label+' without inventing approval',async()=>{
 const {authStore}=await import('@/lib/auth');const values=new Map();globalThis.window={};globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};authStore.setMe({id:'synthetic',role:'ADMIN'});
 try{const client=new QueryClient();const file={id:'67e371f9-cd03-43ca-926e-a6a2425ae1aa',sha256:'a'.repeat(64),version:2,contentType:'application/pdf',size:10};client.setQueryData(['umbrella-regularization',UMBRELLA_ORDER],{orderId:UMBRELLA_ORDER,productId:'93d60874-b89b-49cb-bb8d-3b96ecfc6248',name:'UMBRELLA 200ML',proposedName:'UMBRELLA 60ML',sku:'LEAVE UMBRELLA 60ML',gtin:'0631430443749',regularized:false,prepared:false,accountBlocked:false,remoteId:null,operationStatus:null,approval:null,evidence:{unit:file,account:file,...extra}});
 const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(UmbrellaRegularization,{orderId:UMBRELLA_ORDER})));assert.match(html,/Anexo e revisão são etapas distintas/);assert.match(html,/Abrir evidência da unidade/);assert.match(html,/Abrir evidência da conta Bling/);assert.doesNotMatch(html,/Criar NF-e|Enviar NF-e/);
 if(!extra.unitReviewed||!extra.accountReviewed)assert.match(html,/disabled=""[^>]*>Revisar catálogo e aprovar regularização/);
 }finally{authStore.clearAll();}
});

for(const [label,state,pattern] of [
 ['UNKNOWN recuperável',{operationStatus:'UNKNOWN',accountBlocked:true,approval:{approvalId:'a',expiresAt:'2099-01-01T00:00:00Z',action:'CREATE_PRODUCT',started:true}},/Reconciliar produto por leitura/],
 ['aprovação expirada',{operationStatus:null,approval:{approvalId:'a',expiresAt:'2020-01-01T00:00:00Z',action:'CREATE_PRODUCT',started:false}},/disabled=""[^>]*>Executar regularização aprovada/],
 ['preparação concluída',{regularized:true,prepared:true,operationStatus:'SUCCEEDED'},/disabled=""[^>]*>Pedido preparado/],
])test('U '+label+' respects the server state',async()=>{
 const {authStore}=await import('@/lib/auth');const values=new Map();globalThis.window={};globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};authStore.setMe({id:'synthetic',role:'ADMIN'});
 try{const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});client.setQueryData(['umbrella-regularization',UMBRELLA_ORDER],{orderId:UMBRELLA_ORDER,productId:'93d60874-b89b-49cb-bb8d-3b96ecfc6248',name:'UMBRELLA 60ML',proposedName:'UMBRELLA 60ML',regularized:false,prepared:false,accountBlocked:false,operationStatus:null,approval:null,evidence:{unit:null,account:null,unitReviewed:true,accountReviewed:true},...state});
 const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(UmbrellaRegularization,{orderId:UMBRELLA_ORDER})));assert.match(html,pattern);assert.doesNotMatch(html,/Criar NF-e|Enviar NF-e/);
 }finally{authStore.clearAll();}
});
