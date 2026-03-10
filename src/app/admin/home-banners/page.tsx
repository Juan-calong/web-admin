"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Images,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  ImagePlus,
  LayoutPanelTop,
  ExternalLink,
  CalendarClock,
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

type TargetType =
  | "NONE"
  | "PROMOTIONS"
  | "NEWS"
  | "SHOP"
  | "PRODUCT"
  | "CATEGORY"
  | "URL";

type HomeBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  buttonLabel: string | null;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
  targetType: TargetType;
  targetId: string | null;
  targetUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListDTO = {
  ok: true;
  items: HomeBanner[];
};

type ItemDTO = {
  ok: true;
  item: HomeBanner;
};

type PresignImageDTO = {
  ok: true;
  key: string;
  uploadUrl: string;
  publicUrl: string;
};

type ConfirmImageDTO = {
  ok: true;
  key: string;
  imageUrl: string;
  mime: string;
  size: number;
};

type FormState = {
  title: string;
  subtitle: string;
  buttonLabel: string;
  imageUrl: string;
  active: boolean;
  sortOrder: string;
  targetType: TargetType;
  targetId: string;
  targetUrl: string;
  startsAt: string;
  endsAt: string;
};

function getNowLocalInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function createEmptyForm(): FormState {
  return {
    title: "",
    subtitle: "",
    buttonLabel: "",
    imageUrl: "",
    active: true,
    sortOrder: "0",
    targetType: "NONE",
    targetId: "",
    targetUrl: "",
    startsAt: getNowLocalInputValue(),
    endsAt: "",
  };
}

async function fetchBanners(): Promise<ListDTO> {
  const { data } = await api.get(endpoints.homeBanners.list);
  return data;
}

async function createBanner(payload: unknown): Promise<ItemDTO> {
  const { data } = await api.post(endpoints.homeBanners.create, payload);
  return data;
}

async function updateBanner(id: string, payload: unknown): Promise<ItemDTO> {
  const { data } = await api.patch(endpoints.homeBanners.update(id), payload);
  return data;
}

async function deleteBanner(id: string) {
  const { data } = await api.delete(endpoints.homeBanners.delete(id));
  return data;
}

async function presignBannerImage(file: File): Promise<PresignImageDTO> {
  const { data } = await api.post(endpoints.homeBanners.presignImage, {
    contentType: file.type,
    size: file.size,
  });
  return data;
}

async function confirmBannerImage(key: string): Promise<ConfirmImageDTO> {
  const { data } = await api.post(endpoints.homeBanners.confirmImage, { key });
  return data;
}

async function uploadBannerFile(file: File): Promise<ConfirmImageDTO> {
  const presign = await presignBannerImage(file);

  const uploadRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error("Falha no upload da imagem.");
  }

  return confirmBannerImage(presign.key);
}

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function toIsoOrNull(value: string) {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formFromBanner(item: HomeBanner): FormState {
  return {
    title: item.title ?? "",
    subtitle: item.subtitle ?? "",
    buttonLabel: item.buttonLabel ?? "",
    imageUrl: item.imageUrl ?? "",
    active: item.active,
    sortOrder: String(item.sortOrder ?? 0),
    targetType: item.targetType ?? "NONE",
    targetId: item.targetId ?? "",
    targetUrl: item.targetUrl ?? "",
    startsAt: toInputDateTimeLocal(item.startsAt) || getNowLocalInputValue(),
    endsAt: toInputDateTimeLocal(item.endsAt),
  };
}

function buildPayload(form: FormState) {
  return {
    title: form.title.trim() || null,
    subtitle: form.subtitle.trim() || null,
    buttonLabel: form.buttonLabel.trim() || null,
    imageUrl: form.imageUrl.trim(),
    active: form.active,
    sortOrder: Number(form.sortOrder || 0),

    targetType: form.targetType,
    targetId:
      form.targetType === "PRODUCT" || form.targetType === "CATEGORY"
        ? form.targetId.trim() || null
        : null,
    targetUrl: form.targetType === "URL" ? form.targetUrl.trim() || null : null,

    startsAt: toIsoOrNull(form.startsAt),
    endsAt: toIsoOrNull(form.endsAt),
  };
}

function targetTypeLabel(type: TargetType) {
  switch (type) {
    case "PROMOTIONS":
      return "Promoções";
    case "NEWS":
      return "Novidades";
    case "SHOP":
      return "Loja";
    case "PRODUCT":
      return "Produto";
    case "CATEGORY":
      return "Categoria";
    case "URL":
      return "URL";
    case "NONE":
    default:
      return "Sem ação";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function AdminHomeBannersPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(createEmptyForm());
  const [uploadingImage, setUploadingImage] = useState(false);

  const bannersQ = useQuery({
    queryKey: ["admin-home-banners"],
    queryFn: fetchBanners,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const items = useMemo(() => {
    const list = bannersQ.data?.items ?? [];
    return [...list].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [bannersQ.data?.items]);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form);

      if (!payload.imageUrl) {
        throw new Error("Selecione uma imagem para o banner.");
      }

      if (editingId) {
        return updateBanner(editingId, payload);
      }

      return createBanner(payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Banner atualizado." : "Banner criado.");
      setEditingId(null);
      setForm(createEmptyForm());
      await qc.invalidateQueries({ queryKey: ["admin-home-banners"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Falha ao salvar banner."));
    },
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => deleteBanner(id),
    onSuccess: async (_data, deletedId) => {
      toast.success("Banner removido.");

      if (editingId === deletedId) {
        setEditingId(null);
        setForm(createEmptyForm());
      }

      await qc.invalidateQueries({ queryKey: ["admin-home-banners"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Falha ao remover banner."));
    },
  });

  const toggleActiveM = useMutation({
    mutationFn: async (item: HomeBanner) =>
      updateBanner(item.id, {
        active: !item.active,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-home-banners"] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Falha ao alterar status do banner."));
    },
  });

  function resetForm() {
    setEditingId(null);
    setForm(createEmptyForm());

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function startEdit(item: HomeBanner) {
    setEditingId(item.id);
    setForm(formFromBanner(item));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFileChange(file?: File) {
    if (!file) return;

    try {
      setUploadingImage(true);

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Formato inválido. Use JPG, PNG ou WEBP.");
      }

      const maxBytes = 5 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error("A imagem deve ter no máximo 5MB.");
      }

      const result = await uploadBannerFile(file);

      setForm((s) => ({
        ...s,
        imageUrl: result.imageUrl,
      }));

      toast.success("Imagem enviada com sucesso.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Falha ao enviar imagem."));
    } finally {
      setUploadingImage(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeImage() {
    setForm((s) => ({
      ...s,
      imageUrl: "",
    }));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 pb-6 lg:px-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-slate-700">
                <LayoutPanelTop className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-xl text-slate-900 sm:text-2xl">
                  Banners da Home
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Gerencie os banners que aparecem no topo do app, com controle de
                  imagem, ordem, status e destino do clique.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Use esta tela para manter a home organizada. Você pode ativar ou
              desativar banners, definir a ordem de exibição e controlar para onde o
              usuário será enviado ao tocar.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => bannersQ.refetch()}
                disabled={bannersQ.isFetching}
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    bannersQ.isFetching ? "animate-spin" : ""
                  )}
                />
                {bannersQ.isFetching ? "Atualizando..." : "Atualizar"}
              </Button>

              <Button
                className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                onClick={resetForm}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo banner
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

          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Total de banners</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{items.length}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Banners ativos</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] xl:sticky xl:top-4 xl:h-fit">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900">
              {editingId ? "Editar banner" : "Novo banner"}
            </CardTitle>
            <CardDescription className="text-slate-600">
              Configure imagem, ordem, janela de exibição e destino do banner.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-2">
              <Label className="text-slate-700">Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="Ex.: Promo da semana"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Subtítulo</Label>
              <Textarea
                value={form.subtitle}
                onChange={(e) => setForm((s) => ({ ...s, subtitle: e.target.value }))}
                placeholder="Ex.: Até 30% off em produtos selecionados"
                className="min-h-[96px] rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Texto do botão</Label>
              <Input
                value={form.buttonLabel}
                onChange={(e) => setForm((s) => ({ ...s, buttonLabel: e.target.value }))}
                placeholder="Ex.: Ver promoções"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-slate-700">Imagem do banner</Label>

              {form.imageUrl ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                  <img
                    src={form.imageUrl}
                    alt="Preview do banner"
                    className="h-48 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                  <ImagePlus className="h-6 w-6" />
                  Nenhuma imagem selecionada
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadingImage ? "Enviando..." : "Selecionar imagem"}
                </Button>

                {form.imageUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    onClick={removeImage}
                    disabled={uploadingImage}
                  >
                    Remover imagem
                  </Button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                <p>Upload direto para o Cloudflare R2.</p>
                <p>Formatos aceitos: JPG, PNG e WEBP.</p>
                <p>Tamanho máximo: 5MB.</p>
                <p>Recomendado: banner horizontal, como 1200x500.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-slate-700">Ordem</Label>
                <Input
                  value={form.sortOrder}
                  onChange={(e) => setForm((s) => ({ ...s, sortOrder: e.target.value }))}
                  type="number"
                  min={0}
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-slate-700">Status</Label>
                <Button
                  type="button"
                  className={cn(
                    "h-11 rounded-xl",
                    form.active
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  )}
                  variant={form.active ? "default" : "outline"}
                  onClick={() => setForm((s) => ({ ...s, active: !s.active }))}
                >
                  {form.active ? "Ativo" : "Inativo"}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label className="text-slate-700">Destino do banner</Label>
              <select
                value={form.targetType}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    targetType: e.target.value as TargetType,
                    targetId: "",
                    targetUrl: "",
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="NONE">Sem ação</option>
                <option value="PROMOTIONS">Promoções</option>
                <option value="NEWS">Novidades</option>
                <option value="SHOP">Loja</option>
                <option value="PRODUCT">Produto</option>
                <option value="CATEGORY">Categoria</option>
                <option value="URL">URL externa</option>
              </select>
            </div>

            {(form.targetType === "PRODUCT" || form.targetType === "CATEGORY") && (
              <div className="grid gap-2">
                <Label className="text-slate-700">
                  {form.targetType === "PRODUCT" ? "ID do produto" : "ID da categoria"}
                </Label>
                <Input
                  value={form.targetId}
                  onChange={(e) => setForm((s) => ({ ...s, targetId: e.target.value }))}
                  placeholder={
                    form.targetType === "PRODUCT"
                      ? "UUID do produto"
                      : "UUID da categoria"
                  }
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                />
              </div>
            )}

            {form.targetType === "URL" && (
              <div className="grid gap-2">
                <Label className="text-slate-700">URL de destino</Label>
                <Input
                  value={form.targetUrl}
                  onChange={(e) => setForm((s) => ({ ...s, targetUrl: e.target.value }))}
                  placeholder="https://..."
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-slate-700">Início</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((s) => ({ ...s, startsAt: e.target.value }))}
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-slate-700">Fim (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((s) => ({ ...s, endsAt: e.target.value }))}
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending || uploadingImage}
              >
                {saveM.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingId ? "Salvando..." : "Criando..."}
                  </>
                ) : editingId ? (
                  "Salvar alterações"
                ) : (
                  "Criar banner"
                )}
              </Button>

              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={resetForm}
                disabled={saveM.isPending || uploadingImage}
              >
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900">Lista de banners</CardTitle>
            <CardDescription className="text-slate-600">
              Se houver 1 banner ativo, o app mostra só ele. Se houver mais de 1,
              vira carrossel.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pt-5">
            {bannersQ.isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Carregando banners...
              </div>
            ) : bannersQ.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {apiErrorMessage(bannersQ.error, "Erro ao carregar banners.")}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Nenhum banner cadastrado ainda.
              </div>
            ) : (
              <div className="grid gap-3">
                {items.map((item) => {
                  const deletingThis =
                    deleteM.isPending &&
                    (deleteM.variables as string | undefined) === item.id;

                  const togglingThis =
                    toggleActiveM.isPending &&
                    (toggleActiveM.variables as HomeBanner | undefined)?.id === item.id;

                  const editingThis = editingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-3xl border bg-white p-4 shadow-sm transition-all",
                        editingThis
                          ? "border-slate-900 ring-1 ring-slate-900/10"
                          : "border-slate-200"
                      )}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div className="h-24 w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title ?? "Banner"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                Sem imagem
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-base font-semibold text-slate-900">
                                {item.title || "Sem título"}
                              </div>

                              {editingThis && (
                                <Badge className="border-0 bg-slate-900 text-white hover:bg-slate-900">
                                  Em edição
                                </Badge>
                              )}

                              <Badge
                                className={cn(
                                  "rounded-full border-0",
                                  item.active
                                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                                    : "bg-slate-200 text-slate-700 hover:bg-slate-200"
                                )}
                              >
                                {item.active ? "Ativo" : "Inativo"}
                              </Badge>

                              <Badge className="rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-white">
                                Ordem {item.sortOrder}
                              </Badge>

                              <Badge className="rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-white">
                                {targetTypeLabel(item.targetType)}
                              </Badge>
                            </div>

                            {item.subtitle ? (
                              <p className="text-sm leading-6 text-slate-600">
                                {item.subtitle}
                              </p>
                            ) : null}

                            <div className="grid gap-2 text-xs text-slate-500">
                              <div>
                                {item.buttonLabel ? `Botão: ${item.buttonLabel} • ` : ""}
                                Atualizado em {formatDateTime(item.updatedAt)}
                              </div>

                              {(item.targetId || item.targetUrl) && (
                                <div className="break-all">
                                  {item.targetId ? `targetId: ${item.targetId}` : ""}
                                  {item.targetId && item.targetUrl ? " • " : ""}
                                  {item.targetUrl ? `targetUrl: ${item.targetUrl}` : ""}
                                </div>
                              )}

                              {(item.startsAt || item.endsAt) && (
                                <div className="flex items-start gap-2">
                                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <span>
                                    Janela: {formatDateTime(item.startsAt)} até{" "}
                                    {formatDateTime(item.endsAt)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                          <Button
                            variant="outline"
                            className="h-10 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                            onClick={() => startEdit(item)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>

                          <Button
                            variant="outline"
                            className="h-10 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                            onClick={() => toggleActiveM.mutate(item)}
                            disabled={togglingThis}
                          >
                            {togglingThis ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Alterando...
                              </>
                            ) : item.active ? (
                              <>
                                <EyeOff className="mr-2 h-4 w-4" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" />
                                Ativar
                              </>
                            )}
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                className="col-span-2 h-10 rounded-xl border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 sm:col-span-1"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </Button>
                            </AlertDialogTrigger>

                            <AlertDialogContent className="rounded-2xl border border-slate-200 bg-white">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir banner?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Essa ação remove o banner permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>

                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                                  Cancelar
                                </AlertDialogCancel>

                                <AlertDialogAction
                                  className="rounded-xl bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => deleteM.mutate(item.id)}
                                  disabled={deletingThis}
                                >
                                  {deletingThis ? "Excluindo..." : "Confirmar"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
            <Images className="h-5 w-5" />
            Como isso funciona no app
          </CardTitle>
          <CardDescription className="text-slate-600">
            O mobile consome só os banners ativos e dentro da janela de data.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Se existir apenas 1 banner ativo, o app mostra somente esse banner.
            Se existirem 2 ou mais, a área vira um carrossel.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Se não existir nenhum banner ativo, você pode usar um banner padrão local
            no mobile como fallback.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            Para banners com URL externa, revise o link antes de publicar para evitar
            navegação quebrada.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}