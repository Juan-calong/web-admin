"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/apiError";
import {
  openLocalDeliveryLabelPdf,
  openLocalDeliverySeparationListPdf,
} from "@/components/admin/local-delivery/localDeliveryPdf";

export function LocalDeliveryDocumentsPanel({ orderId }: { orderId: string }) {
  const labelM = useMutation({
    mutationFn: () => openLocalDeliveryLabelPdf(orderId),
    onSuccess: () => {
      toast.success("Etiqueta local aberta para impressão.");
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Não foi possível abrir a etiqueta local."));
    },
  });

  const separationListM = useMutation({
    mutationFn: () => openLocalDeliverySeparationListPdf(orderId),
    onSuccess: () => {
      toast.success("Lista de separação aberta para impressão.");
    },
    onError: (err) => {
      toast.error(
        apiErrorMessage(err, "Não foi possível abrir a lista de separação.")
      );
    },
  });

  const busy = labelM.isPending || separationListM.isPending;

  return (
    <Card className="overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/95 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Truck className="h-5 w-5" />
            </div>

            <div>
              <CardTitle className="text-lg font-bold text-zinc-950">
                Entrega local
              </CardTitle>
              <p className="mt-1 text-sm text-zinc-500">
                Fluxo local: abrir etiqueta, imprimir e usar a lista para separação.
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Este pedido usa <strong>entrega local</strong>. Não é necessário gerar etiqueta dos Correios.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Button
            type="button"
            className="h-12 w-full rounded-2xl bg-zinc-950 text-white hover:bg-zinc-800"
            onClick={() => labelM.mutate()}
            disabled={busy}
          >
            {labelM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Abrir etiqueta local
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-2xl border-zinc-200 bg-white"
            onClick={() => separationListM.mutate()}
            disabled={busy}
          >
            {separationListM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardList className="mr-2 h-4 w-4" />
            )}
            Abrir lista de separação
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <FileText className="h-4 w-4" />
              Documento em PDF
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              A etiqueta e a lista abrem no visualizador de PDF do navegador,
              com opções de imprimir e baixar.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <ExternalLink className="h-4 w-4" />
              Fluxo parecido com Correios
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              O documento é gerado como PDF local e aberto em nova aba, parecido
              com a etiqueta dos Correios.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}