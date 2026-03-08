"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, UserCheck, type LucideIcon } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
  notificationId?: string | null;
};

async function readAllNotifications() {
  await api.post(endpoints.adminInbox.readAll);
}

async function fetchUnreadCount() {
  const { data } = await api.get(endpoints.adminInbox.unreadCount);
  return data as { count: number };
}

async function fetchPendingSellers() {
  const { data } = await api.get(endpoints.adminInbox.pendingSellers);
  return data as { items: PendingSeller[] };
}

function IdemKey(id: string, action: string) {
  return `admin-inbox:${id}:${action}`;
}

function decUnread(qc: any, by = 1) {
  qc.setQueryData(["admin-unread-count"], (old: any) => {
    const prev = Number(old?.count ?? 0);
    return { count: Math.max(0, prev - by) };
  });
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
  const [hiddenSellerIds, setHiddenSellerIds] = useState<Set<string>>(new Set());

  function hideSeller(id: string) {
    setHiddenSellerIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const unread = useQuery({
    queryKey: ["admin-unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

  const sellers = useQuery({
    queryKey: ["admin-pending-sellers"],
    queryFn: fetchPendingSellers,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

  const sellerItems = (sellers.data?.items ?? []).filter((item) => !hiddenSellerIds.has(item.id));
  const unreadCount = unread.data?.count ?? 0;
  const pendingSellerCount = sellerItems.length;

  const topRefreshing = unread.isFetching || sellers.isFetching;

  const refreshAll = async () => {
    await Promise.all([unread.refetch(), sellers.refetch()]);
  };

  const readAllM = useMutation({
    mutationFn: readAllNotifications,
    onSuccess: async () => {
      toast.success("Notificações marcadas como lidas.");
      qc.setQueryData(["admin-unread-count"], { count: 0 });
      await qc.invalidateQueries({ queryKey: ["admin-unread-count"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao marcar como lidas.")),
  });

  const approveSeller = useMutation({
    mutationFn: async (vars: { sellerId: string; notificationId?: string | null }) =>
      api.post(
        endpoints.adminInbox.approveSeller(vars.sellerId),
        { notificationId: vars.notificationId ?? null },
        { headers: { "Idempotency-Key": IdemKey(vars.sellerId, "approve-seller") } }
      ),
    onSuccess: async (_data, vars) => {
      toast.success("Vendedor aprovado.");
      hideSeller(vars.sellerId);
      decUnread(qc, 1);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar vendedor.")),
  });

  const rejectSeller = useMutation({
    mutationFn: async (vars: { sellerId: string; notificationId?: string | null; reason?: string }) =>
      api.post(
        endpoints.adminInbox.rejectSeller(vars.sellerId),
        { reason: vars.reason, notificationId: vars.notificationId ?? null },
        { headers: { "Idempotency-Key": IdemKey(vars.sellerId, "reject-seller") } }
      ),
    onSuccess: async (_data, vars) => {
      toast.success("Vendedor rejeitado.");
      hideSeller(vars.sellerId);
      decUnread(qc, 1);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao rejeitar vendedor.")),
  });

  const actingSellerId =
    (approveSeller.variables as { sellerId?: string } | undefined)?.sellerId ??
    (rejectSeller.variables as { sellerId?: string } | undefined)?.sellerId ??
    null;

  const sellerBusy = approveSeller.isPending || rejectSeller.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-black sm:text-2xl">Inbox do Admin</h1>
          <p className="text-sm text-black/60">Pendências e ações rápidas</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-fit text-sm text-black/70">
            Não lidas: <span className="font-semibold">{unreadCount}</span>
          </div>

          <Button
            variant="outline"
            className="w-full rounded-xl sm:w-auto"
            onClick={refreshAll}
            disabled={topRefreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", topRefreshing ? "animate-spin" : "")} />
            Atualizar
          </Button>

          <Button
            variant="outline"
            className="w-full rounded-xl sm:w-auto"
            onClick={() => readAllM.mutate()}
            disabled={readAllM.isPending || unreadCount === 0}
          >
            Ler todas
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sellers" className="w-full">
        <div className="-mx-3 overflow-x-auto px-3">
          <TabsList className="w-max min-w-full rounded-xl sm:w-auto">
            <TabsTrigger value="sellers" className="whitespace-nowrap">
              Aprovações <CountPill n={pendingSellerCount} />
            </TabsTrigger>
          </TabsList>
        </div>

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
                  {sellerItems.map((u) => (
                    <SellerRow
                      key={u.id}
                      seller={u}
                      busy={sellerBusy}
                      acting={actingSellerId === u.id}
                      onApprove={() =>
                        approveSeller.mutate({ sellerId: u.id, notificationId: u.notificationId })
                      }
                      onReject={(reason) =>
                        rejectSeller.mutate({
                          sellerId: u.id,
                          notificationId: u.notificationId,
                          reason,
                        })
                      }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words font-semibold">
            {seller.name} {acting ? <span className="text-xs text-black/50">• Processando…</span> : null}
          </div>
          <div className="break-all text-sm text-black/60">{seller.email}</div>
          <div className="mt-2 text-xs text-black/50">
            Criado em: {new Date(seller.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full rounded-xl sm:w-auto" disabled={busy}>
                Aprovar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Aprovar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>
                  O vendedor será liberado para usar o sistema.
                </AlertDialogDescription>
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
              <Button variant="outline" className="w-full rounded-xl sm:w-auto" disabled={busy}>
                Recusar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Recusar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se quiser, informe um motivo (opcional).
                </AlertDialogDescription>
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
                <AlertDialogAction
                  className="rounded-xl"
                  onClick={() => onReject(reason.trim() || undefined)}
                >
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