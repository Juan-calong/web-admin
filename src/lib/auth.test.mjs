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


test('existing HTTP auth contract supports cookie refresh after memory loss and logout without persisting token',async()=>{
  const {api}=await import('./api.ts');const {endpoints}=await import('./endpoints.ts');
  const requests=[];const previous=api.defaults.adapter;
  api.defaults.adapter=async config=>{requests.push(config);return {status:200,statusText:'OK',headers:{},config,data:config.url===endpoints.auth.logout?{}:{accessToken:'synthetic-memory-only',user:{id:'admin',role:'ADMIN'}}};};
  try{
    const login=await api.post(endpoints.auth.login,{email:'synthetic@example.test',password:'synthetic'});
    authStore.setAccessToken(login.data.accessToken);authStore.setMe(login.data.user);
    assert.equal(authStore.getAccessToken(),'synthetic-memory-only');
    const {readFile}=await import('node:fs/promises');const {default:ts}=await import('typescript');
    const source=await readFile(new URL('./auth.ts',import.meta.url),'utf8');
    const fresh=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
    assert.equal(fresh.authStore.getAccessToken(),null);
    authStore.clearAccessToken();const refreshed=await api.post(endpoints.auth.refresh,{});authStore.setAccessToken(refreshed.data.accessToken);
    assert.equal(requests[1].withCredentials,true);assert.equal(requests[1].headers.Authorization,undefined);
    await api.post(endpoints.auth.logout,{});authStore.clearAll();
    assert.equal(authStore.getAccessToken(),null);assert.equal(authStore.getMe(),null);
    assert.deepEqual(requests.map(r=>r.url),[endpoints.auth.login,endpoints.auth.refresh,endpoints.auth.logout]);
    assert.equal(writes.some(([k])=>k==='accessToken'),false);
  }finally{api.defaults.adapter=previous;authStore.clearAll();}
});
