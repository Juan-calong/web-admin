"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Store,
  Users,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Lock,
  Unlock,
  ShoppingCart,
  Eye,
  Ban,
  Filter,
  Wallet,
  ChevronUp,
  CircleDashed,
  CircleSlash,
  ScanSearch,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type AccessStatus = "ACTIVE" | "BLOCKED" | "UNDER_REVIEW";
type ReviewStatus = "NONE" | "UNDER_REVIEW" | "RESOLVED";
type EffectiveAuditStatus = "MATCH" | "MISMATCH" | "UNDER_REVIEW";
type MoneyLike = string | number;

type SellerItem = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  accessStatus: AccessStatus;
  purchasesBlocked: boolean;
  sellerProfile?: {
    id: string;
    cnpj?: string | null;
    wallet?: {
      available: MoneyLike;
      pending: MoneyLike;
    } | null;
    _count?: {
      referredSalons?: number;
      activeSalons?: number;
      referredCustomers?: number;
    };
  } | null;
};

type CustomerItem = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  createdAt: string;
  accessStatus: AccessStatus;
  purchasesBlocked: boolean;
  referredBySellerId?: string | null;
  referredBySalonId?: string | null;
  referredByCustomerId?: string | null;
};

type SalonOwnerItem = {
  id: string;
  name: string;
  email: string;
  accessStatus: AccessStatus;
  purchasesBlocked: boolean;
};

type SalonItem = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  city: string;
  state: string;
  active: boolean;
  ordersBlocked: boolean;
  createdAt: string;
  activeSellerId?: string | null;
  users?: SalonOwnerItem[];
  wallet?: {
    available: MoneyLike;
    pending: MoneyLike;
  } | null;
  _count?: {
    orders?: number;
    users?: number;
    referredCustomers?: number;
  };
};

type AuditExpected = {
  beneficiaryType: "SELLER" | "SALON" | "CUSTOMER";
  beneficiaryId: string;
  amount: string;
  source: string;
};

type AuditActual = {
  id: string;
  beneficiaryType: "SELLER" | "SALON" | "CUSTOMER";
  beneficiaryId: string;
  amount: string;
  status: string;
  createdAt: string;
};

type CommissionAudit = {
  orderId: string;
  orderCode: string;
  createdAt: string;
  orderStatus: string;
  paymentStatus: string;
  adminApprovalStatus: string;
  totalAmount: string;
  expected: AuditExpected | null;
  actual: AuditActual[];
  computedStatus: "MATCH" | "MISMATCH";
  effectiveStatus: EffectiveAuditStatus;
  reason: string;
  review?: {
    status: ReviewStatus;
    note?: string | null;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
  } | null;
};

type PaginatedResponse<T> = {
  page: number;
  take: number;
  total?: number;
  items: T[];
};

type AuditFilter =
  | "ALL"
  | "ACTION_REQUIRED"
  | "UNDER_REVIEW"
  | "MISMATCH"
  | "MATCH"
  | "NO_COMMISSION"
  | "PAID";

function brDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function brMoney(value?: MoneyLike | null) {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(num) ? num : 0);
}

function shortId(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function isNeutralNoCommission(audit: CommissionAudit) {
  return !audit.expected && audit.actual.length === 0;
}

function accessBadgeClass(status: AccessStatus) {
  if (status === "ACTIVE") return "border-emerald-300 bg-emerald-500/10 text-emerald-700";
  if (status === "BLOCKED") return "border-rose-300 bg-rose-500/10 text-rose-700";
  return "border-amber-300 bg-amber-500/10 text-amber-700";
}

function accessLabel(status: AccessStatus) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "BLOCKED") return "Bloqueado";
  return "Em análise";
}

function auditTone(audit: CommissionAudit) {
  if (audit.effectiveStatus === "UNDER_REVIEW") {
    return {
      wrap: "border-amber-200 bg-amber-50/60",
      badge: "border-amber-300 bg-amber-500/10 text-amber-700",
      label: "Em análise",
    };
  }

  if (audit.effectiveStatus === "MISMATCH") {
    return {
      wrap: "border-rose-200 bg-rose-50/60",
      badge: "border-rose-300 bg-rose-500/10 text-rose-700",
      label: "Não bate",
    };
  }

  if (isNeutralNoCommission(audit)) {
    return {
      wrap: "border-slate-200 bg-slate-50/70",
      badge: "border-slate-300 bg-slate-500/10 text-slate-700",
      label: "Sem comissão",
    };
  }

  return {
    wrap: "border-emerald-200 bg-emerald-50/60",
    badge: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
    label: "Bate",
  };
}

function orderStatusTone(value?: string) {
  if (!value) return "border-slate-300 bg-slate-500/10 text-slate-700";
  if (value === "PAID" || value === "COMPLETED" || value === "APPROVED") {
    return "border-emerald-300 bg-emerald-500/10 text-emerald-700";
  }
  if (value === "PENDING" || value === "CREATED") {
    return "border-amber-300 bg-amber-500/10 text-amber-700";
  }
  if (value === "CANCELED" || value === "FAILED" || value === "REFUNDED" || value === "REJECTED") {
    return "border-rose-300 bg-rose-500/10 text-rose-700";
  }
  return "border-slate-300 bg-slate-500/10 text-slate-700";
}

function diagnosticLabel(audit: CommissionAudit) {
  if (audit.effectiveStatus === "UNDER_REVIEW") return "Aguardando revisão manual";
  if (audit.effectiveStatus === "MISMATCH") return "Divergência de comissão";
  if (isNeutralNoCommission(audit)) return "Sem comissão aplicável";
  return "Sem problema";
}

function summaryMetricLabel(audits: CommissionAudit[]) {
  return {
    mismatch: audits.filter((a) => a.effectiveStatus === "MISMATCH").length,
    underReview: audits.filter((a) => a.effectiveStatus === "UNDER_REVIEW").length,
    match: audits.filter((a) => a.effectiveStatus === "MATCH" && !isNeutralNoCommission(a)).length,
    noCommission: audits.filter((a) => isNeutralNoCommission(a)).length,
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}) {
  return (
    <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full md:w-[320px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400"
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function AccessActionButtons({
  accessStatus,
  purchasesBlocked,
  onActivate,
  onBlock,
  onUnderReview,
  onTogglePurchase,
  activateLabel = "Ativar acesso",
  blockLabel = "Bloquear acesso",
  reviewLabel = "Enviar para análise",
  freePurchaseLabel = "Liberar compra",
  blockPurchaseLabel = "Bloquear compra",
  compact = false,
}: {
  accessStatus: AccessStatus;
  purchasesBlocked: boolean;
  onActivate: () => void;
  onBlock: () => void;
  onUnderReview: () => void;
  onTogglePurchase: () => void;
  activateLabel?: string;
  blockLabel?: string;
  reviewLabel?: string;
  freePurchaseLabel?: string;
  blockPurchaseLabel?: string;
  compact?: boolean;
}) {
  const buttonClass = compact ? "rounded-xl" : "rounded-2xl";

  return (
    <>
      {accessStatus === "ACTIVE" ? (
        <>
          <Button variant="destructive" className={buttonClass} onClick={onBlock}>
            <Ban className="mr-2 h-4 w-4" />
            {blockLabel}
          </Button>

          <Button
            variant="outline"
            className={`${buttonClass} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}
            onClick={onUnderReview}
          >
            <Clock3 className="mr-2 h-4 w-4" />
            {reviewLabel}
          </Button>
        </>
      ) : null}

      {accessStatus === "UNDER_REVIEW" ? (
        <>
          <Button variant="secondary" className={buttonClass} onClick={onActivate}>
            <Unlock className="mr-2 h-4 w-4" />
            {activateLabel}
          </Button>

          <Button
            variant="outline"
            className={`${buttonClass} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
            onClick={onBlock}
          >
            <Ban className="mr-2 h-4 w-4" />
            {blockLabel}
          </Button>
        </>
      ) : null}

      {accessStatus === "BLOCKED" ? (
        <>
          <Button variant="secondary" className={buttonClass} onClick={onActivate}>
            <Unlock className="mr-2 h-4 w-4" />
            {activateLabel}
          </Button>

          <Button
            variant="outline"
            className={`${buttonClass} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}
            onClick={onUnderReview}
          >
            <Clock3 className="mr-2 h-4 w-4" />
            {reviewLabel}
          </Button>
        </>
      ) : null}

      <Button
        variant={purchasesBlocked ? "secondary" : "outline"}
        className={buttonClass}
        onClick={onTogglePurchase}
      >
        <ShoppingCart className="mr-2 h-4 w-4" />
        {purchasesBlocked ? freePurchaseLabel : blockPurchaseLabel}
      </Button>
    </>
  );
}

async function fetchSellers() {
  const { data } = await api.get<PaginatedResponse<SellerItem>>(endpoints.adminSecurity.sellers);
  return data;
}

async function fetchSalons() {
  const { data } = await api.get<PaginatedResponse<SalonItem>>(endpoints.adminSecurity.salons);
  return data;
}

async function fetchCustomers() {
  const { data } = await api.get<PaginatedResponse<CustomerItem>>(endpoints.adminSecurity.customers);
  return data;
}

async function fetchAudits() {
  const { data } = await api.get<PaginatedResponse<CommissionAudit>>(endpoints.adminCommissionAudits.list);
  return data;
}

export default function AdminSecurityAuditsPage() {
  const queryClient = useQueryClient();

  const [sellerSearch, setSellerSearch] = useState("");
  const [salonSearch, setSalonSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("ACTION_REQUIRED");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const sellersQuery = useQuery({
    queryKey: ["admin-security", "sellers"],
    queryFn: fetchSellers,
  });

  const salonsQuery = useQuery({
    queryKey: ["admin-security", "salons"],
    queryFn: fetchSalons,
  });

  const customersQuery = useQuery({
    queryKey: ["admin-security", "customers"],
    queryFn: fetchCustomers,
  });

  const auditsQuery = useQuery({
    queryKey: ["admin-security", "audits"],
    queryFn: fetchAudits,
  });

  const refreshAll = async () => {
    await Promise.all([
      sellersQuery.refetch(),
      salonsQuery.refetch(),
      customersQuery.refetch(),
      auditsQuery.refetch(),
    ]);
    toast.success("Dados atualizados");
  };

  const patchUserMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<{
        accessStatus: AccessStatus;
        purchasesBlocked: boolean;
        reason: string;
      }>;
    }) => {
      const { data } = await api.patch(endpoints.adminSecurity.patchUserAccess(id), payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin-security", "sellers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-security", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-security", "salons"] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Erro ao atualizar usuário");
    },
  });

  const patchSalonMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<{
        active: boolean;
        ordersBlocked: boolean;
        reason: string;
      }>;
    }) => {
      const { data } = await api.patch(endpoints.adminSecurity.patchSalonAccess(id), payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Salão atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin-security", "salons"] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Erro ao atualizar salão");
    },
  });

  const patchAuditReviewMutation = useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: {
        status: "UNDER_REVIEW" | "RESOLVED";
        note?: string;
      };
    }) => {
      const { data } = await api.patch(endpoints.adminCommissionAudits.review(orderId), payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Revisão atualizada");
      queryClient.invalidateQueries({ queryKey: ["admin-security", "audits"] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Erro ao atualizar revisão");
    },
  });

  const sellers = useMemo(() => {
    const items = sellersQuery.data?.items ?? [];
    if (!sellerSearch.trim()) return items;
    const term = sellerSearch.toLowerCase();
    return items.filter((item) =>
      [item.name, item.email, item.sellerProfile?.cnpj].some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      )
    );
  }, [sellerSearch, sellersQuery.data?.items]);

  const salons = useMemo(() => {
    const items = salonsQuery.data?.items ?? [];
    if (!salonSearch.trim()) return items;
    const term = salonSearch.toLowerCase();
    return items.filter((item) =>
      [item.name, item.email, item.city, item.state, item.cnpj].some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      )
    );
  }, [salonSearch, salonsQuery.data?.items]);

  const customers = useMemo(() => {
    const items = customersQuery.data?.items ?? [];
    if (!customerSearch.trim()) return items;
    const term = customerSearch.toLowerCase();
    return items.filter((item) =>
      [item.name, item.email, item.phone, item.cpf].some((v) =>
        String(v ?? "").toLowerCase().includes(term)
      )
    );
  }, [customerSearch, customersQuery.data?.items]);

  const audits = useMemo(() => {
    let items = auditsQuery.data?.items ?? [];

    items = [...items].sort((a, b) => {
      const score = (audit: CommissionAudit) => {
        if (audit.effectiveStatus === "UNDER_REVIEW") return 0;
        if (audit.effectiveStatus === "MISMATCH") return 1;
        if (audit.effectiveStatus === "MATCH" && !isNeutralNoCommission(audit)) return 2;
        if (isNeutralNoCommission(audit)) return 3;
        return 4;
      };

      const scoreDiff = score(a) - score(b);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (auditSearch.trim()) {
      const term = auditSearch.toLowerCase();
      items = items.filter((item) =>
        [
          item.orderCode,
          item.orderId,
          item.reason,
          item.expected?.beneficiaryType,
          item.expected?.beneficiaryId,
          item.adminApprovalStatus,
          diagnosticLabel(item),
        ].some((v) => String(v ?? "").toLowerCase().includes(term))
      );
    }

    return items.filter((audit) => {
      switch (auditFilter) {
        case "ACTION_REQUIRED":
          return audit.effectiveStatus === "MISMATCH" || audit.effectiveStatus === "UNDER_REVIEW";
        case "UNDER_REVIEW":
          return audit.effectiveStatus === "UNDER_REVIEW";
        case "MISMATCH":
          return audit.effectiveStatus === "MISMATCH";
        case "MATCH":
          return audit.effectiveStatus === "MATCH" && !isNeutralNoCommission(audit);
        case "NO_COMMISSION":
          return isNeutralNoCommission(audit);
        case "PAID":
          return audit.paymentStatus === "PAID";
        case "ALL":
        default:
          return true;
      }
    });
  }, [auditFilter, auditSearch, auditsQuery.data?.items]);

  const auditSummary = useMemo(() => {
    return summaryMetricLabel(auditsQuery.data?.items ?? []);
  }, [auditsQuery.data?.items]);

  const summary = useMemo(() => {
    const sellerItems = sellersQuery.data?.items ?? [];
    const salonItems = salonsQuery.data?.items ?? [];
    const customerItems = customersQuery.data?.items ?? [];
    const auditItems = auditsQuery.data?.items ?? [];

    return {
      blockedUsers:
        [...sellerItems, ...customerItems].filter((item) => item.accessStatus === "BLOCKED").length +
        salonItems.flatMap((salon) => salon.users ?? []).filter((owner) => owner.accessStatus === "BLOCKED").length,
      blockedPurchases:
        [...sellerItems, ...customerItems].filter((item) => item.purchasesBlocked).length +
        salonItems.filter((salon) => salon.ordersBlocked).length,
      inactiveSalons: salonItems.filter((salon) => !salon.active).length,
      mismatches: auditItems.filter((item) => item.effectiveStatus === "MISMATCH").length,
    };
  }, [sellersQuery.data?.items, salonsQuery.data?.items, customersQuery.data?.items, auditsQuery.data?.items]);

  const isBusy =
    patchUserMutation.isPending ||
    patchSalonMutation.isPending ||
    patchAuditReviewMutation.isPending;

  function toggleExpanded(orderId: string) {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-xl shadow-slate-300/50">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-100/90">
              <ShieldCheck className="h-3.5 w-3.5" />
              Segurança e auditoria
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Painel operacional</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Gerencie acesso, compras, situação dos salões e auditoria de comissão com foco no que realmente precisa de atenção.
            </p>
          </div>

          <Button
            onClick={refreshAll}
            disabled={isBusy}
            className="rounded-2xl bg-white text-slate-900 hover:bg-slate-100"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar tudo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Usuários bloqueados"
          value={summary.blockedUsers}
          icon={Lock}
          hint="Acesso suspenso ou retido"
        />
        <StatCard
          title="Compras travadas"
          value={summary.blockedPurchases}
          icon={ShoppingCart}
          hint="Usuários ou salões impedidos de comprar"
        />
        <StatCard
          title="Salões inativos"
          value={summary.inactiveSalons}
          icon={Store}
          hint="Operação pausada pelo admin"
        />
        <StatCard
          title="Divergências"
          value={summary.mismatches}
          icon={AlertTriangle}
          hint="Casos que exigem conferência"
        />
      </div>

      <Tabs defaultValue="sellers" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 md:grid-cols-4">
          <TabsTrigger value="sellers" className="rounded-xl">Vendedores</TabsTrigger>
          <TabsTrigger value="salons" className="rounded-xl">Salões</TabsTrigger>
          <TabsTrigger value="customers" className="rounded-xl">Customers</TabsTrigger>
          <TabsTrigger value="audits" className="rounded-xl">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="sellers" className="mt-6">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <SectionHeader
                title="Vendedores"
                subtitle="Visualize acesso, bloqueio de compra e saldos de comissão do vendedor."
                right={<SearchBox value={sellerSearch} onChange={setSellerSearch} placeholder="Buscar por nome, e-mail ou CNPJ" />}
              />
            </CardHeader>

            <CardContent className="space-y-4">
              {sellersQuery.isLoading ? (
                <div className="py-10 text-sm text-slate-500">Carregando vendedores...</div>
              ) : sellers.length === 0 ? (
                <div className="py-10 text-sm text-slate-500">Nenhum vendedor encontrado.</div>
              ) : (
                sellers.map((seller) => (
                  <Card key={seller.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-none">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{seller.name}</h3>
                            <Badge variant="outline" className={accessBadgeClass(seller.accessStatus)}>
                              {accessLabel(seller.accessStatus)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={
                                seller.purchasesBlocked
                                  ? "border-rose-300 bg-rose-500/10 text-rose-700"
                                  : "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                              }
                            >
                              {seller.purchasesBlocked ? "Compra bloqueada" : "Compra liberada"}
                            </Badge>
                          </div>

                          <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                            <p><span className="font-medium text-slate-900">E-mail:</span> {seller.email}</p>
                            <p><span className="font-medium text-slate-900">Telefone:</span> {seller.phone || "—"}</p>
                            <p><span className="font-medium text-slate-900">CNPJ:</span> {seller.sellerProfile?.cnpj || "—"}</p>
                            <p><span className="font-medium text-slate-900">Criado em:</span> {brDate(seller.createdAt)}</p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Saldo disponível</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{brMoney(seller.sellerProfile?.wallet?.available)}</p>
                              <p className="mt-1 text-[11px] text-slate-500">Já liberado para saque/uso</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Saldo pendente</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{brMoney(seller.sellerProfile?.wallet?.pending)}</p>
                              <p className="mt-1 text-[11px] text-slate-500">Ainda em retenção</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Salões ativos</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{seller.sellerProfile?._count?.activeSalons ?? 0}</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Customers indicados</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{seller.sellerProfile?._count?.referredCustomers ?? 0}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 xl:min-w-[220px]">
  <AccessActionButtons
    accessStatus={seller.accessStatus}
    purchasesBlocked={seller.purchasesBlocked}
    onActivate={() =>
      patchUserMutation.mutate({
        id: seller.id,
        payload: {
          accessStatus: "ACTIVE",
          reason: "Liberado no painel",
        },
      })
    }
    onBlock={() =>
      patchUserMutation.mutate({
        id: seller.id,
        payload: {
          accessStatus: "BLOCKED",
          reason: "Bloqueado no painel",
        },
      })
    }
    onUnderReview={() =>
      patchUserMutation.mutate({
        id: seller.id,
        payload: {
          accessStatus: "UNDER_REVIEW",
          reason: "Conta enviada para análise manual",
        },
      })
    }
    onTogglePurchase={() =>
      patchUserMutation.mutate({
        id: seller.id,
        payload: {
          purchasesBlocked: !seller.purchasesBlocked,
          reason: seller.purchasesBlocked
            ? "Compra liberada no painel"
            : "Compra bloqueada no painel",
        },
      })
    }
  />
</div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salons" className="mt-6">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <SectionHeader
                title="Salões"
                subtitle="Controle a operação do salão e o acesso do owner vinculado."
                right={<SearchBox value={salonSearch} onChange={setSalonSearch} placeholder="Buscar por nome, e-mail, CNPJ ou cidade" />}
              />
            </CardHeader>

            <CardContent className="space-y-4">
              {salonsQuery.isLoading ? (
                <div className="py-10 text-sm text-slate-500">Carregando salões...</div>
              ) : salons.length === 0 ? (
                <div className="py-10 text-sm text-slate-500">Nenhum salão encontrado.</div>
              ) : (
                salons.map((salon) => (
                  <Card key={salon.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-none">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-900">{salon.name}</h3>
                              <Badge
                                variant="outline"
                                className={
                                  salon.active
                                    ? "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                                    : "border-rose-300 bg-rose-500/10 text-rose-700"
                                }
                              >
                                {salon.active ? "Ativo" : "Inativo"}
                              </Badge>

                              <Badge
                                variant="outline"
                                className={
                                  salon.ordersBlocked
                                    ? "border-rose-300 bg-rose-500/10 text-rose-700"
                                    : "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                                }
                              >
                                {salon.ordersBlocked ? "Pedidos bloqueados" : "Pedidos liberados"}
                              </Badge>
                            </div>

                            <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                              <p><span className="font-medium text-slate-900">E-mail:</span> {salon.email}</p>
                              <p><span className="font-medium text-slate-900">Local:</span> {salon.city} / {salon.state}</p>
                              <p><span className="font-medium text-slate-900">CNPJ:</span> {salon.cnpj}</p>
                              <p><span className="font-medium text-slate-900">Criado em:</span> {brDate(salon.createdAt)}</p>
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 xl:min-w-[220px]">
                            <Button
                              variant={salon.active ? "destructive" : "secondary"}
                              className="rounded-2xl"
                              onClick={() =>
                                patchSalonMutation.mutate({
                                  id: salon.id,
                                  payload: {
                                    active: !salon.active,
                                    reason: salon.active ? "Salão desativado no painel" : "Salão reativado no painel",
                                  },
                                })
                              }
                            >
                              {salon.active ? (
                                <>
                                  <Lock className="mr-2 h-4 w-4" />
                                  Desativar salão
                                </>
                              ) : (
                                <>
                                  <Unlock className="mr-2 h-4 w-4" />
                                  Reativar salão
                                </>
                              )}
                            </Button>

                            <Button
                              variant={salon.ordersBlocked ? "secondary" : "outline"}
                              className="rounded-2xl"
                              onClick={() =>
                                patchSalonMutation.mutate({
                                  id: salon.id,
                                  payload: {
                                    ordersBlocked: !salon.ordersBlocked,
                                    reason: salon.ordersBlocked ? "Pedidos liberados no painel" : "Pedidos bloqueados no painel",
                                  },
                                })
                              }
                            >
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              {salon.ordersBlocked ? "Liberar pedidos" : "Bloquear pedidos"}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-xs text-slate-500">Saldo disponível</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{brMoney(salon.wallet?.available)}</p>
                            <p className="mt-1 text-[11px] text-slate-500">Já liberado</p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-xs text-slate-500">Saldo pendente</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{brMoney(salon.wallet?.pending)}</p>
                            <p className="mt-1 text-[11px] text-slate-500">Aguardando liberação</p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-xs text-slate-500">Pedidos</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{salon._count?.orders ?? 0}</p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-xs text-slate-500">Customers indicados</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{salon._count?.referredCustomers ?? 0}</p>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-700" />
                            <p className="text-sm font-medium text-slate-900">Owners vinculados</p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {(salon.users ?? []).length === 0 ? (
                              <p className="text-sm text-slate-500">Nenhum owner encontrado.</p>
                            ) : (
                              (salon.users ?? []).map((owner) => (
                                <div key={owner.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-slate-900">{owner.name}</p>
                                    <Badge variant="outline" className={accessBadgeClass(owner.accessStatus)}>
                                      {accessLabel(owner.accessStatus)}
                                    </Badge>
                                  </div>

                                  <p className="mt-1 text-sm text-slate-500">{owner.email}</p>

                                  <div className="mt-3 flex flex-wrap gap-2">
  <AccessActionButtons
    accessStatus={owner.accessStatus}
    purchasesBlocked={owner.purchasesBlocked}
    compact
    activateLabel="Ativar acesso"
    blockLabel="Bloquear acesso"
    reviewLabel="Enviar para análise"
    freePurchaseLabel="Liberar compra"
    blockPurchaseLabel="Bloquear compra"
    onActivate={() =>
      patchUserMutation.mutate({
        id: owner.id,
        payload: {
          accessStatus: "ACTIVE",
          reason: "Owner liberado no painel",
        },
      })
    }
    onBlock={() =>
      patchUserMutation.mutate({
        id: owner.id,
        payload: {
          accessStatus: "BLOCKED",
          reason: "Owner bloqueado no painel",
        },
      })
    }
    onUnderReview={() =>
      patchUserMutation.mutate({
        id: owner.id,
        payload: {
          accessStatus: "UNDER_REVIEW",
          reason: "Owner enviado para análise manual",
        },
      })
    }
    onTogglePurchase={() =>
      patchUserMutation.mutate({
        id: owner.id,
        payload: {
          purchasesBlocked: !owner.purchasesBlocked,
          reason: owner.purchasesBlocked
            ? "Compra liberada para owner"
            : "Compra bloqueada para owner",
        },
      })
    }
  />
</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="mt-6">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <SectionHeader
                title="Customers"
                subtitle="Controle acesso, compras e vínculo de indicação."
                right={<SearchBox value={customerSearch} onChange={setCustomerSearch} placeholder="Buscar por nome, e-mail, telefone ou CPF" />}
              />
            </CardHeader>

            <CardContent className="space-y-4">
              {customersQuery.isLoading ? (
                <div className="py-10 text-sm text-slate-500">Carregando customers...</div>
              ) : customers.length === 0 ? (
                <div className="py-10 text-sm text-slate-500">Nenhum customer encontrado.</div>
              ) : (
                customers.map((customer) => (
                  <Card key={customer.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 shadow-none">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{customer.name}</h3>
                            <Badge variant="outline" className={accessBadgeClass(customer.accessStatus)}>
                              {accessLabel(customer.accessStatus)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={
                                customer.purchasesBlocked
                                  ? "border-rose-300 bg-rose-500/10 text-rose-700"
                                  : "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                              }
                            >
                              {customer.purchasesBlocked ? "Compra bloqueada" : "Compra liberada"}
                            </Badge>
                          </div>

                          <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                            <p><span className="font-medium text-slate-900">E-mail:</span> {customer.email}</p>
                            <p><span className="font-medium text-slate-900">Telefone:</span> {customer.phone || "—"}</p>
                            <p><span className="font-medium text-slate-900">CPF:</span> {customer.cpf || "—"}</p>
                            <p><span className="font-medium text-slate-900">Criado em:</span> {brDate(customer.createdAt)}</p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Indicado por seller</p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">{customer.referredBySellerId || "—"}</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Indicado por salão</p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">{customer.referredBySalonId || "—"}</p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-xs text-slate-500">Indicado por customer</p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">{customer.referredByCustomerId || "—"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 xl:min-w-[220px]">
  <AccessActionButtons
    accessStatus={customer.accessStatus}
    purchasesBlocked={customer.purchasesBlocked}
    onActivate={() =>
      patchUserMutation.mutate({
        id: customer.id,
        payload: {
          accessStatus: "ACTIVE",
          reason: "Customer liberado no painel",
        },
      })
    }
    onBlock={() =>
      patchUserMutation.mutate({
        id: customer.id,
        payload: {
          accessStatus: "BLOCKED",
          reason: "Customer bloqueado no painel",
        },
      })
    }
    onUnderReview={() =>
      patchUserMutation.mutate({
        id: customer.id,
        payload: {
          accessStatus: "UNDER_REVIEW",
          reason: "Customer enviado para análise manual",
        },
      })
    }
    onTogglePurchase={() =>
      patchUserMutation.mutate({
        id: customer.id,
        payload: {
          purchasesBlocked: !customer.purchasesBlocked,
          reason: customer.purchasesBlocked
            ? "Compra liberada no painel"
            : "Compra bloqueada no painel",
        },
      })
    }
  />
</div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audits" className="mt-6">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-5">
              <SectionHeader
                title="Auditoria de comissão"
                subtitle="Mostra apenas pedidos realmente auditáveis: pagos e aprovados."
                right={<SearchBox value={auditSearch} onChange={setAuditSearch} placeholder="Buscar por pedido, motivo ou beneficiário" />}
              />

              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Filter className="h-4 w-4" />
                    Filtros rápidos
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <FilterChip active={auditFilter === "ACTION_REQUIRED"} label="Precisa ação" onClick={() => setAuditFilter("ACTION_REQUIRED")} />
                    <FilterChip active={auditFilter === "UNDER_REVIEW"} label="Em análise" onClick={() => setAuditFilter("UNDER_REVIEW")} />
                    <FilterChip active={auditFilter === "MISMATCH"} label="Não bate" onClick={() => setAuditFilter("MISMATCH")} />
                    <FilterChip active={auditFilter === "MATCH"} label="Bate" onClick={() => setAuditFilter("MATCH")} />
                    <FilterChip active={auditFilter === "NO_COMMISSION"} label="Sem comissão" onClick={() => setAuditFilter("NO_COMMISSION")} />
                    <FilterChip active={auditFilter === "PAID"} label="Pagos" onClick={() => setAuditFilter("PAID")} />
                    <FilterChip active={auditFilter === "ALL"} label="Todos" onClick={() => setAuditFilter("ALL")} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                    <p className="text-xs text-rose-700">Não bate</p>
                    <p className="mt-1 text-xl font-semibold text-rose-800">{auditSummary.mismatch}</p>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <p className="text-xs text-amber-700">Em análise</p>
                    <p className="mt-1 text-xl font-semibold text-amber-800">{auditSummary.underReview}</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <p className="text-xs text-emerald-700">Bate</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-800">{auditSummary.match}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs text-slate-600">Sem comissão</p>
                    <p className="mt-1 text-xl font-semibold text-slate-800">{auditSummary.noCommission}</p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {auditsQuery.isLoading ? (
                <div className="py-10 text-sm text-slate-500">Carregando auditorias...</div>
              ) : audits.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                    <ScanSearch className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-800">Nenhum item encontrado</p>
                  <p className="mt-1 text-sm text-slate-500">Tente mudar o filtro ou a busca.</p>
                </div>
              ) : (
                audits.map((audit) => {
                  const tone = auditTone(audit);
                  const expanded = !!expandedOrders[audit.orderId];

                  return (
                    <div
                      key={audit.orderId}
                      className={`rounded-3xl border p-4 shadow-sm transition ${tone.wrap}`}
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">
                              Pedido {audit.orderCode}
                            </h3>

                            <Badge variant="outline" className={tone.badge}>
                              {tone.label}
                            </Badge>

                            <Badge variant="outline" className={orderStatusTone(audit.paymentStatus)}>
                              {audit.paymentStatus}
                            </Badge>

                            <Badge variant="outline" className={orderStatusTone(audit.adminApprovalStatus)}>
                              {audit.adminApprovalStatus}
                            </Badge>

                            <Badge variant="outline" className={orderStatusTone(audit.orderStatus)}>
                              {audit.orderStatus}
                            </Badge>
                          </div>

                          <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-5">
                            <div>
                              <p className="text-xs text-slate-500">Pedido</p>
                              <p className="font-medium text-slate-900">{shortId(audit.orderId)}</p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">Criado em</p>
                              <p className="font-medium text-slate-900">{brDate(audit.createdAt)}</p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">Total</p>
                              <p className="font-semibold text-slate-900">{brMoney(audit.totalAmount)}</p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">Pagamento</p>
                              <p className="font-medium text-slate-900">{audit.paymentStatus}</p>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500">Diagnóstico</p>
                              <p className="font-medium text-slate-900">{diagnosticLabel(audit)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1 xl:min-w-[240px]">
                          <Button
                            variant="outline"
                            className="rounded-2xl border-slate-300 bg-white"
                            onClick={() => toggleExpanded(audit.orderId)}
                          >
                            {expanded ? (
                              <>
                                <ChevronUp className="mr-2 h-4 w-4" />
                                Ocultar detalhes
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalhes
                              </>
                            )}
                          </Button>

                          <Button
                            variant="outline"
                            className="rounded-2xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            onClick={() =>
                              patchAuditReviewMutation.mutate({
                                orderId: audit.orderId,
                                payload: {
                                  status: "UNDER_REVIEW",
                                  note: "Enviado para revisão manual pelo painel",
                                },
                              })
                            }
                          >
                            <Clock3 className="mr-2 h-4 w-4" />
                            Enviar para análise
                          </Button>

                          <Button
                            variant="secondary"
                            className="rounded-2xl"
                            onClick={() =>
                              patchAuditReviewMutation.mutate({
                                orderId: audit.orderId,
                                payload: {
                                  status: "RESOLVED",
                                  note: "Revisão concluída pelo admin",
                                },
                              })
                            }
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Concluir análise
                          </Button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="mt-5 space-y-4">
                          <Separator className="bg-slate-200" />

                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-3xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-slate-700" />
                                <p className="text-sm font-medium text-slate-900">Comissão esperada</p>
                              </div>

                              <Separator className="my-3 bg-slate-200" />

                              {audit.expected ? (
                                <div className="space-y-2 text-sm text-slate-600">
                                  <p><span className="font-medium text-slate-900">Beneficiário:</span> {audit.expected.beneficiaryType}</p>
                                  <p><span className="font-medium text-slate-900">ID:</span> {audit.expected.beneficiaryId}</p>
                                  <p><span className="font-medium text-slate-900">Valor:</span> {brMoney(audit.expected.amount)}</p>
                                  <p><span className="font-medium text-slate-900">Origem:</span> {audit.expected.source}</p>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                  <CircleSlash className="h-4 w-4" />
                                  Nenhuma comissão esperada para este pedido.
                                </div>
                              )}
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-slate-700" />
                                <p className="text-sm font-medium text-slate-900">Comissão salva</p>
                              </div>

                              <Separator className="my-3 bg-slate-200" />

                              {audit.actual.length === 0 ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                  <CircleDashed className="h-4 w-4" />
                                  Nenhuma linha de comissão salva.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {audit.actual.map((row) => (
                                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                      <p><span className="font-medium text-slate-900">Beneficiário:</span> {row.beneficiaryType}</p>
                                      <p><span className="font-medium text-slate-900">ID:</span> {row.beneficiaryId}</p>
                                      <p><span className="font-medium text-slate-900">Valor:</span> {brMoney(row.amount)}</p>
                                      <p><span className="font-medium text-slate-900">Status:</span> {row.status}</p>
                                      <p><span className="font-medium text-slate-900">Criado:</span> {brDate(row.createdAt)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {audit.review ? (
                            <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                              <div className="flex items-center gap-2 font-medium">
                                <Clock3 className="h-4 w-4" />
                                Revisão manual
                              </div>
                              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                <p><span className="font-medium">Status:</span> {audit.review.status}</p>
                                <p><span className="font-medium">Revisado por:</span> {audit.review.reviewedBy || "—"}</p>
                                <p><span className="font-medium">Em:</span> {brDate(audit.review.reviewedAt)}</p>
                                <p><span className="font-medium">Nota:</span> {audit.review.note || "—"}</p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}