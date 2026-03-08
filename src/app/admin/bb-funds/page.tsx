"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type BalanceDTO = {
  ok: true;
  balance: null | {
    id: string;
    balance: string;
    asOf: string;
    createdBy: string | null;
    notes: string | null;
  };
};

type SummaryDTO = {
  ok: true;
  summary: {
    balance: null | {
      id: string;
      amount: string;
      asOf: string;
      notes: string | null;
    };
    batch: {
      batchKey: string | null;
      scheduledFor: string | null;
      payoutCount: number;
      totalAmount: string;
      hasOpenBatch: boolean;
    };
    requested: {
      payoutCount: number;
      totalAmount: string;
    };
    comparison: {
      difference: string;
      coverageRatio: number | null;
      status: "OK" | "LOW" | "INSUFFICIENT" | "NO_PENDING_BATCH";
    };
  };
};

async function fetchBalance(): Promise<BalanceDTO> {
  const { data } = await api.get(endpoints.bbFunds.get);
  return data;
}

async function fetchSummary(): Promise<SummaryDTO> {
  const { data } = await api.get(endpoints.bbFunds.summary);
  return data;
}

async function setBalance(payload: { balance: string; notes?: string }) {
  const { data } = await api.post(endpoints.bbFunds.set, payload);
  return data as BalanceDTO;
}

function formatBRL(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function getStatusUi(status: SummaryDTO["summary"]["comparison"]["status"]) {
  switch (status) {
    case "OK":
      return {
        label: "Saldo suficiente",
        badgeClass: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        helper: "O saldo cobre o próximo malote.",
      };
    case "LOW":
      return {
        label: "Saldo apertado",
        badgeClass: "bg-amber-100 text-amber-700 border border-amber-200",
        helper: "O saldo cobre, mas com pouca folga.",
      };
    case "INSUFFICIENT":
      return {
        label: "Saldo insuficiente",
        badgeClass: "bg-red-100 text-red-700 border border-red-200",
        helper: "O saldo atual não cobre o próximo malote.",
      };
    case "NO_PENDING_BATCH":
    default:
      return {
        label: "Sem malote pendente",
        badgeClass: "bg-zinc-100 text-zinc-700 border border-zinc-200",
        helper: "Não há payouts em lote no momento.",
      };
  }
}

export default function BbFundsPage() {
  const qc = useQueryClient();

  const balQ = useQuery({
    queryKey: ["admin-bb-balance"],
    queryFn: fetchBalance,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const summaryQ = useQuery({
    queryKey: ["admin-bb-malote-summary"],
    queryFn: fetchSummary,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const current = balQ.data?.balance ?? null;
  const summary = summaryQ.data?.summary;

  const [balance, setBalanceStr] = useState("");
  const [notes, setNotes] = useState("");

  const saveM = useMutation({
    mutationFn: setBalance,
    onSuccess: async () => {
      toast.success("Saldo atualizado.");
      setBalanceStr("");
      setNotes("");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-bb-balance"] }),
        qc.invalidateQueries({ queryKey: ["admin-bb-malote-summary"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] }),
      ]);
    },
    onError: (e: any) => {
      toast.error(String(e?.response?.data?.error || e?.message || "Erro ao salvar saldo"));
    },
  });

  const lastUpdated = useMemo(() => {
    if (!current?.asOf) return null;
    const d = new Date(current.asOf);
    return d.toLocaleString("pt-BR");
  }, [current?.asOf]);

  const statusUi = getStatusUi(summary?.comparison.status ?? "NO_PENDING_BATCH");

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-black">Saldo do BB</h1>
        <p className="text-sm text-black/60">
          Informe o saldo disponível na conta do Banco do Brasil para checarmos se o malote do dia 10 vai passar.
        </p>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black/70">Último saldo informado</div>
            <div className="text-2xl font-black">
              {current ? formatBRL(current.balance) : "—"}
            </div>
            <div className="text-xs text-black/60">
              {current
                ? `Atualizado em ${lastUpdated}${current.notes ? ` • ${current.notes}` : ""}`
                : "Nenhum saldo informado ainda."}
            </div>
          </div>

          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              balQ.refetch();
              summaryQ.refetch();
            }}
            disabled={balQ.isFetching || summaryQ.isFetching}
          >
            Atualizar
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black/70">Próximo malote</div>
            <div className="text-2xl font-black">
              {summary ? formatBRL(summary.batch.totalAmount) : "—"}
            </div>

            <div className="mt-1 text-xs text-black/60">
              {summary
                ? `${summary.batch.payoutCount} payout(s)${
                    summary.batch.batchKey ? ` • lote ${summary.batch.batchKey}` : ""
                  }${
                    summary.batch.scheduledFor
                      ? ` • previsto para ${formatDateTime(summary.batch.scheduledFor)}`
                      : ""
                  }`
                : "Carregando resumo do malote..."}
            </div>

            {summary && (
              <div className="mt-2 text-xs text-black/50">
                {summary.batch.hasOpenBatch
                  ? "Existe um lote aberto para processamento."
                  : "Ainda não existe lote aberto."}
              </div>
            )}
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <div
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusUi.badgeClass}`}
            >
              {statusUi.label}
            </div>

            <div className="text-sm text-black/70">
              Diferença:{" "}
              <span className="font-bold">
                {summary ? formatBRL(summary.comparison.difference) : "—"}
              </span>
            </div>

            <div className="text-xs text-black/60">{statusUi.helper}</div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
              Saldo atual
            </div>
            <div className="mt-1 text-lg font-black">
              {summary?.balance ? formatBRL(summary.balance.amount) : "—"}
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
              Total do malote
            </div>
            <div className="mt-1 text-lg font-black">
              {summary ? formatBRL(summary.batch.totalAmount) : "—"}
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
              Payouts no malote
            </div>
            <div className="mt-1 text-lg font-black">
              {summary?.batch.payoutCount ?? 0}
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
              Fora do lote
            </div>
            <div className="mt-1 text-lg font-black">
              {summary?.requested?.payoutCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-black/60">
              {summary ? formatBRL(summary.requested.totalAmount) : "—"}
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <div className="text-sm font-semibold">Atualizar saldo</div>
        <div className="text-xs text-black/60">Use ponto para centavos (ex: 1234.56)</div>

        <Separator className="my-3" />

        <div className="grid max-w-md gap-3">
          <Input
            value={balance}
            onChange={(e) => setBalanceStr(e.target.value)}
            placeholder="Ex: 1000.00"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observação (opcional)"
          />

          <Button
            className="rounded-xl"
            onClick={() => {
              if (!balance.trim()) return toast.error("Informe o saldo.");
              saveM.mutate({ balance: balance.trim(), notes: notes.trim() || undefined });
            }}
            disabled={saveM.isPending}
          >
            Salvar
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <div className="text-sm font-semibold">Onde isso aparece?</div>
        <div className="mt-1 text-sm text-black/60">
          O resumo separa o que já está no malote do que ainda está fora dele. Se o saldo informado for menor que o
          total do lote, o sistema pode criar um alerta no <b>Inbox</b>. No dia do malote, isso também ajuda a
          bloquear o envio automático até que o saldo seja suficiente.
        </div>
      </Card>
    </div>
  );
}