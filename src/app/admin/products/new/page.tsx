"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type Category = {
  id: string;
  name: string;
  active: boolean;
};

function stableKey(prefix: string, ...parts: (string | number | boolean | null | undefined)[]) {
  return `${prefix}:${parts.map((p) => String(p ?? "")).join(":")}`;
}

// ✅ 1 por linha -> string[]
function parseHighlights(text: string) {
  return String(text ?? "")
    .split("\n")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => s.slice(0, 60));
}

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [highlightsText, setHighlightsText] = useState(""); // ✅ NOVO
  const [stock, setStock] = useState<number>(0);
  const [active, setActive] = useState(true);
  const [categoryId, setCategoryId] = useState<string>("");

  const categoriesQ = useQuery({
    queryKey: ["categories", { active: true }],
    queryFn: async () => {
      const res = await api.get(endpoints.categories.list, { params: { active: "true" } });
      return (res.data?.items ?? []) as Category[];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (categoriesQ.isError) toast.error(apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias."));
  }, [categoriesQ.isError]);

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
      const payload: any = {
        sku: sku.trim(),
        name: name.trim(),
        price: price.trim().replace(",", "."),
        active: Boolean(active),
        stock: Number.isFinite(stock) ? stock : 0,
        categoryId: categoryId ? categoryId : null,
      };

      const desc = description.trim();
      if (desc) payload.description = desc; // ✅ só manda se tiver

      // ✅ highlights: só manda se tiver
      const highlights = parseHighlights(highlightsText);
      if (highlights.length) payload.highlights = highlights;

      await api.post(endpoints.products.create, payload, {
        headers: { "Idempotency-Key": stableKey("product-create", payload.sku || payload.name || "no-key") },
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
              <div className="text-xs text-black/50">Use o formato que seu backend espera (ex.: 59.90).</div>
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

            {/* ✅ NOVO: Destaques */}
            <div className="grid gap-2">
              <Label>Destaques (1 por linha)</Label>
              <Textarea
                className="rounded-xl min-h-[110px]"
                value={highlightsText}
                onChange={(e) => setHighlightsText(e.target.value)}
                placeholder={`Ex.:\nBrilho\nHidratação\nReconstrução`}
              />
              <div className="text-xs text-black/50">Máx: 10 itens • 60 caracteres por linha.</div>
            </div>

            <div className="grid gap-2">
              <Label>Estoque</Label>
              <Input
                type="number"
                className="rounded-xl"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Categoria</Label>
              <select
                className="h-10 rounded-xl border bg-white px-3 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {categoriesQ.isLoading ? <div className="text-xs text-black/50">Carregando categorias…</div> : null}
              {categoriesQ.isError ? <div className="text-xs text-red-600">Erro ao carregar categorias.</div> : null}

              <div className="text-xs text-black/50">
                {selectedCategoryName ? (
                  <>
                    Selecionada: <span className="font-semibold">{selectedCategoryName}</span>
                  </>
                ) : (
                  "Nenhuma categoria"
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
              <span className="text-sm font-medium">Ativo</span>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => router.back()} disabled={createM.isPending}>
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
