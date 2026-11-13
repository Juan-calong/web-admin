"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {umbrellaClient,UMBRELLA_ORDER} from '@/lib/umbrellaRegularization';
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
 const [file,setFile]=useState<File|null>(null),[confirmed,setConfirmed]=useState(false),[reviewRef,setReviewRef]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 const s=query.data,disabled=busy||query.isFetching||query.isError||!admin;
 async function run(action:'evidence'|'approve'|'execute'|'reconcile'|'prepare'){
  if(lock.current||disabled)return;
  const warning=action==='evidence'?'Confirmo por documento da unidade vendida que este pedido contém Umbrella 60 ml, GTIN 0631430443749. Fotos genéricas do catálogo não bastam.':action==='approve'?'Consultar o catálogo do Bling e aprovar individualmente a regularização por cinco minutos? Ainda não cria o produto.':action==='execute'?'Executar uma vez a associação ou criação aprovada do Umbrella 60 ml e corrigir somente o nome local conflitante? Não emite NF-e. Timeout exige reconciliação; não repita a criação.':action==='reconcile'?'Consultar somente o produto existente no Bling e reconciliar a operação. Nenhum produto será criado e nenhum POST externo será repetido. O bloqueio da conta não é removido automaticamente.':'Preparar documento e automação locais deste pedido regularizado? Não cria venda nem NF-e.';
  if(!window.confirm(warning))return;
  lock.current=true;setBusy(true);setMessage(null);
  try{
   const fresh=await client.read();let body:object;
   if(action==='evidence'){
    if(!confirmed||!file||file.size>256*1024||!['image/jpeg','image/png','application/pdf'].includes(file.type)||!/^[A-Za-z0-9:_-]{1,160}$/.test(reviewRef))throw Error('Documento, confirmação e referência válidos necessários.');
    body={requestId:crypto.randomUUID(),reviewRef,contentBase64:await fileBase64(file),contentType:file.type,confirmation:'CONFIRM_SOLD_UMBRELLA_60ML_GTIN_0631430443749'};
   }else if(action==='approve')body={requestId:crypto.randomUUID(),confirmation:'APPROVE_UMBRELLA_60ML_REGULARIZATION'};
   else if(action==='execute'||action==='reconcile'){
    if(!fresh.approval||fresh.approval.approvalId!==s?.approval?.approvalId||action==='execute'&&(fresh.approval.started||Date.parse(fresh.approval.expiresAt)<=Date.now()))throw Error('Aprovação indisponível ou expirada. Atualize o estado.');
    body={approvalId:fresh.approval.approvalId,confirmation:action==='execute'?'EXECUTE_UMBRELLA_60ML_REGULARIZATION':'RECONCILE_UMBRELLA_PRODUCT_READ_ONLY'};
   }else body={};
   await client.post(action,body);setMessage(action==='reconcile'?'Reconciliação confirmada. Qualquer bloqueio causal restante requer revisão supervisionada; não há liberação automática.':'Etapa confirmada pela API. Confira o estado atualizado antes de avançar.');
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
  {s&&!s.regularized?<>
   <label className="block text-sm">Documento da unidade vendida (PDF/JPEG/PNG, até 256 KiB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={disabled} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <label className="block text-sm">Referência documental sem dados pessoais<input className="block border p-2" value={reviewRef} maxLength={160} disabled={disabled} onChange={e=>setReviewRef(e.target.value)}/></label>
   <label className="block text-sm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/> Conferi o documento da unidade deste pedido: Umbrella 60 ml e GTIN 0631430443749.</label>
   <Button variant="outline" disabled={disabled||!confirmed||!file||!reviewRef} onClick={()=>{void run('evidence');}}>Registrar evidência complementar</Button>
   <Button variant="outline" disabled={disabled||!s.evidenceId||!!s.operationStatus} onClick={()=>{void run('approve');}}>Revisar catálogo e aprovar regularização</Button>
   {s.approval?<p className="text-sm">Aprovação {s.approval.action==='ASSOCIATE'?'de associação local':'de criação individual no Bling'} · expira em {new Date(s.approval.expiresAt).toLocaleString('pt-BR')}. {s.approval.started?'Já consumida. Não repita a criação.':''}</p>:null}
   <Button variant="outline" disabled={disabled||!s.approval||s.approval.started||Date.parse(s.approval.expiresAt)<=now} onClick={()=>{void run('execute');}}>Executar regularização aprovada</Button>
   <Button variant="outline" disabled={disabled||!s.approval||!['UNKNOWN','SUCCEEDED'].includes(s.operationStatus??'')} onClick={()=>{void run('reconcile');}}>Reconciliar produto por leitura</Button>
  </>:null}
  {s?.accountBlocked?<p role="status">Conta bloqueada. A regularização não libera a conta automaticamente; preparação exige revisão causal das pendências.</p>:null}
  {s?.regularized?<Button variant="outline" disabled={disabled||s.prepared||s.accountBlocked} onClick={()=>{void run('prepare');}}>{s.prepared?'Pedido preparado — continue no fluxo fiscal':'Preparar pedido regularizado'}</Button>:null}
  <p className="text-xs">A API revalida identidade, duplicidade, pagamento, logística, autoridade e evidências. Worker, P3 e escritas fiscais globais permanecem fechados.</p>
 </section>;
}
