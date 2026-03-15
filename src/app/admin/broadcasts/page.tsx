"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Megaphone,
  RefreshCw,
  Plus,
  Send,
  Loader2,
  Users,
  Clock3,
  CheckCircle2,
  FileText,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type BroadcastChannel = "APP" | "WHATSAPP" | "BOTH";
type BroadcastAudience = "ALL" | "SELLER" | "SALON_OWNER" | "CUSTOMER";
type BroadcastStatus =
  | "DRAFT"
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "CANCELED";

type AdminBroadcast = {
  id: string;
  title: string;
  body: string;
  channel: BroadcastChannel;
  audience: BroadcastAudience;
  status: BroadcastStatus;
  createdByUserId: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    recipients: number;
  };
};

type ListDTO = {
  items: AdminBroadcast[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type CreateDTO = AdminBroadcast;

type PublishDTO = {
  ok: true;
  broadcastId: string;
  recipientsCreated: number;
  sentAt: string;
};

type FormState = {
  title: string;
  body: string;
  audience: BroadcastAudience;
  channel: BroadcastChannel;
};

function createEmptyForm(): FormState {
  return {
    title: "",
    body: "",
    audience: "CUSTOMER",
    channel: "APP",
  };
}

async function fetchBroadcasts(): Promise<ListDTO> {
  const { data } = await api.get(endpoints.adminBroadcasts.list, {
    params: {
      page: 1,
      pageSize: 100,
    },
  });
  return data;
}

async function createBroadcast(payload: FormState): Promise<CreateDTO> {
  const { data } = await api.post(endpoints.adminBroadcasts.create, payload);
  return data;
}

async function publishBroadcast(id: string): Promise<PublishDTO> {
  const { data } = await api.post(endpoints.adminBroadcasts.publish(id));
  return data;
}

function audienceLabel(audience: BroadcastAudience) {
  switch (audience) {
    case "ALL":
      return "Todos";
    case "SELLER":
      return "Seller";
    case "SALON_OWNER":
      return "Salão";
    case "CUSTOMER":
      return "Customer";
    default:
      return audience;
  }
}

function statusLabel(status: BroadcastStatus) {
  switch (status) {
    case "DRAFT":
      return "Rascunho";
    case "QUEUED":
      return "Na fila";
    case "PROCESSING":
      return "Processando";
    case "SENT":
      return "Enviado";
    case "FAILED":
      return "Falhou";
    case "CANCELED":
      return "Cancelado";
    default:
      return status;
  }
}

function statusClasses(status: BroadcastStatus) {
  switch (status) {
    case "SENT":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "FAILED":
      return "bg-red-600 text-white hover:bg-red-600";
    case "CANCELED":
      return "bg-slate-400 text-white hover:bg-slate-400";
    case "PROCESSING":
    case "QUEUED":
      return "bg-amber-500 text-white hover:bg-amber-500";
    case "DRAFT":
    default:
      return "bg-slate-200 text-slate-700 hover:bg-slate-200";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function AdminBroadcastsPage() {
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(createEmptyForm());

  const broadcastsQ = useQuery({
    queryKey: ["admin-broadcasts"],
    queryFn: fetchBroadcasts,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const items = useMemo(() => {
    const list = broadcastsQ.data?.items ?? [];
    return [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [broadcastsQ.data?.items]);

  const draftCount = useMemo(
    () => items.filter((item) => item.status === "DRAFT").length,
    [items]
  );

  const sentCount = useMemo(
    () => items.filter((item) => item.status === "SENT").length,
    [items]
  );

  const customerCount = useMemo(
    () => items.filter((item) => item.audience === "CUSTOMER").length,
    [items]
  );

  const allAudienceCount = useMemo(
    () => items.filter((item) => item.audience === "ALL").length,
    [items]
  );

  const saveM = useMutation({
    mutationFn: async () => {
      const payload: FormState = {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        channel: "APP",
      };

      if (!payload.title || payload.title.length < 3) {
        throw new Error("O título precisa ter pelo menos 3 caracteres.");
      }

      if (!payload.body || payload.body.length < 3) {
        throw new Error("A mensagem precisa ter pelo menos 3 caracteres.");
      }

      return createBroadcast(payload);
    },
    onSuccess: async () => {
      toast.success("Broadcast criado como rascunho.");
      setForm(createEmptyForm());
      await qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Falha ao criar broadcast."));
    },
  });

  const publishM = useMutation({
    mutationFn: async (id: string) => publishBroadcast(id),
    onSuccess: async (data) => {
      toast.success(
        `Broadcast publicado para ${data.recipientsCreated} destinatário(s).`
      );
      await qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Falha ao publicar broadcast."));
    },
  });

  function resetForm() {
    setForm(createEmptyForm());
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 pb-6 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
                <Megaphone className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-xl text-slate-900 sm:text-2xl">
                  Broadcasts
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Crie mensagens administrativas básicas para preparar a base de
                  comunicação do app. Nesta fase inicial, o canal é apenas APP.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Use esta área para criar campanhas simples como “Hoje temos promoções”
              ou “Frete grátis”. Por enquanto, isso registra e publica o broadcast no
              sistema; o push no celular entra na próxima etapa.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => broadcastsQ.refetch()}
                disabled={broadcastsQ.isFetching}
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    broadcastsQ.isFetching ? "animate-spin" : ""
                  )}
                />
                {broadcastsQ.isFetching ? "Atualizando..." : "Atualizar"}
              </Button>

              <Button
                className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                onClick={resetForm}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo broadcast
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">Resumo</CardTitle>
            <CardDescription className="text-slate-600">
              Visão rápida desta área
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Total</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {items.length}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Rascunhos</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {draftCount}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Enviados</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {sentCount}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Customer</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {customerCount}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 xl:col-span-2">
              <p className="text-sm text-slate-500">Todos</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {allAudienceCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] xl:sticky xl:top-4 xl:h-fit">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900">Novo broadcast</CardTitle>
            <CardDescription className="text-slate-600">
              Crie uma mensagem simples para testar a comunicação administrativa.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-2">
              <Label className="text-slate-700">Título</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((s) => ({ ...s, title: e.target.value }))
                }
                placeholder="Ex.: Hoje temos promoções"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Mensagem</Label>
              <Textarea
                value={form.body}
                onChange={(e) =>
                  setForm((s) => ({ ...s, body: e.target.value }))
                }
                placeholder="Ex.: Aproveite o frete grátis por tempo limitado."
                className="min-h-[130px] rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Público</Label>
              <select
                value={form.audience}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    audience: e.target.value as BroadcastAudience,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="CUSTOMER">Customer</option>
                <option value="SALON_OWNER">Salão</option>
                <option value="SELLER">Seller</option>
                <option value="ALL">Todos</option>
              </select>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                <p>
                  <strong>Customer:</strong> envia para usuários customer.
                </p>
                <p>
                  <strong>Salão:</strong> envia para usuários salão.
                </p>
                <p>
                  <strong>Seller:</strong> envia para sellers.
                </p>
                <p>
                  <strong>Todos:</strong> envia para customer, salão e seller.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Canal</Label>
              <Input
                value="APP"
                disabled
                className="h-11 rounded-xl border-slate-300 bg-slate-50 text-slate-900"
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                Nesta primeira fase, o broadcast é salvo/publicado apenas no canal APP.
                Push de celular entra no próximo passo.
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending}
              >
                {saveM.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar rascunho
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={resetForm}
                disabled={saveM.isPending}
              >
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900">Lista de broadcasts</CardTitle>
            <CardDescription className="text-slate-600">
              Aqui você acompanha os rascunhos e os envios já publicados.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pt-5">
            {broadcastsQ.isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Carregando broadcasts...
              </div>
            ) : broadcastsQ.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {apiErrorMessage(
                  broadcastsQ.error,
                  "Erro ao carregar broadcasts."
                )}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Nenhum broadcast criado ainda.
              </div>
            ) : (
              <div className="grid gap-3">
                {items.map((item) => {
                  const publishingThis =
                    publishM.isPending &&
                    (publishM.variables as string | undefined) === item.id;

                  const canPublish = item.status === "DRAFT";

                  return (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-slate-900">
                              {item.title}
                            </div>

                            <Badge
                              className={cn(
                                "rounded-full border-0",
                                statusClasses(item.status)
                              )}
                            >
                              {statusLabel(item.status)}
                            </Badge>

                            <Badge className="rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-white">
                              {audienceLabel(item.audience)}
                            </Badge>

                            <Badge className="rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-white">
                              {item.channel}
                            </Badge>
                          </div>

                          <p className="text-sm leading-6 text-slate-600">
                            {item.body}
                          </p>

                          <div className="grid gap-2 text-xs text-slate-500">
                            <div className="flex items-center gap-2">
                              <Clock3 className="h-3.5 w-3.5 shrink-0" />
                              <span>Criado em {formatDateTime(item.createdAt)}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Destinatários registrados:{" "}
                                {item._count?.recipients ?? 0}
                              </span>
                            </div>

                            {item.sentAt ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>Publicado em {formatDateTime(item.sentAt)}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span>Aguardando publicação</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button
                            className="h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => publishM.mutate(item.id)}
                            disabled={!canPublish || publishingThis}
                          >
                            {publishingThis ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Publicando...
                              </>
                            ) : (
                              <>
                                <Send className="mr-2 h-4 w-4" />
                                {canPublish ? "Publicar" : "Publicado"}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Megaphone className="h-5 w-5" />
            Como isso funciona agora
          </CardTitle>
          <CardDescription className="text-slate-600">
            Esta primeira versão prepara o envio administrativo, mas ainda não dispara
            push no celular.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Ao criar, o broadcast fica em <strong>Rascunho</strong>.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Ao publicar, o sistema gera os destinatários com base no público
            escolhido.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Nesta etapa, isso ainda não é a notificação push do aparelho. O push entra
            quando conectarmos os tokens do dispositivo e o provedor de push.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Para o seu caso de “clicou e abriu o app”, o próximo bloco técnico é
            justamente o push mobile.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}