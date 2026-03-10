"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers3,
  Search,
  Settings2,
  Package2,
  Plus,
  Trash2,
  Save,
  Tag,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProductItem = {
  id: string;
  sku?: string | null;
  name: string;
  price?: string | number | null;
  customerPrice?: string | number | null;
  active?: boolean;
};

type ProductListResponse =
  | ProductItem[]
  | {
      items?: ProductItem[];
      data?: ProductItem[];
      total?: number;
      page?: number;
      take?: number;
    };

type QuantityDiscountType = "PERCENT" | "FIXED";

type QuantityDiscountRule = {
  id?: string;
  minQuantity: number;
  discountType: QuantityDiscountType;
  discountValue: number;
  active?: boolean;
};

type ProductQuantityDiscountConfigResponse = {
  productId: string;
  quantityDiscountEnabled: boolean;
  rules: Array<{
    id: string;
    productId: string;
    minQuantity: number;
    discountType: QuantityDiscountType;
    discountValue: string | number;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
};

type ConfigCacheItem = {
  quantityDiscountEnabled: boolean;
  rules: QuantityDiscountRule[];
};

function formatCurrency(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeProductsResponse(data: ProductListResponse): ProductItem[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function sortRules(rules: QuantityDiscountRule[]) {
  return [...rules].sort((a, b) => a.minQuantity - b.minQuantity);
}

function createEmptyRule(): QuantityDiscountRule {
  return {
    minQuantity: 2,
    discountType: "PERCENT",
    discountValue: 0,
    active: true,
  };
}

function normalizeConfig(
  data: ProductQuantityDiscountConfigResponse
): ConfigCacheItem {
  return {
    quantityDiscountEnabled: Boolean(data.quantityDiscountEnabled),
    rules: sortRules(
      (data.rules || []).map((rule) => ({
        id: rule.id,
        minQuantity: Number(rule.minQuantity),
        discountType: rule.discountType,
        discountValue: toNumber(rule.discountValue),
        active: rule.active,
      }))
    ),
  };
}

function getRulesSummary(enabled: boolean, rules: QuantityDiscountRule[]) {
  if (!enabled || rules.length === 0) return "Nenhuma faixa configurada";

  return sortRules(rules)
    .map((rule) => {
      if (rule.discountType === "PERCENT") {
        return `${rule.minQuantity}+ (${rule.discountValue}%)`;
      }
      return `${rule.minQuantity}+ (${formatCurrency(rule.discountValue)})`;
    })
    .join(" • ");
}

function validateRules(enabled: boolean, rules: QuantityDiscountRule[]) {
  if (!enabled) return null;

  const seen = new Set<number>();

  for (const rule of rules) {
    if (!Number.isInteger(rule.minQuantity) || rule.minQuantity < 2) {
      return "Cada faixa precisa ter quantidade mínima inteira e maior ou igual a 2.";
    }

    if (seen.has(rule.minQuantity)) {
      return `A quantidade mínima ${rule.minQuantity} está repetida.`;
    }

    seen.add(rule.minQuantity);

    if (rule.discountType !== "PERCENT" && rule.discountType !== "FIXED") {
      return "Tipo de desconto inválido.";
    }

    if (!Number.isFinite(rule.discountValue) || rule.discountValue <= 0) {
      return "O valor do desconto precisa ser maior que 0.";
    }

    if (rule.discountType === "PERCENT" && rule.discountValue > 100) {
      return "O desconto percentual não pode ser maior que 100%.";
    }
  }

  return null;
}

export default function QuantityDiscountsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<QuantityDiscountRule[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [configCache, setConfigCache] = useState<Record<string, ConfigCacheItem>>({});

  const productsQuery = useQuery({
    queryKey: ["admin", "quantity-discounts", "products"],
    queryFn: async () => {
      const { data } = await api.get<ProductListResponse>(endpoints.products.list, {
        params: { page: 1, take: 200 },
      });

      return normalizeProductsResponse(data);
    },
    staleTime: 60_000,
  });

  const productIds = useMemo(() => {
    return (productsQuery.data ?? []).map((product) => product.id);
  }, [productsQuery.data]);

  const configsBootstrapQuery = useQuery({
    queryKey: ["admin", "quantity-discounts", "bootstrap-configs", productIds],
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.allSettled(
        productIds.map(async (productId) => {
          const { data } = await api.get<ProductQuantityDiscountConfigResponse>(
            endpoints.admin.productQuantityDiscounts(productId)
          );

          return [productId, normalizeConfig(data)] as const;
        })
      );

      const nextCache: Record<string, ConfigCacheItem> = {};

      for (const result of results) {
        if (result.status === "fulfilled") {
          const [productId, config] = result.value;
          nextCache[productId] = config;
        }
      }

      return nextCache;
    },
  });

  const configQuery = useQuery({
    queryKey: ["admin", "quantity-discounts", "config", selectedProduct?.id],
    enabled: dialogOpen && !!selectedProduct?.id,
    queryFn: async () => {
      const { data } = await api.get<ProductQuantityDiscountConfigResponse>(
        endpoints.admin.productQuantityDiscounts(selectedProduct!.id)
      );
      return data;
    },
  });

  useEffect(() => {
    if (!configsBootstrapQuery.data) return;

    setConfigCache((prev) => ({
      ...configsBootstrapQuery.data,
      ...prev,
    }));
  }, [configsBootstrapQuery.data]);

  useEffect(() => {
    if (!configQuery.data || !selectedProduct?.id) return;

    const normalized = normalizeConfig(configQuery.data);

    setEnabled(normalized.quantityDiscountEnabled);
    setRules(normalized.rules);
    setFormError(null);

    setConfigCache((prev) => ({
      ...prev,
      [selectedProduct.id]: normalized,
    }));
  }, [configQuery.data, selectedProduct?.id]);

  useEffect(() => {
    if (!dialogOpen) {
      setFormError(null);
    }
  }, [dialogOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct?.id) return;

      await api.put(endpoints.admin.productQuantityDiscounts(selectedProduct.id), {
        quantityDiscountEnabled: enabled,
        rules: enabled
          ? rules.map((rule) => ({
              minQuantity: Number(rule.minQuantity),
              discountType: rule.discountType,
              discountValue: Number(rule.discountValue),
            }))
          : [],
      });
    },
    onSuccess: async () => {
      if (selectedProduct?.id) {
        setConfigCache((prev) => ({
          ...prev,
          [selectedProduct.id]: {
            quantityDiscountEnabled: enabled,
            rules: sortRules(rules),
          },
        }));
      }

      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discounts", "config", selectedProduct?.id],
      });

      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discounts", "bootstrap-configs"],
      });

      toast.success("Promoção por quantidade salva com sucesso.");
      setDialogOpen(false);
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.message || "Erro ao salvar promoção por quantidade.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct?.id) return;
      await api.delete(endpoints.admin.productQuantityDiscounts(selectedProduct.id));
    },
    onSuccess: async () => {
      if (selectedProduct?.id) {
        setConfigCache((prev) => ({
          ...prev,
          [selectedProduct.id]: {
            quantityDiscountEnabled: false,
            rules: [],
          },
        }));
      }

      setEnabled(false);
      setRules([]);

      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discounts", "config", selectedProduct?.id],
      });

      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discounts", "bootstrap-configs"],
      });

      toast.success("Configuração removida com sucesso.");
      setDialogOpen(false);
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.message || "Erro ao remover configuração.";
      setFormError(message);
      toast.error(message);
    },
  });

  const filteredProducts = useMemo(() => {
    const items = productsQuery.data || [];
    const term = search.trim().toLowerCase();

    if (!term) return items;

    return items.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      return name.includes(term) || sku.includes(term);
    });
  }, [productsQuery.data, search]);

  const activeConfiguredCount = useMemo(() => {
    return Object.values(configCache).filter(
      (item) => item.quantityDiscountEnabled && item.rules.length > 0
    ).length;
  }, [configCache]);

  function openConfig(product: ProductItem) {
    setSelectedProduct(product);
    setDialogOpen(true);

    const cached = configCache[product.id];

    if (cached) {
      setEnabled(cached.quantityDiscountEnabled);
      setRules(sortRules(cached.rules));
      setFormError(null);
    } else {
      setEnabled(false);
      setRules([]);
      setFormError(null);
    }
  }

  function addRule() {
    setRules((prev) => sortRules([...prev, createEmptyRule()]));
  }

  function updateRule(index: number, patch: Partial<QuantityDiscountRule>) {
    setRules((prev) =>
      sortRules(prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
    );
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    const validationError = validateRules(enabled, rules);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    saveMutation.mutate();
  }

  const selectedSummary = useMemo(() => {
    return getRulesSummary(enabled, rules);
  }, [enabled, rules]);

  const isBootstrappingConfigs =
    configsBootstrapQuery.isLoading || configsBootstrapQuery.isFetching;

  return (
    <div className="space-y-6 text-slate-900">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-700 shadow-sm">
                <Layers3 className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-xl text-slate-900">
                  Promoções por quantidade
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Configure faixas de desconto por produto sem poluir a tela de edição
                  e com uma visão mais organizada do que já está ativo.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou SKU"
                className="h-11 rounded-xl border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-violet-700 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>

              <div>
                <CardTitle className="text-xl text-slate-900">Resumo</CardTitle>
                <CardDescription className="text-slate-600">
                  Visão rápida da página
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Produtos carregados</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {productsQuery.data?.length ?? 0}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Promoções configuradas</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-3xl font-semibold text-slate-900">
                  {activeConfiguredCount}
                </p>

                {isBootstrappingConfigs && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    carregando
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-xl text-slate-900">Produtos</CardTitle>
          <CardDescription className="text-slate-600">
            Clique em configurar para editar as faixas de desconto por quantidade.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {productsQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
              Carregando produtos...
            </div>
          ) : productsQuery.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Erro ao carregar produtos.
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const cached = configCache[product.id];
                const isEnabled = cached?.quantityDiscountEnabled ?? false;
                const hasRules = Boolean(cached && cached.rules.length > 0);

                const summary = cached
                  ? getRulesSummary(cached.quantityDiscountEnabled, cached.rules)
                  : isBootstrappingConfigs
                  ? "Carregando configuração salva..."
                  : "Clique em configurar para carregar as faixas.";

                const faixaContainerClass =
                  isEnabled && hasRules
                    ? "rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4"
                    : "rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4";

                const faixaLabelClass =
                  isEnabled && hasRules
                    ? "text-xs font-semibold uppercase tracking-[0.16em] text-blue-700"
                    : "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500";

                const faixaTextClass =
                  isEnabled && hasRules
                    ? "mt-2 text-sm leading-6 text-slate-800"
                    : "mt-2 text-sm leading-6 text-slate-600";

                return (
                  <Card
                    key={product.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <CardHeader className="space-y-4 border-b border-slate-100 bg-slate-50/70">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="line-clamp-2 text-base font-semibold text-slate-900">
                            {product.name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-slate-500">
                            SKU: {product.sku || "—"}
                          </CardDescription>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm">
                          <Package2 className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge
                          className={
                            product.active
                              ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                              : "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200"
                          }
                        >
                          {product.active ? "Ativo" : "Inativo"}
                        </Badge>

                        <Badge
                          className={
                            isEnabled && hasRules
                              ? "border-0 bg-blue-600 text-white hover:bg-blue-600"
                              : "border border-slate-300 bg-white text-slate-700 hover:bg-white"
                          }
                        >
                          {isEnabled && hasRules ? "Qtd ativa" : "Sem config"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-5">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm text-slate-500">Preço</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">
                          {formatCurrency(product.customerPrice ?? product.price)}
                        </p>
                      </div>

                      <div className={faixaContainerClass}>
                        <div className="flex items-center justify-between gap-3">
                          <p className={faixaLabelClass}>Faixas</p>

                          {isEnabled && hasRules ? (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                              Ativa
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Vazio
                            </span>
                          )}
                        </div>

                        <p className={faixaTextClass}>{summary}</p>
                      </div>

                      <Button
                        className="h-11 w-full rounded-xl bg-slate-900 text-white shadow-sm hover:bg-slate-800"
                        onClick={() => openConfig(product)}
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        Configurar
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent className="max-w-5xl border border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {selectedProduct ? `Configurar: ${selectedProduct.name}` : "Configurar"}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Defina as faixas de desconto por quantidade para este produto.
            </DialogDescription>
          </DialogHeader>

          {configQuery.isLoading && !configCache[selectedProduct?.id || ""] ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Carregando configuração...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-semibold text-slate-900">
                        Ativar promoção por quantidade
                      </Label>
                      <p className="text-sm leading-6 text-slate-600">
                        Quando ativado, o produto passa a aplicar desconto conforme a
                        quantidade comprada.
                      </p>
                    </div>

                    <Switch checked={enabled} onCheckedChange={setEnabled} />
                  </div>

                  {enabled && (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Faixas de desconto
                          </p>
                          <p className="text-sm text-slate-600">
                            O sistema aplica apenas a maior faixa atingida pelo cliente.
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={addRule}
                          className="h-11 rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar faixa
                        </Button>
                      </div>

                      {rules.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5 text-sm text-blue-900">
                          Nenhuma faixa cadastrada ainda.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {rules.map((rule, index) => (
                            <div
                              key={`${rule.id || "new"}-${index}`}
                              className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
                            >
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <div className="rounded-xl bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                                    Faixa {index + 1}
                                  </div>

                                  <div className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                    {rule.minQuantity}+ unidades
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => removeRule(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[140px_180px_1fr]">
                                <div className="space-y-2">
                                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Qtd. mínima
                                  </Label>
                                  <Input
                                    type="number"
                                    min={2}
                                    value={rule.minQuantity}
                                    className="h-11 rounded-xl border-slate-300 bg-white text-slate-900 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-200"
                                    onChange={(e) =>
                                      updateRule(index, {
                                        minQuantity: Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Tipo
                                  </Label>
                                  <select
                                    className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    value={rule.discountType}
                                    onChange={(e) =>
                                      updateRule(index, {
                                        discountType:
                                          e.target.value as QuantityDiscountType,
                                      })
                                    }
                                  >
                                    <option value="PERCENT">Percentual</option>
                                    <option value="FIXED">Valor fixo</option>
                                  </select>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    {rule.discountType === "PERCENT"
                                      ? "Percentual"
                                      : "Valor"}
                                  </Label>

                                  <div className="relative">
                                    {rule.discountType === "PERCENT" ? (
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                                        %
                                      </span>
                                    ) : (
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                                        R$
                                      </span>
                                    )}

                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={rule.discountValue}
                                      className="h-11 rounded-xl border-slate-300 bg-white pl-14 text-slate-900 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-200"
                                      onChange={(e) =>
                                        updateRule(index, {
                                          discountValue: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                {rule.discountType === "PERCENT" ? (
                                  <>
                                    Comprando{" "}
                                    <span className="font-semibold text-slate-900">
                                      {rule.minQuantity} ou mais
                                    </span>
                                    , o cliente recebe{" "}
                                    <span className="font-semibold text-blue-700">
                                      {rule.discountValue}% de desconto
                                    </span>
                                    .
                                  </>
                                ) : (
                                  <>
                                    Comprando{" "}
                                    <span className="font-semibold text-slate-900">
                                      {rule.minQuantity} ou mais
                                    </span>
                                    , o cliente recebe{" "}
                                    <span className="font-semibold text-emerald-700">
                                      {formatCurrency(rule.discountValue)}
                                    </span>{" "}
                                    de desconto.
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Card className="h-fit border border-slate-200 bg-slate-50 shadow-none">
                  <CardHeader className="border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
                        <Tag className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900">Resumo</CardTitle>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-5">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={
                          enabled
                            ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                            : "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200"
                        }
                      >
                        {enabled ? "Ativado" : "Desativado"}
                      </Badge>

                      <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                        {rules.length} faixa(s)
                      </Badge>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 text-sm leading-6 text-slate-800 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                        Resumo atual
                      </p>
                      <p>{selectedSummary}</p>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-sm leading-6 text-amber-900 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                        Exemplo de regra
                      </p>
                      Exemplo: 3+ = 5%, 5+ = 10%. Se o cliente comprar 5, entra só a
                      faixa de 10%.
                    </div>
                  </CardContent>
                </Card>
              </div>

              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <Separator />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 rounded-xl"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending || saveMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removendo...
                    </>
                  ) : (
                    "Remover configuração"
                  )}
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    onClick={() => setDialogOpen(false)}
                    disabled={deleteMutation.isPending || saveMutation.isPending}
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                    onClick={handleSave}
                    disabled={deleteMutation.isPending || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Salvar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}