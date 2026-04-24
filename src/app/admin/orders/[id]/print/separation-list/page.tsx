"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";

type LocalDeliveryDocuments = {
  documents: {
    separationList: {
      title: string;
      brand: string;
      orderNumber?: string | null;
      printedDate?: string | null;
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
      items: Array<{
        id: string;
        quantity: number;
        name: string;
        sku?: string | null;
      }>;
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

export default function SeparationListPrintPage() {
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

  const doc = docsQ.data?.documents?.separationList;

  return (
    <main>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
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

        .page {
          max-width: 840px;
          margin: 0 auto;
          background: white;
          padding: 28px;
          border: 1px solid #d4d4d8;
          box-sizing: border-box;
        }

        .header {
          text-align: center;
          border-bottom: 2px solid #000;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }

        .header-title {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 0.3px;
        }

        .header-subtitle {
          margin-top: 6px;
          font-size: 14px;
          font-weight: 700;
        }

        .section {
          margin-bottom: 18px;
        }

        .section-title {
          font-size: 13px;
          font-weight: 900;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .line {
          font-size: 14px;
          line-height: 1.55;
          word-break: break-word;
        }

        .line + .line {
          margin-top: 2px;
        }

        .item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 15px;
          line-height: 1.5;
          margin-bottom: 10px;
        }

        .checkbox {
          font-family: monospace;
          font-weight: 900;
          min-width: 26px;
        }

        .totals-box {
          margin-top: 14px;
          border-top: 1px dashed #000;
          padding-top: 10px;
          font-size: 14px;
          font-weight: 800;
        }

        .sign-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin-top: 20px;
        }

        .sign-line {
          border-top: 1px solid #000;
          padding-top: 6px;
          font-size: 13px;
          min-height: 32px;
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

          .page {
            max-width: none;
            margin: 0;
            padding: 0;
            border: none;
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
          <div className="screen-actions">Carregando lista de separação...</div>
        ) : docsQ.isError || !doc ? (
          <div className="screen-actions">
            Não foi possível carregar a lista de separação.
          </div>
        ) : (
          <section className="page">
            <div className="header">
              <div className="header-title">{doc.title}</div>
              <div className="header-subtitle">Pedido: {text(doc.orderNumber)}</div>
            </div>

            <div className="section">
              <div className="section-title">Dados do pedido</div>
              <div className="line">Pedido: {text(doc.orderNumber)}</div>
              <div className="line">Data: {text(doc.printedDate)}</div>
              <div className="line">Tipo de entrega: ENTREGA LOCAL</div>
            </div>

            <div className="section">
              <div className="section-title">Cliente</div>
              <div className="line">Nome: {text(doc.customer?.name)}</div>
              <div className="line">Telefone: {text(doc.customer?.phone)}</div>
            </div>

            <div className="section">
              <div className="section-title">Endereço de entrega</div>
              <div className="line">
                {text(doc.address?.street)}, {text(doc.address?.number)}
              </div>

              {doc.address?.complement ? (
                <div className="line">Complemento: {doc.address.complement}</div>
              ) : null}

              <div className="line">Bairro: {text(doc.address?.neighborhood)}</div>
              <div className="line">
                {text(doc.address?.city)} - {text(doc.address?.state)}
              </div>
              <div className="line">CEP: {text(doc.address?.zipCode)}</div>
            </div>

            {doc.deliveryNotes ? (
              <div className="section">
                <div className="section-title">Observação de entrega</div>
                <div className="line">{doc.deliveryNotes}</div>
              </div>
            ) : null}

            <div className="section">
              <div className="section-title">Produtos para separar</div>

              {doc.items.map((item) => (
                <div key={item.id} className="item">
                  <span className="checkbox">[ ]</span>
                  <span>
                    {item.quantity}x {item.name}
                    {item.sku ? ` — SKU: ${item.sku}` : ""}
                  </span>
                </div>
              ))}

              <div className="totals-box">
                Total de itens: {doc.totals.itemsQuantity}
              </div>
            </div>

            <div className="section">
              <div className="section-title">Conferência</div>

              <div className="sign-grid">
                <div className="sign-line">Separado por</div>
                <div className="sign-line">Conferido por</div>
                <div className="sign-line">Data/Hora</div>
                <div className="sign-line">Observação interna</div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}