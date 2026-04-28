import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type LocalDeliveryDocuments = {
  documents: {
    label: {
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
      hiddenItemsCount: number;
      totals: {
        itemsQuantity: number;
        productsCount: number;
      };
    };

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

function optionalText(value?: string | number | null) {
  const v = String(value ?? "").trim();
  return v || "";
}

function mmToPt(mm: number) {
  return mm * 2.8346456693;
}

function formatPrintedDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "Não informado";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const hasTime = /\d{2}:\d{2}/.test(raw);

  if (!hasTime) {
    return new Intl.DateTimeFormat("pt-BR").format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function fetchLocalDeliveryDocuments(orderId: string) {
  const { data } = await api.get(
    endpoints.adminOrders.localDeliveryDocuments(orderId)
  );

  return data as LocalDeliveryDocuments;
}

function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

const unifiedStyles = StyleSheet.create({
  page: {
    paddingTop: 12,
    paddingLeft: 12,
    paddingRight: 18, // Aumentei um pouco a margem direita para a impressora não cortar o conteúdo
    paddingBottom: 12,
    fontFamily: "Helvetica",
    color: "#000000",
    backgroundColor: "#ffffff",
  },

  header: {
    alignItems: "center",
    marginBottom: 12,
  },

  headerTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1,
    letterSpacing: 0.5,
  },

  headerSubtitle: {
    marginTop: 1,
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    lineHeight: 1,
  },

  topSection: {
    marginBottom: 14,
  },

  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 4,
  },

  orderNumber: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.02,
    marginBottom: 2,
  },

  dateText: {
    fontSize: 10,
    lineHeight: 1.15,
  },

  customerName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
    marginBottom: 6,
  },

  phoneText: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
  },

  addressTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  addressPrimary: {
    fontSize: 14.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.18,
    marginBottom: 4,
  },

  addressSecondary: {
    fontSize: 12.5,
    lineHeight: 1.16,
    marginBottom: 3,
  },

  bottomDivider: {
    borderBottomWidth: 1.6,
    borderBottomColor: "#000000",
    marginTop: 12,
  },

  // NOVA CLASSE PARA AS LINHAS DE DATA E TELEFONE
  separatorLine: {
    borderBottomWidth: 1.2,
    borderBottomColor: "#000000",
    marginTop: 8,
    width: "100%",
  },

  productSection: {
    marginTop: 18,
  },

  productTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },

  productRow: {
    flexDirection: "row",
    alignItems: "flex-start", // Alterado para não repuxar com textos de 2 linhas
    marginBottom: 9,
    paddingRight: 6, // Mais um respiro de segurança do lado direito
  },

  productText: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingRight: 10, // Garante que o texto não "cole" no checkbox
  },

  productCheckbox: {
    width: 12,
    height: 12,
    borderWidth: 0.8,
    borderColor: "#000000",
    marginTop: 1, // Desce o checkbox um pouquinho pra alinhar com o topo do texto
    flexShrink: 0, // A MÁGICA AQUI: Diz ao flexbox para NUNCA esmagar a largura do checkbox
  },

  hiddenItemsText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },

  totalItemsText: {
    marginTop: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },

  productDivider: {
    borderBottomWidth: 1.4,
    borderBottomColor: "#000000",
    marginTop: 12,
  },
  
  checkSection: {
    marginTop: 32,
    marginBottom: 12,
    paddingHorizontal: 10,
  },

  checkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  checkColumn: {
    width: "38%",
    alignItems: "center",
  },

  checkTopLine: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    marginBottom: 5,
  },

  checkLabel: {
    fontSize: 7.4,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },

  proofSection: {
    marginTop: 32,
    marginBottom: 12,
    alignItems: "center",
    paddingHorizontal: 12,
  },

  proofTitle: {
    fontSize: 8.6,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    textAlign: "center",
  },

  proofText: {
    width: "90%",
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: "center",
  },

  signatureSection: {
    marginTop: 26,
    alignItems: "center",
    paddingHorizontal: 12,
  },

  signatureLine: {
    width: "54%",
    borderBottomWidth: 1.2,
    borderBottomColor: "#000000",
    marginBottom: 5,
  },

  signatureLabel: {
    fontSize: 6.2,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    textAlign: "center",
  },
});

function LocalDeliveryLabel({ docs }: { docs: LocalDeliveryDocuments }) {
  const label = docs.documents.label;
  const separation = docs.documents.separationList;

  const customer = separation.customer ?? label.customer;
  const address = separation.address ?? label.address;

  const items = separation.items?.length ? separation.items : label.items;
  const totals = separation.totals ?? label.totals;

  const maxVisibleItems = 3; 
  const visibleItems = items.slice(0, maxVisibleItems);
  const hiddenItemsCount = Math.max(items.length - maxVisibleItems, 0);

  const addressLine1 = [
    optionalText(address?.street),
    optionalText(address?.number),
  ]
    .filter(Boolean)
    .join(", ");

  const addressLine2 = optionalText(address?.complement);

  const cityState = [
    optionalText(address?.city),
    optionalText(address?.state),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <View>
      <View style={unifiedStyles.header}>
        <Text style={unifiedStyles.headerTitle}>KEYFI</Text>
        <Text style={unifiedStyles.headerSubtitle}>PROFESSIONAL</Text>
      </View>

      <View style={unifiedStyles.topSection}>
        <Text style={unifiedStyles.sectionLabel}>PEDIDO</Text>
        <Text style={unifiedStyles.orderNumber}>
          #{text(label.orderNumber)}
        </Text>
        <Text style={unifiedStyles.dateText}>
          DATA: {formatPrintedDate(label.printedDate)}
        </Text>
        {/* LINHA INSERIDA AQUI */}
        <View style={unifiedStyles.separatorLine} />
      </View>

      <View style={unifiedStyles.topSection}>
        <Text style={unifiedStyles.sectionLabel}>CLIENTE</Text>
        <Text style={unifiedStyles.customerName}>
          {text(customer?.name)}
        </Text>

        <Text style={unifiedStyles.sectionLabel}>TELEFONE</Text>
        <Text style={unifiedStyles.phoneText}>
          {text(customer?.phone)}
        </Text>
        {/* LINHA INSERIDA AQUI */}
        <View style={unifiedStyles.separatorLine} />
      </View>

      <View>
        <Text style={unifiedStyles.addressTitle}>ENDEREÇO DE ENTREGA</Text>

        <Text style={unifiedStyles.addressPrimary}>
          {addressLine1 || "Não informado"}
        </Text>

        {addressLine2 ? (
          <Text style={unifiedStyles.addressPrimary}>{addressLine2}</Text>
        ) : null}

        <Text style={unifiedStyles.addressSecondary}>
          {text(address?.neighborhood)}
        </Text>

        <Text style={unifiedStyles.addressSecondary}>
          {cityState || "Não informado"}
        </Text>

        <Text style={unifiedStyles.addressSecondary}>
          CEP: {text(address?.zipCode)}
        </Text>

        <View style={unifiedStyles.bottomDivider} />
        
        <View style={unifiedStyles.productSection}>
          <Text style={unifiedStyles.productTitle}>PEDIDO</Text>

          {visibleItems.map((item) => (
            <View key={item.id} style={unifiedStyles.productRow}>
              <Text style={unifiedStyles.productText}>
                {item.quantity}x {item.name}
              </Text>
              <View style={unifiedStyles.productCheckbox} />
            </View>
          ))}

          {hiddenItemsCount > 0 ? (
            <Text style={unifiedStyles.hiddenItemsText}>
              + {hiddenItemsCount} item(ns) adicional(is)
            </Text>
          ) : null}

          <Text style={unifiedStyles.totalItemsText}>
            TOTAL DE ITENS: {totals.itemsQuantity}
          </Text>

          <View style={unifiedStyles.productDivider} />

          <View style={unifiedStyles.checkSection}>
            <View style={unifiedStyles.checkRow}>
              <View style={unifiedStyles.checkColumn}>
                <View style={unifiedStyles.checkTopLine} />
                <Text style={unifiedStyles.checkLabel}>SEPARADO</Text>
              </View>

              <View style={unifiedStyles.checkColumn}>
                <View style={unifiedStyles.checkTopLine} />
                <Text style={unifiedStyles.checkLabel}>CONFERIDO</Text>
              </View>
            </View>
          </View>

          <View style={unifiedStyles.proofSection}>
            <Text style={unifiedStyles.proofTitle}>
              COMPROVANTE DE ENTREGA
            </Text>

            <Text style={unifiedStyles.proofText}>
              Recebi o pedido acima em perfeitas condições.
            </Text>
          </View>

          <View style={unifiedStyles.signatureSection}>
            <View style={unifiedStyles.signatureLine} />
            <Text style={unifiedStyles.signatureLabel}>
              ASSINATURA DO RECEBEDOR
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function UnifiedLocalDeliveryDocument({
  docs,
}: {
  docs: LocalDeliveryDocuments;
}) {
  return (
    <Document>
      <Page
        size={[mmToPt(80), mmToPt(100)]}
        style={unifiedStyles.page}
        wrap={false}
      >
        <LocalDeliveryLabel docs={docs} />
      </Page>
    </Document>
  );
}

function UnifiedLocalDeliveryBatchDocument({
  docsList,
}: {
  docsList: LocalDeliveryDocuments[];
}) {
  return (
    <Document>
      {docsList.map((docs, index) => (
        <Page
          key={`${
            docs.documents.label.orderNumber ??
            docs.documents.label.customer?.name ??
            index
          }`}
          size={[mmToPt(80), mmToPt(100)]}
          style={unifiedStyles.page}
          wrap={false}
        >
          <LocalDeliveryLabel docs={docs} />
        </Page>
      ))}
    </Document>
  );
}

export async function openLocalDeliveryUnifiedPdf(orderId: string) {
  const docs = await fetchLocalDeliveryDocuments(orderId);
  const blob = await pdf(<UnifiedLocalDeliveryDocument docs={docs} />).toBlob();
  openPdfBlob(blob);
}

export async function openLocalDeliveryUnifiedBatchPdf(orderIds: string[]) {
  const uniqueOrderIds = Array.from(new Set(orderIds)).filter(Boolean);

  if (!uniqueOrderIds.length) {
    throw new Error("Nenhum pedido informado para gerar documentos locais.");
  }

  const docsList = await Promise.all(
    uniqueOrderIds.map((orderId) => fetchLocalDeliveryDocuments(orderId))
  );

  const blob = await pdf(
    <UnifiedLocalDeliveryBatchDocument docsList={docsList} />
  ).toBlob();

  openPdfBlob(blob);
}