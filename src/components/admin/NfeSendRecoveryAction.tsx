"use client";
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {sendRecoveryState,type FiscalSnapshot,type FiscalBinding} from '@/lib/supervisedFiscal';

const notice='Não será criada uma nova NF-e. Nenhum envio será repetido. Serão consultados os documentos existentes no Bling. O desbloqueio da conta dependerá da reconciliação completa.';
type Props={snapshot:FiscalSnapshot;binding:FiscalBinding|null;disabled:boolean;onRecover:()=>void};
export function NfeSendRecoveryAction({snapshot,binding,disabled,onRecover}:Props){
  const recovery=sendRecoveryState(snapshot,binding);
  if(!recovery.pending)return null;
  const blocked=disabled||!recovery.canRequest;
  return <section aria-label="Recuperação de envio incerto" className="space-y-2 rounded-xl border border-amber-300 p-4">
    <p className="text-sm">{notice}</p>
    <p role="status" className="text-sm text-zinc-600">{recovery.reason}</p>
    <AlertDialog>
      <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={blocked}>Recuperar envio incerto</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Confirmar recuperação por leitura?</AlertDialogTitle><AlertDialogDescription>{notice} Não haverá repetição automática desta solicitação.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={blocked} onClick={onRecover}>Confirmar recuperação por leitura</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
