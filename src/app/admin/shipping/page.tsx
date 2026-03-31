"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck,
  MapPinned,
  BadgePercent,
  Save,
  RefreshCw,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ShippingConfig = {
  id?: string;
  localDeliveryEnabled: boolean;
  localDeliveryCity: string;
  localDeliveryState: string;
  localDeliveryPrice: string | number;

  correiosDiscountEnabled: boolean;
  correiosDiscountMinSubtotal: string | number;
  correiosDiscountMaxAmount: string | number;

  createdAt?: string;
  updatedAt?: string;
};

function normalizeMoneyInput(v: string) {
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

function toMoneyString(value: string | number | null | undefined, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).replace(".", ",");
}

function toNumberBR(value: string | number | null | undefined, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrencyBRL(value: string | number | null | undefined) {
  const amount = toNumberBR(value, 0);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function ToggleField({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-black"
      />
    </label>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700">
            {icon}
          </div>

          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? (
              <p className="text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-5">{children}</CardContent>
    </Card>
  );
}

async function fetchShippingConfig(): Promise<ShippingConfig> {
  const { data } = await api.get(endpoints.adminShippingConfig.get);
  return (data?.item ?? data) as ShippingConfig;
}

export default function AdminShippingPage() {
  const qc = useQueryClient();

  const configQ = useQuery({
    queryKey: ["admin-shipping-config"],
    queryFn: fetchShippingConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const config = configQ.data ?? null;

  const [localDeliveryEnabled, setLocalDeliveryEnabled] = useState(true);
  const [localDeliveryCity, setLocalDeliveryCity] = useState("São José do Rio Preto");
  const [localDeliveryState, setLocalDeliveryState] = useState("SP");
  const [localDeliveryPrice, setLocalDeliveryPrice] = useState("0");

  const [correiosDiscountEnabled, setCorreiosDiscountEnabled] = useState(false);
  const [correiosDiscountMinSubtotal, setCorreiosDiscountMinSubtotal] = useState("300");
  const [correiosDiscountMaxAmount, setCorreiosDiscountMaxAmount] = useState("30");

  useEffect(() => {
    if (!config) return;

    setLocalDeliveryEnabled(Boolean(config.localDeliveryEnabled));
    setLocalDeliveryCity(config.localDeliveryCity || "São José do Rio Preto");
    setLocalDeliveryState((config.localDeliveryState || "SP").toUpperCase());
    setLocalDeliveryPrice(toMoneyString(config.localDeliveryPrice, "0"));

    setCorreiosDiscountEnabled(Boolean(config.correiosDiscountEnabled));
    setCorreiosDiscountMinSubtotal(
      toMoneyString(config.correiosDiscountMinSubtotal, "300")
    );
    setCorreiosDiscountMaxAmount(
      toMoneyString(config.correiosDiscountMaxAmount, "30")
    );
  }, [config]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = {
        localDeliveryEnabled: Boolean(localDeliveryEnabled),
        localDeliveryCity: localDeliveryCity.trim(),
        localDeliveryState: localDeliveryState.trim().toUpperCase(),
        localDeliveryPrice: String(localDeliveryPrice || "0").replace(",", "."),

        correiosDiscountEnabled: Boolean(correiosDiscountEnabled),
        correiosDiscountMinSubtotal: String(
          correiosDiscountMinSubtotal || "0"
        ).replace(",", "."),
        correiosDiscountMaxAmount: String(
          correiosDiscountMaxAmount || "0"
        ).replace(",", "."),
      };

      if (!payload.localDeliveryCity) {
        throw new Error("Informe a cidade da entrega local.");
      }

      if (!payload.localDeliveryState || payload.localDeliveryState.length !== 2) {
        throw new Error("UF inválida. Use 2 letras, ex.: SP.");
      }

      if (toNumberBR(payload.localDeliveryPrice) < 0) {
        throw new Error("O valor da entrega local não pode ser negativo.");
      }

      if (toNumberBR(payload.correiosDiscountMinSubtotal) < 0) {
        throw new Error("O mínimo do desconto dos Correios não pode ser negativo.");
      }

      if (toNumberBR(payload.correiosDiscountMaxAmount) < 0) {
        throw new Error("O teto do desconto dos Correios não pode ser negativo.");
      }

      await api.put(endpoints.adminShippingConfig.save, payload);
    },
    onSuccess: async () => {
      toast.success("Configurações de entrega e frete salvas.");
      await qc.invalidateQueries({ queryKey: ["admin-shipping-config"] });
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Falha ao salvar configurações."));
    },
  });

  const summary = useMemo(() => {
    return {
      localPriceLabel: formatCurrencyBRL(localDeliveryPrice),
      minSubtotalLabel: formatCurrencyBRL(correiosDiscountMinSubtotal),
      maxDiscountLabel: formatCurrencyBRL(correiosDiscountMaxAmount),
    };
  }, [localDeliveryPrice, correiosDiscountMinSubtotal, correiosDiscountMaxAmount]);

  if (configQ.isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        Carregando configurações…
      </div>
    );
  }

  if (configQ.isError) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-600">
        {apiErrorMessage(configQ.error, "Erro ao carregar configurações de frete.")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-24 sm:px-6 lg:space-y-6 lg:pb-10">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-200">
                  Configuração logística
                </Badge>

                <Badge className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-emerald-200">
                  Entrega local + Correios
                </Badge>
              </div>

              <div className="space-y-1">
                <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">
                  Entrega e frete
                </h1>
                <p className="text-sm text-white/70">
                  Centralize a entrega local e o desconto automático dos Correios
                  em um só lugar.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/70">
                <span className="rounded-full bg-white/10 px-3 py-1">
                  Cidade local:{" "}
                  <span className="font-semibold text-white">
                    {localDeliveryCity || "-"}
                  </span>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1">
                  UF:{" "}
                  <span className="font-semibold text-white">
                    {localDeliveryState || "-"}
                  </span>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1">
                  Entrega local:{" "}
                  <span className="font-semibold text-white">
                    {localDeliveryEnabled ? "Ligada" : "Desligada"}
                  </span>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1">
                  Desconto Correios:{" "}
                  <span className="font-semibold text-white">
                    {correiosDiscountEnabled ? "Ligado" : "Desligado"}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => configQ.refetch()}
                disabled={configQ.isFetching || saveM.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>

              <Button
                type="button"
                className="rounded-2xl bg-sky-500 text-white hover:bg-sky-600 hover:text-white"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveM.isPending ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Valor entrega local
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {summary.localPriceLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Mínimo desconto Correios
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {summary.minSubtotalLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Teto desconto Correios
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {summary.maxDiscountLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Região local
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {localDeliveryCity || "—"} / {localDeliveryState || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <SectionCard
            icon={<MapPinned className="h-5 w-5" />}
            title="Entrega local"
            description="Defina quando a entrega própria aparece e qual valor será cobrado."
          >
            <ToggleField
              checked={localDeliveryEnabled}
              onChange={setLocalDeliveryEnabled}
              title="Ativar entrega local"
              description="Quando ligado, pedidos da cidade/UF configuradas poderão receber a opção de entrega local."
            />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 md:col-span-2">
                <Label>Cidade atendida</Label>
                <Input
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                  value={localDeliveryCity}
                  onChange={(e) => setLocalDeliveryCity(e.target.value)}
                  placeholder="Ex.: São José do Rio Preto"
                />
              </div>

              <div className="grid gap-2">
                <Label>UF</Label>
                <Input
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/60 uppercase"
                  value={localDeliveryState}
                  onChange={(e) =>
                    setLocalDeliveryState(
                      e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase()
                    )
                  }
                  placeholder="SP"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid gap-2 md:max-w-xs">
              <Label>Valor da entrega local</Label>
              <Input
                className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                value={localDeliveryPrice}
                onChange={(e) => setLocalDeliveryPrice(normalizeMoneyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
              />
              <div className="text-xs text-slate-500">
                Use <span className="font-semibold">0</span> para entrega grátis.
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<BadgePercent className="h-5 w-5" />}
            title="Desconto automático dos Correios"
            description="Aplique desconto no frete automaticamente quando o pedido atingir o valor mínimo."
          >
            <ToggleField
              checked={correiosDiscountEnabled}
              onChange={setCorreiosDiscountEnabled}
              title="Ativar desconto automático"
              description="Quando ligado, o desconto será aplicado automaticamente nas opções de frete dos Correios."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Valor mínimo do pedido</Label>
                <Input
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                  value={correiosDiscountMinSubtotal}
                  onChange={(e) =>
                    setCorreiosDiscountMinSubtotal(normalizeMoneyInput(e.target.value))
                  }
                  placeholder="300"
                  inputMode="decimal"
                />
                <div className="text-xs text-slate-500">
                  Ex.: pedidos acima de {formatCurrencyBRL(correiosDiscountMinSubtotal)}.
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Teto do desconto no frete</Label>
                <Input
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
                  value={correiosDiscountMaxAmount}
                  onChange={(e) =>
                    setCorreiosDiscountMaxAmount(normalizeMoneyInput(e.target.value))
                  }
                  placeholder="30"
                  inputMode="decimal"
                />
                <div className="text-xs text-slate-500">
                  Ex.: descontar até {formatCurrencyBRL(correiosDiscountMaxAmount)}.
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <SectionCard
            icon={<Truck className="h-5 w-5" />}
            title="Resumo da regra"
            description="Visual rápido de como a lógica está configurada hoje."
          >
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Entrega local
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {localDeliveryEnabled
                    ? `Pedidos de ${localDeliveryCity || "—"}/${localDeliveryState || "—"} podem receber entrega local por ${summary.localPriceLabel}.`
                    : "A entrega local está desligada no momento."}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Correios
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {correiosDiscountEnabled
                    ? `Pedidos a partir de ${summary.minSubtotalLabel} recebem desconto automático no frete dos Correios, limitado a ${summary.maxDiscountLabel}.`
                    : "O desconto automático dos Correios está desligado."}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-emerald-800">
                  Comportamento esperado
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  Mesma região configurada → pode aparecer entrega local. Fora da região →
                  segue cotação normal. Desconto dos Correios só entra quando estiver ativo
                  e o pedido bater o mínimo.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}