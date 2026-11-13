import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {UmbrellaProductRegularization} from './UmbrellaProductRegularization.tsx';
import {UMBRELLA_PRODUCT_ID} from '../../lib/umbrellaRegularization.ts';
test('only Umbrella gets an explicit supervised review; rendering never dispatches',()=>{
 const render=id=>renderToStaticMarkup(React.createElement(UmbrellaProductRegularization,{productId:id,disabled:false,onChanged:async()=>{throw Error('render must not dispatch');}}));
 assert.equal(render('another'),'');const html=render(UMBRELLA_PRODUCT_ID);assert.match(html,/Revisar regularização supervisionada/);assert.match(html,/não comprova NOT_SENT/);assert.match(html,/não emite NF-e/);
});
