"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  UserCheck,
  type LucideIcon,
  Loader2,
  MailCheck,
  Inbox,
  Clock3,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

type PendingSellersResponse = {
  items: PendingSeller[];
};

type UnreadCountResponse = {
  count: number;
};

async function readAllNotifications() {
  await api.post(endpoints.adminInbox.readAll);
}

async function fetchUnreadCount() {
  const { data } = await api.get(endpoints.adminInbox.unreadCount);
  return data as UnreadCountResponse;
}

async function fetchPendingSellers() {
  const { data } = await api.get(endpoints.adminInbox.pendingSellers);
  return data as PendingSellersResponse;
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

function restoreUnread(qc: any, snapshot: any) {
  qc.setQueryData(["admin-unread-count"], snapshot);
}

function removeSellerFromCache(qc: any, sellerId: string) {
  qc.setQueryData(["admin-pending-sellers"], (old: PendingSellersResponse | undefined) => {
    if (!old?.items) return old;
    return {
      ...old,
      items: old.items.filter((item) => item.id !== sellerId),
    };
  });
}

function restorePendingSellers(qc: any, snapshot: any) {
  qc.setQueryData(["admin-pending-sellers"], snapshot);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function CountPill({ n }: { n: number }) {
  if (!n) return null;

  return (
    <span className="ml-2 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold leading-none text-slate-700">
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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{subtitle}</div>

          <div className="mt-4">
            <Button
              variant="outline"
              className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing ? "animate-spin" : "")}
              />
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

  const sellerItems = sellers.data?.items ?? [];
  const unreadCount = unread.data?.count ?? 0;
  const pendingSellerCount = sellerItems.length;

  const topRefreshing = unread.isFetching || sellers.isFetching;

  const refreshAll = async () => {
    await Promise.all([unread.refetch(), sellers.refetch()]);
  };

  const readAllM = useMutation({
    mutationFn: readAllNotifications,
    onMutate: async () => {
      const prevUnread = qc.getQueryData(["admin-unread-count"]);
      qc.setQueryData(["admin-unread-count"], { count: 0 });
      return { prevUnread };
    },
    onSuccess: async () => {
      toast.success("Notificações marcadas como lidas.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
      ]);
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevUnread) {
        qc.setQueryData(["admin-unread-count"], ctx.prevUnread);
      }
      toast.error(apiErrorMessage(err, "Falha ao marcar como lidas."));
    },
  });

  const approveSeller = useMutation({
    mutationFn: async (vars: { sellerId: string; notificationId?: string | null }) =>
      api.post(
        endpoints.adminInbox.approveSeller(vars.sellerId),
        { notificationId: vars.notificationId ?? null },
        { headers: { "Idempotency-Key": IdemKey(vars.sellerId, "approve-seller") } }
      ),
    onMutate: async (vars) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.cancelQueries({ queryKey: ["admin-unread-count"] }),
      ]);

      const prevPending = qc.getQueryData(["admin-pending-sellers"]);
      const prevUnread = qc.getQueryData(["admin-unread-count"]);

      removeSellerFromCache(qc, vars.sellerId);
      if (vars.notificationId) {
        decUnread(qc, 1);
      }

      return { prevPending, prevUnread };
    },
    onSuccess: async () => {
      toast.success("Vendedor aprovado.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevPending) restorePendingSellers(qc, ctx.prevPending);
      if (ctx?.prevUnread) restoreUnread(qc, ctx.prevUnread);

      toast.error(apiErrorMessage(err, "Falha ao aprovar vendedor."));
    },
  });

  const rejectSeller = useMutation({
    mutationFn: async (vars: {
      sellerId: string;
      notificationId?: string | null;
      reason?: string;
    }) =>
      api.post(
        endpoints.adminInbox.rejectSeller(vars.sellerId),
        { reason: vars.reason, notificationId: vars.notificationId ?? null },
        { headers: { "Idempotency-Key": IdemKey(vars.sellerId, "reject-seller") } }
      ),
    onMutate: async (vars) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.cancelQueries({ queryKey: ["admin-unread-count"] }),
      ]);

      const prevPending = qc.getQueryData(["admin-pending-sellers"]);
      const prevUnread = qc.getQueryData(["admin-unread-count"]);

      removeSellerFromCache(qc, vars.sellerId);
      if (vars.notificationId) {
        decUnread(qc, 1);
      }

      return { prevPending, prevUnread };
    },
    onSuccess: async () => {
      toast.success("Vendedor rejeitado.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pending-sellers"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevPending) restorePendingSellers(qc, ctx.prevPending);
      if (ctx?.prevUnread) restoreUnread(qc, ctx.prevUnread);

      toast.error(apiErrorMessage(err, "Falha ao rejeitar vendedor."));
    },
  });

  const actingSellerId =
    (approveSeller.variables as { sellerId?: string } | undefined)?.sellerId ??
    (rejectSeller.variables as { sellerId?: string } | undefined)?.sellerId ??
    null;

  const sellerBusy = approveSeller.isPending || rejectSeller.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 pb-6 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
                <Inbox className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-xl text-slate-900 sm:text-2xl">
                  Inbox do Admin
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Pendências e ações rápidas de aprovação, com atualização imediata da
                  lista.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Sempre que um vendedor solicitar acesso, a solicitação aparece aqui para
              análise. Ao aprovar ou recusar, o item já some da lista.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={refreshAll}
                disabled={topRefreshing}
              >
                <RefreshCw
                  className={cn("mr-2 h-4 w-4", topRefreshing ? "animate-spin" : "")}
                />
                Atualizar
              </Button>

              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => readAllM.mutate()}
                disabled={readAllM.isPending || unreadCount === 0}
              >
                {readAllM.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Lendo...
                  </>
                ) : (
                  "Ler todas"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
                <MailCheck className="h-5 w-5" />
              </div>

              <div>
                <CardTitle className="text-xl text-slate-900">Status</CardTitle>
                <CardDescription className="text-slate-600">
                  Visão rápida da inbox
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Não lidas</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-3xl font-semibold text-slate-900">{unreadCount}</p>
                {topRefreshing && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    atualizando
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sellers" className="w-full">
        <div className="-mx-3 overflow-x-auto px-3">
          <TabsList className="h-auto w-max min-w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
            <TabsTrigger
              value="sellers"
              className="rounded-xl px-4 py-2.5 text-slate-700 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
            >
              Aprovações <CountPill n={pendingSellerCount} />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sellers" className="mt-4">
          <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-slate-900">Vendedores pendentes</CardTitle>
              <CardDescription className="text-slate-600">
                Cadastros aguardando aprovação do admin.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-5">
              {sellers.isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                  Carregando...
                </div>
              ) : sellers.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
                        approveSeller.mutate({
                          sellerId: u.id,
                          notificationId: u.notificationId,
                        })
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
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-words text-base font-semibold text-slate-900">
              {seller.name}
            </div>

            {acting ? (
              <Badge className="border-0 bg-slate-900 text-white hover:bg-slate-900">
                Processando...
              </Badge>
            ) : (
              <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                Pendente
              </Badge>
            )}
          </div>

          <div className="break-all text-sm text-slate-600">{seller.email}</div>

          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            Criado em: {formatDateTime(seller.createdAt)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="h-10 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
                disabled={busy}
              >
                Aprovar
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent className="rounded-2xl border border-slate-200 bg-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Aprovar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>
                  O vendedor será liberado para usar o sistema.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                  Cancelar
                </AlertDialogCancel>

                <AlertDialogAction
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={onApprove}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full rounded-xl border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                disabled={busy}
              >
                Recusar
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent className="rounded-2xl border border-slate-200 bg-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Recusar vendedor?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se quiser, informe um motivo opcional.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="grid gap-2">
                <Label className="text-slate-700">Motivo (opcional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: dados inconsistentes..."
                  className="min-h-[88px] rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <Separator />

              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                  Cancelar
                </AlertDialogCancel>

                <AlertDialogAction
                  className="rounded-xl bg-red-600 text-white hover:bg-red-700"
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