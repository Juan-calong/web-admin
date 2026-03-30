"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Upload,
  Trash2,
  Star,
  RefreshCw,
  Tag,
  Image as ImageIcon,
  Clapperboard,
  Eye,
  Loader2,
} from "lucide-react";
import { ProductStatusPanel } from "@/components/admin/ProductStatusPanel";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type PromoAppliesTo = "SELLER" | "SALON" | "CUSTOMER" | "BOTH";
type DiscountType = "PCT" | "FIXED" | "PRICE";
type ProductAudience = "ALL" | "STAFF_ONLY";

type ProductImage = {
  id: string;
  url: string;
  key?: string;
  isPrimary?: boolean | null;
  sort?: number | null;
  mime?: string | null;
  size?: number | null;
};

type TrainingVideoItem = {
  id: string;
  title: string;
  description?: string | null;
  publicUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  active: boolean;
  sortOrder: number;
  showInGallery?: boolean;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;

  description?: string | null;

  price: string;
  active: boolean;
  stock?: number | null;
  customerPrice?: string | null;
  effectivePrice?: string | null;

  categoryId?: string | null;
  categoryIds?: string[] | null;
  categories?: { id: string; name: string; active: boolean }[] | null;
  categoryLinks?: { category: { id: string; name: string; active: boolean } }[] | null;

  audience?: ProductAudience | null;

  highlights?: string[] | null;
  brand?: string | null;
  line?: string | null;
  volume?: string | null;

  effects?: string[] | null;
  benefits?: string[] | null;
  howToUse?: string[] | null;

  weightKg?: string | null;
  heightCm?: string | null;
  widthCm?: string | null;
  lengthCm?: string | null;
  packageVolumes?: number | null;
  images?: ProductImage[];
};

type Category = {
  id: string;
  name: string;
  active: boolean;
};

type ProductPromotion = {
  id: string;
  productId: string;
  appliesTo: PromoAppliesTo;
  type: DiscountType;
  value: string | number;
  active: boolean;
  startsAt: string;
  endsAt?: string | null;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
  isActiveNow?: boolean;
  [k: string]: unknown;
};

type EditDraft = {
  sku: string;
  name: string;
  price: string;

  description: string;

  customerPrice: string;
  highlightsText: string;
  effectsText: string;
  benefitsText: string;
  howToUseText: string;

  active: boolean;
  stock: number;
  categoryId: string;
  categoryIds: string[];
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

function getDraftKey(productId: string) {
  return `admin-product-edit-draft:${productId}`;
}

function readDraft(productId: string): EditDraft | null {
  try {
    const raw = sessionStorage.getItem(getDraftKey(productId));
    if (!raw) return null;
    return JSON.parse(raw) as EditDraft;
  } catch {
    return null;
  }
}

function clearDraft(productId: string) {
  try {
    sessionStorage.removeItem(getDraftKey(productId));
  } catch {}
}

function normalizeMoney(s: string) {
  return s.trim().replace(",", ".");
}

function parseNumberBR(s: string) {
  const n = Number(String(s ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function datetimeLocalToISO(local: string) {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDatetimeLocalValue(v?: string | Date | null) {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function stableIdem(prefix: string, parts: Record<string, unknown>) {
  const keys = Object.keys(parts).sort();
  const flat = keys.map((k) => `${k}=${String(parts[k])}`).join("&");
  return `${prefix}:${flat}`;
}

async function idemKey(prefix: string, payload: unknown) {
  const json = JSON.stringify(payload);

  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${prefix}:${b64}`;
}

function sanitizeMoneyInput(v: string) {
  let s = String(v ?? "").replace(/[^\d.,]/g, "");
  const firstSepIndex = s.search(/[.,]/);
  if (firstSepIndex >= 0) {
    const head = s.slice(0, firstSepIndex);
    const tail = s.slice(firstSepIndex + 1).replace(/[.,]/g, "");
    s = head + s[firstSepIndex] + tail;
  }
  s = s.replace(/^[.,]/, "");
  return s;
}

function sanitizeIntInput(v: string) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function parsePositiveDecimal(value: string) {
  const normalized = normalizeMoney(String(value ?? ""));
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
    return "Ex.: 15 = 15 cm • 10,5 = 10 cm e meio";
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


function statusPill(active: boolean) {
  return active
    ? "bg-emerald-600 text-white border-transparent"
    : "bg-zinc-200 text-zinc-900 border-transparent";
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

function toggleCategoryId(id: string, prev: string[]) {
  return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
}

function SectionCard({
  title,
  description,
  icon,
  defaultOpen = true,
  children,
  right,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <details open={defaultOpen} className="group">
        <summary className="list-none cursor-pointer">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {icon ? (
                  <div className="grid h-9 w-9 place-items-center rounded-2xl bg-sky-100 text-sky-700">
                    {icon}
                  </div>
                ) : null}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                  {description ? (
                    <p className="text-sm text-slate-500">{description}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {right}
              <div className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition group-open:bg-slate-900 group-open:text-white">
                {defaultOpen ? "Seção" : "Abrir"}
              </div>
            </div>
          </div>
        </summary>

        <CardContent className="space-y-4 p-5">{children}</CardContent>
      </details>
    </Card>
  );
}

const promoEndpoints = {
  list: (productId: string) => `/admin/products/${productId}/promotions`,
  create: (productId: string) => `/admin/products/${productId}/promotions`,
  patch: (productId: string, promoId: string) =>
    `/admin/products/${productId}/promotions/${promoId}`,
  disable: (productId: string, promoId: string) =>
    `/admin/products/${productId}/promotions/${promoId}/disable`,
};

export default function EditProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const returnTo = searchParams.get("returnTo") || "/admin/products";
  const didHydrateDraftRef = useRef(false);

  function appliesToLabel(v: string) {
    if (v === "SELLER") return "Vendedor";
    if (v === "SALON") return "Salão";
    if (v === "BOTH") return "Ambos";
    if (v === "CUSTOMER") return "Cliente final";
    return v;
  }

  function promoConflictMsg(appliesTo: string) {
    if (appliesTo === "BOTH") {
      return "Conflito: já existe promo ativa (Cliente final/Salão/Vendedor) nesse período.";
    }
    return `Conflito: já existe promo ativa para ${appliesToLabel(appliesTo)} nesse período.`;
  }

  useEffect(() => {
    if (id === "new") router.replace("/admin/products/new");
  }, [id, router]);

  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const res = await api.get(endpoints.products.byId(id));
      const raw = res.data;
      return (raw?.item ?? raw) as Product;
    },
    enabled: id !== "new",
    retry: false,
    refetchOnWindowFocus: false,
  });

  const categoriesQ = useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const res = await api.get(endpoints.categories.list);
      return (res.data?.items ?? []) as Category[];
    },
    retry: false,
  });

  const categories = useMemo(() => {
    const items = categoriesQ.data ?? [];
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, [categoriesQ.data]);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");
  const [highlightsText, setHighlightsText] = useState("");
  const [effectsText, setEffectsText] = useState("");
  const [benefitsText, setBenefitsText] = useState("");
  const [howToUseText, setHowToUseText] = useState("");
  const [active, setActive] = useState(true);
  const [stock, setStock] = useState<number>(0);

  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [audience, setAudience] = useState<ProductAudience>("ALL");
  const availableToCustomer = audience === "ALL";

  const [files, setFiles] = useState<File[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [videoSortOrder, setVideoSortOrder] = useState("0");
  const [videoActive, setVideoActive] = useState(true);
  const [videoShowInGallery, setVideoShowInGallery] = useState(true);
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState("");

  const [brand, setBrand] = useState("");
  const [line, setLine] = useState("");

  const [volume, setVolume] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [packageVolumes, setPackageVolumes] = useState("1");
  const product = productQ.data ?? null;

  useEffect(() => {
    if (!product) return;
    if (didHydrateDraftRef.current) return;

    const draft = readDraft(id);

    if (draft) {
      setSku(draft.sku ?? "");
      setName(draft.name ?? "");
      setPrice(draft.price ?? "");
      setDescription(draft.description ?? "");
      setCustomerPrice(draft.customerPrice ?? "");
      setHighlightsText(draft.highlightsText ?? "");
      setEffectsText(draft.effectsText ?? "");
      setBenefitsText(draft.benefitsText ?? "");
      setHowToUseText(draft.howToUseText ?? "");
      setActive(!!draft.active);
      setStock(Math.max(0, Number(draft.stock ?? 0)));
      setCategoryId(draft.categoryId ?? "");
      setCategoryIds(Array.isArray(draft.categoryIds) ? draft.categoryIds : []);
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
      didHydrateDraftRef.current = true;
      return;
    }

    setSku(product.sku ?? "");
    setName(product.name ?? "");
    setPrice(String(product.price ?? ""));
    setCustomerPrice(product.customerPrice != null ? String(product.customerPrice) : "");
    setDescription(product.description ?? "");
    setBrand(product.brand ?? "");
    setLine(product.line ?? "");
    setVolume(product.volume ?? "");
    setEffectsText((product.effects ?? []).join("\n"));
    setBenefitsText((product.benefits ?? []).join("\n"));
    setHowToUseText((product.howToUse ?? []).join("\n"));
    setWeightKg(product.weightKg != null ? String(product.weightKg) : "");
    setHeightCm(product.heightCm != null ? String(product.heightCm) : "");
    setWidthCm(product.widthCm != null ? String(product.widthCm) : "");
    setLengthCm(product.lengthCm != null ? String(product.lengthCm) : "");
    setPackageVolumes(
      product.packageVolumes != null ? String(product.packageVolumes) : "1"
    );
    setHighlightsText((product.highlights ?? []).join("\n"));
    setActive(!!product.active);
    setStock(Math.max(0, Number(product.stock ?? 0)));

    const main = product.categoryId ?? "";

    const idsFromCategoryIds =
      Array.isArray(product.categoryIds) && product.categoryIds.length > 0
        ? product.categoryIds
        : [];

    const idsFromCategories =
      Array.isArray(product.categories) && product.categories.length > 0
        ? product.categories.map((c) => c.id)
        : [];

    const idsFromCategoryLinks =
      Array.isArray(product.categoryLinks) && product.categoryLinks.length > 0
        ? product.categoryLinks
            .map((link) => link?.category?.id)
            .filter(Boolean)
        : [];

    const ids = Array.from(
      new Set([
        ...idsFromCategoryIds,
        ...idsFromCategories,
        ...idsFromCategoryLinks,
        ...(main ? [main] : []),
      ])
    );

    setCategoryId(main);
    setCategoryIds(ids.filter((x: string) => x !== main));
    if (product.audience) setAudience(product.audience);

    didHydrateDraftRef.current = true;
  }, [product, id]);

  useEffect(() => {
    if (!didHydrateDraftRef.current) return;

    try {
      sessionStorage.setItem(
        getDraftKey(id),
        JSON.stringify({
          sku,
          name,
          price,
          description,
          effectsText,
          benefitsText,
          howToUseText,
          customerPrice,
          highlightsText,
          active,
          stock,
          categoryId,
          categoryIds,
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
        } satisfies EditDraft)
      );
    } catch {}
  }, [
    id,
    sku,
    name,
    price,
    description,
    customerPrice,
    highlightsText,
    active,
    stock,
    effectsText,
    benefitsText,
    howToUseText,
    categoryId,
    categoryIds,
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

  const images = product?.images ?? [];
  const primaryUrl =
    images.find((x) => x.isPrimary)?.url ??
    [...images].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]?.url ??
    null;

  const saveM = useMutation({
    mutationFn: async () => {
      const skuN = sku.trim();
      const nameN = name.trim();

      if (!skuN) throw new Error("SKU é obrigatório.");
      if (!nameN) throw new Error("Nome é obrigatório.");

      const priceSan = normalizeMoney(price);
      const priceNum = parseNumberBR(priceSan);
      const weightKgSan = weightKg.trim() ? normalizeMoney(weightKg) : null;
      const heightCmSan = heightCm.trim() ? normalizeMoney(heightCm) : null;
      const widthCmSan = widthCm.trim() ? normalizeMoney(widthCm) : null;
      const lengthCmSan = lengthCm.trim() ? normalizeMoney(lengthCm) : null;

      const packageVolumesNum = packageVolumes.trim()
        ? Math.max(1, Math.trunc(Number(packageVolumes)))
        : 1;

      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error("Preço inválido. Use um valor maior que 0 (ex.: 59,90).");
      }

      const stockSafe = Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;
      const highlights = parseHighlights(highlightsText);
      const effects = parseStringList(effectsText);
      const benefits = parseStringList(benefitsText);
      const howToUse = parseStringList(howToUseText);

      const payload = {
        sku: skuN,
        name: nameN,
        description: description.trim() ? description.trim() : null,
        price: priceSan,
        customerPrice: customerPrice.trim() ? normalizeMoney(customerPrice) : null,
        active: Boolean(active),
        stock: stockSafe,
        categoryId: categoryId ? categoryId : null,
        categoryIds: Array.from(new Set([...(categoryIds ?? []), ...(categoryId ? [categoryId] : [])])),
        audience,
        highlights,
        effects,
        benefits,
        howToUse,
        brand: brand.trim() ? brand.trim() : null,
        line: line.trim() ? line.trim() : null,
        volume: volume.trim() ? volume.trim() : null,


        weightKg: weightKgSan,
        heightCm: heightCmSan,
        widthCm: widthCmSan,
        lengthCm: lengthCmSan,
        packageVolumes: Number.isFinite(packageVolumesNum) ? packageVolumesNum : 1,
      };

      const idem = await idemKey(`product-update:${id}`, payload);

      await api.patch(endpoints.products.update(id), payload, {
        headers: { "Idempotency-Key": idem },
      });
    },
    onSuccess: async () => {
      clearDraft(id);
      toast.success("Produto salvo.");
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["product", id] });
      router.replace(returnTo);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Falha ao salvar.")),
  });

  const uploadM = useMutation({
    mutationFn: async () => {
      setUploadErr(null);
      if (!files.length) throw new Error("Selecione ao menos uma imagem.");

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        const contentType =
          file.type === "image/jpg"
            ? "image/jpeg"
            : file.type || "application/octet-stream";

        const presignRes = await api.post(
          endpoints.products.images.presign(id),
          {
            contentType,
            size: file.size,
            filename: file.name,
            mime: contentType,
          },
          {
            headers: {
              "Idempotency-Key": `prod-img-presign:${id}:${index}:${file.name}:${file.size}`,
            },
          }
        );

        const { uploadUrl, publicUrl, key } = presignRes.data ?? {};
        if (!uploadUrl || !key) {
          throw new Error("Presign inválido: faltou uploadUrl/key.");
        }

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });

        if (!putRes.ok) {
          const t = await putRes.text().catch(() => "");
          throw new Error(`Falha no upload (PUT): ${putRes.status} ${t}`.slice(0, 200));
        }

        await api.post(
          endpoints.products.images.confirm(id),
          {
            key,
            url: publicUrl,
            mime: contentType,
            size: file.size,
            sort: (images?.length ?? 0) + index,
            isPrimary: (images?.length ?? 0) === 0 && index === 0,
          },
          {
            headers: {
              "Idempotency-Key": `prod-img-confirm:${id}:${index}:${key}`,
            },
          }
        );
      }
    },
    onSuccess: async () => {
      toast.success(files.length > 1 ? "Imagens enviadas." : "Imagem enviada.");
      setFiles([]);
      await qc.invalidateQueries({ queryKey: ["product", id] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      await productQ.refetch();
    },
    onError: (err: unknown) => {
      const msg = apiErrorMessage(err, "Falha no upload.");
      setUploadErr(msg);
      toast.error(msg);
    },
  });

  const deleteImgM = useMutation({
    mutationFn: async (imageId: string) => {
      await api.delete(endpoints.products.images.delete(id, imageId), {
        headers: { "Idempotency-Key": `prod-img-del:${id}:${imageId}` },
      });
    },
    onSuccess: async () => {
      toast.message("Imagem removida.");
      await qc.invalidateQueries({ queryKey: ["product", id] });
      await productQ.refetch();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Falha ao remover imagem.")),
  });

  const setPrimaryM = useMutation({
    mutationFn: async (primaryImageId: string) => {
      await api.patch(
        endpoints.products.images.update(id),
        { primaryImageId },
        { headers: { "Idempotency-Key": `prod-img-primary:${id}:${primaryImageId}` } }
      );
    },
    onSuccess: async () => {
      toast.success("Imagem primária atualizada.");
      await qc.invalidateQueries({ queryKey: ["product", id] });
      await productQ.refetch();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Falha ao definir primária.")),
  });

  const videosQ = useQuery({
    queryKey: ["admin-product-videos", id],
    enabled: id !== "new",
    queryFn: async () => {
      const { data } = await api.get(endpoints.adminTrainingVideos.adminList(id));
      return (data?.items ?? []) as TrainingVideoItem[];
    },
    retry: false,
  });

  const videos = videosQ.data ?? [];

  const uploadVideoM = useMutation({
    mutationFn: async () => {
      if (!videoFile) throw new Error("Selecione um vídeo.");
      if (!videoFile.type.startsWith("video/")) {
        throw new Error("Arquivo inválido. Envie um vídeo.");
      }

      const initResponse = await api.post(
        endpoints.adminTrainingVideos.initUpload(id),
        {
          fileName: videoFile.name,
          contentType: videoFile.type,
          scope: "PRODUCT",
          productId: id,
        }
      );

      const { uploadUrl, objectKey } = initResponse.data ?? {};
      if (!uploadUrl || !objectKey) {
        throw new Error("Init do vídeo inválido.");
      }

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": videoFile.type,
        },
        body: videoFile,
      });

      if (!putResponse.ok) {
        throw new Error("Falha ao enviar vídeo para o storage.");
      }

      await api.post(
        endpoints.adminTrainingVideos.finalize(id),
        {
          productId: id,
          scope: "PRODUCT",
          objectKey,
          title:
            videoTitle.trim() ||
            name.trim() ||
            videoFile.name.replace(/\.[^/.]+$/, ""),
          description: videoDescription.trim() || null,
          mimeType: videoFile.type,
          sizeBytes: videoFile.size,
          sortOrder: Number(videoSortOrder || 0),
          active: videoActive,
          showInGallery: videoShowInGallery,
          thumbnailUrl: videoThumbnailUrl.trim() || null,
          originalName: videoFile.name,
        }
      );
    },
    onSuccess: async () => {
      toast.success("Vídeo enviado.");
      setVideoFile(null);
      setVideoTitle("");
      setVideoDescription("");
      setVideoSortOrder("0");
      setVideoActive(true);
      setVideoShowInGallery(true);
      setVideoThumbnailUrl("");

      await qc.invalidateQueries({ queryKey: ["admin-product-videos", id] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Falha ao enviar vídeo."));
    },
  });

  const patchVideoM = useMutation({
    mutationFn: async ({
      videoId,
      payload,
    }: {
      videoId: string;
      payload: {
        active?: boolean;
        showInGallery?: boolean;
      };
    }) => {
      await api.patch(endpoints.adminTrainingVideos.update(videoId), payload);
    },
    onSuccess: async () => {
      toast.success("Vídeo atualizado.");
      await qc.invalidateQueries({ queryKey: ["admin-product-videos", id] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Falha ao atualizar vídeo."));
    },
  });

  const deleteVideoM = useMutation({
    mutationFn: async (videoId: string) => {
      await api.delete(endpoints.adminTrainingVideos.remove(videoId));
    },
    onSuccess: async () => {
      toast.success("Vídeo removido.");
      await qc.invalidateQueries({ queryKey: ["admin-product-videos", id] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Falha ao remover vídeo."));
    },
  });

  const promosQ = useQuery({
    queryKey: ["admin-product-promos", id],
    enabled: id !== "new",
    queryFn: async () => {
      const res = await api.get(promoEndpoints.list(id));
      return (res.data?.items ?? res.data ?? []) as ProductPromotion[];
    },
    retry: false,
  });

  const promos = useMemo(() => {
    const list = promosQ.data ?? [];
    return [...list].sort((a, b) => {
      const an = a.isActiveNow ? 1 : 0;
      const bn = b.isActiveNow ? 1 : 0;
      if (an !== bn) return bn - an;
      if ((a.priority ?? 0) !== (b.priority ?? 0))
        return (b.priority ?? 0) - (a.priority ?? 0);
      return String(b.startsAt ?? "").localeCompare(String(a.startsAt ?? ""));
    });
  }, [promosQ.data]);

  const [pAppliesTo, setPAppliesTo] = useState<PromoAppliesTo>("BOTH");
  const [pType, setPType] = useState<DiscountType>("PCT");
  const [pValue, setPValue] = useState("");
  const [pStartsAt, setPStartsAt] = useState("");
  const [pEndsAt, setPEndsAt] = useState("");
  const [pPriority, setPPriority] = useState("0");
  const [pActive, setPActive] = useState(true);

  useEffect(() => {
    if (!pStartsAt) setPStartsAt(toDatetimeLocalValue(new Date()));
  }, [pStartsAt]);

  function validatePromo(type: DiscountType, valueNum: number) {
    if (type === "PCT" && (valueNum <= 0 || valueNum > 100))
      return "Para Percentual (%), o valor deve ser > 0 e ≤ 100.";
    if ((type === "FIXED" || type === "PRICE") && valueNum <= 0)
      return "Para valores em R$, o valor deve ser > 0.";
    return null;
  }

  const createPromoM = useMutation({
    mutationFn: async () => {
      const valueNum = parseNumberBR(pValue);
      if (!Number.isFinite(valueNum)) throw new Error("Informe um valor válido.");
      const msg = validatePromo(pType, valueNum);
      if (msg) throw new Error(msg);

      if (!pStartsAt) throw new Error("Informe a data/hora de início.");
      const startsISO = datetimeLocalToISO(pStartsAt);
      if (!startsISO) throw new Error("Início inválido.");

      const endsISO = pEndsAt ? datetimeLocalToISO(pEndsAt) : null;
      if (pEndsAt && !endsISO) throw new Error("Fim inválido.");

      if (endsISO) {
        const a = new Date(startsISO).getTime();
        const b = new Date(endsISO).getTime();
        if (!(b > a)) throw new Error("O fim deve ser maior que o início.");
      }

      const priorityNum = pPriority.trim() ? Number(pPriority) : 0;
      if (!Number.isFinite(priorityNum) || !Number.isInteger(priorityNum) || priorityNum < 0)
        throw new Error("Prioridade inválida (use inteiro >= 0).");

      const payload: {
        appliesTo: PromoAppliesTo;
        type: DiscountType;
        value: number;
        active: boolean;
        startsAt: string;
        priority: number;
        endsAt?: string;
      } = {
        appliesTo: pAppliesTo,
        type: pType,
        value: valueNum,
        active: Boolean(pActive),
        startsAt: startsISO,
        priority: priorityNum,
      };
      if (endsISO) payload.endsAt = endsISO;

      const idem = stableIdem(`admin-prod-promo-create:${id}`, payload);

      await api.post(promoEndpoints.create(id), payload, {
        headers: { "Idempotency-Key": idem },
      });
    },
    onSuccess: async () => {
      toast.success("Promoção criada.");
      setPType("PCT");
      setPValue("");
      setPAppliesTo("BOTH");
      setPPriority("0");
      setPActive(true);
      setPStartsAt(toDatetimeLocalValue(new Date()));
      setPEndsAt("");

      await qc.invalidateQueries({ queryKey: ["admin-product-promos", id] });
      await promosQ.refetch();
    },
    onError: (e: unknown) => {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error(promoConflictMsg(pAppliesTo));
        return;
      }
      toast.error(apiErrorMessage(e, "Falha ao criar promoção."));
    },
  });

  const [editPromoId, setEditPromoId] = useState<string | null>(null);
  const [eAppliesTo, setEAppliesTo] = useState<PromoAppliesTo>("BOTH");
  const [eType, setEType] = useState<DiscountType>("PCT");
  const [eValue, setEValue] = useState("");
  const [eStartsAt, setEStartsAt] = useState("");
  const [eEndsAt, setEEndsAt] = useState("");
  const [ePriority, setEPriority] = useState("0");
  const [eActive, setEActive] = useState(true);

  function startEdit(p: ProductPromotion) {
    setEditPromoId(p.id);
    setEAppliesTo((p.appliesTo ?? "BOTH") as PromoAppliesTo);
    setEType((p.type ?? "PCT") as DiscountType);
    setEValue(p.value != null ? String(p.value) : "");
    setEActive(Boolean(p.active));
    setEStartsAt(p.startsAt ? toDatetimeLocalValue(p.startsAt) : "");
    setEEndsAt(p.endsAt ? toDatetimeLocalValue(p.endsAt) : "");
    setEPriority(String(p.priority ?? 0));
  }

  function cancelEdit() {
    setEditPromoId(null);
  }

  const patchPromoM = useMutation({
  mutationFn: async ({
    promoId,
    updatedAt,
  }: {
    promoId: string;
    updatedAt?: string;
  }) => {
    const valueNum = parseNumberBR(eValue);
    if (!Number.isFinite(valueNum)) throw new Error("Informe um valor válido.");

    const msg = validatePromo(eType, valueNum);
    if (msg) throw new Error(msg);

    if (!eStartsAt) throw new Error("Informe a data/hora de início.");
    const startsISO = datetimeLocalToISO(eStartsAt);
    if (!startsISO) throw new Error("Início inválido.");

    const endsISO = eEndsAt ? datetimeLocalToISO(eEndsAt) : null;
    if (eEndsAt && !endsISO) throw new Error("Fim inválido.");

    if (endsISO) {
      const a = new Date(startsISO).getTime();
      const b = new Date(endsISO).getTime();
      if (!(b > a)) throw new Error("O fim deve ser maior que o início.");
    }

    const priorityNum = ePriority.trim() ? Number(ePriority) : 0;
    if (!Number.isFinite(priorityNum) || !Number.isInteger(priorityNum) || priorityNum < 0) {
      throw new Error("Prioridade inválida (use inteiro >= 0).");
    }

    const payload = {
      appliesTo: eAppliesTo,
      type: eType,
      value: valueNum,
      active: Boolean(eActive),
      startsAt: startsISO,
      endsAt: eEndsAt ? endsISO : null,
      priority: priorityNum,
    };

    const idem = stableIdem(`admin-prod-promo-patch:${id}:${promoId}`, {
      ...payload,
      lastUpdatedAt: updatedAt ?? "",
    });

    const res = await api.patch(promoEndpoints.patch(id, promoId), payload, {
      headers: { "Idempotency-Key": idem },
    });

    return (res.data?.promotion ?? res.data) as ProductPromotion;
  },

  onSuccess: async (updatedPromo) => {
    toast.success("Promoção salva.");
    setEditPromoId(null);

    qc.setQueryData<ProductPromotion[]>(["admin-product-promos", id], (prev = []) =>
      prev.map((p) => (p.id === updatedPromo.id ? { ...p, ...updatedPromo } : p))
    );

    await qc.invalidateQueries({ queryKey: ["admin-product-promos", id] });
    await qc.invalidateQueries({ queryKey: ["products"] });
    await qc.invalidateQueries({ queryKey: ["product", id] });
    await promosQ.refetch();
  },

  onError: (e: unknown) => {
    toast.error(apiErrorMessage(e, "Falha ao salvar promoção."));
  },
});

  const disablePromoM = useMutation({
  mutationFn: async ({
    promoId,
    updatedAt,
  }: {
    promoId: string;
    updatedAt?: string;
  }) => {
    const idem = stableIdem(`admin-prod-promo-disable:${id}:${promoId}`, {
      updatedAt: updatedAt ?? "",
    });

    const res = await api.patch(
      promoEndpoints.disable(id, promoId),
      {},
      { headers: { "Idempotency-Key": idem } }
    );

    return (res.data?.promotion ?? res.data) as ProductPromotion;
  },

  onSuccess: async (updatedPromo) => {
    toast.success("Promoção desativada.");

    qc.setQueryData<ProductPromotion[]>(["admin-product-promos", id], (prev = []) =>
      prev.map((p) => (p.id === updatedPromo.id ? { ...p, ...updatedPromo } : p))
    );

    await qc.invalidateQueries({ queryKey: ["admin-product-promos", id] });
    await qc.invalidateQueries({ queryKey: ["products"] });
    await qc.invalidateQueries({ queryKey: ["product", id] });

    await promosQ.refetch();
  },

  onError: (e: unknown) => {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      toast.error(promoConflictMsg(eAppliesTo));
      return;
    }
    toast.error(apiErrorMessage(e, "Falha ao desativar promoção."));
  },
});

  const selectedCategoryNames = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return categoryIds.map((cid) => map.get(cid)).filter(Boolean) as string[];
  }, [categories, categoryIds]);

  const pricePreview = price ? `R$ ${price}` : "—";
  const customerPricePreview = customerPrice ? `R$ ${customerPrice}` : "Preço padrão";

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

  if (id === "new") return null;

  if (productQ.isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        Carregando…
      </div>
    );
  }

  if (productQ.isError) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-600">
        {apiErrorMessage(productQ.error, "Erro ao carregar produto.")}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-3 px-3 pb-24 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Produto não encontrado.
        </div>
        <Button
          variant="outline"
          className="w-full rounded-2xl sm:w-auto"
          onClick={() => router.replace(returnTo)}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-24 sm:px-6 lg:space-y-6 lg:pb-10">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("rounded-full px-3 py-1", statusPill(active))}>
                    {active ? "ATIVO" : "INATIVO"}
                  </Badge>

                  <Badge
                    className={cn(
                      "rounded-full border px-3 py-1",
                      audience === "STAFF_ONLY"
                        ? "border-slate-600 bg-slate-800 text-slate-200"
                        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                    )}
                  >
                    {audience === "STAFF_ONLY" ? "Salão / Vendedor" : "Cliente vê"}
                  </Badge>

                  <Badge className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-200">
                    Editar produto
                  </Badge>
                </div>

                <div className="space-y-1">
                  <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">
                    {name || "Editar produto"}
                  </h1>
                  <p className="text-sm text-white/70">
                    Gerencie dados, categorias, mídia e promoções em um layout mais compacto.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-white/70">
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    SKU: <span className="font-mono text-white">{sku || "-"}</span>
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    ID: <span className="font-mono text-white">{id}</span>
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    Estoque: <span className="font-semibold text-white">{stock}</span>
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    Imagens: <span className="font-semibold text-white">{images.length}</span>
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1">
                    Vídeos: <span className="font-semibold text-white">{videos.length}</span>
                  </span>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => router.replace(returnTo)}
                  disabled={saveM.isPending}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>

                <Button
                  type="button"
                  className="rounded-2xl bg-sky-500 text-white hover:bg-sky-600 hover:text-white"
                  onClick={() => saveM.mutate()}
                  disabled={saveM.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saveM.isPending ? "Salvando…" : "Salvar produto"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Preço padrão
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">{pricePreview}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Preço cliente final
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {customerPricePreview}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Categoria principal
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                {categories.find((c) => c.id === categoryId)?.name || "Não definida"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Promoções
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">{promos.length}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-8">
            <SectionCard
              title="Dados do produto"
              description="Informações principais, preços e descrição"
              defaultOpen
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>SKU</Label>
                  <Input
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Estoque</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                    value={stock}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const clean = sanitizeIntInput(raw);
                      const n = clean ? Number(clean) : 0;
                      setStock(Number.isFinite(n) ? Math.max(0, n) : 0);
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Marca</Label>
                  <Input
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex.: Wella"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Linha / Família</Label>
                  <Input
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                    value={line}
                    onChange={(e) => setLine(e.target.value)}
                    placeholder="Ex.: Fusion"
                  />
                </div>
              </div>

<div className="grid gap-4 md:grid-cols-2">
  <div className="grid gap-2">
    <Label>Volume</Label>
    <Input
      className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
      value={volume}
      onChange={(e) => setVolume(e.target.value)}
      placeholder="Ex.: 500ml"
      maxLength={20}
    />
    <div className="text-xs text-slate-500">Máx. 20 caracteres.</div>
  </div>

  <div className="grid gap-2">
<Label>Descrição do produto</Label>
<Textarea
  className="min-h-[110px] rounded-2xl border-slate-200 bg-slate-50/60"
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  placeholder="Texto principal exibido no app."
/>
  </div>
</div>

                            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
  <div className="mb-4">
    <div className="text-sm font-semibold text-slate-900">
      Logística / Embalagem
    </div>

    <p className="mt-1 text-xs text-slate-500">
      Preencha o tamanho da embalagem em <span className="font-semibold">centímetros</span> e o peso em <span className="font-semibold">quilogramas</span>.
    </p>

    <p className="mt-1 text-xs text-slate-500">
      Exemplo: <span className="font-semibold">15</span> = 15 cm •{" "}
      <span className="font-semibold">10,5</span> = 10 cm e meio •{" "}
      <span className="font-semibold">0,200</span> = 200 g
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
        className="h-11 rounded-2xl border-slate-200 bg-white"
        value={weightKg}
        onChange={(e) => setWeightKg(sanitizeMoneyInput(e.target.value))}
        placeholder="Ex.: 0,200"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px] text-xs text-slate-500">
        {describeWeight(weightKg)}
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Altura da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-11 rounded-2xl border-slate-200 bg-white"
        value={heightCm}
        onChange={(e) => setHeightCm(sanitizeMoneyInput(e.target.value))}
        placeholder="Ex.: 10"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px] text-xs text-slate-500">
        {describeDimension(heightCm)}
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Largura da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-11 rounded-2xl border-slate-200 bg-white"
        value={widthCm}
        onChange={(e) => setWidthCm(sanitizeMoneyInput(e.target.value))}
        placeholder="Ex.: 15"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px] text-xs text-slate-500">
        {describeDimension(widthCm)}
      </div>
    </div>

    <div className="flex h-full flex-col">
      <div className="mb-2 flex min-h-[48px] items-end">
        <Label className="block text-sm font-medium leading-5 text-slate-800">
          Comprimento da caixa (cm)
        </Label>
      </div>

      <Input
        className="h-11 rounded-2xl border-slate-200 bg-white"
        value={lengthCm}
        onChange={(e) => setLengthCm(sanitizeMoneyInput(e.target.value))}
        placeholder="Ex.: 20"
        inputMode="decimal"
      />

      <div className="mt-2 min-h-[20px] text-xs text-slate-500">
        {describeDimension(lengthCm)}
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
        className="h-11 rounded-2xl border-slate-200 bg-white"
        value={packageVolumes}
        onChange={(e) => setPackageVolumes(sanitizeIntInput(e.target.value))}
        placeholder="1"
        inputMode="numeric"
      />

      <div className="mt-2 min-h-[20px] text-xs text-slate-500">
        {describeVolumes(packageVolumes)}
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


              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid gap-2">
                    <Label>Preço</Label>
                    <Input
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={price}
                      onChange={(e) => setPrice(sanitizeMoneyInput(e.target.value))}
                      placeholder="Ex.: 59,90"
                      inputMode="decimal"
                    />
                    <div className="text-xs text-slate-500">
                      Somente números. Valor deve ser maior que 0.
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid gap-2">
                    <Label>Preço cliente final (opcional)</Label>
                    <Input
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(sanitizeMoneyInput(e.target.value))}
                      placeholder="Ex.: 49,90"
                      inputMode="decimal"
                    />
                    <div className="text-xs text-slate-500">
                      Se vazio, cliente final usa o preço padrão.
                    </div>
                  </div>
                </div>
              </div>

<div className="grid gap-4 md:grid-cols-2">
  <div className="grid gap-2">
    <Label>Benefício (1 por linha)</Label>
    <Textarea
      className="min-h-[130px] rounded-2xl border-slate-200 bg-slate-50/60"
      value={effectsText}
      onChange={(e) => setEffectsText(e.target.value)}
      placeholder={`Ex.:\nBrilho intenso\nRedução de frizz`}
    />
  </div>

  <div className="grid gap-2">
    <Label>Ativos e funções (1 por linha)</Label>
    <Textarea
      className="min-h-[130px] rounded-2xl border-slate-200 bg-slate-50/60"
      value={benefitsText}
      onChange={(e) => setBenefitsText(e.target.value)}
      placeholder={`Ex.:\nHidratação\nMaciez`}
    />
  </div>
</div>

<div className="grid gap-2">
  <Label>Modo de uso (1 por linha)</Label>
  <Textarea
    className="min-h-[140px] rounded-2xl border-slate-200 bg-slate-50/60"
    value={howToUseText}
    onChange={(e) => setHowToUseText(e.target.value)}
    placeholder={`Ex.:\nAplique nos cabelos úmidos\nMassageie\nEnxágue`}
  />
</div>

              <div className="grid gap-2">
                <Label>Destaques (1 por linha)</Label>
                <Textarea
                  className="min-h-[110px] rounded-2xl border-slate-200 bg-slate-50/60"
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  placeholder={`Ex.:\nBrilho\nHidratação\nReconstrução`}
                />
                <div className="text-xs text-slate-500">
                  Máx: 10 itens • 60 caracteres por linha.
                </div>
              </div>

              <Separator />

              <div className="hidden sm:flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => router.replace(returnTo)}
                  disabled={saveM.isPending}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>

                <Button
                  type="button"
                  className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                  onClick={() => saveM.mutate()}
                  disabled={saveM.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saveM.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title="Promoções do produto"
              description="Crie, acompanhe e edite promoções sem ocupar a tela toda"
              icon={<Tag className="h-4 w-4" />}
              defaultOpen={false}
              right={
                <Button
                  variant="outline"
                  className="hidden rounded-2xl sm:flex"
                  onClick={() => promosQ.refetch()}
                  disabled={promosQ.isFetching}
                >
                  <RefreshCw
                    className={cn("mr-2 h-4 w-4", promosQ.isFetching ? "animate-spin" : "")}
                  />
                  {promosQ.isFetching ? "Atualizando…" : "Atualizar"}
                </Button>
              }
            >
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-4 text-sm font-semibold text-slate-900">Criar promoção</div>

                <div className="grid gap-4 md:grid-cols-12">
                  <div className="grid gap-2 md:col-span-4">
                    <Label>Aplica para</Label>
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                      value={pAppliesTo}
                      onChange={(e) => setPAppliesTo(e.target.value as PromoAppliesTo)}
                    >
                      <option value="BOTH">Ambos</option>
                      <option value="SALON">Somente Salão</option>
                      <option value="SELLER">Somente Vendedor</option>
                      <option value="CUSTOMER">Somente Cliente final</option>
                    </select>
                    <div className="text-xs text-slate-500">Quem vê o desconto nessa promoção.</div>
                  </div>

                  <div className="grid gap-2 md:col-span-4">
                    <Label>Tipo</Label>
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                      value={pType}
                      onChange={(e) => setPType(e.target.value as DiscountType)}
                    >
                      <option value="PCT">Percentual (%)</option>
                      <option value="FIXED">Desconto (R$)</option>
                      <option value="PRICE">Preço promocional (R$)</option>
                    </select>
                    <div className="text-xs text-slate-500">Defina como o desconto será aplicado.</div>
                  </div>

                  <div className="grid gap-2 md:col-span-4">
                    <Label>Valor</Label>
                    <Input
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={pValue}
                      onChange={(e) => setPValue(sanitizeMoneyInput(e.target.value))}
                      placeholder={pType === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                      inputMode={pType === "PCT" ? "numeric" : "decimal"}
                    />
                    <div className="text-xs text-slate-500">
                      {pType === "PCT" ? "0 < valor ≤ 100" : "Valor > 0"}
                    </div>
                  </div>

                  <div className="grid gap-2 md:col-span-6">
                    <Label>Início (data + hora)</Label>
                    <Input
                      type="datetime-local"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={pStartsAt}
                      onChange={(e) => setPStartsAt(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2 md:col-span-6">
                    <Label>Fim (opcional)</Label>
                    <Input
                      type="datetime-local"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={pEndsAt}
                      onChange={(e) => setPEndsAt(e.target.value)}
                    />
                    <div className="text-xs text-slate-500">Se vazio, fica sem expiração.</div>
                  </div>

                  <div className="grid gap-2 md:col-span-4">
                    <Label>Prioridade</Label>
                    <Input
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                      value={pPriority}
                      onChange={(e) => setPPriority(sanitizeIntInput(e.target.value))}
                      placeholder="Ex.: 10"
                      inputMode="numeric"
                    />
                    <div className="text-xs text-slate-500">Inteiro ≥ 0. Maior vence.</div>
                  </div>

                  <div className="grid gap-2 md:col-span-4">
                    <Label>Status</Label>
                    <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={pActive}
                        onChange={(e) => setPActive(e.target.checked)}
                      />
                      Ativa
                    </label>
                    <div className="text-xs text-slate-500">Pode criar inativa e ativar depois.</div>
                  </div>

                  <div className="flex items-end md:col-span-4">
                    <Button
                      className="h-11 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                      onClick={() => createPromoM.mutate()}
                      disabled={createPromoM.isPending}
                    >
                      {createPromoM.isPending ? "Criando…" : "Criar promoção"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">Promoções cadastradas</div>

                {promosQ.isLoading ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm">
                    Carregando promoções…
                  </div>
                ) : promosQ.isError ? (
                  <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {apiErrorMessage(promosQ.error, "Erro ao carregar promoções.")}
                  </div>
                ) : promos.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Nenhuma promoção para este produto.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {promos.map((p) => {
                      const isEditing = editPromoId === p.id;

                      const statusLabel =
                        p.active === false
                          ? "INATIVA"
                          : p.isActiveNow
                            ? "ATIVA AGORA"
                            : "PROGRAMADA/EXPIRADA";

                      return (
                        <div
                          key={p.id}
                          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  className={cn(
                                    "rounded-full",
                                    p.active
                                      ? "bg-emerald-600 text-white border-transparent"
                                      : "bg-zinc-200 text-zinc-900 border-transparent"
                                  )}
                                >
                                  {statusLabel}
                                </Badge>

                                <Badge variant="secondary" className="rounded-full">
                                  {p.type}
                                </Badge>

                                <Badge variant="secondary" className="rounded-full">
                                  {appliesToLabel(p.appliesTo)}
                                </Badge>

                                <Badge variant="secondary" className="rounded-full">
                                  prioridade {p.priority ?? 0}
                                </Badge>
                              </div>

                              <div className="text-sm font-semibold text-slate-900">
                                Valor: <span className="font-mono">{String(p.value)}</span>
                              </div>

                              <div className="text-xs text-slate-500">
                                Início: {fmtDateTime(p.startsAt)} • Fim:{" "}
                                {fmtDateTime(p.endsAt ?? null)}
                              </div>

                              <div className="text-[10px] font-mono text-slate-400 break-all">
                                ID: {p.id}
                              </div>
                            </div>

                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                              {!isEditing ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-2xl"
                                  onClick={() => startEdit(p)}
                                >
                                  Editar
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-2xl"
                                  onClick={cancelEdit}
                                >
                                  Cancelar
                                </Button>
                              )}

                              <Button
  type="button"
  variant="outline"
  className="rounded-2xl"
  disabled={disablePromoM.isPending || p.active === false}
onClick={() => {
  if (confirm("Desativar esta promoção?")) {
    disablePromoM.mutate({
      promoId: p.id,
      updatedAt: p.updatedAt as string | undefined,
    });
  }
}}
>
  Desativar
</Button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="mt-4 space-y-3">
                              <Separator />

                              <div className="grid gap-4 sm:grid-cols-6">
                                <div className="grid gap-2 sm:col-span-2">
                                  <Label>Aplica para</Label>
                                  <select
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm"
                                    value={eAppliesTo}
                                    onChange={(e) => setEAppliesTo(e.target.value as PromoAppliesTo)}
                                  >
                                    <option value="BOTH">Ambos</option>
                                    <option value="SALON">Somente Salão</option>
                                    <option value="SELLER">Somente Vendedor</option>
                                    <option value="CUSTOMER">Somente Cliente final</option>
                                  </select>
                                </div>

                                <div className="grid gap-2 sm:col-span-2">
                                  <Label>Tipo</Label>
                                  <select
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm"
                                    value={eType}
                                    onChange={(e) => setEType(e.target.value as DiscountType)}
                                  >
                                    <option value="PCT">Percentual (%)</option>
                                    <option value="FIXED">Desconto (R$)</option>
                                    <option value="PRICE">Preço promocional (R$)</option>
                                  </select>
                                </div>

                                <div className="grid gap-2 sm:col-span-2">
                                  <Label>Valor</Label>
                                  <Input
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                                    value={eValue}
                                    onChange={(e) => setEValue(sanitizeMoneyInput(e.target.value))}
                                    placeholder={eType === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                                    inputMode={eType === "PCT" ? "numeric" : "decimal"}
                                  />
                                </div>

                                <div className="grid gap-2 sm:col-span-3">
                                  <Label>Início</Label>
                                  <Input
                                    type="datetime-local"
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                                    value={eStartsAt}
                                    onChange={(e) => setEStartsAt(e.target.value)}
                                  />
                                </div>

                                <div className="grid gap-2 sm:col-span-3">
                                  <Label>Fim (opcional)</Label>
                                  <Input
                                    type="datetime-local"
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                                    value={eEndsAt}
                                    onChange={(e) => setEEndsAt(e.target.value)}
                                  />
                                </div>

                                <div className="grid gap-2 sm:col-span-2">
                                  <Label>Prioridade</Label>
                                  <Input
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                                    value={ePriority}
                                    onChange={(e) => setEPriority(sanitizeIntInput(e.target.value))}
                                    inputMode="numeric"
                                  />
                                </div>

                                <div className="grid gap-2 sm:col-span-2">
                                  <Label>Status</Label>
                                  <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={eActive}
                                      onChange={(e) => setEActive(e.target.checked)}
                                    />
                                    Ativa
                                  </label>
                                </div>

                                <div className="flex items-end sm:col-span-2">
                                  <Button
                                    className="h-11 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                                    onClick={() =>
  patchPromoM.mutate({
    promoId: p.id,
    updatedAt: p.updatedAt as string | undefined,
  })
}
                                    disabled={patchPromoM.isPending}
                                  >
                                    {patchPromoM.isPending ? "Salvando…" : "Salvar promoção"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Dica: regra “cupom não afeta produto com promoção” fica no checkout/pricing.
              </div>
            </SectionCard>

            <SectionCard
              title="Mídia do produto"
              description="Imagens e vídeos em um bloco só, mais compacto"
              icon={<ImageIcon className="h-4 w-4" />}
              defaultOpen={false}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-900">
                      Imagem principal
                    </div>

                    {primaryUrl ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="aspect-[4/3] w-full bg-muted">
                          <img
                            src={primaryUrl}
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid min-h-[180px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                        Nenhuma imagem ainda.
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Enviar nova imagem
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => productQ.refetch()}
                        disabled={productQ.isFetching}
                      >
                        <RefreshCw
                          className={cn(
                            "mr-2 h-4 w-4",
                            productQ.isFetching ? "animate-spin" : ""
                          )}
                        />
                        Atualizar
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
                        <input
                          className="w-full text-sm"
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            setUploadErr(null);
                            setFiles(Array.from(e.target.files ?? []));
                          }}
                        />
                      </div>

                      <div className="text-xs text-slate-500 break-words">
                        {files.length
                          ? files.length === 1
                            ? `Selecionado: ${files[0].name} (${Math.round(files[0].size / 1024)} KB)`
                            : `${files.length} imagens selecionadas`
                          : "Escolha uma ou mais imagens JPG/PNG/WEBP."}
                      </div>

                      {uploadErr ? <div className="text-sm text-red-600">{uploadErr}</div> : null}

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                          onClick={() => uploadM.mutate()}
                          disabled={!files.length || uploadM.isPending}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {uploadM.isPending ? "Enviando…" : "Upload"}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => setFiles([])}
                          disabled={!files.length || uploadM.isPending}
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {images.length ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-900">Galeria</div>

                      <div className="grid grid-cols-2 gap-3">
                        {images.map((im) => {
                          const isPrimary = Boolean(im.isPrimary);
                          return (
                            <div
                              key={im.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-2"
                            >
                              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="aspect-square">
                                  <img
                                    src={im.url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>

                                {isPrimary ? (
                                  <div className="absolute left-2 top-2 rounded-full bg-slate-900 px-2 py-1 text-[10px] text-white">
                                    primária
                                  </div>
                                ) : null}
                              </div>

                              <div className="mt-2 flex flex-col gap-2">
                                {!isPrimary ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-2 text-xs"
                                    disabled={setPrimaryM.isPending}
                                    onClick={() => setPrimaryM.mutate(im.id)}
                                  >
                                    <Star className="mr-1 h-3.5 w-3.5" />
                                    Primária
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-2 text-xs"
                                  disabled={deleteImgM.isPending || isPrimary}
                                  onClick={() => {
                                    if (confirm("Remover esta imagem?")) deleteImgM.mutate(im.id);
                                  }}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Remover
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Clapperboard className="h-4 w-4" />
                        Vídeos do produto
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => videosQ.refetch()}
                        disabled={videosQ.isFetching}
                      >
                        <RefreshCw
                          className={cn(
                            "mr-2 h-4 w-4",
                            videosQ.isFetching ? "animate-spin" : ""
                          )}
                        />
                        Atualizar
                      </Button>
                    </div>

                    <div className="grid gap-3">
                      <Input
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                        value={videoTitle}
                        onChange={(e) => setVideoTitle(e.target.value)}
                        placeholder="Título do vídeo"
                      />

                      <Input
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                        type="number"
                        value={videoSortOrder}
                        onChange={(e) => setVideoSortOrder(e.target.value)}
                        placeholder="Ordem"
                      />

                      <Textarea
                        className="min-h-[90px] rounded-2xl border-slate-200 bg-slate-50/60"
                        value={videoDescription}
                        onChange={(e) => setVideoDescription(e.target.value)}
                        placeholder="Descrição do vídeo"
                      />

                      <Input
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                        value={videoThumbnailUrl}
                        onChange={(e) => setVideoThumbnailUrl(e.target.value)}
                        placeholder="Thumbnail URL (opcional)"
                      />

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={videoActive}
                            onChange={(e) => setVideoActive(e.target.checked)}
                          />
                          Vídeo ativo
                        </label>

                        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={videoShowInGallery}
                            onChange={(e) => setVideoShowInGallery(e.target.checked)}
                          />
                          Mostrar na galeria
                        </label>
                      </div>

                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
                        <Input
                          type="file"
                          accept="video/*"
                          className="rounded-xl border-0 bg-transparent p-0 shadow-none"
                          onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                        />
                      </div>

                      {videoFile ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          {videoFile.name} • {formatBytes(videoFile.size)}
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                          onClick={() => uploadVideoM.mutate()}
                          disabled={!videoFile || uploadVideoM.isPending}
                        >
                          {uploadVideoM.isPending ? (
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
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => {
                            setVideoFile(null);
                            setVideoTitle("");
                            setVideoDescription("");
                            setVideoSortOrder("0");
                            setVideoActive(true);
                            setVideoShowInGallery(true);
                            setVideoThumbnailUrl("");
                          }}
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    {videosQ.isLoading ? (
                      <div className="text-sm text-slate-500">Carregando vídeos...</div>
                    ) : videos.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Vídeos cadastrados
                        </div>

                        {videos.map((video) => (
                          <div
                            key={video.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex flex-col gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {video.title}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Ordem {video.sortOrder} • {video.active ? "Ativo" : "Inativo"} •{" "}
                                  {video.showInGallery ? "Na galeria" : "Fora da galeria"}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 break-all">
                                  {video.originalName || video.publicUrl}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-2 text-xs"
                                  onClick={() =>
                                    window.open(video.publicUrl, "_blank", "noopener,noreferrer")
                                  }
                                >
                                  <Eye className="mr-1 h-3.5 w-3.5" />
                                  Abrir
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-2 text-xs"
                                  disabled={patchVideoM.isPending}
                                  onClick={() =>
                                    patchVideoM.mutate({
                                      videoId: video.id,
                                      payload: { showInGallery: !video.showInGallery },
                                    })
                                  }
                                >
                                  {video.showInGallery ? "Tirar da galeria" : "Mostrar na galeria"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-2 text-xs"
                                  disabled={patchVideoM.isPending}
                                  onClick={() =>
                                    patchVideoM.mutate({
                                      videoId: video.id,
                                      payload: { active: !video.active },
                                    })
                                  }
                                >
                                  {video.active ? "Desativar" : "Ativar"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-2 text-xs"
                                  disabled={deleteVideoM.isPending}
                                  onClick={() => {
                                    if (confirm(`Remover o vídeo "${video.title}"?`)) {
                                      deleteVideoM.mutate(video.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Remover
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">
                        Nenhum vídeo cadastrado para este produto.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5 xl:col-span-4">
            <div className="xl:sticky xl:top-6 xl:self-start">
              <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Painel rápido</CardTitle>
                  <CardDescription>
                    Status, categorias e resumo fixos enquanto você desce
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </div>

                    <ProductStatusPanel
                      active={active}
                      onActiveChange={setActive}
                      availableToCustomer={availableToCustomer}
                      onAvailableToCustomerChange={(v) => setAudience(v ? "ALL" : "STAFF_ONLY")}
                    />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Categoria principal
                    </div>

                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                      value={categoryId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCategoryId(v);
                        setCategoryIds((prev) => prev.filter((x) => x !== v));
                      }}
                      disabled={categoriesQ.isLoading}
                    >
                      <option value="">Sem categoria principal</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="mt-2 min-h-[18px] text-xs text-slate-500">
                      {categoriesQ.isLoading ? "Carregando categorias…" : null}
                      {categoriesQ.isError ? (
                        <span className="text-red-600">Erro ao carregar categorias.</span>
                      ) : null}
                      {!categoriesQ.isLoading && !categoriesQ.isError ? (
                        categoryId ? "Categoria principal definida." : "Nenhuma categoria principal."
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Categorias adicionais
                      </div>
                      <Badge variant="secondary" className="rounded-full">
                        {categoryIds.length}
                      </Badge>
                    </div>

                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                      {categories.filter((c) => c.id !== categoryId).map((c) => {
                        const checked = categoryIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm cursor-pointer select-none transition",
                              checked
                                ? "border-sky-200 bg-sky-50 text-sky-900"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            )}
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
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Preenche <code>categoryIds</code>. A principal (<code>categoryId</code>) é opcional.
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Resumo rápido
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Preço</span>
                        <span className="font-semibold text-slate-900">{pricePreview}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Cliente final</span>
                        <span className="font-semibold text-slate-900">
                          {customerPricePreview}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Estoque</span>
                        <span className="font-semibold text-slate-900">{stock}</span>
                      </div>

                                            <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Peso</span>
                        <span className="font-semibold text-slate-900">
                          {weightKg ? `${weightKg} kg` : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Dimensões</span>
                        <span className="font-semibold text-right text-slate-900">
                          {heightCm && widthCm && lengthCm
                            ? `${heightCm} × ${widthCm} × ${lengthCm} cm`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Volumes</span>
                        <span className="font-semibold text-slate-900">
                          {packageVolumes || "1"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Imagens</span>
                        <span className="font-semibold text-slate-900">{images.length}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Vídeos</span>
                        <span className="font-semibold text-slate-900">{videos.length}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Promoções</span>
                        <span className="font-semibold text-slate-900">{promos.length}</span>
                      </div>
                    </div>

                    {selectedCategoryNames.length ? (
                      <>
                        <Separator className="my-4" />
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Selecionadas
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {selectedCategoryNames.map((cat) => (
                              <Badge key={cat} variant="secondary" className="rounded-full">
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => router.replace(returnTo)}
                      disabled={saveM.isPending}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Voltar
                    </Button>

                    <Button
                      type="button"
                      className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                      onClick={() => saveM.mutate()}
                      disabled={saveM.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveM.isPending ? "Salvando…" : "Salvar produto"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 px-3 py-3">
          <Button
            variant="outline"
            className="w-1/2 rounded-2xl"
            onClick={() => router.replace(returnTo)}
            disabled={saveM.isPending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <Button
            className="w-1/2 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
            onClick={() => saveM.mutate()}
            disabled={saveM.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveM.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </>
  );
}