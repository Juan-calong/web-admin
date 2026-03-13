"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Upload } from "lucide-react";

import { ProductStatusPanel } from "@/components/admin/ProductStatusPanel";

type Category = {
  id: string;
  name: string;
  active: boolean;
};

type ProductAudience = "ALL" | "STAFF_ONLY";

type ProductApiResponse = {
  item?: { id?: string };
  id?: string;
};

type NewDraft = {
  sku: string;
  name: string;
  price: string;
  customerPrice: string;
  description: string;
  highlightsText: string;
  stock: number;
  active: boolean;
  categoryId: string;
  categoryIds: string[];
  catSearch: string;
  audience: ProductAudience;
  brand: string;
  line: string;
  volume: string;
  effect: string;
  videoTitle: string;
  videoDescription: string;
  videoSortOrder: string;
  videoActive: boolean;
  videoShowInGallery: boolean;
  videoThumbnailUrl: string;
};

const DRAFT_KEY = "admin-product-new-draft";

function stableKey(
  prefix: string,
  ...parts: (string | number | boolean | null | undefined)[]
) {
  return `${prefix}:${parts.map((p) => String(p ?? "")).join(":")}`;
}

function parseHighlights(text: string) {
  return String(text ?? "")
    .split("\n")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 60));
}

function toggleCategoryId(id: string, prev: string[]) {
  return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
}

function readDraft(): NewDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NewDraft;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const returnTo = searchParams.get("returnTo") || "/admin/products";
  const didHydrateDraftRef = useRef(false);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [description, setDescription] = useState("");
  const [highlightsText, setHighlightsText] = useState("");
  const [stock, setStock] = useState<number>(0);
  const [active, setActive] = useState(true);

  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState("");

  const [audience, setAudience] = useState<ProductAudience>("ALL");
  const availableToCustomer = audience === "ALL";

  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [line, setLine] = useState("");

  const [volume, setVolume] = useState("");
  const [effect, setEffect] = useState("");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [videoSortOrder, setVideoSortOrder] = useState("0");
  const [videoActive, setVideoActive] = useState(true);
  const [videoShowInGallery, setVideoShowInGallery] = useState(true);
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState("");

  useEffect(() => {
    const draft = readDraft();

    if (draft) {
      setSku(draft.sku ?? "");
      setName(draft.name ?? "");
      setPrice(draft.price ?? "");
      setCustomerPrice(draft.customerPrice ?? "");
      setDescription(draft.description ?? "");
      setHighlightsText(draft.highlightsText ?? "");
      setStock(Number.isFinite(Number(draft.stock)) ? Math.max(0, Number(draft.stock)) : 0);
      setActive(!!draft.active);
      setCategoryId(draft.categoryId ?? "");
      setCategoryIds(Array.isArray(draft.categoryIds) ? draft.categoryIds : []);
      setCatSearch(draft.catSearch ?? "");
      setAudience(draft.audience ?? "ALL");
      setBrand(draft.brand ?? "");
      setLine(draft.line ?? "");
      setVolume(draft.volume ?? "");
      setEffect(draft.effect ?? "");
      setVideoTitle(draft.videoTitle ?? "");
      setVideoDescription(draft.videoDescription ?? "");
      setVideoSortOrder(draft.videoSortOrder ?? "0");
      setVideoActive(!!draft.videoActive);
      setVideoShowInGallery(!!draft.videoShowInGallery);
      setVideoThumbnailUrl(draft.videoThumbnailUrl ?? "");
    }

    didHydrateDraftRef.current = true;
  }, []);

  useEffect(() => {
    if (!didHydrateDraftRef.current) return;

    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          sku,
          name,
          price,
          customerPrice,
          description,
          highlightsText,
          stock,
          active,
          categoryId,
          categoryIds,
          catSearch,
          audience,
          brand,
          line,
          volume,
          effect,
          videoTitle,
          videoDescription,
          videoSortOrder,
          videoActive,
          videoShowInGallery,
          videoThumbnailUrl,
        } satisfies NewDraft)
      );
    } catch {}
  }, [
    sku,
    name,
    price,
    customerPrice,
    description,
    highlightsText,
    stock,
    active,
    categoryId,
    categoryIds,
    catSearch,
    audience,
    brand,
    line,
    volume,
    effect,
    videoTitle,
    videoDescription,
    videoSortOrder,
    videoActive,
    videoShowInGallery,
    videoThumbnailUrl,
  ]);

  useEffect(() => {
    if (!files.length) {
      setPreviewUrls([]);
      return;
    }

    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  async function uploadProductImages(productId: string, imageFiles: File[]) {
    for (let index = 0; index < imageFiles.length; index += 1) {
      const imageFile = imageFiles[index];

      const contentType =
        imageFile.type === "image/jpg"
          ? "image/jpeg"
          : imageFile.type || "application/octet-stream";

      const presignRes = await api.post(
        endpoints.products.images.presign(productId),
        {
          contentType,
          size: imageFile.size,
          filename: imageFile.name,
          mime: contentType,
        },
        {
          headers: {
            "Idempotency-Key": `prod-img-presign:new:${productId}:${index}:${imageFile.name}:${imageFile.size}`,
          },
        }
      );

      const { uploadUrl, publicUrl, key } = presignRes.data ?? {};
      if (!uploadUrl || !key) {
        throw new Error("Presign inválido: faltou uploadUrl/key.");
      }

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: imageFile,
        headers: { "Content-Type": contentType },
      });

      if (!putRes.ok) {
        const t = await putRes.text().catch(() => "");
        throw new Error(`Falha no upload (PUT): ${putRes.status} ${t}`.slice(0, 200));
      }

      await api.post(
        endpoints.products.images.confirm(productId),
        {
          key,
          url: publicUrl,
          mime: contentType,
          size: imageFile.size,
          sort: index,
          isPrimary: index === 0,
        },
        {
          headers: {
            "Idempotency-Key": `prod-img-confirm:new:${productId}:${index}:${key}`,
          },
        }
      );
    }
  }

  async function uploadProductVideo(productId: string, file: File) {
    if (!file.type.startsWith("video/")) {
      throw new Error("O arquivo selecionado precisa ser um vídeo.");
    }

    const initResponse = await api.post(
      endpoints.adminTrainingVideos.initUpload(productId),
      {
        fileName: file.name,
        contentType: file.type,
        scope: "PRODUCT",
        productId,
      }
    );

    const { uploadUrl, objectKey } = initResponse.data ?? {};
    if (!uploadUrl || !objectKey) {
      throw new Error("Init do vídeo inválido.");
    }

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

    await api.post(
      endpoints.adminTrainingVideos.finalize(productId),
      {
        productId,
        scope: "PRODUCT",
        objectKey,
        title:
          videoTitle.trim() ||
          name.trim() ||
          file.name.replace(/\.[^/.]+$/, ""),
        description: videoDescription.trim() || null,
        mimeType: file.type,
        sizeBytes: file.size,
        sortOrder: Number(videoSortOrder || 0),
        active: videoActive,
        showInGallery: videoShowInGallery,
        thumbnailUrl: videoThumbnailUrl.trim() || null,
        originalName: file.name,
      }
    );
  }

  const categoriesQ = useQuery({
    queryKey: ["categories", { active: true }],
    queryFn: async () => {
      const res = await api.get(endpoints.categories.list, {
        params: { active: "true" },
      });
      return (res.data?.items ?? []) as Category[];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (categoriesQ.isError) {
      toast.error(apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias."));
    }
  }, [categoriesQ.isError, categoriesQ.error]);

  const categories = useMemo(() => {
    const items = categoriesQ.data ?? [];
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, [categoriesQ.data]);

  const selectedCategoryName = useMemo(() => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId)?.name ?? null;
  }, [categories, categoryId]);

  const createM = useMutation({
    mutationFn: async () => {
      const skuN = sku.trim();
      const nameN = name.trim();
      const priceN = price.trim().replace(",", ".");
      const customerPriceN = customerPrice.trim().replace(",", ".");

      if (!skuN) throw new Error("SKU é obrigatório.");
      if (!nameN) throw new Error("Nome é obrigatório.");
      if (!priceN) throw new Error("Preço é obrigatório.");

      const stockSafe = Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;

      const payload: {
        sku: string;
        name: string;
        price: string;
        customerPrice: string | null;
        active: boolean;
        stock: number;
        categoryId: string | null;
        categoryIds: string[];
        audience: ProductAudience;
        description?: string;
        highlights?: string[];
        brand?: string | null;
        line?: string | null;
        volume?: string | null;
        effect?: string | null;
      } = {
        sku: skuN,
        name: nameN,
        price: priceN,
        customerPrice: customerPriceN ? customerPriceN : null,
        active: Boolean(active),
        stock: stockSafe,
        categoryId: categoryId ? categoryId : null,
        categoryIds: Array.from(
          new Set([...(categoryIds ?? []), ...(categoryId ? [categoryId] : [])])
        ),
        audience,
        brand: brand.trim() ? brand.trim() : null,
        line: line.trim() ? line.trim() : null,
        volume: volume.trim() ? volume.trim() : null,
        effect: effect.trim() ? effect.trim() : null,
      };

      const desc = description.trim();
      if (desc) payload.description = desc;

      const highlights = parseHighlights(highlightsText);
      if (highlights.length) payload.highlights = highlights;

      const createRes = await api.post(endpoints.products.create, payload, {
        headers: {
          "Idempotency-Key": stableKey(
            "product-create",
            payload.sku || payload.name || "no-key",
            payload.categoryId ?? "",
            payload.categoryIds.join(","),
            payload.audience
          ),
        },
      });

      const created = createRes.data as ProductApiResponse;
      const productId = created?.item?.id ?? created?.id;

      if (files.length > 0) {
        if (!productId) throw new Error("Produto criado, mas sem ID para enviar imagem.");
        await uploadProductImages(productId, files);
      }

      if (videoFile) {
        if (!productId) throw new Error("Produto criado, mas sem ID para enviar vídeo.");
        await uploadProductVideo(productId, videoFile);
      }
    },
    onSuccess: async () => {
      clearDraft();
      toast.success(files.length ? "Produto criado com imagens." : "Produto criado.");
      await qc.invalidateQueries({ queryKey: ["products"] });
      router.replace(returnTo);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Falha ao criar produto.")),
  });

  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const selectedExtraCategories = useMemo(() => {
    return categoryIds
      .map((id) => categoriesById.get(id))
      .filter(Boolean) as Category[];
  }, [categoryIds, categoriesById]);

  const filteredExtraCategories = useMemo(() => {
    const q = catSearch.trim().toLowerCase();

    return categories
      .filter((c) => c.id !== categoryId)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, categoryId, catSearch]);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-3xl font-semibold tracking-tight text-slate-900">
              Novo Produto
            </div>
            <div className="text-sm text-black/60">Crie um item no catálogo</div>
          </div>

          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            Admin
          </Badge>
        </div>

        <Card className="rounded-2xl border-slate-200/70 bg-[#F7F8FA] shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createM.mutate();
              }}
              className="grid gap-6 lg:grid-cols-12"
            >
              <div className="lg:col-span-8">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="p-4 sm:p-6">
                    <div className="mb-5">
                      <div className="text-base font-semibold">Dados do Produto</div>
                      <p className="text-xs text-black/60">
                        Preencha e clique em &quot;Criar&quot;.
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>SKU</Label>
                          <Input
                            className="rounded-xl"
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            placeholder="Ex: SHAMPOO-001"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Nome</Label>
                          <Input
                            className="rounded-xl"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Shampoo Premium"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Marca</Label>
                          <Input
                            className="rounded-xl"
                            value={brand}
                            onChange={(e) => setBrand(e.target.value)}
                            placeholder="Ex: Wella"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Linha / Família</Label>
                          <Input
                            className="rounded-xl"
                            value={line}
                            onChange={(e) => setLine(e.target.value)}
                            placeholder="Ex: Fusion"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Volume</Label>
                          <Input
                            className="rounded-xl"
                            value={volume}
                            onChange={(e) => setVolume(e.target.value)}
                            placeholder="Ex.: 500ml"
                            maxLength={20}
                          />
                          <div className="text-xs text-black/50">
                            Máx. 20 caracteres.
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label>Efeito</Label>
                          <Input
                            className="rounded-xl"
                            value={effect}
                            onChange={(e) => setEffect(e.target.value)}
                            placeholder="Ex.: Brilho intenso"
                            maxLength={20}
                          />
                          <div className="text-xs text-black/50">
                            Texto curto. Máx. 20 caracteres.
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>
                            Preço <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            className="rounded-xl"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="R$ 59,90"
                            inputMode="decimal"
                          />
                          <div className="text-xs text-black/50">
                            Use o formato que seu backend espera (ex.: 59.90).
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label>Preço cliente final (opcional)</Label>
                          <Input
                            className="rounded-xl"
                            value={customerPrice}
                            onChange={(e) => setCustomerPrice(e.target.value)}
                            placeholder="R$ 49,90"
                            inputMode="decimal"
                          />
                          <div className="text-xs text-black/50">
                            Se vazio, cliente final usa o preço padrão.
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label>Descrição</Label>
                        <Textarea
                          className="rounded-xl min-h-[110px]"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Ex: Shampoo enriquecido com queratina"
                        />
                      </div>

                      <Separator />

                      <div className="grid gap-2">
                        <Label>Imagem do produto (opcional)</Label>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              id="product-image-input"
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                            />

                            <Button
                              type="button"
                              className="h-10 rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                              onClick={() =>
                                document.getElementById("product-image-input")?.click()
                              }
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Enviar imagem
                            </Button>

                            {files.length > 0 && (
                              <span className="max-w-[260px] truncate text-xs text-black/60">
                                {files.length === 1
                                  ? files[0].name
                                  : `${files.length} imagens selecionadas`}
                              </span>
                            )}
                          </div>

                          {previewUrls.length > 0 && (
                            <div className="flex items-center justify-end">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-3">
                                <div className="mb-2 text-xs font-medium text-black/80">
                                  Preview ({previewUrls.length})
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  {previewUrls.slice(0, 6).map((url, index) => (
                                    <div
                                      key={`${url}-${index}`}
                                      className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-white"
                                    >
                                      <img
                                        src={url}
                                        alt={`Preview ${index + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-2 text-[11px] text-black/50">
                                  As imagens serão enviadas após criar. A primeira vira primária.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-black/50">
                          JPG, PNG ou WEBP. Tamanho máximo: 5MB por arquivo. Você pode selecionar
                          várias imagens. A primeira será definida como primária.
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <Label>Vídeo do produto (opcional)</Label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label className="text-xs">Título do vídeo</Label>
                            <Input
                              className="rounded-xl"
                              value={videoTitle}
                              onChange={(e) => setVideoTitle(e.target.value)}
                              placeholder="Ex.: Como aplicar corretamente"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label className="text-xs">Ordem</Label>
                            <Input
                              className="rounded-xl"
                              type="number"
                              value={videoSortOrder}
                              onChange={(e) => setVideoSortOrder(e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label className="text-xs">Descrição do vídeo</Label>
                          <Textarea
                            className="rounded-xl min-h-[90px]"
                            value={videoDescription}
                            onChange={(e) => setVideoDescription(e.target.value)}
                            placeholder="Ex.: Passo a passo de aplicação, modo de uso, cuidados..."
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label className="text-xs">Thumbnail URL (opcional)</Label>
                          <Input
                            className="rounded-xl"
                            value={videoThumbnailUrl}
                            onChange={(e) => setVideoThumbnailUrl(e.target.value)}
                            placeholder="https://..."
                          />
                          <div className="text-xs text-black/50">
                            Se vazio, depois você pode ajustar no editar.
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={videoActive}
                              onChange={(e) => setVideoActive(e.target.checked)}
                            />
                            Vídeo ativo
                          </label>

                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={videoShowInGallery}
                              onChange={(e) => setVideoShowInGallery(e.target.checked)}
                            />
                            Mostrar na galeria do produto
                          </label>
                        </div>

                        <div className="grid gap-2">
                          <Label className="text-xs">Arquivo do vídeo</Label>
                          <Input
                            type="file"
                            accept="video/*"
                            className="rounded-xl"
                            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                          />

                          <div className="text-xs text-black/50">
                            O vídeo será enviado após criar o produto.
                          </div>

                          {videoFile ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-black/70">
                              {videoFile.name} • {Math.round(videoFile.size / 1024)} KB
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <Separator />

                      <div className="grid gap-2">
                        <Label>Destaques (1 por linha)</Label>
                        <Textarea
                          className="rounded-xl min-h-[110px]"
                          value={highlightsText}
                          onChange={(e) => setHighlightsText(e.target.value)}
                          placeholder={`Ex:\nBrilho\nHidratação\nReconstrução`}
                        />
                        <div className="text-xs text-black/50">
                          Máx: 10 itens • 60 caracteres por linha.
                        </div>
                      </div>

                      <div className="grid gap-2 max-w-xs">
                        <Label>Estoque</Label>
                        <Input
                          type="number"
                          min={0}
                          className="rounded-xl"
                          value={stock}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setStock(Number.isFinite(n) ? Math.max(0, n) : 0);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="space-y-4 lg:sticky lg:top-6">
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                    <div className="mb-3 text-sm font-semibold">Status</div>

                    <ProductStatusPanel
                      active={active}
                      onActiveChange={setActive}
                      availableToCustomer={availableToCustomer}
                      onAvailableToCustomerChange={(v: boolean) =>
                        setAudience(v ? "ALL" : "STAFF_ONLY")
                      }
                    />

                    <div className="mt-2 text-xs text-black/50">
                      Produto ativo aparece no catálogo.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-4">
                    <div className="text-sm font-semibold">Categorias</div>

                    <div className="grid gap-2">
                      <Label className="text-xs">Categoria principal (opcional)</Label>

                      <Select
                        value={categoryId || "none"}
                        onValueChange={(v: string) => {
                          const next = v === "none" ? "" : v;
                          setCategoryId(next);
                          setCatSearch("");
                          if (next) setCategoryIds((prev) => prev.filter((x) => x !== next));
                        }}
                      >
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria principal</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {categoriesQ.isLoading ? (
                        <div className="text-xs text-black/50">Carregando categorias…</div>
                      ) : null}
                      {categoriesQ.isError ? (
                        <div className="text-xs text-red-600">Erro ao carregar categorias.</div>
                      ) : null}

                      <div className="text-xs text-black/50">
                        {selectedCategoryName ? (
                          <>
                            Selecionada:{" "}
                            <span className="font-semibold">{selectedCategoryName}</span>
                          </>
                        ) : (
                          "Nenhuma categoria principal"
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-2">
                      <Label className="text-xs">Categorias Extras (multi)</Label>

                      <Input
                        className="h-10 rounded-xl bg-white"
                        value={catSearch}
                        onChange={(e) => setCatSearch(e.target.value)}
                        placeholder="Buscar categoria..."
                      />

                      {selectedExtraCategories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedExtraCategories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCategoryIds((prev) => prev.filter((x) => x !== c.id))}
                              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200"
                              title="Remover categoria"
                            >
                              <span className="max-w-[180px] truncate">{c.name}</span>
                              <X className="h-3.5 w-3.5 text-slate-500" />
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => setCategoryIds([])}
                            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                            title="Limpar todas"
                          >
                            Limpar
                          </button>
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs text-black/60">
                            Mostrando: <b>{filteredExtraCategories.length}</b> • Selecionadas:{" "}
                            <b>{categoryIds.length}</b>
                          </div>

                          {!!catSearch && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 rounded-xl px-2 text-xs"
                              onClick={() => setCatSearch("")}
                            >
                              Limpar busca
                            </Button>
                          )}
                        </div>

                        <div className="max-h-56 overflow-auto pr-1">
                          <div className="grid gap-2">
                            {filteredExtraCategories.map((c) => {
                              const checked = categoryIds.includes(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={[
                                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer select-none",
                                    "transition-colors",
                                    checked
                                      ? "bg-slate-50 border-slate-200"
                                      : "bg-white border-slate-200 hover:bg-slate-50/50",
                                  ].join(" ")}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      setCategoryIds((prev) => toggleCategoryId(c.id, prev))
                                    }
                                  />
                                  <span className="truncate">{c.name}</span>
                                </label>
                              );
                            })}

                            {filteredExtraCategories.length === 0 && (
                              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-black/60">
                                Nenhuma categoria encontrada.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-2xl px-6 text-sm font-medium"
                      onClick={() => router.replace(returnTo)}
                      disabled={createM.isPending}
                    >
                      Cancelar
                    </Button>

                    <Button
                      type="submit"
                      disabled={createM.isPending}
                      className="h-11 rounded-2xl px-7 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      {createM.isPending ? "Criando…" : "Criar"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}