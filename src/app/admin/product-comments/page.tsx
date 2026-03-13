"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  EyeOff,
  MessageSquareText,
  RefreshCw,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CommentStatus = "PENDING" | "APPROVED" | "HIDDEN" | "REJECTED";
type FilterStatus = CommentStatus | "ALL";

type CommentItem = {
  id: string;
  comment: string;
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
};

type CommentsResponse = {
  items: CommentItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
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
      return "Oculto";
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

export default function AdminProductCommentsPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<FilterStatus>("PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["admin-product-comments", status],
    queryFn: async () => {
      const res = await api.get<CommentsResponse>(endpoints.adminProductComments.list, {
        params: status === "ALL" ? {} : { status },
      });
      return res.data;
    },
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

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
  }, [items]);

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
    onSuccess: () => {
      toast.success("Comentário atualizado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["admin-product-comments"] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Não foi possível moderar o comentário."));
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

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <MessageSquareText className="h-5 w-5" />
              Comentários de produtos
            </CardTitle>
            <CardDescription>
              Aprove, oculte ou rejeite comentários enviados pelos usuários.
            </CardDescription>
          </div>

          <Button
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="rounded-xl"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs
            value={status}
            onValueChange={(value) => setStatus(value as FilterStatus)}
          >
            <TabsList className="grid w-full grid-cols-2 gap-2 rounded-xl sm:grid-cols-5">
              <TabsTrigger value="ALL">Todos</TabsTrigger>
              <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
              <TabsTrigger value="APPROVED">Aprovados</TabsTrigger>
              <TabsTrigger value="HIDDEN">Ocultos</TabsTrigger>
              <TabsTrigger value="REJECTED">Rejeitados</TabsTrigger>
            </TabsList>
          </Tabs>

          {query.isLoading ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Carregando comentários...
            </div>
          ) : query.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
              Não foi possível carregar os comentários.
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum comentário encontrado para este filtro.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const busy = moderateMutation.isPending;

                return (
                  <Card key={item.id} className="rounded-2xl border shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                                item.status
                              )}`}
                            >
                              {statusLabel(item.status)}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              Enviado em {formatDateTime(item.createdAt)}
                            </span>
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {item.product?.name || "Produto"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {item.product?.sku || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {item.user?.name || "Usuário"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.user?.email || "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {item.comment}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nota interna da moderação</label>
                        <Textarea
                          value={notes[item.id] ?? ""}
                          onChange={(e) =>
                            setNotes((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          placeholder="Opcional. Ex.: ocultado por conteúdo inadequado."
                          className="min-h-[96px] rounded-xl"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => handleModerate(item.id, "APPROVED")}
                          disabled={busy}
                          className="rounded-xl"
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Aprovar
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => handleModerate(item.id, "HIDDEN")}
                          disabled={busy}
                          className="rounded-xl"
                        >
                          <EyeOff className="mr-2 h-4 w-4" />
                          Ocultar
                        </Button>

                        <Button
                          variant="destructive"
                          onClick={() => handleModerate(item.id, "REJECTED")}
                          disabled={busy}
                          className="rounded-xl"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Rejeitar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}