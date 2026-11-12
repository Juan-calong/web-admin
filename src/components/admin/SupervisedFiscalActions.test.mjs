import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {SupervisedFiscalActions} from './SupervisedFiscalActions.tsx';
const props={snapshot:{orderId:'synthetic',ready:true,reconciliation:false,automation:{automationStatus:'QUEUED'},document:{id:'d',status:'DRAFT',blingOrderId:'sale',blingNfeId:'nfe'},danfeUrl:null,xmlUrl:null},action:'SEND_NFE',reason:'',approval:null,busy:false,now:0,onPrepare(){},onApprove(){},onExecute(){}};
test('renders real identifiers and separate approval before send',()=>{const html=renderToStaticMarkup(React.createElement(SupervisedFiscalActions,props));assert.match(html,/sale/);assert.match(html,/nfe/);assert.match(html,/Solicitar aprovação: Enviar NF-e/);assert.doesNotMatch(html,/Executar: Enviar/);});
test('expired approval renders expiration instead of an executable send',()=>{const html=renderToStaticMarkup(React.createElement(SupervisedFiscalActions,{...props,now:1000,approval:{approvalId:'approval',action:'SEND_NFE',expiresAt:'1970-01-01T00:00:00Z',transportAuthorized:false}}));assert.match(html,/Expirada ou incompatível/);assert.doesNotMatch(html,/Executar: Enviar/);});
test('authorized invoice renders existing files and no enabled send',()=>{const html=renderToStaticMarkup(React.createElement(SupervisedFiscalActions,{...props,action:null,reason:'NF-e autorizada. Novo envio bloqueado.',snapshot:{...props.snapshot,document:{...props.snapshot.document,status:'AUTHORIZED',protocol:'synthetic-protocol',accessKey:'synthetic-key'},danfeUrl:'https://example.test/danfe',xmlUrl:'https://example.test/xml'}}));assert.match(html,/Abrir DANFE existente/);assert.match(html,/Abrir XML existente/);assert.match(html,/synthetic-protocol/);assert.match(html,/Novo envio bloqueado/);assert.equal((html.match(/disabled=""/g)||[]).length,7);});

test('execution appears only after the server advertises this exact valid approval',()=>{
  const approval={approvalId:'current',action:'SEND_NFE',expiresAt:'2099-01-01T00:00:00Z',transportAuthorized:false};
  const html=renderToStaticMarkup(React.createElement(SupervisedFiscalActions,{...props,approval,snapshot:{...props.snapshot,approvedId:'current'}}));
  assert.match(html,/Executar: Enviar NF-e/);
  const stale=renderToStaticMarkup(React.createElement(SupervisedFiscalActions,{...props,approval,snapshot:{...props.snapshot,approvedId:null}}));
  assert.doesNotMatch(stale,/Executar: Enviar NF-e/);
});
