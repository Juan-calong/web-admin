"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import { ProductStatusPanel } from "@/components/admin/ProductStatusPanel";

type Category = {
  id: string;
  name: string;
  active: boolean;
};

type ProductAudience = "ALL" | "STAFF_ONLY";

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

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();

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

  const [availableToCustomer, setAvailableToCustomer] = useState(true);
  const audience: ProductAudience = availableToCustomer ? "ALL" : "STAFF_ONLY";

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
} = {
  sku: skuN,
  name: nameN,
  price: priceN,
  customerPrice: customerPriceN ? customerPriceN : null,
  active: Boolean(active),
  stock: stockSafe,
  categoryId: categoryId ? categoryId : null,

  categoryIds: Array.from(new Set([...(categoryIds ?? []), ...(categoryId ? [categoryId] : [])])),
  audience,
};

      const desc = description.trim();
      if (desc) payload.description = desc;

      const highlights = parseHighlights(highlightsText);
      if (highlights.length) payload.highlights = highlights;

      await api.post(endpoints.products.create, payload, {
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
    },
    onSuccess: async () => {
      toast.success("Produto criado.");
      await qc.invalidateQueries({ queryKey: ["products"] });
      router.replace("/admin/products");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Falha ao criar produto.")),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-black">Novo produto</div>
          <div className="text-sm text-black/60">Criar item no catálogo</div>
        </div>

        <Badge variant="secondary" className="rounded-full">
          Admin
        </Badge>
      </div>

      <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm border-t-4">
        <CardHeader>
          <CardTitle>Dados do produto</CardTitle>
          <CardDescription>Preencha e clique em “Criar”.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createM.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-2">
              <Label>SKU</Label>
              <Input
                className="rounded-xl"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex.: SHAMPOO-001"
              />
            </div>

            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                className="rounded-xl"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Shampoo Premium"
              />
            </div>

            <div className="grid gap-2">
              <Label>Preço</Label>
              <Input
                className="rounded-xl"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex.: 59.90"
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
    placeholder="Ex.: 49.90"
    inputMode="decimal"
  />
  <div className="text-xs text-black/50">
    Se vazio, cliente final usa o preço padrão.
  </div>
</div>

            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea
                className="rounded-xl min-h-[110px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional..."
              />
            </div>

            <div className="grid gap-2">
              <Label>Destaques (1 por linha)</Label>
              <Textarea
                className="rounded-xl min-h-[110px]"
                value={highlightsText}
                onChange={(e) => setHighlightsText(e.target.value)}
                placeholder={`Ex.:\nBrilho\nHidratação\nReconstrução`}
              />
              <div className="text-xs text-black/50">
                Máx: 10 itens • 60 caracteres por linha.
              </div>
            </div>

            <div className="grid gap-2">
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

            <div className="grid gap-2">
              <Label>Categoria principal (opcional)</Label>
              <select
                className="h-10 rounded-xl border bg-white px-3 text-sm"
                value={categoryId}
                onChange={(e) => {
                  const v = e.target.value;
                  setCategoryId(v);
                  setCategoryIds((prev) => prev.filter((x) => x !== v));
                }}
              >
                <option value="">Sem categoria principal</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {categoriesQ.isLoading ? (
                <div className="text-xs text-black/50">Carregando categorias…</div>
              ) : null}
              {categoriesQ.isError ? (
                <div className="text-xs text-red-600">Erro ao carregar categorias.</div>
              ) : null}

              <div className="text-xs text-black/50">
                {selectedCategoryName ? (
                  <>
                    Selecionada: <span className="font-semibold">{selectedCategoryName}</span>
                  </>
                ) : (
                  "Nenhuma categoria principal"
                )}
              </div>
            </div>

            {/* ✅ Status + Visibilidade */}
            <div className="grid gap-2">
              <Label>Status</Label>

              <ProductStatusPanel
                active={active}
                onActiveChange={setActive}
                availableToCustomer={availableToCustomer}
                onAvailableToCustomerChange={setAvailableToCustomer}
              />

              <div className="text-xs text-black/50">
                <b>Cliente final</b> • <b>Salão/Vendedor</b>
              </div>
            </div>

            {/* ✅ Multi categorias (extras) */}
            <div className="grid gap-2">
              <Label>Categorias extras (multi)</Label>

              <div className="rounded-2xl border p-3 space-y-2">
                <div className="text-xs text-black/60">
                  Selecionadas: <b>{categoryIds.length}</b>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {categories
                    .filter((c) => c.id !== categoryId)
                    .map((c) => {
                      const checked = categoryIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={[
                            "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer select-none",
                            checked ? "bg-black/5" : "bg-white",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setCategoryIds((prev) => toggleCategoryId(c.id, prev))}
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      );
                    })}
                </div>

                <div className="text-xs text-black/50">
                  Este bloco preenche <code>categoryIds</code> (extras). A categoria principal (
                  <code>categoryId</code>) fica separada.
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => router.back()}
                disabled={createM.isPending}
              >
                Cancelar
              </Button>

              <Button type="submit" className="rounded-xl" disabled={createM.isPending}>
                {createM.isPending ? "Criando…" : "Criar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}