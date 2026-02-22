"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  audience?: ProductAudience | null;
  

  highlights?: string[] | null;
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

function statusPill(active: boolean) {
  return active
    ? "bg-emerald-600 text-white border-transparent"
    : "bg-zinc-200 text-zinc-900 border-transparent";
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
function normalizeCategoryIds(mainId: string, ids: string[]) {
  if (!mainId) return ids;
  return ids.includes(mainId) ? ids : [mainId, ...ids];
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
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  function appliesToLabel(v: string) {
    if (v === "SELLER") return "Vendedor";
    if (v === "SALON") return "Salão";
    if (v === "BOTH") return "Ambos";
    if (v === "CUSTOMER") return "Cliente final";
    return v;
  }

  function promoConflictMsg(appliesTo: string) {
if (appliesTo === "BOTH")
  return "Conflito: já existe promo ativa (Cliente final/Salão/Vendedor) nesse período.";
    return `Conflito: já existe promo ativa para ${appliesToLabel(
      appliesTo
    )} nesse período.`;
  }

  useEffect(() => {
    if (id === "new") router.replace("/admin/products/new");
  }, [id, router]);

  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const res = await api.get(endpoints.products.byId(id));
      return (res.data?.item ?? res.data) as Product;
    },
    enabled: id !== "new",
    retry: false,
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
  const [active, setActive] = useState(true);
  const [stock, setStock] = useState<number>(0);

  const [categoryId, setCategoryId] = useState<string>("");

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [availableToCustomer, setAvailableToCustomer] = useState(true);
  const audience: ProductAudience = availableToCustomer ? "ALL" : "STAFF_ONLY";

  const [file, setFile] = useState<File | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const product = productQ.data ?? null;

  useEffect(() => {
    if (!product) return;
    setSku(product.sku ?? "");
    setName(product.name ?? "");
    setPrice(String(product.price ?? ""));
    setCustomerPrice(product.customerPrice != null ? String(product.customerPrice) : "");
    setDescription(product.description ?? "");
    setHighlightsText((product.highlights ?? []).join("\n"));
    setActive(!!product.active);
    setStock(Math.max(0, Number(product.stock ?? 0))); 

    const main = product.categoryId ?? "";
    const ids =
      Array.isArray(product.categoryIds) && product.categoryIds.length > 0
        ? product.categoryIds
        : main
        ? [main]
        : [];

    setCategoryId(main);
    setCategoryIds(ids.filter((x) => x !== main));

    setAvailableToCustomer((product.audience ?? "ALL") !== "STAFF_ONLY");
  }, [product?.id]);

  const images = product?.images ?? [];
  const primaryUrl =
    images.find((x) => x.isPrimary)?.url ??
    [...images].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0]?.url ??
    null;

  const selectedCategoryName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name
    : null;

  const saveM = useMutation({
    mutationFn: async () => {
      const skuN = sku.trim();
      const nameN = name.trim();

      if (!skuN) throw new Error("SKU é obrigatório.");
      if (!nameN) throw new Error("Nome é obrigatório.");

      const priceSan = normalizeMoney(price);
      const priceNum = parseNumberBR(priceSan);

      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error("Preço inválido. Use um valor maior que 0 (ex.: 59,90).");
      }

      const stockSafe = Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;

      const highlights = parseHighlights(highlightsText);

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
      };

const idem = await idemKey(`product-update:${id}`, payload);

await api.patch(endpoints.products.update(id), payload, {
  headers: { "Idempotency-Key": idem },
});
    },
    onSuccess: async () => {
      toast.success("Produto salvo.");
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["product", id] });
      router.replace("/admin/products");
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Falha ao salvar.")),
  });

  const uploadM = useMutation({
    mutationFn: async () => {
      setUploadErr(null);
      if (!file) throw new Error("Selecione um arquivo.");

      const contentType =
        file.type === "image/jpg" ? "image/jpeg" : file.type || "application/octet-stream";

      const presignRes = await api.post(
        endpoints.products.images.presign(id),
        {
          contentType,
          size: file.size,
          filename: file.name,
          mime: contentType,
        },
        { headers: { "Idempotency-Key": `prod-img-presign:${id}:${file.name}:${file.size}` } }
      );

      const { uploadUrl, publicUrl, key } = presignRes.data ?? {};
      if (!uploadUrl || !key) throw new Error("Presign inválido: faltou uploadUrl/key.");

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
          isPrimary: (images?.length ?? 0) === 0,
        },
        { headers: { "Idempotency-Key": `prod-img-confirm:${id}:${key}` } }
      );
    },
    onSuccess: async () => {
      toast.success("Imagem enviada.");
      setFile(null);
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
  }, []);

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
    mutationFn: async (promoId: string) => {
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
      if (!Number.isFinite(priorityNum) || !Number.isInteger(priorityNum) || priorityNum < 0)
        throw new Error("Prioridade inválida (use inteiro >= 0).");

      const payload: {
        appliesTo: PromoAppliesTo;
        type: DiscountType;
        value: number;
        active: boolean;
        startsAt: string;
        priority: number;
        endsAt: string | null;
      } = {
        appliesTo: eAppliesTo,
        type: eType,
        value: valueNum,
        active: Boolean(eActive),
        startsAt: startsISO,
        endsAt: eEndsAt ? endsISO : null,
        priority: priorityNum,
      };

      const idem = stableIdem(`admin-prod-promo-patch:${id}:${promoId}`, payload);

      await api.patch(promoEndpoints.patch(id, promoId), payload, {
        headers: { "Idempotency-Key": idem },
      });
    },
    onSuccess: async () => {
      toast.success("Promoção salva.");
      setEditPromoId(null);
      await qc.invalidateQueries({ queryKey: ["admin-product-promos", id] });
      await promosQ.refetch();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Falha ao salvar promoção.")),
  });

  const disablePromoM = useMutation({
    mutationFn: async (promoId: string) => {
      await api.patch(
        promoEndpoints.disable(id, promoId),
        {},
        { headers: { "Idempotency-Key": `admin-prod-promo-disable:${id}:${promoId}` } }
      );
    },
    onSuccess: async () => {
      toast.success("Promoção desativada.");
      await qc.invalidateQueries({ queryKey: ["admin-product-promos", id] });
      await promosQ.refetch();
    },
    onError: (e: unknown) => {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error(promoConflictMsg(eAppliesTo));
        return;
      }
      toast.error(apiErrorMessage(e, "Falha ao salvar promoção."));
    },
  });

  if (id === "new") return null;

  if (productQ.isLoading) return <div className="rounded-2xl border p-4">Carregando…</div>;
  if (productQ.isError)
    return (
      <div className="rounded-2xl border p-4 text-red-600">
        {apiErrorMessage(productQ.error, "Erro ao carregar produto.")}
      </div>
    );

  if (!product) {
    return (
      <div className="space-y-3 px-3 sm:px-6">
        <div className="rounded-2xl border p-4">Produto não encontrado.</div>
        <Button
          variant="outline"
          className="w-full rounded-xl sm:w-auto"
          onClick={() => router.replace("/admin/products")}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 sm:px-6 pb-24 sm:pb-0">
        {/* ===== Topbar ===== */}
        <div className="rounded-3xl border bg-gradient-to-b from-zinc-50 to-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black leading-tight break-words">
                  {name || "Editar produto"}
                </h1>

                <Badge className={cn("rounded-full", statusPill(active))}>
                  {active ? "ATIVO" : "INATIVO"}
                </Badge>

                {/* ✅ Audience badge */}
                <Badge
  className={cn(
    "rounded-full border",
    audience === "STAFF_ONLY"
      ? "bg-zinc-50 text-zinc-700 border-zinc-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200"
  )}
>
  {audience === "STAFF_ONLY" ? "Salão/Vendedor" : "Cliente vê"}
</Badge>

                <Badge variant="secondary" className="rounded-full">
                  Admin
                </Badge>
              </div>

              <div className="text-sm text-black/60 break-words">
                SKU:{" "}
                <span className="font-mono text-black/70 break-all">{sku || "-"}</span>{" "}
                <span className="text-black/30">•</span>{" "}
                ID: <span className="font-mono text-black/60 break-all">{id}</span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => router.replace("/admin/products")}
                disabled={saveM.isPending}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>

              <Button
                type="button"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveM.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        {/* ===== Layout em 2 colunas ===== */}
        <div className="grid gap-4 lg:grid-cols-5">
          {/* COL DIREITA: Dados + Promo (primeiro no mobile) */}
          <div className="order-1 space-y-4 lg:order-2 lg:col-span-3">
            {/* DADOS */}
            <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-sky-500/70">
              <CardHeader>
                <CardTitle>Dados do produto</CardTitle>
                <CardDescription>Campos principais e validações anti-negativo.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>SKU</Label>
                    <Input
                      className="w-full rounded-xl"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Estoque</Label>
                    <Input
                      type="number"
                      min={0}
                      className="w-full rounded-xl"
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
                    className="w-full rounded-xl"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Preço</Label>
                  <Input
                    className="w-full rounded-xl"
                    value={price}
                    onChange={(e) => setPrice(sanitizeMoneyInput(e.target.value))}
                    placeholder="Ex.: 59,90"
                    inputMode="decimal"
                  />
                  <div className="text-xs text-black/50">
                    Somente números. Valor deve ser maior que 0.
                  </div>
                </div>

                <div className="grid gap-2">
  <Label>Preço cliente final (opcional)</Label>
  <Input
    className="w-full rounded-xl"
    value={customerPrice}
    onChange={(e) => setCustomerPrice(sanitizeMoneyInput(e.target.value))}
    placeholder="Ex.: 49,90"
    inputMode="decimal"
  />
  <div className="text-xs text-black/50">
    Se vazio, cliente final usa o preço padrão.
  </div>
</div>


                <div className="grid gap-2">
                  <Label>Descrição</Label>
                  <Textarea
                    className="w-full rounded-xl min-h-[120px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Opcional..."
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Destaques (1 por linha)</Label>
                  <Textarea
                    className="w-full rounded-xl min-h-[110px]"
                    value={highlightsText}
                    onChange={(e) => setHighlightsText(e.target.value)}
                    placeholder={`Ex.:\nBrilho\nHidratação\nReconstrução`}
                  />
                  <div className="text-xs text-black/50">
                    Máx: 10 itens • 60 caracteres por linha.
                  </div>
                </div>

                {/* CATEGORIA + STATUS */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
  <Label>Categoria principal (opcional)</Label>

  <div className="mt-2">
    <select
      className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
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
  </div>

  <div className="mt-2 min-h-[18px] text-xs text-black/50">
    {categoriesQ.isLoading ? "Carregando categorias…" : null}
    {categoriesQ.isError ? (
      <span className="text-red-600">Erro ao carregar categorias.</span>
    ) : null}
    {!categoriesQ.isLoading && !categoriesQ.isError ? (
      categoryId ? "Categoria principal definida." : "Nenhuma categoria principal."
    ) : null}
  </div>
</div>

<div className="rounded-2xl border bg-white p-4 shadow-sm">
  <Label>Status</Label>

  <div className="mt-2">
    <ProductStatusPanel
      active={active}
      onActiveChange={setActive}
      availableToCustomer={availableToCustomer}
      onAvailableToCustomerChange={setAvailableToCustomer}
    />
  </div>
</div>
                </div>

                {/* ✅ multi categorias */}
                <div className="grid gap-2">
                  <Label>Categorias (multi)</Label>

                  <div className="rounded-2xl border p-3 space-y-2">
                    <div className="text-xs text-black/60">
                      Selecionadas: <b>{categoryIds.length}</b>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {categories.filter((c) => c.id !== categoryId).map((c) => {
                        const checked = categoryIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer select-none",
                              checked ? "bg-black/5" : "bg-white"
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

                    <div className="text-xs text-black/50">
                      Esse bloco preenche <code>categoryIds</code>. A categoria principal (
                      <code>categoryId</code>) é opcional.
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Botões (desktop/tablet) */}
                <div className="hidden sm:flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => router.replace("/admin/products")}
                    disabled={saveM.isPending}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                  </Button>

                  <Button
                    type="button"
                    className="rounded-xl"
                    onClick={() => saveM.mutate()}
                    disabled={saveM.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saveM.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* PROMOÇÕES */}
            <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm border-t-4 border-t-sky-500/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Promoções do produto
                </CardTitle>
                <CardDescription>
                  Promoção é aplicada no preço do item (antes de cupom). Use <b>Prioridade</b>{" "}
                  para escolher qual vence.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-3xl border bg-white p-4 space-y-3">
                  <div className="text-sm font-semibold">Criar promoção</div>

                  <div className="grid gap-3 md:grid-cols-12">
                    {/* Linha 1 */}
                    <div className="grid gap-2 md:col-span-4">
                      <Label>Aplica para</Label>
                      <select
                        className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                        value={pAppliesTo}
                        onChange={(e) => setPAppliesTo(e.target.value as PromoAppliesTo)}
                      >
                        <option value="BOTH">Ambos</option>
                        <option value="SALON">Somente Salão</option>
                        <option value="SELLER">Somente Vendedor</option>
                        <option value="CUSTOMER">Somente Cliente final</option>
                      </select>
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">
                        Quem vê o desconto nessa promoção.
                      </div>
                    </div>

                    <div className="grid gap-2 md:col-span-4">
                      <Label>Tipo</Label>
                      <select
                        className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                        value={pType}
                        onChange={(e) => setPType(e.target.value as DiscountType)}
                      >
                        <option value="PCT">Percentual (%)</option>
                        <option value="FIXED">Desconto (R$)</option>
                        <option value="PRICE">Preço promocional (R$)</option>
                      </select>
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                    </div>

                    <div className="grid gap-2 md:col-span-4">
                      <Label>Valor</Label>
                      <Input
                        className="w-full rounded-xl"
                        value={pValue}
                        onChange={(e) => setPValue(sanitizeMoneyInput(e.target.value))}
                        placeholder={pType === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                        inputMode={pType === "PCT" ? "numeric" : "decimal"}
                      />
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">
                        {pType === "PCT" ? "0 < valor ≤ 100" : "Valor > 0"}
                      </div>
                    </div>

                    {/* Linha 2 */}
                    <div className="grid gap-2 md:col-span-6">
                      <Label>Início (data + hora)</Label>
                      <Input
                        type="datetime-local"
                        className="w-full rounded-xl"
                        value={pStartsAt}
                        onChange={(e) => setPStartsAt(e.target.value)}
                      />
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                    </div>

                    <div className="grid gap-2 md:col-span-6">
                      <Label>Fim (opcional)</Label>
                      <Input
                        type="datetime-local"
                        className="w-full rounded-xl"
                        value={pEndsAt}
                        onChange={(e) => setPEndsAt(e.target.value)}
                      />
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">
                        Se vazio, fica sem expiração.
                      </div>
                    </div>

                    {/* Linha 3 */}
                    <div className="grid gap-2 md:col-span-4">
                      <Label>Prioridade</Label>
                      <Input
                        className="w-full rounded-xl"
                        value={pPriority}
                        onChange={(e) => setPPriority(sanitizeIntInput(e.target.value))}
                        placeholder="Ex.: 10"
                        inputMode="numeric"
                      />
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">
                        Inteiro ≥ 0. Maior vence.
                      </div>
                    </div>

                    <div className="grid gap-2 md:col-span-4">
                      <Label>Status</Label>
                      <label className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={pActive}
                          onChange={(e) => setPActive(e.target.checked)}
                        />
                        Ativa
                      </label>
                      <div className="min-h-[32px] text-xs leading-tight text-black/50">
                        Pode criar inativa e ativar depois.
                      </div>
                    </div>

                    {/* Botão */}
                    <div className="md:col-span-4 flex flex-col md:items-end">
                      <div className="hidden md:block h-5" />
                      <div className="hidden md:block min-h-[32px]" />
                      <Button
                        className="w-full rounded-xl md:w-auto"
                        onClick={() => createPromoM.mutate()}
                        disabled={createPromoM.isPending}
                      >
                        {createPromoM.isPending ? "Criando…" : "Criar promoção"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* LIST PROMOS */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-sm font-semibold">Promoções cadastradas</div>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl sm:w-auto"
                      onClick={() => promosQ.refetch()}
                      disabled={promosQ.isFetching}
                    >
                      <RefreshCw
                        className={cn("mr-2 h-4 w-4", promosQ.isFetching ? "animate-spin" : "")}
                      />
                      {promosQ.isFetching ? "Atualizando…" : "Atualizar"}
                    </Button>
                  </div>

                  {promosQ.isLoading ? (
                    <div className="rounded-2xl border p-4 text-sm">Carregando promoções…</div>
                  ) : promosQ.isError ? (
                    <div className="rounded-2xl border p-4 text-sm text-red-600">
                      {apiErrorMessage(promosQ.error, "Erro ao carregar promoções.")}
                    </div>
                  ) : promos.length === 0 ? (
                    <div className="rounded-2xl border p-4 text-sm text-black/60">
                      Nenhuma promoção para este produto.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {promos.map((p) => {
                        const isEditing = editPromoId === p.id;

                        const statusLabel =
                          p.active === false ? "INATIVA" : p.isActiveNow ? "ATIVA AGORA" : "PROGRAMADA/EXPIRADA";

                        return (
                          <div key={p.id} className="rounded-3xl border bg-white p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
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
                                  <div className="text-sm font-semibold break-words">
                                    {p.type} • {p.appliesTo} • prioridade {p.priority ?? 0}
                                  </div>
                                </div>

                                <div className="text-xs text-black/60 break-words">
                                  Valor: <span className="font-mono">{String(p.value)}</span> • Início:{" "}
                                  {fmtDateTime(p.startsAt)} • Fim: {fmtDateTime(p.endsAt ?? null)}
                                </div>
                                <div className="text-[10px] text-black/50 font-mono break-all">ID: {p.id}</div>
                              </div>

                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                {!isEditing ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full rounded-xl sm:w-auto"
                                    onClick={() => startEdit(p)}
                                  >
                                    Editar
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full rounded-xl sm:w-auto"
                                    onClick={cancelEdit}
                                  >
                                    Cancelar
                                  </Button>
                                )}

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full rounded-xl sm:w-auto"
                                  disabled={disablePromoM.isPending || p.active === false}
                                  onClick={() => {
                                    if (confirm("Desativar esta promoção?")) disablePromoM.mutate(p.id);
                                  }}
                                >
                                  Desativar
                                </Button>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="space-y-3">
                                <Separator />

                                <div className="grid gap-3 sm:grid-cols-6">
                                  <div className="grid gap-2 sm:col-span-2">
                                    <Label>Aplica para</Label>
                                    <select
                                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                                      value={eAppliesTo}
                                      onChange={(e) => setEAppliesTo(e.target.value as PromoAppliesTo)}
                                    >
                                      <option value="BOTH">Ambos</option>
                                      <option value="SALON">Somente Salão</option>
                                      <option value="SELLER">Somente Vendedor</option>
                                      <option value="CUSTOMER">Somente Cliente final</option>
                                    </select>
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-2">
                                    <Label>Tipo</Label>
                                    <select
                                      className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                                      value={eType}
                                      onChange={(e) => setEType(e.target.value as DiscountType)}
                                    >
                                      <option value="PCT">Percentual (%)</option>
                                      <option value="FIXED">Desconto (R$)</option>
                                      <option value="PRICE">Preço promocional (R$)</option>
                                    </select>
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-2">
                                    <Label>Valor</Label>
                                    <Input
                                      className="w-full rounded-xl"
                                      value={eValue}
                                      onChange={(e) => setEValue(sanitizeMoneyInput(e.target.value))}
                                      placeholder={eType === "PCT" ? "Ex.: 20" : "Ex.: 15,90"}
                                      inputMode={eType === "PCT" ? "numeric" : "decimal"}
                                    />
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">
                                      {eType === "PCT" ? "0 < valor ≤ 100" : "Valor > 0"}
                                    </div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-3">
                                    <Label>Início</Label>
                                    <Input
                                      type="datetime-local"
                                      className="w-full rounded-xl"
                                      value={eStartsAt}
                                      onChange={(e) => setEStartsAt(e.target.value)}
                                    />
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-3">
                                    <Label>Fim (opcional)</Label>
                                    <Input
                                      type="datetime-local"
                                      className="w-full rounded-xl"
                                      value={eEndsAt}
                                      onChange={(e) => setEEndsAt(e.target.value)}
                                    />
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">
                                      Se vazio, remove o fim (null).
                                    </div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-2">
                                    <Label>Prioridade</Label>
                                    <Input
                                      className="w-full rounded-xl"
                                      value={ePriority}
                                      onChange={(e) => setEPriority(sanitizeIntInput(e.target.value))}
                                      inputMode="numeric"
                                    />
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">
                                      Inteiro ≥ 0. Maior vence.
                                    </div>
                                  </div>

                                  <div className="grid gap-2 sm:col-span-2">
                                    <Label>Status</Label>
                                    <label className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={eActive}
                                        onChange={(e) => setEActive(e.target.checked)}
                                      />
                                      Ativa
                                    </label>
                                    <div className="min-h-[32px] text-xs leading-tight text-black/50">{"\u00A0"}</div>
                                  </div>

                                  <div className="sm:col-span-2 flex flex-col sm:items-end">
                                    <div className="hidden sm:block h-5" />
                                    <div className="hidden sm:block min-h-[32px]" />
                                    <Button
                                      className="w-full rounded-xl sm:w-auto"
                                      onClick={() => patchPromoM.mutate(p.id)}
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

                <div className="text-xs text-black/50">
                  Dica: regra “cupom não afeta produto com promoção” é no checkout/pricing.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* COL ESQUERDA: Imagens (depois no mobile) */}
          <Card className="order-2 rounded-3xl lg:order-1 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Imagens
              </CardTitle>
              <CardDescription>Upload, galeria e imagem primária</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-zinc-50 p-3">
                <div className="text-xs text-black/60 mb-2">Prévia</div>
                {primaryUrl ? (
                  <div className="overflow-hidden rounded-2xl border bg-white">
                    <div className="aspect-video sm:aspect-square w-full bg-muted">
                      <img src={primaryUrl} alt={name} className="h-full w-full object-cover" />
                    </div>
                  </div>
                ) : (
                  <div className="grid place-items-center rounded-2xl border bg-white p-6 text-sm text-black/50">
                    Nenhuma imagem ainda.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border bg-white p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-sm font-semibold">Enviar nova imagem</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl sm:w-auto"
                    onClick={() => productQ.refetch()}
                    disabled={productQ.isFetching}
                  >
                    <RefreshCw className={cn("mr-2 h-4 w-4", productQ.isFetching ? "animate-spin" : "")} />
                    Atualizar
                  </Button>
                </div>

                <div className="grid gap-2">
                  <input
                    className="text-sm w-full"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setUploadErr(null);
                      setFile(e.target.files?.[0] ?? null);
                    }}
                  />

                  <div className="text-xs text-black/50 break-words">
                    {file ? `Selecionado: ${file.name} (${Math.round(file.size / 1024)} KB)` : "Escolha um arquivo JPG/PNG/WEBP."}
                  </div>

                  {uploadErr ? <div className="text-sm text-red-600">{uploadErr}</div> : null}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      className="w-full rounded-xl sm:w-auto"
                      onClick={() => uploadM.mutate()}
                      disabled={!file || uploadM.isPending}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {uploadM.isPending ? "Enviando…" : "Upload"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-xl sm:w-auto"
                      onClick={() => setFile(null)}
                      disabled={!file || uploadM.isPending}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
              </div>

              {images.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Galeria</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((im) => {
                      const isPrimary = Boolean(im.isPrimary);
                      return (
                        <div key={im.id} className="rounded-2xl border bg-white p-2">
                          <div className="relative overflow-hidden rounded-xl border bg-muted">
                            <div className="aspect-square">
                              <img src={im.url} alt="" className="h-full w-full object-cover" />
                            </div>

                            {isPrimary ? (
                              <div className="absolute left-2 top-2 rounded-full bg-black/80 text-white text-[10px] px-2 py-1">
                                primária
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-col sm:flex-row flex-wrap gap-2">
                            {!isPrimary ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 w-full sm:w-auto rounded-xl px-2 text-xs"
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
                              className="h-8 w-full sm:w-auto rounded-xl px-2 text-xs"
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky actions (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/90 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-5xl gap-2 px-3 py-3">
          <Button
            variant="outline"
            className="w-1/2 rounded-xl"
            onClick={() => router.replace("/admin/products")}
            disabled={saveM.isPending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <Button className="w-1/2 rounded-xl" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveM.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </>
  );
}