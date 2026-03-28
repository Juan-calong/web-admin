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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Upload,
  Search,
  CheckCircle2,
  Package2,
  Video,
} from "lucide-react";

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
  effectsText: string;
  benefitsText: string;
  howToUseText: string;

  stock: number;
  active: boolean;
  categoryId: string;
  categoryIds: string[];
  catSearch: string;
  audience: ProductAudience;

  brand: string;
  line: string;
  volume: string;

  weightKg: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  packageVolumes: string;

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

function parseStringList(text: string) {
  return String(text ?? "")
    .split(/\r?\n|;/g)
    .map((s) => s.replace(/^\s*[-•\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

function normalizeDecimalInput(value: string) {
  return String(value ?? "").trim().replace(",", ".");
}

function parsePositiveDecimal(value: string) {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) return null;

  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatPtNumber(value: number, maxFractionDigits = 3) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function describeWeight(value: string) {
  const kg = parsePositiveDecimal(value);

  if (kg == null) {
    return "Ex.: 0,200 = 200 g";
  }

  const grams = kg * 1000;

  if (grams < 1000) {
    return `Equivale a ${formatPtNumber(grams, 0)} g`;
  }

  return `Equivale a ${formatPtNumber(kg, 3)} kg (${formatPtNumber(grams, 0)} g)`;
}

function describeDimension(value: string) {
  const cm = parsePositiveDecimal(value);

  if (cm == null) {
    return "Ex.: 15 = 15 cm • 10.5 = 10 cm e meio";
  }

  if (cm < 1) {
    return `${formatPtNumber(cm, 2)} cm = ${formatPtNumber(cm * 10, 1)} mm`;
  }

  if (Number.isInteger(cm)) {
    return `${formatPtNumber(cm, 0)} cm`;
  }

  return `${formatPtNumber(cm, 2)} cm`;
}

function describeVolumes(value: string) {
  const raw = String(value ?? "").trim();
  const n = raw ? Math.max(1, Math.trunc(Number(raw) || 1)) : 1;

  return n === 1 ? "1 caixa/pacote" : `${n} caixas/pacotes`;
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

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-slate-500">{children}</p>;
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
        {icon}
      </div>

      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
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
  const [effectsText, setEffectsText] = useState("");
  const [benefitsText, setBenefitsText] = useState("");
  const [howToUseText, setHowToUseText] = useState("");

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

  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [packageVolumes, setPackageVolumes] = useState("1");

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
      setEffectsText(draft.effectsText ?? "");
      setBenefitsText(draft.benefitsText ?? "");
      setHowToUseText(draft.howToUseText ?? "");

      setStock(
        Number.isFinite(Number(draft.stock)) ? Math.max(0, Number(draft.stock)) : 0
      );
      setActive(!!draft.active);
      setCategoryId(draft.categoryId ?? "");
      setCategoryIds(Array.isArray(draft.categoryIds) ? draft.categoryIds : []);
      setCatSearch(draft.catSearch ?? "");
      setAudience(draft.audience ?? "ALL");

      setBrand(draft.brand ?? "");
      setLine(draft.line ?? "");
      setVolume(draft.volume ?? "");

      setWeightKg(draft.weightKg ?? "");
      setHeightCm(draft.heightCm ?? "");
      setWidthCm(draft.widthCm ?? "");
      setLengthCm(draft.lengthCm ?? "");
      setPackageVolumes(draft.packageVolumes ?? "1");

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
          effectsText,
          benefitsText,
          howToUseText,

          stock,
          active,
          categoryId,
          categoryIds,
          catSearch,
          audience,

          brand,
          line,
          volume,

          weightKg,
          heightCm,
          widthCm,
          lengthCm,
          packageVolumes,

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
    effectsText,
    benefitsText,
    howToUseText,

    stock,
    active,
    categoryId,
    categoryIds,
    catSearch,
    audience,

    brand,
    line,
    volume,

    weightKg,
    heightCm,
    widthCm,
    lengthCm,
    packageVolumes,

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

    await api.post(endpoints.adminTrainingVideos.finalize(productId), {
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
    });
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

  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
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

  const highlightItems = useMemo(() => parseHighlights(highlightsText), [highlightsText]);
  const effectsItems = useMemo(() => parseStringList(effectsText), [effectsText]);
  const benefitsItems = useMemo(() => parseStringList(benefitsText), [benefitsText]);
  const howToUseItems = useMemo(() => parseStringList(howToUseText), [howToUseText]);

  const pricePreview = price ? `R$ ${price}` : "—";
  const customerPricePreview = customerPrice ? `R$ ${customerPrice}` : "Usa preço padrão";

    const packageSummary = useMemo(() => {
    const weight = parsePositiveDecimal(weightKg);
    const height = parsePositiveDecimal(heightCm);
    const width = parsePositiveDecimal(widthCm);
    const length = parsePositiveDecimal(lengthCm);

    const volumes = Math.max(1, Math.trunc(Number(packageVolumes || 1) || 1));

    const parts: string[] = [];

    if (length != null || width != null || height != null) {
      parts.push(
        `${length != null ? formatPtNumber(length, 2) : "—"} × ${
          width != null ? formatPtNumber(width, 2) : "—"
        } × ${height != null ? formatPtNumber(height, 2) : "—"} cm`
      );
    }

    if (weight != null) {
      const grams = weight * 1000;
      parts.push(
        grams < 1000
          ? `${formatPtNumber(grams, 0)} g`
          : `${formatPtNumber(weight, 3)} kg`
      );
    }

    parts.push(volumes === 1 ? "1 volume" : `${volumes} volumes`);

    return parts.length
      ? parts.join(" • ")
      : "Preencha peso e medidas da embalagem.";
  }, [weightKg, heightCm, widthCm, lengthCm, packageVolumes]);

  const createM = useMutation({
    mutationFn: async () => {
      const skuN = sku.trim();
      const nameN = name.trim();
      const priceN = normalizeDecimalInput(price);
      const customerPriceN = normalizeDecimalInput(customerPrice);

      const weightKgN = normalizeDecimalInput(weightKg);
      const heightCmN = normalizeDecimalInput(heightCm);
      const widthCmN = normalizeDecimalInput(widthCm);
      const lengthCmN = normalizeDecimalInput(lengthCm);

      const packageVolumesRaw = String(packageVolumes ?? "").trim();
      const packageVolumesN = packageVolumesRaw
        ? Math.max(1, Math.trunc(Number(packageVolumesRaw)))
        : 1;

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
        effects?: string[];
        benefits?: string[];
        howToUse?: string[];

        brand?: string | null;
        line?: string | null;
        volume?: string | null;

        weightKg?: string | null;
        heightCm?: string | null;
        widthCm?: string | null;
        lengthCm?: string | null;
        packageVolumes: number;
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
        weightKg: weightKgN ? weightKgN : null,
        heightCm: heightCmN ? heightCmN : null,
        widthCm: widthCmN ? widthCmN : null,
        lengthCm: lengthCmN ? lengthCmN : null,
        packageVolumes: Number.isFinite(packageVolumesN) ? packageVolumesN : 1,
      };

      const desc = description.trim();
      if (desc) payload.description = desc;

      const highlights = parseHighlights(highlightsText);
      if (highlights.length) payload.highlights = highlights;

      const effects = parseStringList(effectsText);
      if (effects.length) payload.effects = effects;

      const benefits = parseStringList(benefitsText);
      if (benefits.length) payload.benefits = benefits;

      const howToUse = parseStringList(howToUseText);
      if (howToUse.length) payload.howToUse = howToUse;

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

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f5f7fb]">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[34px] font-bold tracking-[-0.03em] text-slate-950 sm:text-[40px]">
              Novo Produto
            </div>
            <div className="mt-1 text-sm text-slate-600 sm:text-base">
              Preencha as informações para criar o produto no catálogo
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl border-slate-200 bg-white px-6 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => router.replace(returnTo)}
              disabled={createM.isPending}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              form="new-product-form"
              disabled={createM.isPending}
              className="h-12 rounded-2xl bg-[#18a999] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#159989]"
            >
              {createM.isPending ? "Criando..." : "Criar Produto"}
            </Button>
          </div>
        </div>

        <form
          id="new-product-form"
          onSubmit={(e) => {
            e.preventDefault();
            createM.mutate();
          }}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]"
        >
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-5 sm:p-7">
                <SectionHeader
                  icon={<Package2 className="h-5 w-5" />}
                  title="Dados do Produto"
                  subtitle='Preencha e clique em "Criar".'
                />

                <div className="grid gap-5 xl:grid-cols-4">
                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">SKU</Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Ex: SHAMPOO-001"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">Nome</Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Shampoo Premium"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">Marca</Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="Ex: Wella"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Linha / Família
                    </Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={line}
                      onChange={(e) => setLine(e.target.value)}
                      placeholder="Ex: Fusion"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">Volume</Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      placeholder="Ex: 500ml"
                      maxLength={20}
                    />
                    <FieldHint>Máx. 20 caracteres.</FieldHint>
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Estoque
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={String(stock)}
                      onChange={(e) => setStock(Math.max(0, Number(e.target.value || 0)))}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Preço <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="59.90"
                      inputMode="decimal"
                    />
                    <FieldHint>Use o formato que seu backend espera.</FieldHint>
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Preço cliente final <span className="text-slate-400">(opcional)</span>
                    </Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(e.target.value)}
                      placeholder="49.90"
                      inputMode="decimal"
                    />
                    <FieldHint>Se vazio, cliente final usa o preço padrão.</FieldHint>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <Label className="text-sm font-medium text-slate-800">
                      Descrição do produto
                    </Label>
                    <Textarea
                      className="min-h-[110px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Texto principal que o usuário verá primeiro."
                    />
                    <FieldHint>
                      Essa será a descrição exibida no app.
                    </FieldHint>
                  </div>
                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Benefício
                    </Label>
                    <Textarea
                      className="min-h-[140px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                      value={effectsText}
                      onChange={(e) => setEffectsText(e.target.value)}
                      placeholder={"Um por linha\nBrilho intenso\nRedução de frizz"}
                    />
                    <FieldHint>Um item por linha.</FieldHint>
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Ativos e funções
                    </Label>
                    <Textarea
                      className="min-h-[140px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                      value={benefitsText}
                      onChange={(e) => setBenefitsText(e.target.value)}
                      placeholder={"Um por linha\nHidratação profunda\nMaciez"}
                    />
                    <FieldHint>Um item por linha.</FieldHint>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <Label className="text-sm font-medium text-slate-800">
                      Modo de uso
                    </Label>
                    <Textarea
                      className="min-h-[150px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                      value={howToUseText}
                      onChange={(e) => setHowToUseText(e.target.value)}
                      placeholder={
                        "Um passo por linha\nAplique nos cabelos úmidos\nMassageie\nEnxágue"
                      }
                    />
                    <FieldHint>Um passo por linha.</FieldHint>
                  </div>

<div className="xl:col-span-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
  <div className="mb-4">
    <div className="text-sm font-semibold text-slate-900">
      Logística / Embalagem
    </div>

    <p className="mt-1 text-xs text-slate-500">
      Preencha o tamanho da embalagem em <span className="font-semibold">centímetros</span> e o peso em <span className="font-semibold">quilogramas</span>.
    </p>

    <p className="mt-1 text-xs text-slate-500">
      Exemplo: <span className="font-semibold">15</span> = 15 cm •{" "}
      <span className="font-semibold">10.5</span> = 10 cm e meio •{" "}
      <span className="font-semibold">0.200</span> = 200 g
    </p>
  </div>

  <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Peso da embalagem (kg)
        </Label>
      </div>

      <Input
        className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
        value={weightKg}
        onChange={(e) => setWeightKg(e.target.value)}
        placeholder="Ex.: 0.200"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px]">
        <FieldHint>{describeWeight(weightKg)}</FieldHint>
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Altura da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
        value={heightCm}
        onChange={(e) => setHeightCm(e.target.value)}
        placeholder="Ex.: 10"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px]">
        <FieldHint>{describeDimension(heightCm)}</FieldHint>
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Largura da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
        value={widthCm}
        onChange={(e) => setWidthCm(e.target.value)}
        placeholder="Ex.: 15"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px]">
        <FieldHint>{describeDimension(widthCm)}</FieldHint>
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Comprimento da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
        value={lengthCm}
        onChange={(e) => setLengthCm(e.target.value)}
        placeholder="Ex.: 10"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px]">
        <FieldHint>{describeDimension(lengthCm)}</FieldHint>
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Quantidade de volumes
        </Label>
      </div>

      <Input
        type="number"
        min={1}
        step={1}
        className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
        value={packageVolumes}
        onChange={(e) => setPackageVolumes(e.target.value)}
        placeholder="1"
        inputMode="numeric"
      />

      <div className="mt-2 min-h-[20px]">
        <FieldHint>{describeVolumes(packageVolumes)}</FieldHint>
      </div>
    </div>
  </div>

  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-emerald-800">
      Resumo da embalagem
    </div>
    <p className="mt-1 text-sm font-medium text-slate-900">{packageSummary}</p>
  </div>
</div>

                  <div className="space-y-2 xl:col-span-4">
                    <Label className="text-sm font-medium text-slate-800">
                      Imagens do produto <span className="text-slate-400">(opcional)</span>
                    </Label>

                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
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
                            className="h-11 rounded-2xl bg-[#e8f8f5] px-4 text-sm font-semibold text-[#16897d] hover:bg-[#d9f3ee]"
                            variant="ghost"
                            onClick={() =>
                              document.getElementById("product-image-input")?.click()
                            }
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Enviar imagem
                          </Button>

                          <span className="text-sm text-slate-500">
                            JPG, PNG ou WEBP
                          </span>
                        </div>
                      </div>

                      {files.length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-xs font-medium text-slate-700">
                              {files.length === 1
                                ? files[0].name
                                : `${files.length} imagens selecionadas`}
                            </div>

                            <button
                              type="button"
                              onClick={() => setFiles([])}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {previewUrls.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                              {previewUrls.slice(0, 6).map((url, index) => (
                                <div
                                  key={`${url}-${index}`}
                                  className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                                >
                                  <img
                                    src={url}
                                    alt={`Preview ${index + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <p className="mt-2 text-[11px] text-slate-500">
                            As imagens serão enviadas após criar. A primeira vira primária.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-5 sm:p-7">
                <SectionHeader
                  icon={<Video className="h-5 w-5" />}
                  title="Vídeo do produto"
                  subtitle="Opcional"
                />

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Título do vídeo
                    </Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder="Ex: Como aplicar corretamente"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-800">Ordem</Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      type="number"
                      value={videoSortOrder}
                      onChange={(e) => setVideoSortOrder(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <Label className="text-sm font-medium text-slate-800">
                    Descrição do vídeo
                  </Label>
                  <Textarea
                    className="min-h-[92px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                    value={videoDescription}
                    onChange={(e) => setVideoDescription(e.target.value)}
                    placeholder="Ex: Passo a passo de aplicação, modo de uso, cuidados..."
                  />
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto_auto] xl:items-end">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Thumbnail URL <span className="text-slate-400">(opcional)</span>
                    </Label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] shadow-none placeholder:text-slate-400"
                      value={videoThumbnailUrl}
                      onChange={(e) => setVideoThumbnailUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <label className="flex h-12 min-w-[150px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800">
                    <Checkbox
                      checked={videoActive}
                      onCheckedChange={(checked) => setVideoActive(checked === true)}
                    />
                    Vídeo ativo
                  </label>

                  <label className="flex h-12 min-w-[230px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800">
                    <Checkbox
                      checked={videoShowInGallery}
                      onCheckedChange={(checked) =>
                        setVideoShowInGallery(checked === true)
                      }
                    />
                    Mostrar na galeria
                  </label>
                </div>

                <div className="mt-5 space-y-2">
                  <Label className="text-sm font-medium text-slate-800">
                    Arquivo do vídeo
                  </Label>

                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          id="product-video-input"
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-2xl bg-[#e8f8f5] px-4 text-sm font-semibold text-[#16897d] hover:bg-[#d9f3ee]"
                          onClick={() => document.getElementById("product-video-input")?.click()}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Enviar vídeo
                        </Button>

                        <span className="text-sm text-slate-500">MP4, MOV ou WEBM</span>
                      </div>
                    </div>

                    {videoFile ? (
                      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                        <div>
                          <span className="font-medium text-slate-700">{videoFile.name}</span>
                          <span className="ml-2 text-slate-400">
                            • {Math.round(videoFile.size / 1024)} KB
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setVideoFile(null)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <FieldHint>O vídeo será enviado após criar o produto.</FieldHint>
                </div>

                <Separator className="my-7" />

                <div className="grid gap-6 xl:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <Label className="text-sm font-medium text-slate-800">
                        Destaques (1 por linha)
                      </Label>
                      <span className="text-sm text-slate-400">Máx. 10</span>
                    </div>

                    <Textarea
                      className="min-h-[180px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-[15px] shadow-none placeholder:text-slate-400"
                      value={highlightsText}
                      onChange={(e) => setHighlightsText(e.target.value)}
                      placeholder={"Um destaque por linha\nSem sal\nUso profissional"}
                    />
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-900">
                      Prévia dos destaques
                    </div>

                    {highlightItems.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {highlightItems.map((item, index) => (
                          <span
                            key={`${item}-${index}`}
                            className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Os destaques digitados aparecerão aqui.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[30px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[18px] font-semibold text-slate-900">Status</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Controle de publicação e audiência.
                    </p>
                  </div>

                  <div
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.03em]",
                      active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-600",
                    ].join(" ")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {active ? "Ativo" : "Inativo"}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Produto ativo
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Produto ativo aparece no catálogo.
                      </p>
                    </div>

                    <Checkbox
                      checked={active}
                      onCheckedChange={(checked) => setActive(checked === true)}
                    />
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-900">
                      Audiência
                    </div>

                    <Select
                      value={audience}
                      onValueChange={(v: ProductAudience) => setAudience(v)}
                    >
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] text-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        <SelectItem value="STAFF_ONLY">STAFF_ONLY</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          Disponível para cliente final
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Quando a audiência for ALL, o cliente também enxerga.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setAudience((v) => (v === "ALL" ? "STAFF_ONLY" : "ALL"))
                        }
                        className={[
                          "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.03em] transition",
                          availableToCustomer
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {availableToCustomer ? "CLIENTE VÊ" : "INTERNO"}
                      </button>
                    </div>

                    <div className="pt-4">
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-emerald-700">
                        {audience}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-5">
                <div className="mb-5 text-[18px] font-semibold text-slate-900">Categorias</div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-800">
                      Categoria principal <span className="text-slate-400">(opcional)</span>
                    </Label>

                    <Select
                      value={categoryId || "none"}
                      onValueChange={(v: string) => {
                        const next = v === "none" ? "" : v;
                        setCategoryId(next);
                        setCatSearch("");
                        if (next) setCategoryIds((prev) => prev.filter((x) => x !== next));
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 text-[15px] text-slate-700">
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
                      <div className="text-xs text-slate-500">Carregando categorias...</div>
                    ) : null}

                    {categoriesQ.isError ? (
                      <div className="text-xs text-red-600">
                        Erro ao carregar categorias.
                      </div>
                    ) : null}

                    <div className="text-xs text-slate-500">
                      {selectedCategoryName ? (
                        <>
                          Selecionada:{" "}
                          <span className="font-semibold text-slate-700">
                            {selectedCategoryName}
                          </span>
                        </>
                      ) : (
                        "Nenhuma categoria principal."
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Categorias adicionais
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {categoryIds.length}
                      </span>
                    </div>

                    <div className="relative mb-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={catSearch}
                        onChange={(e) => setCatSearch(e.target.value)}
                        placeholder="Buscar categoria..."
                        className="h-11 rounded-2xl border-slate-200 bg-white pl-10 text-[14px] shadow-none placeholder:text-slate-400"
                      />
                    </div>

                    {selectedExtraCategories.length > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {selectedExtraCategories.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setCategoryIds((prev) => prev.filter((id) => id !== c.id))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800"
                          >
                            {c.name}
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                      {filteredExtraCategories.map((c) => {
                        const checked = categoryIds.includes(c.id);

                        return (
                          <label
                            key={c.id}
                            className={[
                              "flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
                              checked
                                ? "border-sky-200 bg-sky-50 text-sky-900"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setCategoryIds((prev) => toggleCategoryId(c.id, prev))
                              }
                            />
                            <span className="truncate">{c.name}</span>
                          </label>
                        );
                      })}

                      {!filteredExtraCategories.length ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                          Nenhuma categoria encontrada.
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Preenche <code>categoryIds</code>. A principal (
                      <code>categoryId</code>) é opcional.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="p-5">
                <div className="mb-4 text-[18px] font-semibold text-slate-900">
                  Resumo rápido
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Preço</span>
                    <span className="font-semibold text-slate-900">{pricePreview}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Preço cliente</span>
                    <span className="font-semibold text-slate-900">
                      {customerPricePreview}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Estoque</span>
                    <span className="font-semibold text-slate-900">{stock}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Imagens</span>
                    <span className="font-semibold text-slate-900">{files.length}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Vídeo</span>
                    <span className="font-semibold text-slate-900">
                      {videoFile ? "Selecionado" : "Nenhum"}
                    </span>
                  </div>

                  <Separator className="my-2" />

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Conteúdo
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Destaques</span>
                        <span className="font-semibold text-slate-900">
                          {highlightItems.length}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                       <span className="text-slate-500">Benefícios</span>
                        <span className="font-semibold text-slate-900">
                          {effectsItems.length}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Ativos e funções</span>
                        <span className="font-semibold text-slate-900">
                          {benefitsItems.length}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Modo de uso</span>
                        <span className="font-semibold text-slate-900">
                          {howToUseItems.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}