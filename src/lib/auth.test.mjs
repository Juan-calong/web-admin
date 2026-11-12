import test from 'node:test';import assert from 'node:assert/strict';
const writes=[];const values=new Map([['accessToken','legacy-token']]);globalThis.window={};globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push([k,v]);values.set(k,v);},removeItem:k=>values.delete(k)};
const {authStore}=await import('./auth.ts');
test('existing login keeps access token in memory and removes legacy persisted token',()=>{assert.equal(authStore.getAccessToken(),null);assert.equal(values.has('accessToken'),false);authStore.setAccessToken('synthetic-token');assert.equal(authStore.getAccessToken(),'synthetic-token');assert.equal(writes.some(([k])=>k==='accessToken'),false);authStore.clearAll();assert.equal(authStore.getAccessToken(),null);});

test('fiscal POST uses existing auth and never refreshes/replays on 401',async()=>{
  const {default:axios,AxiosError}=await import('axios');
  const requests=[];
  axios.defaults.adapter=async config=>{requests.push(config);throw new AxiosError('synthetic','ERR_BAD_REQUEST',config,null,{status:401,statusText:'Unauthorized',data:{error:'Token inválido'},headers:{},config});};
  const {api}=await import('./api.ts');const {fiscalNoAuthRetryConfig}=await import('./fiscalNoAuthRetry.ts');
  authStore.setAccessToken('synthetic-session');
  await assert.rejects(()=>api.post('/admin/orders/synthetic/fiscal/automations/synthetic/approvals/synthetic/execute',{},fiscalNoAuthRetryConfig));
  assert.equal(requests.length,1);assert.equal(requests[0].headers.Authorization,'Bearer synthetic-session');
  assert.equal(requests.some(r=>r.url.includes('/auth/refresh')),false);
  assert.equal(writes.some(([k])=>k==='accessToken'),false);authStore.clearAll();
});
