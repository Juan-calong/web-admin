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
