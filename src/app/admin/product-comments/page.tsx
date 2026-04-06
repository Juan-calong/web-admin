"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  EyeOff,
  MessageSquareText,
  RefreshCw,
  Star,
  User2,
  Package2,
  Clock3,
  X,
  Loader2,
  MailCheck,
  MessageCircle,
  MessageCircleOff,
  Pencil,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CommentStatus = "PENDING" | "APPROVED" | "HIDDEN" | "REJECTED";
type FilterStatus = CommentStatus | "ALL";

type CommentAdminResponse = {
  id: string;
  response: string;
  createdAt: string;
  updatedAt: string;
  adminUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type CommentItem = {
  id: string;
  comment: string;
  rating?: number | null;
  status: CommentStatus;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  product: {
    id: string;
    name: string;
    sku?: string | null;
  };
  adminResponse?: CommentAdminResponse | null;
};

type CommentsResponse = {
  items: CommentItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type UnreadCountResponse = {
  count: number;
};

type ReadCommentNotificationsVars = {
  silent?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function statusLabel(status: CommentStatus) {
  switch (status) {
    case "PENDING":
      return "Pendente";
    case "APPROVED":
      return "Aprovado";
    case "HIDDEN":
      return "Escondido";
    case "REJECTED":
      return "Rejeitado";
    default:
      return status;
  }
}

function statusClasses(status: CommentStatus) {
  switch (status) {
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "APPROVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "HIDDEN":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function normalizeRating(value?: number | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 5) return 5;
  return Math.round(n);
}

function RatingStars({
  value,
  size = 16,
}: {
  value?: number | null;
  size?: number;
}) {
  const rating = normalizeRating(value);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < rating;

        return (
          <Star
            key={`star-${index}`}
            className={`${size === 14 ? "h-3.5 w-3.5" : "h-4 w-4"} ${
              filled ? "fill-amber-400 text-amber-400" : "text-slate-300"
            }`}
          />
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const classes =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "danger"
      ? "border-red-200 bg-red-50"
      : "border-slate-200 bg-white";

  const textClasses =
    tone === "warning"
      ? "text-amber-800"
      : tone === "success"
      ? "text-emerald-800"
      : tone === "danger"
      ? "text-red-800"
      : "text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${textClasses}`}>{value}</p>
    </div>
  );
}

async function fetchCommentUnreadCount() {
  const { data } = await api.get(endpoints.adminCommentNotifications.unreadCount);
  return data as UnreadCountResponse;
}

async function readAllCommentNotifications(_vars?: ReadCommentNotificationsVars) {
  await api.post(endpoints.adminCommentNotifications.readAll);
}

export default function AdminProductCommentsPage() {
  const queryClient = useQueryClient();
  const autoReadTriggeredRef = useRef(false);

  const [status, setStatus] = useState<FilterStatus>("PENDING");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [editingResponse, setEditingResponse] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: ["admin-product-comments", status],
    queryFn: async () => {
      const res = await api.get<CommentsResponse>(endpoints.adminProductComments.list, {
        params: status === "ALL" ? {} : { status },
      });
      return res.data;
    },
    refetchOnWindowFocus: true,
  });

  const commentUnread = useQuery({
    queryKey: ["admin-comment-unread-count"],
    queryFn: fetchCommentUnreadCount,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const commentUnreadCount = commentUnread.data?.count ?? 0;

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.product.id)) {
        map.set(item.product.id, item.product.name);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (productFilter === "ALL") return items;
    return items.filter((item) => item.product.id === productFilter);
  }, [items, productFilter]);

  const counts = useMemo(() => {
    return {
      all: filteredItems.length,
      pending: filteredItems.filter((item) => item.status === "PENDING").length,
      approved: filteredItems.filter((item) => item.status === "APPROVED").length,
      hidden: filteredItems.filter((item) => item.status === "HIDDEN").length,
      rejected: filteredItems.filter((item) => item.status === "REJECTED").length,
    };
  }, [filteredItems]);

  useEffect(() => {
    if (!items.length) return;

    setNotes((prev) => {
      const next = { ...prev };

      for (const item of items) {
        if (next[item.id] === undefined) {
          next[item.id] = item.adminNote ?? "";
        }
      }

      return next;
    });

    setResponseDrafts((prev) => {
      const next = { ...prev };

      for (const item of items) {
        if (next[item.id] === undefined) {
          next[item.id] = item.adminResponse?.response ?? "";
        }
      }

      return next;
    });
  }, [items]);

  const readAllNotificationsMutation = useMutation({
    mutationFn: (vars?: ReadCommentNotificationsVars) => readAllCommentNotifications(vars),
    onMutate: async () => {
      const prevUnread = queryClient.getQueryData(["admin-comment-unread-count"]);
      queryClient.setQueryData(["admin-comment-unread-count"], { count: 0 });
      return { prevUnread };
    },
    onSuccess: async (_data, variables) => {
      if (!variables?.silent) {
        toast.success("Notificações de comentários marcadas como lidas.");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-comment-unread-count"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-product-comments"] }),
      ]);
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevUnread) {
        queryClient.setQueryData(["admin-comment-unread-count"], ctx.prevUnread);
      }

      toast.error(
        apiErrorMessage(error, "Não foi possível marcar notificações como lidas.")
      );
    },
  });

  useEffect(() => {
    if (autoReadTriggeredRef.current) return;
    if (commentUnread.isLoading) return;
    if (readAllNotificationsMutation.isPending) return;
    if (commentUnreadCount <= 0) return;

    autoReadTriggeredRef.current = true;
    readAllNotificationsMutation.mutate({ silent: true });
  }, [
    commentUnread.isLoading,
    commentUnreadCount,
    readAllNotificationsMutation,
  ]);

  const moderateMutation = useMutation({
    mutationFn: async ({
      id,
      nextStatus,
      adminNote,
    }: {
      id: string;
      nextStatus: Exclude<CommentStatus, "PENDING">;
      adminNote?: string;
    }) => {
      const res = await api.patch(endpoints.adminProductComments.moderate(id), {
        status: nextStatus,
        adminNote: adminNote?.trim() ? adminNote.trim() : undefined,
      });
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Avaliação atualizada com sucesso.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-product-comments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-comment-unread-count"] }),
      ]);
    },
    onError: (error) => {
      toast.error(
        apiErrorMessage(error, "Não foi possível moderar a avaliação.")
      );
    },
  });

  const saveAdminResponseMutation = useMutation({
    mutationFn: async ({
      id,
      content,
      hasResponse,
    }: {
      id: string;
      content: string;
      hasResponse: boolean;
    }) => {
      const payload = { response: content.trim() };
      const url = endpoints.adminProductComments.adminResponse.update(id);

      if (hasResponse) {
        const res = await api.patch(url, payload);
        return res.data;
      }

      const res = await api.put(url, payload);
      return res.data;
    },
    onSuccess: async (_data, vars) => {
      toast.success(vars.hasResponse ? "Resposta atualizada." : "Resposta criada.");
      setEditingResponse((prev) => ({ ...prev, [vars.id]: false }));

      await queryClient.invalidateQueries({ queryKey: ["admin-product-comments"] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Não foi possível salvar a resposta administrativa."));
    },
  });

  const deactivateAdminResponseMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await api.delete(endpoints.adminProductComments.adminResponse.deactivate(id));
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Resposta administrativa desativada.");
      await queryClient.invalidateQueries({ queryKey: ["admin-product-comments"] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Não foi possível desativar a resposta administrativa."));
    },
  });

  function handleModerate(
    id: string,
    nextStatus: Exclude<CommentStatus, "PENDING">
  ) {
    moderateMutation.mutate({
      id,
      nextStatus,
      adminNote: notes[id] ?? "",
    });
  }

  function handleSaveResponse(item: CommentItem) {
    const draft = responseDrafts[item.id] ?? "";

    if (!draft.trim()) {
      toast.error("Digite uma resposta administrativa antes de salvar.");
      return;
    }

    saveAdminResponseMutation.mutate({
      id: item.id,
      content: draft,
      hasResponse: Boolean(item.adminResponse),
    });
  }

  function handleEditResponse(item: CommentItem) {
    setEditingResponse((prev) => ({ ...prev, [item.id]: true }));
    setResponseDrafts((prev) => ({
      ...prev,
      [item.id]: item.adminResponse?.response ?? prev[item.id] ?? "",
    }));
  }

  const refreshing = query.isFetching || commentUnread.isFetching;
  const actingCommentId =
    (moderateMutation.variables as { id?: string } | undefined)?.id ?? null;
  const savingResponseId =
    (saveAdminResponseMutation.variables as { id?: string } | undefined)?.id ?? null;
  const deactivatingResponseId =
    (deactivateAdminResponseMutation.variables as { id?: string } | undefined)?.id ?? null;

  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
                <MessageSquareText className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-xl text-slate-900 sm:text-2xl">
                  Comentários e avaliações
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Modere avaliações dos clientes e acompanhe novas entradas sem
                  misturar com o inbox de aprovação.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  void Promise.all([query.refetch(), commentUnread.refetch()]);
                }}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn("mr-2 h-4 w-4", refreshing ? "animate-spin" : "")}
                />
                Atualizar
              </Button>

              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => readAllNotificationsMutation.mutate({ silent: false })}
                disabled={
                  readAllNotificationsMutation.isPending || commentUnreadCount === 0
                }
              >
                {readAllNotificationsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Lendo...
                  </>
                ) : (
                  <>
                    <MailCheck className="mr-2 h-4 w-4" />
                    Ler todas
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Visíveis na tela" value={counts.all} />
            <StatCard label="Pendentes" value={counts.pending} tone="warning" />
            <StatCard label="Aprovados" value={counts.approved} tone="success" />
            <StatCard label="Ocultos" value={counts.hidden} />
            <StatCard
              label="Não lidas"
              value={commentUnreadCount}
              tone={commentUnreadCount > 0 ? "danger" : "default"}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
        <CardHeader className="gap-4 border-b border-slate-100 pb-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-slate-900">Fila de moderação</CardTitle>
              <CardDescription className="text-slate-600">
                Filtre por status e registre notas administrativas ao aprovar,
                ocultar ou rejeitar.
              </CardDescription>
            </div>

            <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
              <Tabs
                value={status}
                onValueChange={(value) => setStatus(value as FilterStatus)}
                className="w-full lg:w-auto"
              >
                <TabsList className="grid h-auto w-full grid-cols-5 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm lg:w-auto">
                  <TabsTrigger value="ALL" className="rounded-xl px-3 py-2">
                    Todos
                  </TabsTrigger>
                  <TabsTrigger value="PENDING" className="rounded-xl px-3 py-2">
                    Pend.
                  </TabsTrigger>
                  <TabsTrigger value="APPROVED" className="rounded-xl px-3 py-2">
                    Aprov.
                  </TabsTrigger>
                  <TabsTrigger value="HIDDEN" className="rounded-xl px-3 py-2">
                    Ocult.
                  </TabsTrigger>
                  <TabsTrigger value="REJECTED" className="rounded-xl px-3 py-2">
                    Rej.
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-11 min-w-[220px] rounded-xl border-slate-300 bg-white text-slate-900">
                  <SelectValue placeholder="Filtrar produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os produtos</SelectItem>
                  {productOptions.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          {query.isLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
              Carregando avaliações...
            </div>
          ) : query.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {apiErrorMessage(query.error, "Erro ao carregar avaliações.")}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Nenhuma avaliação encontrada para o filtro selecionado.
            </div>
          ) : (
            filteredItems.map((item) => {
              const acting = actingCommentId === item.id && moderateMutation.isPending;
              const responseEditing = editingResponse[item.id] || !item.adminResponse;
              const responseExists = Boolean(item.adminResponse);
              const responseBusy =
                (savingResponseId === item.id && saveAdminResponseMutation.isPending) ||
                (deactivatingResponseId === item.id &&
                  deactivateAdminResponseMutation.isPending);

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                              statusClasses(item.status)
                            )}
                          >
                            {statusLabel(item.status)}
                          </span>

                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                              responseExists
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            )}
                          >
                            {responseExists ? "Com resposta admin" : "Sem resposta admin"}
                          </span>

                          <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                            <Clock3 className="h-4 w-4" />
                            {formatDateTime(item.createdAt)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                          <div className="inline-flex items-center gap-2">
                            <User2 className="h-4 w-4" />
                            <span className="font-medium text-slate-900">
                              {item.user.name}
                            </span>
                            <span className="text-slate-500">({item.user.email})</span>
                          </div>

                          <div className="inline-flex items-center gap-2">
                            <Package2 className="h-4 w-4" />
                            <span className="font-medium text-slate-900">
                              {item.product.name}
                            </span>
                            {item.product.sku ? (
                              <span className="text-slate-500">
                                SKU: {item.product.sku}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <RatingStars value={item.rating} />
                        <span className="text-sm font-medium text-slate-700">
                          {normalizeRating(item.rating)}/5
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      {item.comment?.trim() ? item.comment : "Sem comentário escrito."}
                    </div>

                    {item.adminResponse ? (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
                        <p className="font-semibold text-indigo-900">Resposta administrativa ativa</p>
                        <p className="mt-2 whitespace-pre-wrap text-indigo-900">
                          {item.adminResponse.response}
                        </p>
                        <p className="mt-3 text-xs text-indigo-700">
                          Respondido por {item.adminResponse.adminUser?.name ?? "Admin"} em{" "}
                          {formatDateTime(item.adminResponse.updatedAt)}
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Nota administrativa
                      </label>
                      <Textarea
                        value={notes[item.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="Ex.: linguagem inadequada, avaliação aprovada manualmente, comentário ocultado por regra..."
                        className="min-h-[100px] rounded-2xl border-slate-300 bg-white"
                        disabled={moderateMutation.isPending}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => handleModerate(item.id, "APPROVED")}
                        disabled={moderateMutation.isPending}
                      >
                        {acting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Aprovar
                      </Button>

                      <Button
                        variant="outline"
                        className="rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        onClick={() => handleModerate(item.id, "HIDDEN")}
                        disabled={moderateMutation.isPending}
                      >
                        {acting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <EyeOff className="mr-2 h-4 w-4" />
                        )}
                        Ocultar
                      </Button>

                      <Button
                        variant="outline"
                        className="rounded-xl border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleModerate(item.id, "REJECTED")}
                        disabled={moderateMutation.isPending}
                      >
                        {acting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-2 h-4 w-4" />
                        )}
                        Rejeitar
                      </Button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          Resposta administrativa
                        </p>
                        {item.adminResponse && !responseEditing ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl border-slate-300 bg-white"
                            onClick={() => handleEditResponse(item)}
                            disabled={responseBusy}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar resposta
                          </Button>
                        ) : null}
                      </div>

                      {responseEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={responseDrafts[item.id] ?? ""}
                            onChange={(e) =>
                              setResponseDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder="Escreva a resposta da administração para este comentário..."
                            className="min-h-[100px] rounded-2xl border-slate-300 bg-white"
                            disabled={responseBusy}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                              onClick={() => handleSaveResponse(item)}
                              disabled={responseBusy}
                            >
                              {savingResponseId === item.id &&
                              saveAdminResponseMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <MessageCircle className="mr-2 h-4 w-4" />
                              )}
                              Salvar resposta
                            </Button>

                            {item.adminResponse ? (
                              <Button
                                variant="outline"
                                className="rounded-xl border-slate-300 bg-white"
                                onClick={() =>
                                  setEditingResponse((prev) => ({
                                    ...prev,
                                    [item.id]: false,
                                  }))
                                }
                                disabled={responseBusy}
                              >
                                Cancelar edição
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">
                          Use “Editar resposta” para atualizar ou desativar a resposta ativa.
                        </p>
                      )}

                      {item.adminResponse ? (
                        <div className="mt-3">
                          <Button
                            variant="outline"
                            className="rounded-xl border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => deactivateAdminResponseMutation.mutate({ id: item.id })}
                            disabled={responseBusy}
                          >
                            {deactivatingResponseId === item.id &&
                            deactivateAdminResponseMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <MessageCircleOff className="mr-2 h-4 w-4" />
                            )}
                            Desativar resposta
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}