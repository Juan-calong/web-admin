"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";

type LocalDeliveryDocuments = {
  order: {
    id: string;
    number?: string | null;
    code?: string | null;
    printedDate?: string | null;
  };
  customer: {
    name?: string | null;
    phone?: string | null;
  };
  address: {
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  };
  deliveryNotes?: string | null;
  documents: {
    label: {
      title: string;
      brand: string;
      orderNumber?: string | null;
      printedDate?: string | null;
      customer: LocalDeliveryDocuments["customer"];
      address: LocalDeliveryDocuments["address"];
      deliveryNotes?: string | null;
      items: Array<{
        id: string;
        quantity: number;
        name: string;
        sku?: string | null;
      }>;
      hiddenItemsCount: number;
      totals: {
        itemsQuantity: number;
        productsCount: number;
      };
    };
  };
};

function text(value?: string | number | null) {
  const v = String(value ?? "").trim();
  return v || "Não informado";
}

export default function LocalLabelPrintPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");

  const docsQ = useQuery({
    queryKey: ["admin-local-delivery-documents", id],
    queryFn: async () => {
      const res = await api.get(endpoints.adminOrders.localDeliveryDocuments(id));
      return res.data as LocalDeliveryDocuments;
    },
    enabled: Boolean(id),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const label = docsQ.data?.documents?.label;

  return (
    <main>
      <style jsx global>{`
        @page {
          size: 100mm 150mm;
          margin: 4mm;
        }

        body {
          margin: 0;
          background: #f5f5f5;
          color: #000;
          font-family: Arial, sans-serif;
        }

        .screen-shell {
          min-height: 100vh;
          padding: 20px;
        }

        .screen-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .label-page {
          width: 100mm;
          min-height: 150mm;
          box-sizing: border-box;
          background: white;
          margin: 0 auto;
          padding: 0;
          border: 1px solid #000;
        }

        .label-header {
          text-align: center;
          padding: 10px 10px 8px;
          border-bottom: 2px solid #000;
        }

        .label-title {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.4px;
        }

        .label-brand {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 700;
        }

        .section {
          padding: 8px 10px;
          border-bottom: 1px solid #000;
        }

        .section-title {
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 5px;
          letter-spacing: 0.3px;
        }

        .big {
          font-size: 15px;
          font-weight: 900;
          line-height: 1.25;
          word-break: break-word;
        }

        .line {
          font-size: 11px;
          line-height: 1.45;
          word-break: break-word;
        }

        .line + .line {
          margin-top: 1px;
        }

        .item {
          font-size: 11px;
          line-height: 1.35;
          word-break: break-word;
        }

        .item + .item {
          margin-top: 3px;
        }

        .total {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px dashed #000;
          font-size: 12px;
          font-weight: 900;
        }

        @media print {
          body {
            background: white;
          }

          .screen-shell {
            padding: 0;
          }

          .screen-actions {
            display: none;
          }

          .label-page {
            margin: 0;
            border: 1px solid #000;
          }
        }
      `}</style>

      <div className="screen-shell">
        <div className="screen-actions">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <Button type="button" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Salvar PDF
          </Button>
        </div>

        {docsQ.isLoading ? (
          <div className="screen-actions">Carregando etiqueta...</div>
        ) : docsQ.isError || !label ? (
          <div className="screen-actions">Não foi possível carregar a etiqueta.</div>
        ) : (
          <section className="label-page">
            <div className="label-header">
              <div className="label-title">{label.title}</div>
              <div className="label-brand">{label.brand}</div>
            </div>

            <div className="section">
              <div className="section-title">Pedido</div>
              <div className="big">{text(label.orderNumber)}</div>
              <div className="line">Data: {text(label.printedDate)}</div>
            </div>

            <div className="section">
              <div className="section-title">Cliente</div>
              <div className="big">{text(label.customer?.name)}</div>
              <div className="line">Telefone: {text(label.customer?.phone)}</div>
            </div>

            <div className="section">
              <div className="section-title">Endereço</div>
              <div className="line">
                {text(label.address?.street)}, {text(label.address?.number)}
              </div>

              {label.address?.complement ? (
                <div className="line">Complemento: {label.address.complement}</div>
              ) : null}

              <div className="line">Bairro: {text(label.address?.neighborhood)}</div>
              <div className="line">
                {text(label.address?.city)} - {text(label.address?.state)}
              </div>
              <div className="line">CEP: {text(label.address?.zipCode)}</div>
            </div>

            {label.deliveryNotes ? (
              <div className="section">
                <div className="section-title">Observação de entrega</div>
                <div className="line">{label.deliveryNotes}</div>
              </div>
            ) : null}

            <div className="section">
              <div className="section-title">Produtos</div>

              {label.items.map((item) => (
                <div key={item.id} className="item">
                  {item.quantity}x {item.name}
                </div>
              ))}

              {label.hiddenItemsCount > 0 ? (
                <div className="item">
                  + {label.hiddenItemsCount} item(ns) na lista de separação
                </div>
              ) : null}

              <div className="total">
                Total de itens: {label.totals.itemsQuantity}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}