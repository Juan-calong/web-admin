"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  Upload,
  RefreshCw,
  Search,
  Trash2,
  Save,
  Video,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type ProductItem = {
  id: string;
  name: string;
  sku?: string | null;
  active?: boolean;
};

type PaginatedResponse<T> = {
  page?: number;
  take?: number;
  total?: number;
  items: T[];
};

type TrainingVideoItem = {
  id: string;
  productId?: string | null;
  scope: "GENERAL" | "PRODUCT";
  title: string;
  description?: string | null;
  objectKey: string;
  publicUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function brDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function formatBytes(value?: number | null) {
  const bytes = Number(value ?? 0);
  if (!bytes || bytes <= 0) return "—";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full md:w-[320px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
      />
    </div>
  );
}

async function fetchProducts() {
  const { data } = await api.get<PaginatedResponse<ProductItem>>(endpoints.products.list);
  return data;
}

async function fetchTrainingVideos({
  productId,
  scope,
}: {
  productId?: string;
  scope: "GENERAL" | "PRODUCT";
}) {
  const { data } = await api.get<{ items: TrainingVideoItem[] }>(
    endpoints.adminTrainingVideos.adminList(scope === "PRODUCT" ? productId || "general" : "general"),
    {
      params: {
        scope,
        productId: scope === "PRODUCT" ? productId : undefined,
      },
    }
  );

  return data;
}

export default function AdminTrainingVideosPage() {
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState("0");
  const [editingActive, setEditingActive] = useState(true);

  const [videoScope, setVideoScope] = useState<"GENERAL" | "PRODUCT">("GENERAL");

  const productsQuery = useQuery({
    queryKey: ["admin-training-videos", "products"],
    queryFn: fetchProducts,
  });

  const filteredProducts = useMemo(() => {
    const items = productsQuery.data?.items ?? [];
    if (!productSearch.trim()) return items;

    const term = productSearch.toLowerCase();
    return items.filter((item) =>
      [item.name, item.sku, item.id].some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      )
    );
  }, [productSearch, productsQuery.data?.items]);

  const videosQuery = useQuery({
    queryKey: ["admin-training-videos", "list", videoScope, selectedProductId],
    queryFn: () =>
      fetchTrainingVideos({
        productId: selectedProductId,
        scope: videoScope,
      }),
    enabled: videoScope === "GENERAL" || !!selectedProductId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (videoScope === "PRODUCT" && !selectedProductId) {
        throw new Error("Selecione um produto.");
      }

      if (!file) {
        throw new Error("Selecione um arquivo de vídeo.");
      }

      if (!file.type.startsWith("video/")) {
        throw new Error("O arquivo precisa ser um vídeo válido.");
      }

      if (!title.trim()) {
        throw new Error("Título é obrigatório.");
      }

      const routeId = videoScope === "PRODUCT" ? selectedProductId : "general";

      const initResponse = await api.post(
        endpoints.adminTrainingVideos.initUpload(routeId),
        {
          fileName: file.name,
          contentType: file.type,
          scope: videoScope,
          productId: videoScope === "PRODUCT" ? selectedProductId : null,
        }
      );

      const { uploadUrl, objectKey } = initResponse.data;

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error("Falha ao enviar vídeo para o storage.");
      }

      const finalizeResponse = await api.post(
        endpoints.adminTrainingVideos.finalize(routeId),
        {
          productId: videoScope === "PRODUCT" ? selectedProductId : null,
          scope: videoScope,
          objectKey,
          title: title.trim(),
          description: description.trim() || null,
          mimeType: file.type,
          sizeBytes: file.size,
          sortOrder: Number(sortOrder || 0),
          active,
          originalName: file.name,
        }
      );

      return finalizeResponse.data;
    },
    onSuccess: async () => {
      toast.success("Vídeo enviado com sucesso.");
      setTitle("");
      setDescription("");
      setSortOrder("0");
      setActive(true);
      setFile(null);

      const input = document.getElementById("training-video-file") as HTMLInputElement | null;
      if (input) input.value = "";

      await queryClient.invalidateQueries({
        queryKey: ["admin-training-videos", "list"],
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || error?.response?.data?.error || "Erro ao enviar vídeo.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        title?: string;
        description?: string | null;
        sortOrder?: number;
        active?: boolean;
      };
    }) => {
      const { data } = await api.patch(endpoints.adminTrainingVideos.update(id), payload);
      return data;
    },
    onSuccess: async () => {
      toast.success("Vídeo atualizado.");
      setEditingId(null);
      await queryClient.invalidateQueries({
        queryKey: ["admin-training-videos", "list"],
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Erro ao atualizar vídeo.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(endpoints.adminTrainingVideos.remove(id));
      return data;
    },
    onSuccess: async () => {
      toast.success("Vídeo removido.");
      await queryClient.invalidateQueries({
        queryKey: ["admin-training-videos", "list"],
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Erro ao remover vídeo.");
    },
  });

  const refreshAll = async () => {
    await Promise.all([
      productsQuery.refetch(),
      videoScope === "GENERAL" || selectedProductId
        ? videosQuery.refetch()
        : Promise.resolve(),
    ]);
    toast.success("Dados atualizados.");
  };

  const selectedProduct =
    filteredProducts.find((p) => p.id === selectedProductId) ??
    (productsQuery.data?.items ?? []).find((p) => p.id === selectedProductId);

  const isBusy =
    uploadMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const videos = videosQuery.data?.items ?? [];

  function startEditing(video: TrainingVideoItem) {
    setEditingId(video.id);
    setEditingTitle(video.title);
    setEditingDescription(video.description || "");
    setEditingSortOrder(String(video.sortOrder ?? 0));
    setEditingActive(video.active);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTitle("");
    setEditingDescription("");
    setEditingSortOrder("0");
    setEditingActive(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-xl shadow-slate-300/50">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-100/90">
              <Clapperboard className="h-3.5 w-3.5" />
              Treinamento em vídeo
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Vídeos de treinamento</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Faça upload de vídeos gerais do sistema ou vídeos vinculados a produtos, organize a ordem e controle o que aparece no app.
            </p>
          </div>

          <Button
            onClick={refreshAll}
            disabled={isBusy}
            className="rounded-2xl bg-white text-slate-900 hover:bg-slate-100"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar tudo
          </Button>
        </div>
      </div>

      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={videoScope === "GENERAL" ? "default" : "outline"}
              className="rounded-2xl"
              onClick={() => {
                setVideoScope("GENERAL");
                setSelectedProductId("");
                setEditingId(null);
              }}
            >
              Vídeo geral
            </Button>

            <Button
              type="button"
              variant={videoScope === "PRODUCT" ? "default" : "outline"}
              className="rounded-2xl"
              onClick={() => {
                setVideoScope("PRODUCT");
                setEditingId(null);
              }}
            >
              Vídeo de produto
            </Button>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            Escolha se o vídeo será um conteúdo geral do sistema, onboarding, treinamento da plataforma ou um vídeo ligado a um produto específico.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {videoScope === "PRODUCT" ? (
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-4">
              <SectionHeader
                title="Produtos"
                subtitle="Selecione o produto que receberá os vídeos."
              />
              <SearchBox
                value={productSearch}
                onChange={setProductSearch}
                placeholder="Buscar por nome, SKU ou ID"
              />
            </CardHeader>

            <CardContent className="space-y-3">
              {productsQuery.isLoading ? (
                <div className="py-8 text-sm text-slate-500">Carregando produtos...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-sm text-slate-500">Nenhum produto encontrado.</div>
              ) : (
                filteredProducts.map((product) => {
                  const selected = selectedProductId === product.id;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() =>
                        setSelectedProductId((prev) => (prev === product.id ? "" : product.id))
                      }
                      className={[
                        "w-full rounded-2xl border p-4 text-left transition",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`font-medium ${selected ? "text-white" : "text-slate-900"}`}>
                            {product.name}
                          </p>
                          <p className={`mt-1 text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>
                            SKU: {product.sku || "—"}
                          </p>
                          <p className={`mt-1 break-all text-[11px] ${selected ? "text-slate-400" : "text-slate-400"}`}>
                            {product.id}
                          </p>
                        </div>

                        <Badge
                          variant="outline"
                          className={
                            product.active === false
                              ? selected
                                ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                                : "border-rose-300 bg-rose-500/10 text-rose-700"
                              : selected
                                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                                : "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                          }
                        >
                          {product.active === false ? "Inativo" : "Ativo"}
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-col gap-6">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <SectionHeader
                title="Novo vídeo"
                subtitle={
                  videoScope === "GENERAL"
                    ? "Vídeo geral do sistema, onboarding ou treinamento da plataforma"
                    : selectedProduct
                      ? `Produto selecionado: ${selectedProduct.name}`
                      : "Selecione um produto para enviar vídeo"
                }
              />
            </CardHeader>

            <CardContent className="space-y-5">
              {videoScope === "PRODUCT" && !selectedProductId ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Selecione um produto para começar.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">Título</label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex.: Como aplicar corretamente"
                        className="rounded-2xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">Ordem</label>
                      <Input
                        type="number"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        placeholder="0"
                        className="rounded-2xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Descrição</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva o objetivo do vídeo"
                      className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">Arquivo do vídeo</label>
                      <Input
                        id="training-video-file"
                        type="file"
                        accept="video/*"
                        className="rounded-2xl"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      <p className="text-xs text-slate-500">
                        Envie um arquivo de vídeo. O upload vai direto para o storage.
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                      />
                      Ativo no app
                    </label>
                  </div>

                  {file ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <Video className="h-4 w-4" />
                        Arquivo selecionado
                      </div>
                      <p className="mt-2">Nome: {file.name}</p>
                      <p>Tipo: {file.type || "—"}</p>
                      <p>Tamanho: {formatBytes(file.size)}</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => uploadMutation.mutate()}
                      disabled={(videoScope === "PRODUCT" && !selectedProductId) || !file || uploadMutation.isPending}
                      className="rounded-2xl"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Enviar vídeo
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => {
                        setTitle("");
                        setDescription("");
                        setSortOrder("0");
                        setActive(true);
                        setFile(null);

                        const input = document.getElementById("training-video-file") as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <SectionHeader
                title="Vídeos cadastrados"
                subtitle={
                  videoScope === "GENERAL"
                    ? "Gerencie os vídeos gerais do sistema"
                    : selectedProduct
                      ? `Gerencie os vídeos de ${selectedProduct.name}`
                      : "Selecione um produto para visualizar"
                }
                right={
                  videoScope === "GENERAL" || selectedProductId ? (
                    <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                      {videos.length} vídeo(s)
                    </Badge>
                  ) : undefined
                }
              />
            </CardHeader>

            <CardContent className="space-y-4">
              {videoScope === "PRODUCT" && !selectedProductId ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Selecione um produto para visualizar os vídeos.
                </div>
              ) : videosQuery.isLoading ? (
                <div className="py-10 text-sm text-slate-500">Carregando vídeos...</div>
              ) : videos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                    <Clapperboard className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-800">Nenhum vídeo cadastrado</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {videoScope === "GENERAL"
                      ? "Faça o upload do primeiro vídeo geral."
                      : "Faça o upload do primeiro vídeo para este produto."}
                  </p>
                </div>
              ) : (
                videos.map((video) => {
                  const isEditing = editingId === video.id;

                  return (
                    <Card key={video.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-none">
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-900">{video.title}</h3>

                              <Badge
                                variant="outline"
                                className={
                                  video.scope === "GENERAL"
                                    ? "border-sky-300 bg-sky-500/10 text-sky-700"
                                    : "border-violet-300 bg-violet-500/10 text-violet-700"
                                }
                              >
                                {video.scope === "GENERAL" ? "Geral" : "Produto"}
                              </Badge>

                              <Badge
                                variant="outline"
                                className={
                                  video.active
                                    ? "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                                    : "border-rose-300 bg-rose-500/10 text-rose-700"
                                }
                              >
                                {video.active ? "Ativo" : "Inativo"}
                              </Badge>

                              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                                Ordem {video.sortOrder}
                              </Badge>
                            </div>

                            <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                              <p>
                                <span className="font-medium text-slate-900">Arquivo:</span>{" "}
                                {video.originalName || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Tipo:</span>{" "}
                                {video.mimeType || "—"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Tamanho:</span>{" "}
                                {formatBytes(video.sizeBytes)}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Criado em:</span>{" "}
                                {brDate(video.createdAt)}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                              <p className="font-medium text-slate-900">Descrição</p>
                              <p className="mt-2 whitespace-pre-wrap">
                                {video.description || "Sem descrição."}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                              <p className="font-medium text-slate-900">URL pública</p>
                              <p className="mt-2 break-all">{video.publicUrl}</p>
                            </div>

                            {isEditing ? (
                              <>
                                <Separator className="bg-slate-200" />

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-900">Título</label>
                                    <Input
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      className="rounded-2xl"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-900">Ordem</label>
                                    <Input
                                      type="number"
                                      value={editingSortOrder}
                                      onChange={(e) => setEditingSortOrder(e.target.value)}
                                      className="rounded-2xl"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-medium text-slate-900">Descrição</label>
                                  <textarea
                                    value={editingDescription}
                                    onChange={(e) => setEditingDescription(e.target.value)}
                                    className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </div>

                                <label className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={editingActive}
                                    onChange={(e) => setEditingActive(e.target.checked)}
                                  />
                                  Ativo no app
                                </label>

                                <div className="flex flex-wrap gap-3">
                                  <Button
                                    className="rounded-2xl"
                                    disabled={updateMutation.isPending}
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: video.id,
                                        payload: {
                                          title: editingTitle.trim(),
                                          description: editingDescription.trim() || null,
                                          sortOrder: Number(editingSortOrder || 0),
                                          active: editingActive,
                                        },
                                      })
                                    }
                                  >
                                    {updateMutation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Salvando...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Salvar alterações
                                      </>
                                    )}
                                  </Button>

                                  <Button
                                    variant="outline"
                                    className="rounded-2xl"
                                    onClick={cancelEditing}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </>
                            ) : null}
                          </div>

                          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1 xl:min-w-[220px]">
                            <Button
                              variant="outline"
                              className="rounded-2xl"
                              onClick={() => window.open(video.publicUrl, "_blank", "noopener,noreferrer")}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Abrir vídeo
                            </Button>

                            {!isEditing ? (
                              <Button
                                variant="secondary"
                                className="rounded-2xl"
                                onClick={() => startEditing(video)}
                              >
                                <Save className="mr-2 h-4 w-4" />
                                Editar vídeo
                              </Button>
                            ) : null}

                            <Button
                              variant="destructive"
                              className="rounded-2xl"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                const ok = window.confirm(
                                  `Deseja remover o vídeo "${video.title}"?`
                                );

                                if (!ok) return;
                                deleteMutation.mutate(video.id);
                              }}
                            >
                              {deleteMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Removendo...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remover
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-amber-200 bg-amber-50/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="text-sm text-amber-900">
                  <p className="font-medium">Importante</p>
                  <p className="mt-1">
                    O bucket/storage precisa aceitar CORS para o domínio do admin, porque o upload
                    do vídeo é feito direto do navegador para o storage usando presigned URL.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-emerald-200 bg-emerald-50/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div className="text-sm text-emerald-900">
                  <p className="font-medium">Essa tela já cobre</p>
                  <p className="mt-1">
                    Upload, vínculo geral ou por produto, ordenação, ativação/inativação, edição e exclusão.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}