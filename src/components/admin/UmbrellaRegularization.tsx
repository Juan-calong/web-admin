"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {umbrellaClient,evidenceReviewBody,UMBRELLA_ORDER,UNIT_REVIEW,ACCOUNT_REVIEW,type EvidenceFile} from '@/lib/umbrellaRegularization';
import {authStore} from '@/lib/auth';
import {fiscalErrorMessage,isFiscalAdmin} from '@/lib/supervisedFiscal';
import {Button} from '@/components/ui/button';
function fileBase64(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Arquivo não pôde ser lido.'));reader.readAsDataURL(file);});}
export function UmbrellaRegularization({orderId}:{orderId:string}){
 return orderId===UMBRELLA_ORDER?<Panel/>:null;
}
function Panel(){
 const client=useMemo(()=>umbrellaClient(),[]),queries=useQueryClient(),lock=useRef(false);
 const admin=isFiscalAdmin(authStore.getMe());
 const query=useQuery({queryKey:['umbrella-regularization',UMBRELLA_ORDER],queryFn:client.read,enabled:admin,retry:false,refetchOnWindowFocus:false});
 const [purpose,setPurpose]=useState<'UNIT'|'BLING_ACCOUNT'>('UNIT'),[companyId,setCompanyId]=useState('');
 const [opened,setOpened]=useState<{file:EvidenceFile;url:string;purpose:'UNIT'|'BLING_ACCOUNT'}|null>(null);const objectUrl=useRef<string|null>(null);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 const [file,setFile]=useState<File|null>(null),[confirmed,setConfirmed]=useState(false),[reviewRef,setReviewRef]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 const s=query.data,disabled=busy||query.isFetching||query.isError||!admin;
 async function viewDocument(which:'UNIT'|'BLING_ACCOUNT'){
  const info=s?.evidence?.[which==='UNIT'?'unit':'account'];if(!info||lock.current||disabled)return;
  lock.current=true;setBusy(true);setConfirmed(false);
  try{const blob=await client.view(info.id);if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const url=URL.createObjectURL(blob);objectUrl.current=url;setOpened({file:info,url,purpose:which});}catch(e){setMessage(fiscalErrorMessage(e));}finally{lock.current=false;setBusy(false);}
 }
 async function run(action:'review'|'evidence'|'approve'|'execute'|'reconcile'|'prepare'){
  if(lock.current||disabled)return;
  const warning=action==='review'?(opened?.purpose==='UNIT'?UNIT_REVIEW:ACCOUNT_REVIEW):action==='evidence'?'Anexar arquivo privado? O anexo ainda NÃO autoriza regularização. Será necessária abertura e revisão explícita do conteúdo.':action==='approve'?'Consultar o catálogo do Bling e aprovar individualmente a regularização por cinco minutos? Ainda não cria o produto.':action==='execute'?'Executar uma vez a associação ou criação aprovada do Umbrella 60 ml e corrigir somente o nome local conflitante? Não emite NF-e. Timeout exige reconciliação; não repita a criação.':action==='reconcile'?'Consultar somente o produto existente no Bling e reconciliar a operação. Nenhum produto será criado e nenhum POST externo será repetido. Somente a causa comprovada poderá ser resolvida; outras pendências manterão a conta bloqueada.':'Preparar documento e automação locais deste pedido regularizado? Não cria venda nem NF-e.';
  if(!window.confirm(warning))return;
  lock.current=true;setBusy(true);setMessage(null);
  try{
   const fresh=await client.read();let body:object;
   if(action==='evidence'){
    if(!file||file.size>256*1024||!['image/jpeg','image/png','application/pdf'].includes(file.type)||!/^[A-Za-z0-9:_-]{1,160}$/.test(reviewRef))throw Error('Documento, confirmação e referência válidos necessários.');
    body={requestId:crypto.randomUUID(),reviewRef,contentBase64:await fileBase64(file),contentType:file.type,purpose};
   }else if(action==='review'){
    body=evidenceReviewBody(fresh,opened,confirmed,companyId);
   }else if(action==='approve')body={requestId:crypto.randomUUID(),confirmation:'APPROVE_UMBRELLA_60ML_REGULARIZATION'};
   else if(action==='execute'||action==='reconcile'){
    if(!fresh.approval||fresh.approval.approvalId!==s?.approval?.approvalId||action==='execute'&&(fresh.approval.started||Date.parse(fresh.approval.expiresAt)<=Date.now()))throw Error('Aprovação indisponível ou expirada. Atualize o estado.');
    body={approvalId:fresh.approval.approvalId,...(action==='reconcile'?{requestId:crypto.randomUUID()}:{}),confirmation:action==='execute'?'EXECUTE_UMBRELLA_60ML_REGULARIZATION':'RECONCILE_UMBRELLA_PRODUCT_READ_ONLY'};
   }else body={};
   const result=await client.post(action,body);setMessage(action==='reconcile'?(result.accountBlocked===false?'Recuperação confirmada. A API liberou a conta após resolver as causas. Os demais gates continuam válidos.':'Recuperação confirmada; a conta continua bloqueada por outras pendências.'):'Etapa confirmada pela API. Confira o estado atualizado antes de avançar.');
  }catch(e){setMessage(fiscalErrorMessage(e)+' Nenhuma repetição automática foi realizada.');}
  finally{try{await query.refetch({throwOnError:true});await queries.invalidateQueries({queryKey:['admin-supervised-fiscal',UMBRELLA_ORDER]});await queries.invalidateQueries({queryKey:['admin-order-details',UMBRELLA_ORDER]});}catch{setMessage('Não foi possível confirmar o estado atualizado. Não repita a operação; atualize a regularização.');}finally{lock.current=false;setBusy(false);}}
 }
 return <section aria-label="Regularização Umbrella 60 ml" className="space-y-3 rounded-xl border border-amber-300 p-4">
  <h3 className="font-semibold">Regularização supervisionada — Umbrella 60 ml</h3>
  <p className="text-sm">Exclusiva deste pedido. Exige documento da unidade vendida ou separada/entregue, ligado ao pedido, com apresentação 60 ml e GTIN 0631430443749. Catálogo e preço não comprovam a unidade. Histórico anterior será preservado.</p>
  {s?<p className="text-sm">Nome atual: {s.name}. Proposto: {s.proposedName}. SKU: {s.sku}. Vínculo: {s.remoteId??'ausente'}. Operação nova: {s.operationStatus??'não iniciada'}. {s.regularized?'Regularização confirmada.':'Regularização pendente.'}</p>:null}
  {query.isError?<p role="alert">{fiscalErrorMessage(query.error)}</p>:null}
  {message?<p role="status">{message}</p>:null}
  <Button variant="outline" disabled={busy||query.isFetching||!admin} onClick={()=>{void query.refetch();}}>Atualizar regularização</Button>
  {s?<>
   <p role="status">Documento da unidade: {s.evidence?.unitReviewed?'REVISADO':'não revisado'}. Conta Bling: {s.evidence?.accountReviewed?'COMPROVADA':'não comprovada'}. Anexo e revisão são etapas distintas.</p>
   <label className="block text-sm">Finalidade documental<select value={purpose} disabled={disabled} onChange={e=>{setPurpose(e.target.value as 'UNIT'|'BLING_ACCOUNT');setConfirmed(false);}}><option value="UNIT">Unidade deste pedido</option><option value="BLING_ACCOUNT">Empresa da conta Bling autenticada</option></select></label>
   <label className="block text-sm">Documento privado (PDF/JPEG/PNG, até 256 KiB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={disabled} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <label className="block text-sm">Referência documental sem dados pessoais<input className="block border p-2" value={reviewRef} maxLength={160} disabled={disabled} onChange={e=>setReviewRef(e.target.value)}/></label>
   <Button variant="outline" disabled={disabled||!file||!reviewRef} onClick={()=>{void run('evidence');}}>Anexar documento privado — sem aprovação</Button>
   {(['UNIT','BLING_ACCOUNT'] as const).map(which=>{const info=s.evidence?.[which==='UNIT'?'unit':'account'];return info?<div key={which}><p className="text-xs break-all">{which==='UNIT'?'Unidade':'Conta Bling'} · revisão {info.version} · SHA-256 {info.sha256}</p><Button variant="outline" disabled={disabled} onClick={()=>{void viewDocument(which);}}>Abrir evidência {which==='UNIT'?'da unidade':'da conta Bling'}</Button></div>:null;})}
   {opened?<div className="space-y-2">
    <iframe sandbox="" title="Documento privado para revisão administrativa" src={opened.url} className="h-80 w-full border"/>
    <a href={opened.url} download="evidencia" className="underline">Abrir arquivo local para conferência</a>
    {opened.purpose==='BLING_ACCOUNT'?<label className="block text-sm">CNPJ exibido na conta Bling autenticada (nunca informe tokens)<input value={companyId} onChange={e=>setCompanyId(e.target.value)} maxLength={18}/></label>:null}
    <label className="block text-sm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>{opened.purpose==='UNIT'?UNIT_REVIEW:ACCOUNT_REVIEW}</label>
    <p className="text-xs">Conferência humana do conteúdo. Arquivo, OCR, nome, MIME e catálogo não provam a unidade vendida. Para a conta, confira evidência do painel empresarial autenticado; 403 não comprova identidade.</p>
    <Button variant="outline" disabled={disabled||!confirmed} onClick={()=>{void run('review');}}>Aprovar revisão desta versão/hash</Button>
   </div>:null}
   {!s.regularized?<>
   <Button variant="outline" disabled={disabled||s.regularized||!s.evidence?.unitReviewed||!s.evidence?.accountReviewed||!!s.operationStatus} onClick={()=>{void run('approve');}}>Revisar catálogo e aprovar regularização</Button>
   {s.approval?<p className="text-sm">Aprovação {s.approval.action==='ASSOCIATE'?'de associação local':'de criação individual no Bling'} · expira em {new Date(s.approval.expiresAt).toLocaleString('pt-BR')}. {s.approval.started?'Já consumida. Não repita a criação.':''}</p>:null}
   <Button variant="outline" disabled={disabled||s.regularized||!s.approval||s.approval.started||Date.parse(s.approval.expiresAt)<=now} onClick={()=>{void run('execute');}}>Executar regularização aprovada</Button>
   </>:null}
   <Button variant="outline" disabled={disabled||!s.approval||!['UNKNOWN','SUCCEEDED'].includes(s.operationStatus??'')} onClick={()=>{void run('reconcile');}}>Reconciliar produto por leitura</Button>
  </>:null}
  {s?.accountBlocked?<p role="status">Conta bloqueada. Use a recuperação por leitura para resolver somente a causa comprovada. Outras pendências impedem a preparação.</p>:null}
  {s?.regularized?<Button variant="outline" disabled={disabled||s.prepared||s.accountBlocked||!s.evidence?.unitReviewed||!s.evidence?.accountReviewed} onClick={()=>{void run('prepare');}}>{s.prepared?'Pedido preparado — continue no fluxo fiscal':'Preparar pedido regularizado'}</Button>:null}
  <p className="text-xs">A API revalida identidade, duplicidade, pagamento, logística, autoridade e evidências. Worker, P3 e escritas fiscais globais permanecem fechados.</p>
 </section>;
}
