"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock3,
} from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { openLocalDeliveryUnifiedBatchPdf } from "@/components/admin/local-delivery/localDeliveryPdf";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

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
import { Textarea } from "@/components/ui/textarea";

type Order = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  paymentStatus?: string;
  adminApprovalStatus?: string;
  orderStatus?: string;
  status?: string;
  total?: string | number;
  salonName?: string;
  customerName?: string;
  deliveryType?: "LOCAL" | "CORREIOS" | "UNKNOWN" | string | null;
  shippingCarrier?: string | null;
  shippingServiceCode?: string | null;
  shippingServiceName?: string | null;
    localDeliveryStatus?:
    | "PENDING_SEPARATION"
    | "PACKED"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "DELIVERY_PROBLEM"
    | string
    | null;
  localDeliveryUpdatedAt?: string | null;
  localDeliveryPackedAt?: string | null;
  localDeliveryOutForDeliveryAt?: string | null;
  localDeliveryDeliveredAt?: string | null;
  localDeliveryProblemAt?: string | null;
  localDeliveryLastNote?: string | null;
};

type LocalStatusFilter =
  | "ALL"
  | "PENDING_SEPARATION"
  | "PACKED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_PROBLEM";

type LocalDeliveryException = {
  id: string;
  date: string;
  scope: "ALL" | "CITY";
  action: "PAUSED" | "RESCHEDULED";
  city?: string | null;
  state?: string | null;
  newDate?: string | null;
  reason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AdminLocalDeliveryTodayResponse = {
  date: string;
  timezone?: string;
  weekday?: string;
  weekdayLabel?: string;
  globalException?: LocalDeliveryException | null;
  exceptions?: LocalDeliveryException[];
  cities?: Array<{
    city: string;
    state: string;
    ordersCount: number;
    pendingSeparation: number;
    packed: number;
    outForDelivery: number;
    delivered: number;
    problem: number;
    blocked?: boolean;
    exception?: {
      id: string;
      action: "PAUSED" | "RESCHEDULED";
      reason?: string | null;
      newDate?: string | null;
    } | null;
    orderIds?: string[];
  }>;
  totals?: {
    citiesCount: number;
    ordersCount: number;
    pendingSeparation: number;
    packed: number;
    outForDelivery: number;
    delivered: number;
    problem: number;
    blockedCitiesCount?: number;
    blockedOrdersCount?: number;
  };
  orders?: Array<{
    id: string;
    code?: string | null;
    createdAt?: string | null;
    customerName?: string | null;
    city?: string | null;
    state?: string | null;
    paymentStatus?: string | null;
    adminApprovalStatus?: string | null;
    deliveryType?: string | null;
    localDeliveryStatus?: string | null;
  }>;
};


function fmtDate(iso?: string) {
  if (!iso) return "Não informado";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function brl(v?: string | number) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function formatDateLabel(date?: string) {
  if (!date) return "Data não informada";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("pt-BR");
}

function idempotencyKey(orderId: string, action: string) {
  return `admin-order:${orderId}:${action}`;
}

function prettyStatus(value?: string | null) {
  if (!value) return "Não informado";
  return String(value).replaceAll("_", " ").toUpperCase();
}

function getStatusMeta(value?: string | null) {
  const normalized = String(value ?? "").toUpperCase();

  if (
    [
      "PAID",
      "APPROVED",
      "SUCCESS",
      "COMPLETED",
      "DONE",
      "DELIVERED",
    ].includes(normalized)
  ) {
    return {
      chip: "bg-emerald-600/10 text-emerald-700 ring-emerald-200",
      border: "border-emerald-200/80",
      soft: "bg-emerald-50/80",
    };
  }

  if (
    ["PENDING", "WAITING", "PROCESSING", "AWAITING", "UNDER_REVIEW"].includes(
      normalized
    )
  ) {
    return {
      chip: "bg-amber-600/10 text-amber-700 ring-amber-200",
      border: "border-amber-200/80",
      soft: "bg-amber-50/80",
    };
  }

  if (
    [
      "REJECTED",
      "FAILED",
      "CANCELED",
      "CANCELLED",
      "DENIED",
      "EXPIRED",
    ].includes(normalized)
  ) {
    return {
      chip: "bg-red-600/10 text-red-700 ring-red-200",
      border: "border-red-200/80",
      soft: "bg-red-50/80",
    };
  }

  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(normalized)) {
    return {
      chip: "bg-slate-600/10 text-slate-700 ring-slate-200",
      border: "border-slate-200/80",
      soft: "bg-slate-100/80",
    };
  }

  return {
    chip: "bg-zinc-600/10 text-zinc-700 ring-zinc-200",
    border: "border-zinc-200/80",
    soft: "bg-zinc-50/80",
  };
}

function normalizeDeliveryValue(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function resolveDeliveryType(order: Order): "LOCAL" | "CORREIOS" | "UNKNOWN" {
  const candidates = [
    order.deliveryType,
    order.shippingCarrier,
    order.shippingServiceName,
    order.shippingServiceCode,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDeliveryValue(candidate);
    if (!normalized) continue;

    if (
      ["LOCAL", "ENTREGA_LOCAL", "LOCAL_DELIVERY"].some(
        (token) => normalized === token || normalized.includes(token)
      )
    ) {
      return "LOCAL";
    }

    if (normalized === "CORREIOS" || normalized.includes("CORREIOS")) {
      return "CORREIOS";
    }
  }

  return "UNKNOWN";
}

function getDeliveryBadgeMeta(deliveryType: "LOCAL" | "CORREIOS" | "UNKNOWN") {
  if (deliveryType === "LOCAL") {
    return {
      label: "Entrega local",
      classes:
        "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 ring-emerald-200",
    };
  }

  if (deliveryType === "CORREIOS") {
    return {
      label: "Correios",
      classes: "border-sky-200/80 bg-sky-50/90 text-sky-700 ring-sky-200",
    };
  }

  return {
    label: "Entrega não identificada",
    classes: "border-zinc-200/80 bg-zinc-50/90 text-zinc-700 ring-zinc-200",
  };
}

function getLocalDeliveryStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();

  if (normalized === "PENDING_SEPARATION") return "Aguardando separação";
  if (normalized === "PACKED") return "Empacotado";
  if (normalized === "OUT_FOR_DELIVERY") return "Saiu para entrega";
  if (normalized === "DELIVERED") return "Entregue";
  if (normalized === "DELIVERY_PROBLEM") return "Problema na entrega";

  return null;
}


function matchesDeliveryFilter(
  order: Order,
  filter: "ALL" | "LOCAL" | "CORREIOS" | "UNKNOWN"
) {
  if (filter === "ALL") return true;
  return resolveDeliveryType(order) === filter;
}

function resolveLocalDeliveryStatus(order: Order) {
  if (resolveDeliveryType(order) !== "LOCAL") return null;

  return order.localDeliveryStatus || "PENDING_SEPARATION";
}

function matchesLocalStatusFilter(order: Order, filter: LocalStatusFilter) {
  if (filter === "ALL") return true;

  if (resolveDeliveryType(order) !== "LOCAL") return false;

  return resolveLocalDeliveryStatus(order) === filter;
}

function StatusBadge({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const meta = getStatusMeta(value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        meta.border,
        meta.soft,
        meta.chip
      )}
    >
           <span className="uppercase tracking-[0.14em] text-[10px] text-zinc-500">{label}</span>
      <span>{prettyStatus(value)}</span>
    </span>
  );
}

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [deliveryFilter, setDeliveryFilter] = useState<
    "ALL" | "LOCAL" | "CORREIOS" | "UNKNOWN"
  >("ALL");
  const [localStatusFilter, setLocalStatusFilter] =
    useState<LocalStatusFilter>("ALL");
  const [onlyTodayLocalDelivery, setOnlyTodayLocalDelivery] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [globalPauseReason, setGlobalPauseReason] = useState("");
  const [isGlobalPauseDialogOpen, setIsGlobalPauseDialogOpen] = useState(false);
  const [cityPauseReason, setCityPauseReason] = useState("");
  const [isCityPauseDialogOpen, setIsCityPauseDialogOpen] = useState(false);
  const [cityDialogTarget, setCityDialogTarget] = useState<{ city: string; state: string } | null>(
    null
  );
  const [recentActions, setRecentActions] = useState<
    Record<string, { action: "approve" | "reject"; at: number; order: Order }>
  >({});
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const ordersQ = useQuery({
    queryKey: ["orders", { take: 100 }],
    queryFn: async () => {
      const res = await api.get(endpoints.orders.list, { params: { take: 100 } });
      return (res.data?.items ?? []) as Order[];
    },
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });

    const localTodayQ = useQuery({
    queryKey: ["admin-local-delivery-today"],
    queryFn: async () => {
      const { data } = await api.get(endpoints.adminLocalDelivery.today);
      return data as AdminLocalDeliveryTodayResponse;
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const pending = useMemo(() => {
    return (ordersQ.data ?? []).filter((o) => {
      if (o.paymentStatus !== "PAID" || o.adminApprovalStatus !== "PENDING") return false;
      const recentAction = recentActions[o.id];
      return !recentAction || Date.now() - recentAction.at > 10 * 60_000;
    });
  }, [ordersQ.data, recentActions]);

  const approvedRecent = useMemo(() => {
    const fromBackend = (ordersQ.data ?? []).filter((o) => o.adminApprovalStatus === "APPROVED");
    const fromLocal = Object.values(recentActions)
      .filter((entry) => entry.action === "approve")
      .map((entry) => entry.order);

    const merged = [...fromLocal, ...fromBackend].reduce<Record<string, Order>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    return Object.values(merged)
      .sort((a, b) => {
        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return db - da;
      })
      .slice(0, 30);
  }, [ordersQ.data, recentActions]);

  const rejectedRecent = useMemo(() => {
    const fromBackend = (ordersQ.data ?? []).filter((o) => o.adminApprovalStatus === "REJECTED");
    const fromLocal = Object.values(recentActions)
      .filter((entry) => entry.action === "reject")
      .map((entry) => entry.order);

    const merged = [...fromLocal, ...fromBackend].reduce<Record<string, Order>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    return Object.values(merged)
      .sort((a, b) => {
        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return db - da;
      })
      .slice(0, 30);
  }, [ordersQ.data, recentActions]);

  const pendingTotal = useMemo(() => {
    const total = pending.reduce((acc, order) => {
      const value =
        typeof order.total === "string" ? Number(order.total) : order.total ?? 0;
      return Number.isFinite(value) ? acc + Number(value) : acc;
    }, 0);

    return brl(total) ?? "R$ 0,00";
  }, [pending]);

  const currentTabOrders =
    activeTab === "pending"
      ? pending
      : activeTab === "approved"
        ? approvedRecent
        : rejectedRecent;

          const todayOrderIds = useMemo(
    () => new Set((localTodayQ.data?.orders ?? []).map((order) => order.id)),
    [localTodayQ.data?.orders]
  );

  function matchesTodayFilter(order: Order) {
    if (!onlyTodayLocalDelivery) return true;
    return todayOrderIds.has(order.id);
  }

  const displayedOrders = useMemo(
    () =>
      currentTabOrders
        .filter((order) => matchesDeliveryFilter(order, deliveryFilter))
        .filter((order) => matchesLocalStatusFilter(order, localStatusFilter))
        .filter((order) => matchesTodayFilter(order)),
    [currentTabOrders, deliveryFilter, localStatusFilter, onlyTodayLocalDelivery, todayOrderIds]
  );

        const displayedOrderIds = useMemo(
    () => displayedOrders.map((order) => order.id),
    [displayedOrders]
  );
  const selectedVisibleCount = useMemo(
    () => displayedOrderIds.filter((id) => selectedOrderIds.has(id)).length,
    [displayedOrderIds, selectedOrderIds]
  );
  const allDisplayedSelected =
    displayedOrderIds.length > 0 && displayedOrderIds.every((id) => selectedOrderIds.has(id));
  const someDisplayedSelected = displayedOrderIds.some((id) => selectedOrderIds.has(id));

  const selectedDisplayedOrders = useMemo(
    () => displayedOrders.filter((order) => selectedOrderIds.has(order.id)),
    [displayedOrders, selectedOrderIds]
  );
  const selectedLocalDisplayedOrders = useMemo(
    () =>
      selectedDisplayedOrders.filter(
        (order) => resolveDeliveryType(order) === "LOCAL"
      ),
    [selectedDisplayedOrders]
  );
  const selectedLocalOrderIds = useMemo(
    () => selectedLocalDisplayedOrders.map((order) => order.id),
    [selectedLocalDisplayedOrders]
  );
  const selectedNonLocalCount = useMemo(
    () => selectedDisplayedOrders.length - selectedLocalDisplayedOrders.length,
    [selectedDisplayedOrders, selectedLocalDisplayedOrders]
  );

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  function toggleSelectDisplayedOrders() {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);

      if (allDisplayedSelected) {
        for (const id of displayedOrderIds) {
          next.delete(id);
        }
      } else {
        for (const id of displayedOrderIds) {
          next.add(id);
        }
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedOrderIds(new Set());
  }

   const loadedOrders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);

  function selectTodayOrders(status?: "PACKED" | "PENDING_SEPARATION") {
        if (localTodayQ.data?.globalException) {
      toast.warning(
        "As entregas locais de hoje estão pausadas. Remova a pausa para selecionar pedidos."
      );
      return;
    }
    const todayOrders = localTodayQ.data?.orders ?? [];
    const loadedById = new Map(loadedOrders.map((order) => [order.id, order]));
    const todayIds = new Set(todayOrders.map((order) => order.id));
        const blockedCities = new Set(
      (localTodayQ.data?.cities ?? [])
        .filter((city) => city.blocked)
        .map((city) => `${city.city}::${city.state}`)
    );
    const eligibleLoadedOrders = loadedOrders.filter((order) => {
      if (!todayIds.has(order.id)) return false;
      if (onlyTodayLocalDelivery && !todayOrderIds.has(order.id)) return false;
            const todayOrder = todayOrders.find((item) => item.id === order.id);
      if (
        todayOrder?.city &&
        todayOrder?.state &&
        blockedCities.has(`${todayOrder.city}::${todayOrder.state}`)
      ) {
        return false;
      }
      if (!status) return true;
      const resolvedStatus = resolveLocalDeliveryStatus(order);
      if (status === "PACKED") return resolvedStatus === "PACKED";
      return !resolvedStatus || resolvedStatus === "PENDING_SEPARATION";
    });
    const nextIds = eligibleLoadedOrders.map((order) => order.id);

    setSelectedOrderIds(new Set(nextIds));

    if (todayOrders.length > nextIds.length) {
      const missingCount = todayOrders.filter((order) => !loadedById.has(order.id)).length;
      if (missingCount > 0) {
        toast.warning("Alguns pedidos de hoje não estão na lista carregada.");
      }
    }
  }

  function handleViewTodayOrders() {
    setOnlyTodayLocalDelivery(true);
    setDeliveryFilter("LOCAL");
    setLocalStatusFilter("ALL");
    setActiveTab("approved");
  }

    function handleDeliveryFilterChange(
    filter: "ALL" | "LOCAL" | "CORREIOS" | "UNKNOWN"
  ) {
    setDeliveryFilter(filter);
    if (filter === "CORREIOS") {
      setLocalStatusFilter("ALL");
    }
  }

  useEffect(() => {
    const visible = new Set(displayedOrderIds);

    setSelectedOrderIds((prev) => {
      const next = new Set<string>();

      for (const id of prev) {
        if (visible.has(id)) {
          next.add(id);
        }
      }

      if (next.size === prev.size) return prev;
      return next;
    });
  }, [displayedOrderIds]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = !allDisplayedSelected && someDisplayedSelected;
  }, [allDisplayedSelected, someDisplayedSelected]);

  const decideM = useMutation({
    mutationFn: async (vars: { orderId: string; action: "approve" | "reject" }) => {
      const { orderId, action } = vars;
      await api.patch(
        endpoints.adminOrders.decide(orderId),
        { action },
        { headers: { "Idempotency-Key": idempotencyKey(orderId, action) } }
      );
    },
    onSuccess: async (_data, vars) => {
      const sourceOrder = (ordersQ.data ?? []).find((order) => order.id === vars.orderId);
      if (sourceOrder) {
        setRecentActions((prev) => ({
          ...prev,
          [vars.orderId]: {
            action: vars.action,
            at: Date.now(),
            order: {
              ...sourceOrder,
              adminApprovalStatus: vars.action === "approve" ? "APPROVED" : "REJECTED",
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      }

      toast.success(
        vars.action === "approve"
          ? "Pedido aprovado. Agora ele está em Aprovados recentemente."
          : "Pedido reprovado. Agora ele está em Reprovados recentemente."
      );
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await ordersQ.refetch();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Falha ao aprovar/reprovar.")),
  });

    const localBatchPdfM = useMutation({
    mutationFn: async (orderIds: string[]) =>
      openLocalDeliveryUnifiedBatchPdf(orderIds),
    onSuccess: () => toast.success("Documentos locais abertos para impressão."),
    onError: (err) =>
      toast.error(
        apiErrorMessage(err, "Não foi possível abrir os documentos locais.")
      ),
  });

  function handleOpenSelectedLocalDocuments() {
if (!selectedLocalOrderIds.length) {
      toast.error("Selecione pelo menos um pedido de entrega local.");
      return;
    }

    if (selectedNonLocalCount > 0) {
      toast.warning("Pedidos que não são entrega local foram ignorados.");
    }

    localBatchPdfM.mutate(selectedLocalOrderIds);
  }

  const localDeliveryBulkStatusM = useMutation({
    mutationFn: async (vars: {
      orderIds: string[];
      status: "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_PROBLEM";
      note?: string;
    }) => {
      const { data } = await api.post(
        endpoints.adminOrders.localDeliveryBulkStatus,
        vars
      );
      return data as { updated?: number; skipped?: number };
    },
    onSuccess: async (data) => {
      toast.success(`Status local atualizado: ${data.updated ?? 0} pedido(s).`);

      if ((data.skipped ?? 0) > 0) {
        toast.warning(`${data.skipped} pedido(s) foram ignorados.`);
      }

      await qc.invalidateQueries({ queryKey: ["orders"] });
      await ordersQ.refetch();
    },
    onError: (err) => {
      toast.error(
        apiErrorMessage(err, "Não foi possível atualizar os pedidos locais.")
      );
    },
  });
    const createLocalDeliveryExceptionM = useMutation({
    mutationFn: async (body: {
      date: string;
      scope: "ALL" | "CITY";
      action: "PAUSED" | "RESCHEDULED";
      city?: string;
      state?: string;
      newDate?: string;
      reason?: string;
    }) => {
      const { data } = await api.post(endpoints.adminLocalDelivery.exceptions, body);
      return data;
    },
  });

  const deleteLocalDeliveryExceptionM = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(endpoints.adminLocalDelivery.exceptionById(id));
    },
  });

  function handleBulkLocalDeliveryStatus(
    status: "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_PROBLEM"
  ) {
    if (!selectedLocalOrderIds.length) {
      toast.error("Selecione pelo menos um pedido de entrega local.");
      return;
    }

    if (selectedNonLocalCount > 0) {
      toast.warning("Pedidos que não são entrega local serão ignorados.");
    }

    localDeliveryBulkStatusM.mutate({
      orderIds: selectedLocalOrderIds,
      status,
    });
  }
   const isGlobalPaused = Boolean(localTodayQ.data?.globalException);

  async function handlePauseToday() {
    if (!localTodayQ.data?.date) return;
   const reason = globalPauseReason.trim();
    if (!reason) {
      toast.error("Informe o motivo da pausa.");
      return;
    }

    try {
      await createLocalDeliveryExceptionM.mutateAsync({
        date: localTodayQ.data.date,
        scope: "ALL",
        action: "PAUSED",
        reason,
      });
      toast.success("Entregas locais de hoje pausadas.");
      await localTodayQ.refetch();
      await ordersQ.refetch();
      setGlobalPauseReason("");
      setIsGlobalPauseDialogOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível pausar as entregas locais."));
    }
  }

  async function handlePauseCity() {
    if (!localTodayQ.data?.date || !cityDialogTarget) return;
    const reason = cityPauseReason.trim();

    if (!cityDialogTarget.city || !cityDialogTarget.state) {
      toast.error("Cidade inválida para pausa.");
      return;
    }
    if (!reason) {
      toast.error("Informe o motivo da pausa.");
      return;
    }

    try {
      await createLocalDeliveryExceptionM.mutateAsync({
        date: localTodayQ.data.date,
        scope: "CITY",
        action: "PAUSED",
        city: cityDialogTarget.city,
        state: cityDialogTarget.state,
        reason,
      });
      toast.success("Cidade pausada para entregas de hoje.");
      await localTodayQ.refetch();
      setCityPauseReason("");
      setCityDialogTarget(null);
      setIsCityPauseDialogOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível pausar a cidade."));
    }
  }

  async function handleRemovePause(exceptionId: string) {
    if (!exceptionId) return;
    try {
      await deleteLocalDeliveryExceptionM.mutateAsync(exceptionId);
      toast.success("Pausa removida.");
      await localTodayQ.refetch();
      await ordersQ.refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível remover a pausa."));
    }
  }
  const actingOrderId = (decideM.variables as { orderId?: string } | undefined)?.orderId;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_45%,#f4f4f5_100%)]">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Aprovação de pedidos
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Acompanhe pendentes, aprovados e reprovados sem perder contexto
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full rounded-2xl border-zinc-200 bg-white sm:w-auto"
            onClick={() => ordersQ.refetch()}
            disabled={ordersQ.isFetching}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", ordersQ.isFetching && "animate-spin")} />
            {ordersQ.isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <Card className="rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
              <CardHeader className="border-b border-zinc-100 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-xl font-bold text-zinc-950">
                      Entregas locais de hoje
                    </CardTitle>
                    <CardDescription className="text-sm text-zinc-500">
                      Hoje:{" "}
                      {localTodayQ.data
                        ? `${localTodayQ.data.weekdayLabel ?? localTodayQ.data.date} • ${formatDateLabel(localTodayQ.data.date)}`
                        : "—"}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => localTodayQ.refetch()}
                    disabled={localTodayQ.isFetching}
                  >
                    <RefreshCw
                      className={cn("mr-2 h-4 w-4", localTodayQ.isFetching && "animate-spin")}
                    />
                    Atualizar painel
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-4 sm:p-5">
                {localTodayQ.isLoading ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                    Carregando entregas de hoje...
                  </div>
                ) : localTodayQ.isError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                    <p>Não foi possível carregar entregas locais de hoje.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 rounded-xl border-red-200 bg-white"
                      onClick={() => localTodayQ.refetch()}
                    >
                      Atualizar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-sm sm:grid-cols-2">
                      <p className="font-semibold text-zinc-900">
                        {(localTodayQ.data?.totals?.ordersCount ?? 0).toString()} pedidos em{" "}
                        {(localTodayQ.data?.totals?.citiesCount ?? 0).toString()} cidade(s)
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-xs text-zinc-700">
                        <span>Aguardando: {localTodayQ.data?.totals?.pendingSeparation ?? 0}</span>
                        <span>Empacotados: {localTodayQ.data?.totals?.packed ?? 0}</span>
                        <span>Em rota: {localTodayQ.data?.totals?.outForDelivery ?? 0}</span>
                        <span>Entregues: {localTodayQ.data?.totals?.delivered ?? 0}</span>
                        <span>Problema: {localTodayQ.data?.totals?.problem ?? 0}</span>
                      </div>
                    </div>

                                       {isGlobalPaused ? (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <p className="font-semibold">
                          Entregas locais de hoje pausadas
                          {localTodayQ.data?.globalException?.reason
                            ? `: ${localTodayQ.data.globalException.reason}`
                            : "."}
                        </p>
                        <p className="mt-1 text-xs">
                          As entregas locais de hoje estão pausadas. Remova a pausa para voltar a
                          sugerir pedidos.
                        </p>
                        {localTodayQ.data?.globalException?.id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 rounded-xl border-amber-300 bg-white"
                            onClick={() => handleRemovePause(localTodayQ.data?.globalException?.id ?? "")}
                            disabled={deleteLocalDeliveryExceptionM.isPending}
                          >
                            Remover pausa
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Controle do dia
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <AlertDialog
                          open={isGlobalPauseDialogOpen}
                          onOpenChange={(open) => {
                            setIsGlobalPauseDialogOpen(open);
                            if (!open) {
                              setGlobalPauseReason("");
                            } else {
                              setGlobalPauseReason("");
                            }
                          }}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled={isGlobalPaused}
                            >
                              Pausar entregas de hoje
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[28px]">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Pausar entregas locais de hoje?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Isso não altera status dos pedidos. Apenas remove as entregas de
                                hoje da sugestão operacional.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                              <div className="space-y-1">
                              <p className="text-sm font-medium text-zinc-900">
                                Motivo da pausa <span className="text-red-600">*</span>
                              </p>
                              <p className="text-xs text-zinc-500">Campo obrigatório.</p>
                            </div>
                            <Textarea
                              value={globalPauseReason}
                              onChange={(event) => setGlobalPauseReason(event.target.value)}
                              placeholder="Ex: chuva forte, feriado, entregador indisponível"
                            />
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-2xl">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-2xl"
                                onClick={handlePauseToday}
                                disabled={
                                  createLocalDeliveryExceptionM.isPending ||
                                  globalPauseReason.trim().length === 0
                                }
                              >
                                Confirmar pausa
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled>
                          Adiar cidade (V2.5B)
                        </Button>
                      </div>
                    </div>


                    {(localTodayQ.data?.totals?.ordersCount ?? 0) === 0 ? (
                      <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                        Nenhuma entrega local prevista para hoje.
                      </p>
                    ) : null}

                    {(localTodayQ.data?.cities?.length ?? 0) > 0 ? (
                      <div className="rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-sm">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Cidades
                        </p>
                        <div className="space-y-2 text-zinc-700">
                          {(localTodayQ.data?.cities ?? []).map((city) => (
                            <div
                              key={`${city.city}-${city.state}`}
                              className="rounded-lg border border-zinc-200/70 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p>
                                  {city.city}/{city.state} — {city.ordersCount} pedido(s)
                                </p>
                                {city.blocked ? (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    {city.exception?.action === "RESCHEDULED" ? "Adiada" : "Pausada"}
                                  </span>
                                ) : null}
                              </div>
                              {city.blocked ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-900">
                                  <span>
                                    {city.exception?.action === "RESCHEDULED"
                                      ? `Adiada para ${city.exception?.newDate ?? "nova data"}`
                                      : "Pausada"}
                                    {city.exception?.reason ? `: ${city.exception.reason}` : ""}
                                  </span>
                                  {city.exception?.id ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-6 rounded-lg border-amber-300 bg-white px-2 text-[11px]"
                                      disabled={deleteLocalDeliveryExceptionM.isPending}
                                      onClick={() => handleRemovePause(city.exception?.id ?? "")}
                                    >
                                      Remover pausa
                                    </Button>
                                  ) : null}
                                </div>
                              ) : (
                                <AlertDialog
                                  open={
                                    isCityPauseDialogOpen &&
                                    cityDialogTarget?.city === city.city &&
                                    cityDialogTarget?.state === city.state
                                  }
                                  onOpenChange={(open) => {
                                    if (open) {
                                      setCityDialogTarget({ city: city.city, state: city.state });
                                      setCityPauseReason("");
                                      setIsCityPauseDialogOpen(true);
                                      return;
                                    }
                                    setCityPauseReason("");
                                    setCityDialogTarget(null);
                                    setIsCityPauseDialogOpen(false);
                                  }}
                                >
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="mt-1 h-6 rounded-lg px-2 text-[11px]"
                                      onClick={() =>
                                        setCityDialogTarget({ city: city.city, state: city.state })
                                      }
                                    >
                                      Pausar cidade
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="rounded-[28px]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Pausar cidade {city.city}/{city.state}?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Isso não altera status dos pedidos. Apenas remove as
                                        entregas desta cidade da sugestão operacional de hoje.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                      <div className="space-y-1">
                                      <p className="text-sm font-medium text-zinc-900">
                                        Motivo da pausa <span className="text-red-600">*</span>
                                      </p>
                                      <p className="text-xs text-zinc-500">Campo obrigatório.</p>
                                    </div>
                                    <Textarea
                                      value={cityDialogTarget?.city === city.city &&
                                      cityDialogTarget?.state === city.state
                                        ? cityPauseReason
                                        : ""}
                                      onChange={(event) => setCityPauseReason(event.target.value)}
                                      placeholder="Ex: chuva forte, feriado, entregador indisponível"
                                    />
                                    <AlertDialogFooter>
                                      <AlertDialogCancel
                                        className="rounded-2xl"
                                        onClick={() => {
                                          setCityPauseReason("");
                                          setCityDialogTarget(null);
                                          setIsCityPauseDialogOpen(false);
                                        }}
                                      >
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl"
                                        onClick={handlePauseCity}
                                          disabled={
                                          createLocalDeliveryExceptionM.isPending ||
                                          cityPauseReason.trim().length === 0
                                        }
                                      >
                                        Confirmar pausa
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(localTodayQ.data?.cities?.length ?? 0) > 0 &&
                    (localTodayQ.data?.totals?.ordersCount ?? 0) === 0 ? (
                      <p className="text-sm text-zinc-600">
                        Não há pedidos locais pendentes para essas cidades.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" className="rounded-2xl" onClick={handleViewTodayOrders}>
                        Ver pedidos de hoje
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => selectTodayOrders()}
                        disabled={localTodayQ.isLoading || localTodayQ.isError || isGlobalPaused}
                      >
                        Selecionar pedidos de hoje
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => selectTodayOrders("PACKED")}
                        disabled={localTodayQ.isLoading || localTodayQ.isError || isGlobalPaused}
                      >
                        Selecionar empacotados de hoje
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => selectTodayOrders("PENDING_SEPARATION")}
                        disabled={localTodayQ.isLoading || localTodayQ.isError || isGlobalPaused}
                      >
                        Selecionar aguardando separação
                      </Button>
                    </div>

                    <p className="text-xs text-zinc-500">
                      Nenhuma atualização é automática. Revise e confirme as ações em lote.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

          <Card className="rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <CardTitle className="text-xl font-bold text-zinc-950">
                Fila de aprovação
              </CardTitle>
              <CardDescription className="text-sm text-zinc-500">
                {ordersQ.isLoading ? "Carregando pedidos…" : "Tudo no mesmo lugar: Pendentes, Aprovados e Reprovados recentes."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "pending" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("pending")}
                >
                  Pendentes ({pending.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "approved" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("approved")}
                >
                  Aprovados recentemente ({approvedRecent.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === "rejected" ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setActiveTab("rejected")}
                >
                  Reprovados recentemente ({rejectedRecent.length})
                </Button>
              </div>

                            <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Tipo de entrega
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={deliveryFilter === "ALL" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => handleDeliveryFilterChange("ALL")}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={deliveryFilter === "LOCAL" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => handleDeliveryFilterChange("LOCAL")}
                  >
                    Entrega local
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={deliveryFilter === "CORREIOS" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => handleDeliveryFilterChange("CORREIOS")}
                  >
                    Correios
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={deliveryFilter === "UNKNOWN" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => handleDeliveryFilterChange("UNKNOWN")}
                  >
                    Não identificado
                  </Button>
                </div>
                              </div>

              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Status local
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={localStatusFilter === "ALL" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("ALL")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      localStatusFilter === "PENDING_SEPARATION"
                        ? "default"
                        : "outline"
                    }
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("PENDING_SEPARATION")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Aguardando separação
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={localStatusFilter === "PACKED" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("PACKED")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Empacotado
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      localStatusFilter === "OUT_FOR_DELIVERY"
                        ? "default"
                        : "outline"
                    }
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("OUT_FOR_DELIVERY")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Saiu para entrega
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={localStatusFilter === "DELIVERED" ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("DELIVERED")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Entregue
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      localStatusFilter === "DELIVERY_PROBLEM"
                        ? "default"
                        : "outline"
                    }
                    className="rounded-2xl"
                    onClick={() => setLocalStatusFilter("DELIVERY_PROBLEM")}
                    disabled={deliveryFilter === "CORREIOS"}
                  >
                    Problema
                  </Button>
                </div>
                {deliveryFilter === "CORREIOS" ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Status local se aplica apenas a pedidos de entrega local.
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-zinc-500">
                  Exibindo {displayedOrders.length} pedido(s) neste filtro.
                </p>
                                {onlyTodayLocalDelivery ? (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                    <span>Filtro: entregas de hoje ativo</span>
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setOnlyTodayLocalDelivery(false)}
                    >
                      Limpar filtro de hoje
                    </button>
                  </div>
                ) : null}
              </div>

                            <div className="mb-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 sm:text-sm">
                  <label className="inline-flex items-center gap-2 text-zinc-800">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300"
                      checked={allDisplayedSelected}
                      onChange={toggleSelectDisplayedOrders}
                      disabled={displayedOrderIds.length === 0}
                    />
                    <span>Selecionar todos exibidos</span>
                  </label>
                  <span className="text-zinc-500">{selectedVisibleCount} selecionados</span>
                  {selectedVisibleCount > 0 ? (
                    <>
                        <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                        onClick={handleOpenSelectedLocalDocuments}
                        disabled={localBatchPdfM.isPending || selectedVisibleCount === 0}
                      >
                        {localBatchPdfM.isPending
                          ? "Gerando PDF…"
                          : "Abrir documentos locais"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                        onClick={clearSelection}
                      >
                        Limpar seleção
                      </Button>
                    </>
                  ) : null}
                </div>
                                {selectedVisibleCount > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                      onClick={() => handleBulkLocalDeliveryStatus("PACKED")}
                      disabled={
                        selectedLocalOrderIds.length === 0 ||
                        localDeliveryBulkStatusM.isPending
                      }
                    >
                      Marcar empacotado
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                      onClick={() => handleBulkLocalDeliveryStatus("OUT_FOR_DELIVERY")}
                      disabled={
                        selectedLocalOrderIds.length === 0 ||
                        localDeliveryBulkStatusM.isPending
                      }
                    >
                      Saiu para entrega
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                          disabled={
                            selectedLocalOrderIds.length === 0 ||
                            localDeliveryBulkStatusM.isPending
                          }
                        >
                          Marcar entregue
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[28px]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Marcar pedidos selecionados como entregues?
                          </AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            className="rounded-2xl"
                            onClick={() => {
                              setGlobalPauseReason("");
                              setIsGlobalPauseDialogOpen(false);
                              }}
                              >
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-2xl"
                            onClick={() => handleBulkLocalDeliveryStatus("DELIVERED")}
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg border-zinc-200 bg-white px-2 text-xs"
                          disabled={
                            selectedLocalOrderIds.length === 0 ||
                            localDeliveryBulkStatusM.isPending
                          }
                        >
                          Problema
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[28px]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Marcar pedidos selecionados com problema na entrega?
                          </AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-2xl">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-2xl"
                            onClick={() =>
                              handleBulkLocalDeliveryStatus("DELIVERY_PROBLEM")
                            }
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </div>

              {ordersQ.isLoading ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  Carregando pedidos…
                </div>
              ) : ordersQ.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                  {apiErrorMessage(ordersQ.error, "Erro ao carregar pedidos.")}
                </div>
              ) : currentTabOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                  {activeTab === "pending"
                    ? "Nenhum pedido pendente no momento. Confira as abas de Aprovados/Reprovados recentes para rastrear movimentações."
                    : activeTab === "approved"
                      ? "Ainda não há pedidos em Aprovados recentemente."
                      : "Ainda não há pedidos em Reprovados recentemente."}                </div>
              ) : displayedOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                  Nenhum pedido encontrado para os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedOrders.map((o) => {
                    const total = brl(o.total);
                    const busyThis = decideM.isPending && actingOrderId === o.id;
                    const orderStatus = o.orderStatus ?? o.status ?? null;
                    const deliveryType = resolveDeliveryType(o);
                    const deliveryBadge = getDeliveryBadgeMeta(deliveryType);
                    const localDeliveryLabel = getLocalDeliveryStatusLabel(
                      resolveLocalDeliveryStatus(o)
                    );
                    const localBadgeLabel =
                      deliveryType === "LOCAL"
                        ? localDeliveryLabel ?? "Aguardando separação"
                        : null;

                    return (
                      <div
                        key={o.id}
                        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/85 p-3 shadow-sm"                      >
                        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-zinc-300"
                                checked={selectedOrderIds.has(o.id)}
                                onChange={() => toggleOrderSelection(o.id)}
                                aria-label={`Selecionar pedido ${o.id}`}
                              />
                              <h2 className="text-sm font-black tracking-tight text-zinc-950">
                                Pedido #{o.id.slice(0, 8)}
                              </h2>
                              <span className="text-xs text-zinc-500">Criado em {fmtDate(o.createdAt)}</span>

                              {busyThis ? (
                                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Processando…
                                </span>
                              ) : null}
                            </div>

                            <div className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-3 sm:gap-3">
                              <div className="min-w-0 truncate">
                                <span className="text-zinc-500">Cliente:</span>{" "}
                                <span className="font-medium text-zinc-900">{o.customerName ?? "Não informado"}</span>
                              </div>
                              <div className="min-w-0 truncate">
                                <span className="text-zinc-500">Salão:</span>{" "}
                                <span className="font-medium text-zinc-900">{o.salonName ?? "Não informado"}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-zinc-500">Total:</span>{" "}
                                <span className="font-bold text-zinc-950">{total ?? "Não informado"}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge label="Pagamento" value={o.paymentStatus} />
                              <StatusBadge label="Pedido" value={orderStatus} />
                              <StatusBadge label="Admin" value={o.adminApprovalStatus} />
                                <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                  deliveryBadge.classes
                                )}
                              >
                                <span className="uppercase tracking-[0.14em] text-[10px] text-zinc-500">
                                  Entrega
                                </span>
                                <span>{deliveryBadge.label}</span>
                              </span>
                                {localBadgeLabel ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                                  <span className="uppercase tracking-[0.14em] text-[10px] text-violet-500">
                                    Local
                                  </span>
                                  <span>{localBadgeLabel}</span>
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {activeTab === "pending"
                                  ? "Pronto para decisão"
                                  : activeTab === "approved"
                                    ? "Movido para aprovados"
                                    : "Movido para reprovados"}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[360px]">
                            {activeTab === "pending" ? (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 rounded-xl border-zinc-200 bg-white px-3 text-xs"
                                      disabled={decideM.isPending}
                                    >
                                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                      Reprovar
                                    </Button>
                                  </AlertDialogTrigger>

                                  <AlertDialogContent className="rounded-[28px]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reprovar este pedido?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação altera apenas a aprovação do admin.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-2xl">
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl"
                                        onClick={() =>
                                          decideM.mutate({ orderId: o.id, action: "reject" })
                                        }
                                      >
                                        Confirmar reprovação
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="h-8 rounded-xl px-3 text-xs"
                                      disabled={decideM.isPending}
                                    >
                                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                      Aprovar
                                    </Button>
                                  </AlertDialogTrigger>

                                  <AlertDialogContent className="rounded-[28px]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Aprovar este pedido?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Esta ação libera o pedido para seguir o fluxo.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-2xl">
                                        Cancelar
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl"
                                        onClick={() =>
                                          decideM.mutate({ orderId: o.id, action: "approve" })
                                        }
                                      >
                                        Confirmar aprovação
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            ) : activeTab === "approved" ? (
                              <div className="sm:col-span-3">
                                <Link href={`/admin/orders/${o.id}`} className="block">
                                  <Button
                                    size="sm"
                                    className="h-8 w-full rounded-xl px-3 text-xs"
                                    disabled={decideM.isPending}
                                  >
                                    Abrir pedido
                                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            ) : (
                              <div className="sm:col-span-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-xs text-zinc-600">                                Pedido reprovado recentemente. Abra o detalhe para revisar contexto e histórico.
                              </div>
                            )}

                            {activeTab !== "approved" ? (
                              <Link href={`/admin/orders/${o.id}`} className="block">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-full rounded-xl border-zinc-200 bg-white px-3 text-xs"
                                  disabled={decideM.isPending}
                                >
                                  {activeTab === "pending" ? "Abrir detalhe" : "Abrir pedido"}
                                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            ) : null}
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

          <Card className="rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <CardTitle className="text-lg font-bold text-zinc-950">
                Resumo rápido
              </CardTitle>
              <CardDescription className="text-sm text-zinc-500">
                Visão geral da fila atual
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Pendentes</span>
                  <span className="font-bold text-zinc-950">{pending.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Aprovados recentes</span>
                  <span className="font-semibold text-zinc-900">{approvedRecent.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Reprovados recentes</span>
                  <span className="font-semibold text-zinc-900">{rejectedRecent.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-zinc-500">Total em análise</span>
                  <span className="font-bold text-zinc-950">{pendingTotal}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-xs text-zinc-600">
                Critério de Pendentes: paymentStatus = PAID e adminApprovalStatus = PENDING.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}