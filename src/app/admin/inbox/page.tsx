"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, UserCheck, Wallet, type LucideIcon } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type PendingSeller = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type RequestedPayout = {
  id: string;
  amount: string;
  status: "REQUESTED";
  createdAt: string;
  wallet: {
    id: string;
    ownerType: "SELLER" | "SALON";
    sellerId?: string | null;
    salonId?: string | null;
  };
};

async function fetchUnreadCount() {
  const { data } = await api.get(endpoints.adminInbox.unreadCount);
  return data as { count: number };
}

async function fetchPendingSellers() {
  const { data } = await api.get(endpoints.adminInbox.pendingSellers);
  return data as { items: PendingSeller[] };
}

async function fetchRequestedPayouts() {
  const { data } = await api.get(endpoints.adminInbox.requestedPayouts);
  return data as { items: RequestedPayout[] };
}

function IdemKey(id: string, action: string) {
  return `admin-inbox:${id}:${action}`;
}

function CountPill({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold leading-none">
      {n}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  onRefresh,
  refreshing,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-black/5 p-2">
          <Icon className="h-5 w-5 text-black/70" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-black/60">{subtitle}</div>

          <div className="mt-3">
            <Button variant="outline" className="rounded-xl" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing ? "animate-spin" : "")} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminInboxPage() {
  const qc = useQueryClient();

  const unread = useQuery({
    queryKey: ["admin-unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const sellers = useQuery({
    queryKey: ["admin-pending-sellers"],
    queryFn: fetchPendingSellers,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const payouts = useQuery({
    queryKey: ["admin-requested-payouts"],
    queryFn: fetchRequestedPayouts,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  // counts
  const pendingSellerCount = sellers.data?.items?.length ?? 0;
  const requestedPayoutCount = payouts.data?.items?.length ?? 0;
  const unreadCount = unread.data?.count ?? 0;

  const refreshAll = async () => {
    await Promise.all([unread.refetch(), sellers.refetch(), payouts.refetch()]);
  };

  // mutations (por item)
  const approveSeller = useMutation({
    mutationFn: async (id: string) =>
      api.post(endpoints.adminInbox.approveSeller(id), undefined, {
        headers: { "Idempotency-Key": IdemKey(id, "approve-seller") },
      }),
    onSuccess: async () => {
      toast.success("Vendedor aprovado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar vendedor.")),
  });

  const rejectSeller = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      api.post(
        endpoints.adminInbox.rejectSeller(id),
        { reason },
        { headers: { "Idempotency-Key": IdemKey(id, "reject-seller") } }
      ),
    onSuccess: async () => {
      toast.success("Vendedor rejeitado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao rejeitar vendedor.")),
  });

  const markPaid = useMutation({
    mutationFn: async ({ id, txid, receiptUrl }: { id: string; txid?: string; receiptUrl?: string }) =>
      api.post(
        endpoints.adminInbox.markPayoutPaid(id),
        { txid, receiptUrl },
        { headers: { "Idempotency-Key": IdemKey(id, "payout-paid") } }
      ),
    onSuccess: async () => {
      toast.success("Saque marcado como pago.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-requested-payouts"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao marcar como pago.")),
  });

  const rejectPayout = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      api.post(
        endpoints.adminInbox.rejectPayout(id),
        { reason },
        { headers: { "Idempotency-Key": IdemKey(id, "payout-reject") } }
      ),
    onSuccess: async () => {
      toast.success("Saque rejeitado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-requested-payouts"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao rejeitar saque.")),
  });

  // “busy” por item (garante id certo)
  const actingSellerId =
    (typeof approveSeller.variables === "string"
      ? approveSeller.variables
      : (rejectSeller.variables as { id?: string } | undefined)?.id) ?? null;
  const actingPayoutId =
    (markPaid.variables as { id?: string } | undefined)?.id ??
    (rejectPayout.variables as { id?: string } | undefined)?.id ??
    null;

  const topRefreshing = unread.isFetching || sellers.isFetching || payouts.isFetching;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black">Inbox do Admin</h1>
          <p className="text-sm text-black/60">Pendências e ações rápidas</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="text-sm text-black/70 w-fit">
            Não lidas: <span className="font-semibold">{unreadCount}</span>
          </div>

          <Button
            variant="outline"
            className="rounded-xl w-full sm:w-auto"
            onClick={refreshAll}
            disabled={topRefreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", topRefreshing ? "animate-spin" : "")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs: rolagem horizontal no mobile */}
      <Tabs defaultValue="sellers" className="w-full">
        <div className="-mx-3 px-3 overflow-x-auto">
          <TabsList className="rounded-xl w-max min-w-full sm:w-auto">
            <TabsTrigger value="sellers" className="whitespace-nowrap">
              Aprovações <CountPill n={pendingSellerCount} />
            </TabsTrigger>
          </TabsList>
        </div>

        {/* -------- Sellers -------- */}
        <TabsContent value="sellers" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Vendedores pendentes</CardTitle>
              <CardDescription>Cadastros aguardando aprovação do admin.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {sellers.isLoading ? (
                <div className="text-sm text-black/60">Carregando…</div>
              ) : sellers.isError ? (
                <div className="text-sm text-red-600">
                  {apiErrorMessage(sellers.error, "Erro ao carregar aprovações.")}
                </div>
              ) : pendingSellerCount ? (
                <div className="grid gap-3">
                  {sellers.data!.items.map((u) => (
                    <SellerRow
                      key={u.id}
                      seller={u}
                      busy={approveSeller.isPending || rejectSeller.isPending}
                      acting={actingSellerId === u.id}
                      onApprove={() => approveSeller.mutate(u.id)}
                      onReject={(reason) => rejectSeller.mutate({ id: u.id, reason })}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={UserCheck}
                  title="Nenhuma aprovação pendente"
                  subtitle="Quando um vendedor solicitar acesso, ele vai aparecer aqui."
                  onRefresh={() => sellers.refetch()}
                  refreshing={sellers.isFetching}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SellerRow({
  seller,
  busy,
  acting,
  onApprove,
  onReject,
}: {
  seller: PendingSeller;
  busy: boolean;
  acting: boolean;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-2xl border bg-white p-4">
      {/* mobile: coluna; sm+: linha */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold break-words">
            {seller.name}{" "}
            {acting ? <span className="text-xs text-black/50">• Processando…</span> : null}
          </div>
          <div className="text-sm text-black/60 break-all">{seller.email}</div>
          <div className="mt-2 text-xs text-black/50">
            Criado em: {new Date(seller.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="rounded-xl w-full sm:w-auto" disabled={busy}>
                Aprovar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Aprovar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>O vendedor será liberado para usar o sistema.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction className="rounded-xl" onClick={onApprove}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="rounded-xl w-full sm:w-auto" disabled={busy}>
                Recusar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Recusar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>Se quiser, informe um motivo (opcional).</AlertDialogDescription>
              </AlertDialogHeader>

              <div className="grid gap-2">
                <Label>Motivo (opcional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: dados inconsistentes…"
                  className="min-h-[80px] rounded-xl"
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction className="rounded-xl" onClick={() => onReject(reason.trim() || undefined)}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function PayoutRow({
  payout,
  busy,
  acting,
  onPaid,
  onReject,
}: {
  payout: RequestedPayout;
  busy: boolean;
  acting: boolean;
  onPaid: (txid?: string, receiptUrl?: string) => void;
  onReject: (reason?: string) => void;
}) {
  const [txid, setTxid] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [reason, setReason] = useState("");

  const amountLabel = useMemo(() => {
    const n = Number(payout.amount);
    if (Number.isFinite(n)) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return `R$ ${payout.amount}`;
  }, [payout.amount]);

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold break-words">
            Saque {payout.id}{" "}
            {acting ? <span className="text-xs text-black/50">• Processando…</span> : null}
          </div>
          <div className="text-sm text-black/60 break-all">
            Wallet {payout.wallet?.id} • {payout.wallet?.ownerType}
          </div>
          <div className="mt-2 text-xs text-black/50">Criado em: {new Date(payout.createdAt).toLocaleString("pt-BR")}</div>
        </div>

        <div className="text-sm sm:text-base">
          <span className="font-semibold">{amountLabel}</span>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="rounded-xl w-full sm:w-auto" disabled={busy}>
              Marcar como pago
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar pagamento?</AlertDialogTitle>
              <AlertDialogDescription>Você pode informar TXID e/ou URL do comprovante (opcional).</AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>TXID (opcional)</Label>
                <Input
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  placeholder="txid"
                  className="rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label>Comprovante (opcional)</Label>
                <Input
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://…"
                  className="rounded-xl"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl"
                onClick={() => onPaid(txid.trim() || undefined, receiptUrl.trim() || undefined)}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-xl w-full sm:w-auto" disabled={busy}>
              Rejeitar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Rejeitar saque?</AlertDialogTitle>
              <AlertDialogDescription>Se quiser, informe um motivo (opcional).</AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid gap-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: dados bancários ausentes…"
                className="min-h-[80px] rounded-xl"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
              <AlertDialogAction className="rounded-xl" onClick={() => onReject(reason.trim() || undefined)}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
