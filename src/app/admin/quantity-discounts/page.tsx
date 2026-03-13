"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers3,
  Search,
  Sparkles,
  Loader2,
  Plus,
  Settings2,
  Package2,
  Save,
  Trash2,
  Tag,
  Pencil,
  PowerOff,
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
type GroupAppliesTo = "SELLER" | "SALON" | "CUSTOMER" | "CUSTOMER_SALON" | "BOTH";

type QuantityDiscountTier = {
  id?: string;
  minQuantity: number;
  discountType: QuantityDiscountType;
  discountValue: number;
};

type QuantityDiscountGroupItem = {
  id: string;
  name: string;
  appliesTo: GroupAppliesTo;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
  productsCount: number;
  products: Array<{
    id: string;
    name: string;
    sku?: string | null;
    active?: boolean;
  }>;
  tiers: Array<{
    id?: string;
    minQuantity: number;
    discountType: QuantityDiscountType;
    discountValue: number | string;
  }>;
};

function normalizeProductsResponse(data: ProductListResponse): ProductItem[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function sortTiers(tiers: QuantityDiscountTier[]) {
  return [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

function createEmptyTier(): QuantityDiscountTier {
  return {
    minQuantity: 2,
    discountType: "PERCENT",
    discountValue: 0,
  };
}

function getTierSummary(tiers: QuantityDiscountTier[]) {
  if (!tiers.length) return "Nenhuma faixa configurada";

  return sortTiers(tiers)
    .map((tier) =>
      tier.discountType === "PERCENT"
        ? `${tier.minQuantity}+ (${tier.discountValue}%)`
        : `${tier.minQuantity}+ (${formatCurrency(tier.discountValue)})`
    )
    .join(" • ");
}

function getAppliesToLabel(value: GroupAppliesTo) {
  switch (value) {
    case "SELLER":
      return "Seller";
    case "SALON":
      return "Salão";
    case "CUSTOMER":
      return "Cliente";
    case "CUSTOMER_SALON":
      return "Cliente + Salão";
    case "BOTH":
    default:
      return "Todos";
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeInputValue(value?: string | null) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function localDatetimeToIso(value: string) {
  if (!value.trim()) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function validateGroupForm(params: {
  name: string;
  productIds: string[];
  tiers: QuantityDiscountTier[];
  startsAtInput: string;
  endsAtInput: string;
}) {
  const { name, productIds, tiers, startsAtInput, endsAtInput } = params;

  if (!name.trim() || name.trim().length < 2) {
    return "O nome do grupo precisa ter pelo menos 2 caracteres.";
  }

  if (!productIds.length) {
    return "Selecione pelo menos 1 produto.";
  }

  if (!tiers.length) {
    return "Adicione pelo menos 1 faixa.";
  }

  const seen = new Set<number>();

  for (const tier of tiers) {
    if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 2) {
      return "Cada faixa precisa ter quantidade mínima inteira e maior ou igual a 2.";
    }

    if (!["PERCENT", "FIXED"].includes(tier.discountType)) {
      return "Tipo de desconto inválido.";
    }

    if (!Number.isFinite(tier.discountValue) || tier.discountValue <= 0) {
      return "O valor do desconto precisa ser maior que 0.";
    }

    if (tier.discountType === "PERCENT" && tier.discountValue > 100) {
      return "O desconto percentual não pode ser maior que 100%.";
    }

    if (seen.has(tier.minQuantity)) {
      return `A quantidade mínima ${tier.minQuantity} está repetida.`;
    }

    seen.add(tier.minQuantity);
  }

  const startsAtIso = localDatetimeToIso(startsAtInput);
  const endsAtIso = localDatetimeToIso(endsAtInput);

  if (startsAtInput && !startsAtIso) {
    return "Data inicial inválida.";
  }

  if (endsAtInput && !endsAtIso) {
    return "Data final inválida.";
  }

  if (startsAtIso && endsAtIso && new Date(endsAtIso) < new Date(startsAtIso)) {
    return "A data final não pode ser menor que a data inicial.";
  }

  return null;
}

function normalizeGroupFromApi(group: QuantityDiscountGroupItem) {
  return {
    ...group,
    tiers: sortTiers(
      (group.tiers || []).map((tier) => ({
        id: tier.id,
        minQuantity: Number(tier.minQuantity),
        discountType: String(tier.discountType).toUpperCase() as QuantityDiscountType,
        discountValue: toNumber(tier.discountValue),
      }))
    ),
  };
}

export default function QuantityDiscountGroupsPage() {
  const queryClient = useQueryClient();

  const [groupSearch, setGroupSearch] = useState("");
  const [groupStatusFilter, setGroupStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL"
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<GroupAppliesTo>("BOTH");
  const [active, setActive] = useState(true);
  const [startsAtInput, setStartsAtInput] = useState("");
  const [endsAtInput, setEndsAtInput] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const [tiers, setTiers] = useState<QuantityDiscountTier[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(editingGroupId);

  const productsQuery = useQuery({
    queryKey: ["admin", "quantity-discount-groups", "products"],
    queryFn: async () => {
      const { data } = await api.get<ProductListResponse>(endpoints.products.list, {
        params: { page: 1, take: 200 },
      });

      return normalizeProductsResponse(data);
    },
    staleTime: 60_000,
  });

  const groupsQuery = useQuery({
    queryKey: ["admin", "quantity-discount-groups", "list"],
    queryFn: async () => {
      const { data } = await api.get<QuantityDiscountGroupItem[]>(
        endpoints.adminQuantityDiscountGroups.list
      );

      return (data || []).map(normalizeGroupFromApi);
    },
    staleTime: 30_000,
  });

  const groupDetailQuery = useQuery({
    queryKey: ["admin", "quantity-discount-groups", "detail", editingGroupId],
    enabled: dialogOpen && !!editingGroupId,
    queryFn: async () => {
      const { data } = await api.get<QuantityDiscountGroupItem>(
        endpoints.adminQuantityDiscountGroups.byId(editingGroupId!)
      );

      return normalizeGroupFromApi(data);
    },
  });

  const activeGroupsCount = useMemo(() => {
    return (groupsQuery.data || []).filter((group) => group.active).length;
  }, [groupsQuery.data]);

  const totalLinkedProducts = useMemo(() => {
    return (groupsQuery.data || []).reduce((acc, group) => acc + group.productsCount, 0);
  }, [groupsQuery.data]);

  const filteredGroups = useMemo(() => {
    const items = groupsQuery.data || [];
    const term = groupSearch.trim().toLowerCase();

    return items.filter((group) => {
      const matchesSearch =
        !term ||
        group.name.toLowerCase().includes(term) ||
        group.products.some(
          (product) =>
            String(product.name || "").toLowerCase().includes(term) ||
            String(product.sku || "").toLowerCase().includes(term)
        );

      const matchesStatus =
        groupStatusFilter === "ALL" ||
        (groupStatusFilter === "ACTIVE" && group.active) ||
        (groupStatusFilter === "INACTIVE" && !group.active);

      return matchesSearch && matchesStatus;
    });
  }, [groupsQuery.data, groupSearch, groupStatusFilter]);

  const filteredProducts = useMemo(() => {
    const items = productsQuery.data || [];
    const term = productSearch.trim().toLowerCase();

    return items.filter((product) => {
      const matchesSearch =
        !term ||
        String(product.name || "").toLowerCase().includes(term) ||
        String(product.sku || "").toLowerCase().includes(term);

      return matchesSearch;
    });
  }, [productsQuery.data, productSearch]);

  const allFilteredProductsSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => selectedProductIds.includes(product.id));

  const selectedProducts = useMemo(() => {
    const map = new Map((productsQuery.data || []).map((product) => [product.id, product]));
    return selectedProductIds
      .map((id) => map.get(id))
      .filter(Boolean) as ProductItem[];
  }, [productsQuery.data, selectedProductIds]);

  function resetForm() {
    setEditingGroupId(null);
    setName("");
    setAppliesTo("BOTH");
    setActive(true);
    setStartsAtInput("");
    setEndsAtInput("");
    setProductSearch("");
    setSelectedProductIds([]);
    setTiers([createEmptyTier()]);
    setFormError(null);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(groupId: string) {
    resetForm();
    setEditingGroupId(groupId);
    setDialogOpen(true);
  }

  useEffect(() => {
    if (!dialogOpen) return;
    if (!groupDetailQuery.data || !editingGroupId) return;

    const group = groupDetailQuery.data;

    setName(group.name || "");
    setAppliesTo(group.appliesTo || "BOTH");
    setActive(group.active !== false);
    setStartsAtInput(toLocalDatetimeInputValue(group.startsAt));
    setEndsAtInput(toLocalDatetimeInputValue(group.endsAt));
    setSelectedProductIds(group.products.map((product) => product.id));
    setTiers(
      group.tiers.length
        ? group.tiers.map((tier) => ({
            id: tier.id,
            minQuantity: Number(tier.minQuantity),
            discountType: tier.discountType,
            discountValue: toNumber(tier.discountValue),
          }))
        : [createEmptyTier()]
    );
    setFormError(null);
  }, [groupDetailQuery.data, editingGroupId, dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) {
      setFormError(null);
    }
  }, [dialogOpen]);

  function addTier() {
    setTiers((prev) => sortTiers([...prev, createEmptyTier()]));
  }

  function updateTier(index: number, patch: Partial<QuantityDiscountTier>) {
    setTiers((prev) =>
      sortTiers(prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
    );
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }

  function toggleSelectFilteredProducts() {
    const filteredIds = filteredProducts.map((product) => product.id);

    if (!filteredIds.length) return;

    setSelectedProductIds((prev) => {
      const allSelected = filteredIds.every((id) => prev.includes(id));

      if (allSelected) {
        return prev.filter((id) => !filteredIds.includes(id));
      }

      return Array.from(new Set([...prev, ...filteredIds]));
    });
  }

  function buildPayload() {
    return {
      name: name.trim(),
      appliesTo,
      active,
      startsAt: localDatetimeToIso(startsAtInput),
      endsAt: localDatetimeToIso(endsAtInput),
      productIds: selectedProductIds,
      tiers: sortTiers(tiers).map((tier) => ({
        minQuantity: Number(tier.minQuantity),
        discountType: tier.discountType,
        discountValue: Number(tier.discountValue),
      })),
    };
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      const { data } = await api.post(endpoints.adminQuantityDiscountGroups.create, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discount-groups", "list"],
      });

      toast.success("Grupo criado com sucesso.");
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || "Erro ao criar grupo.";
      setFormError(message);
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      const { data } = await api.put(
        endpoints.adminQuantityDiscountGroups.update(editingGroupId!),
        payload
      );
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "quantity-discount-groups", "list"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin", "quantity-discount-groups", "detail", editingGroupId],
        }),
      ]);

      toast.success("Grupo atualizado com sucesso.");
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || "Erro ao atualizar grupo.";
      setFormError(message);
      toast.error(message);
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { data } = await api.patch(
        endpoints.adminQuantityDiscountGroups.disable(groupId)
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "quantity-discount-groups", "list"],
      });

      toast.success("Grupo desativado com sucesso.");
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || "Erro ao desativar grupo.";
      toast.error(message);
    },
  });

  function handleSave() {
    const validationError = validateGroupForm({
      name,
      productIds: selectedProductIds,
      tiers,
      startsAtInput,
      endsAtInput,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDialogLoading = isEditing && groupDetailQuery.isLoading;

  return (
    <div className="space-y-6 text-slate-900">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-700 shadow-sm">
                  <Layers3 className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <CardTitle className="text-xl text-slate-900">
                    Promoções por grupo/faixa
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm leading-6 text-slate-600">
                    Crie grupos de promoção por quantidade e vincule um ou vários
                    produtos na mesma configuração.
                  </CardDescription>
                </div>
              </div>

              <Button
                type="button"
                className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                onClick={openCreateDialog}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo grupo
              </Button>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Buscar por nome do grupo, produto ou SKU"
                className="h-11 rounded-xl border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <select
              value={groupStatusFilter}
              onChange={(e) =>
                setGroupStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
              }
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Todos os status</option>
              <option value="ACTIVE">Somente ativos</option>
              <option value="INACTIVE">Somente inativos</option>
            </select>
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
                  Visão rápida dos grupos
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Grupos cadastrados</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {groupsQuery.data?.length ?? 0}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Grupos ativos</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {activeGroupsCount}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Produtos vinculados</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {totalLinkedProducts}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-xl text-slate-900">Grupos cadastrados</CardTitle>
          <CardDescription className="text-slate-600">
            Gerencie grupos de promoção por quantidade com múltiplos produtos.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {groupsQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
              Carregando grupos...
            </div>
          ) : groupsQuery.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Erro ao carregar grupos.
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
              Nenhum grupo encontrado.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredGroups.map((group) => {
                const tiersSummary = getTierSummary(
                  group.tiers.map((tier) => ({
                    id: tier.id,
                    minQuantity: Number(tier.minQuantity),
                    discountType: tier.discountType,
                    discountValue: toNumber(tier.discountValue),
                  }))
                );

                return (
                  <Card
                    key={group.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <CardHeader className="space-y-4 border-b border-slate-100 bg-slate-50/70">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="line-clamp-2 text-base font-semibold text-slate-900">
                            {group.name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-slate-500">
                            {group.productsCount} produto(s) vinculado(s)
                          </CardDescription>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm">
                          <Package2 className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge
                          className={
                            group.active
                              ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                              : "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200"
                          }
                        >
                          {group.active ? "Ativo" : "Inativo"}
                        </Badge>

                        <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                          {getAppliesToLabel(group.appliesTo)}
                        </Badge>

                        <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                          {group.tiers.length} faixa(s)
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-5">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Faixas
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-800">
                          {tiersSummary}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Produtos
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.products.slice(0, 5).map((product) => (
                            <span
                              key={product.id}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                            >
                              {product.name}
                            </span>
                          ))}

                          {group.products.length > 5 && (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                              +{group.products.length - 5} outros
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-sm text-slate-500">Início</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatDateTime(group.startsAt)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-sm text-slate-500">Fim</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatDateTime(group.endsAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="h-11 flex-1 rounded-xl bg-slate-900 text-white shadow-sm hover:bg-slate-800"
                          onClick={() => openEditDialog(group.id)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-xl border-red-300 bg-white text-red-700 hover:bg-red-50"
                          onClick={() => {
                            const ok = window.confirm(
                              `Deseja desativar o grupo "${group.name}"?`
                            );
                            if (!ok) return;
                            disableMutation.mutate(group.id);
                          }}
                          disabled={!group.active || disableMutation.isPending}
                        >
                          {disableMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PowerOff className="h-4 w-4" />
                          )}
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);

          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-6xl border border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {isEditing ? "Editar grupo de promoção" : "Novo grupo de promoção"}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Vincule um ou vários produtos e configure as faixas de desconto por
              quantidade.
            </DialogDescription>
          </DialogHeader>

          {isDialogLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Carregando grupo...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm font-semibold text-slate-900">
                        Nome do grupo
                      </Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Promoção Escovas"
                        className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-900">
                        Aplicar para
                      </Label>
                      <select
                        value={appliesTo}
                        onChange={(e) => setAppliesTo(e.target.value as GroupAppliesTo)}
                        className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="BOTH">Todos</option>
                        <option value="CUSTOMER">Cliente</option>
                        <option value="SALON">Salão</option>
                        <option value="CUSTOMER_SALON">Cliente + Salão</option>
                        <option value="SELLER">Seller</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold text-slate-900">
                          Grupo ativo
                        </Label>
                        <p className="text-sm leading-6 text-slate-600">
                          Quando ativo, o grupo pode ser aplicado na precificação.
                        </p>
                      </div>
                      <Switch checked={active} onCheckedChange={setActive} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-900">
                        Início
                      </Label>
                      <Input
                        type="datetime-local"
                        value={startsAtInput}
                        onChange={(e) => setStartsAtInput(e.target.value)}
                        className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-900">
                        Fim
                      </Label>
                      <Input
                        type="datetime-local"
                        value={endsAtInput}
                        onChange={(e) => setEndsAtInput(e.target.value)}
                        className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Produtos do grupo
                        </p>
                        <p className="text-sm text-slate-600">
                          Selecione um ou vários produtos para compartilhar as mesmas
                          faixas.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                          onClick={toggleSelectFilteredProducts}
                          disabled={filteredProducts.length === 0}
                        >
                          {allFilteredProductsSelected
                            ? "Desmarcar filtrados"
                            : "Selecionar filtrados"}
                        </Button>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Buscar produtos por nome ou SKU"
                        className="h-11 rounded-xl border-slate-300 bg-white pl-10 text-slate-900"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                        {selectedProductIds.length} selecionado(s)
                      </Badge>

                      <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                        {productsQuery.data?.length ?? 0} produto(s) carregado(s)
                      </Badge>
                    </div>

                    {selectedProducts.length > 0 && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                          Selecionados
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {selectedProducts.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => toggleProduct(product.id)}
                              className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
                            >
                              {product.name} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {productsQuery.isLoading ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        Carregando produtos...
                      </div>
                    ) : productsQuery.isError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        Erro ao carregar produtos.
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        Nenhum produto encontrado.
                      </div>
                    ) : (
                      <div className="grid max-h-[340px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                        {filteredProducts.map((product) => {
                          const isSelected = selectedProductIds.includes(product.id);

                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => toggleProduct(product.id)}
                              className={[
                                "rounded-2xl border p-4 text-left transition-all",
                                isSelected
                                  ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                                  : "border-slate-200 bg-white hover:border-slate-300",
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                                    {product.name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    SKU: {product.sku || "—"}
                                  </p>
                                </div>

                                <div
                                  className={[
                                    "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                                    isSelected
                                      ? "bg-blue-600 text-white"
                                      : "bg-slate-100 text-slate-500",
                                  ].join(" ")}
                                >
                                  {isSelected ? "Selecionado" : "Selecionar"}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
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
                        onClick={addTier}
                        className="h-11 rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar faixa
                      </Button>
                    </div>

                    {tiers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5 text-sm text-blue-900">
                        Nenhuma faixa cadastrada ainda.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {tiers.map((tier, index) => (
                          <div
                            key={`${tier.id || "new"}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
                          >
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <div className="rounded-xl bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                                  Faixa {index + 1}
                                </div>

                                <div className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                  {tier.minQuantity}+ unidades
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => removeTier(index)}
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
                                  value={tier.minQuantity}
                                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-900"
                                  onChange={(e) =>
                                    updateTier(index, {
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
                                  value={tier.discountType}
                                  onChange={(e) =>
                                    updateTier(index, {
                                      discountType: e.target.value as QuantityDiscountType,
                                    })
                                  }
                                >
                                  <option value="PERCENT">Percentual</option>
                                  <option value="FIXED">Valor fixo</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  {tier.discountType === "PERCENT" ? "Percentual" : "Valor"}
                                </Label>

                                <div className="relative">
                                  {tier.discountType === "PERCENT" ? (
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
                                    value={tier.discountValue}
                                    className="h-11 rounded-xl border-slate-300 bg-white pl-14 text-slate-900"
                                    onChange={(e) =>
                                      updateTier(index, {
                                        discountValue: Number(e.target.value),
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                              {tier.discountType === "PERCENT" ? (
                                <>
                                  Comprando{" "}
                                  <span className="font-semibold text-slate-900">
                                    {tier.minQuantity} ou mais
                                  </span>
                                  , o cliente recebe{" "}
                                  <span className="font-semibold text-blue-700">
                                    {tier.discountValue}% de desconto
                                  </span>
                                  .
                                </>
                              ) : (
                                <>
                                  Comprando{" "}
                                  <span className="font-semibold text-slate-900">
                                    {tier.minQuantity} ou mais
                                  </span>
                                  , o cliente recebe{" "}
                                  <span className="font-semibold text-emerald-700">
                                    {formatCurrency(tier.discountValue)}
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
                          active
                            ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                            : "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200"
                        }
                      >
                        {active ? "Ativo" : "Inativo"}
                      </Badge>

                      <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                        {selectedProductIds.length} produto(s)
                      </Badge>

                      <Badge className="border border-slate-300 bg-white text-slate-700 hover:bg-white">
                        {tiers.length} faixa(s)
                      </Badge>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 text-sm leading-6 text-slate-800 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                        Grupo
                      </p>
                      <p className="font-medium text-slate-900">
                        {name.trim() || "Sem nome definido"}
                      </p>
                      <p className="mt-2 text-slate-700">
                        Aplica para: {getAppliesToLabel(appliesTo)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 text-sm leading-6 text-violet-900 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
                        Faixas atuais
                      </p>
                      <p>{getTierSummary(tiers)}</p>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-sm leading-6 text-amber-900 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                        Datas
                      </p>
                      <p>Início: {startsAtInput || "Sem início"}</p>
                      <p>Fim: {endsAtInput || "Sem fim"}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-800 shadow-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Produtos selecionados
                      </p>

                      {selectedProducts.length === 0 ? (
                        <p className="text-slate-500">Nenhum produto selecionado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedProducts.slice(0, 8).map((product) => (
                            <span
                              key={product.id}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                            >
                              {product.name}
                            </span>
                          ))}

                          {selectedProducts.length > 8 && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                              +{selectedProducts.length - 8} outros
                            </span>
                          )}
                        </div>
                      )}
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

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  className="h-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {isEditing ? "Salvar alterações" : "Criar grupo"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}