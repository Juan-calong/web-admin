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
    width: mmToPt(80),
    height: mmToPt(100),
    paddingTop: 6,
    paddingHorizontal: 6,
    paddingBottom: 5,
    fontFamily: "Helvetica",
    fontSize: 7.4,
    color: "#000000",
    backgroundColor: "#ffffff",
  },

  header: {
    alignItems: "center",
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    lineHeight: 1.05,
  },

  headerSubtitle: {
    marginTop: 1,
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },

  separatorStrong: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#000000",
    marginVertical: 3,
  },

  separator: {
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    marginVertical: 2.5,
  },

  block: {
    marginBottom: 1,
  },

  blockTitle: {
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1.5,
  },

  orderNumber: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    marginBottom: 1,
  },

  customerName: {
    fontSize: 9.3,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
    marginBottom: 1,
  },

  phone: {
    fontSize: 8.8,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },

  line: {
    fontSize: 7.4,
    lineHeight: 1.2,
    marginBottom: 0.7,
  },

  productsTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 2,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
  },

  itemText: {
    flex: 1,
    fontSize: 7,
    lineHeight: 1.2,
    textTransform: "uppercase",
    marginRight: 4,
  },

  checkbox: {
    width: 12,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  totals: {
    marginTop: 1,
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
  },

  compactFields: {
    marginTop: 1,
    gap: 1.5,
  },

  footerLine: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },

  footerSmallText: {
    marginTop: 1,
    fontSize: 6.4,
    lineHeight: 1.2,
  },
});

function LocalDeliveryPage({ docs }: { docs: LocalDeliveryDocuments }) {
  const label = docs.documents.label;
  const separation = docs.documents.separationList;

  const items = separation.items?.length ? separation.items : label.items;
  const totals = separation.totals ?? label.totals;
  const customer = separation.customer ?? label.customer;
  const address = separation.address ?? label.address;
  const deliveryNotes = separation.deliveryNotes ?? label.deliveryNotes;

    const addressLine1 = [optionalText(address?.street), optionalText(address?.number)]
    .filter(Boolean)
    .join(", ");
  const addressLine2 = optionalText(address?.complement);
  const cityState = [optionalText(address?.city), optionalText(address?.state)]
    .filter(Boolean)
    .join(" - ");

  const shouldUseCompactReceipt = items.length > 6 || Boolean(deliveryNotes);

  return (
    <Page size={[mmToPt(80), mmToPt(100)]} style={unifiedStyles.page}>
      <View style={unifiedStyles.header} wrap={false}>
        <Text style={unifiedStyles.headerTitle}>KEYFI</Text>
        <Text style={unifiedStyles.headerSubtitle}>PROFESSIONAL</Text>
      </View>

      <View style={unifiedStyles.separatorStrong} />
      <View style={unifiedStyles.block} wrap={false}>
        <Text style={unifiedStyles.blockTitle}>Pedido</Text>
        <Text style={unifiedStyles.orderNumber}>{text(label.orderNumber)}</Text>
        <Text style={unifiedStyles.line}>DATA: {formatPrintedDate(label.printedDate)}</Text>
      </View>

        <View style={unifiedStyles.separator} />

      <View style={unifiedStyles.block} wrap={false}>
        <Text style={unifiedStyles.blockTitle}>Cliente</Text>
        <Text style={unifiedStyles.customerName}>{text(customer?.name)}</Text>
        <Text style={unifiedStyles.blockTitle}>Telefone</Text>
        <Text style={unifiedStyles.phone}>{text(customer?.phone)}</Text>
      </View>

      <View style={unifiedStyles.separator} />

      <View style={unifiedStyles.block} wrap={false}>
        <Text style={unifiedStyles.blockTitle}>Endereço de entrega</Text>
        <Text style={unifiedStyles.line}>{addressLine1 || "Não informado"}</Text>
        {addressLine2 ? <Text style={unifiedStyles.line}>{addressLine2}</Text> : null}
        <Text style={unifiedStyles.line}>{text(address?.neighborhood)}</Text>
        <Text style={unifiedStyles.line}>{cityState || "Não informado"}</Text>
        <Text style={unifiedStyles.line}>CEP: {text(address?.zipCode)}</Text>
      </View>
      <View style={unifiedStyles.separatorStrong} />

      <View style={unifiedStyles.block}>
        <Text style={unifiedStyles.productsTitle}>Produtos</Text>

        {items.map((item) => (
          <View key={item.id} style={unifiedStyles.itemRow}>
            <Text style={unifiedStyles.itemText}>
              {item.quantity}x {item.name}
            </Text>
            <Text style={unifiedStyles.checkbox}>[ ]</Text>
          </View>
         ))}

        <Text style={unifiedStyles.totals}>TOTAL DE ITENS: {totals.itemsQuantity}</Text>
      </View>

      <View style={unifiedStyles.separator} />

      <View style={unifiedStyles.compactFields} wrap={false}>
        <Text style={unifiedStyles.footerLine}>SEPARADO ________</Text>
        <Text style={unifiedStyles.footerLine}>CONFERIDO _______</Text>
        {shouldUseCompactReceipt ? (
          <Text style={unifiedStyles.footerLine}>RECEBIDO/ASSINATURA __________________</Text>
        ) : (
          <>
            <Text style={unifiedStyles.footerLine}>COMPROVANTE DE ENTREGA</Text>
            <Text style={unifiedStyles.footerSmallText}>
              Recebi o pedido em perfeitas condições.
            </Text>
            <Text style={unifiedStyles.footerLine}>ASSINATURA __________________</Text>
          </>
        )}
      </View>
    </Page>
  );
}

function UnifiedLocalDeliveryDocument({
  docs,
}: {
  docs: LocalDeliveryDocuments;
}) {
  return (
    <Document>
      <LocalDeliveryPage docs={docs} />
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
        <LocalDeliveryPage
          key={`${docs.documents.label.orderNumber ?? docs.documents.label.customer?.name ?? index}`}
          docs={docs}
        />
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