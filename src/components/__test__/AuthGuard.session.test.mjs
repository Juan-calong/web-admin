import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import axios, {AxiosError} from 'axios';

// Execute the real effect body with controlled setup/cleanup scheduling.
// This reproduces Strict Mode's effect cycle; it is not browser/cookie UAT.
let mounting;
const redirects=[];
mock.module('react',{defaultExport:React.default,namedExports:{...React,
  useState:value=>{const instance=mounting;return [typeof value==='function'?value():value,value=>instance.states.push(value)];},
  useEffect:effect=>{mounting.cleanup=effect();},
}});
const router={replace:path=>redirects.push(path)};
mock.module('next/navigation.js',{namedExports:{useRouter:()=>router,usePathname:()=>'/admin/orders'}});
const values=new Map();
globalThis.window={location:{pathname:'/admin/orders',search:'',href:''}};
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
let adapter;
axios.defaults.adapter=config=>adapter(config);
const {api,refreshAccessToken}=await import('../../lib/api.ts');
const {authStore}=await import('../../lib/auth.ts');
const {AuthGuard}=await import('../AuthGuard.tsx');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(config,data={})=>({config,data,status:200,statusText:'OK',headers:{}});
const unauthorized=config=>new AxiosError('synthetic','ERR_BAD_REQUEST',config,null,{config,data:{error:'Token inválido'},status:401,statusText:'Unauthorized',headers:{}});
function mount(){const instance={states:[],cleanup:null};mounting=instance;AuthGuard({children:'synthetic child'});mounting=null;return instance;}
function setup(){
 authStore.clearAll();authStore.setMe({id:'synthetic',email:'synthetic@example.test',role:'ADMIN'});redirects.length=0;window.location.href='';
 const requests=[],pending=[];
 adapter=async config=>{requests.push(config);if(config.url==='/auth/refresh')return new Promise((resolve,reject)=>pending.push({config,resolve,reject}));return response(config);};
 return {requests,pending,async finish(){for(const p of pending.splice(0))p.resolve(response(p.config,{accessToken:'synthetic-fresh'}));await tick();}};
}

test('Strict Mode setup/cleanup/setup sends exactly one refresh and never redirects from a disposed effect',async()=>{
 const f=setup();const old=mount();old.cleanup();const active=mount();await tick();
 try{assert.equal(f.pending.length,1);}finally{await f.finish();active.cleanup();}
 assert.deepEqual(redirects,[]);assert.equal(authStore.getAccessToken(),'synthetic-fresh');
 assert.equal(active.states.at(-1),true);assert.deepEqual(old.states,[false]);
});

test('one F5 and two consecutive completed F5 cycles use one refresh each',async()=>{
 const f=setup();authStore.setAccessToken('synthetic-login');const logged=mount();logged.cleanup();assert.equal(f.requests.length,0);
 for(let i=1;i<=3;i++){
  authStore.clearAccessToken();const old=mount();old.cleanup();const active=mount();await tick();
  try{assert.equal(f.requests.filter(r=>r.url==='/auth/refresh').length,i);}finally{await f.finish();active.cleanup();}
  assert.deepEqual(redirects,[]);assert.equal(authStore.getAccessToken(),'synthetic-fresh');
 }
 assert.equal(values.has('accessToken'),false);
});

test('a refresh failure from an unmounted effect cannot clear a later login or redirect',async()=>{
 const f=setup();const old=mount();await tick();old.cleanup();authStore.clearAll();authStore.setAccessToken('synthetic-new-login');
 f.pending.splice(0).forEach(p=>p.reject(unauthorized(p.config)));await tick();
 assert.deepEqual(redirects,[]);assert.equal(authStore.getAccessToken(),'synthetic-new-login');
});

test('AuthGuard and expired read requests share the same in-flight cookie refresh',async()=>{
 const f=setup();const prior=adapter;
 adapter=async config=>{if(config.url==='/synthetic/read'&&!config._retry)throw unauthorized(config);return prior(config);};
 const active=mount();const read=api.get('/synthetic/read');await tick();
 try{assert.equal(f.pending.length,1);}finally{await f.finish();await read;active.cleanup();}
 assert.equal(window.location.href,'');assert.equal(authStore.getAccessToken(),'synthetic-fresh');
});

test('simultaneous expired reads refresh once using cookies and retry each read only once',async()=>{
 const f=setup();const prior=adapter;
 adapter=async config=>{if(config.url.startsWith('/synthetic/')&&!config._retry)throw unauthorized(config);return prior(config);};
 const reads=Promise.all([api.get('/synthetic/one'),api.get('/synthetic/two')]);await tick();
 try{assert.equal(f.pending.length,1);assert.equal(f.pending[0].config.withCredentials,true);}finally{await f.finish();await reads;}
 assert.equal(f.requests.filter(r=>r.url==='/auth/refresh').length,1);
});

test('logout followed by reload rejects refresh without restoring a memory token',async()=>{
 const f=setup();authStore.setAccessToken('synthetic-login');await api.post('/auth/logout',{});authStore.clearAll();
 const active=mount();await tick();f.pending.splice(0).forEach(p=>p.reject(unauthorized(p.config)));await tick();active.cleanup();
 assert.equal(authStore.getAccessToken(),null);assert.deepEqual(redirects,['/login?next=%2Fadmin%2Forders']);assert.equal(values.has('accessToken'),false);
});

test('a refresh response arriving after logout cannot restore the memory access token',async()=>{
 const f=setup();const active=mount();await tick();authStore.clearAll();await f.finish();active.cleanup();
 assert.equal(authStore.getAccessToken(),null);assert.deepEqual(redirects,[]);
});

test('the shared refresh entry point is available to the guard',()=>{assert.equal(typeof refreshAccessToken,'function');});
