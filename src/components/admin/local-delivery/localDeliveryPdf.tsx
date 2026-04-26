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
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#000000",
    backgroundColor: "#ffffff",
  },

  header: {
    alignItems: "center",
    marginBottom: 4,
  },

  headerTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    lineHeight: 1.05,
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },

  separatorStrong: {
    borderBottomWidth: 1.8,
    borderBottomColor: "#000000",
    marginVertical: 5,
  },

  separator: {
    borderBottomWidth: 1.4,
    borderBottomColor: "#000000",
    marginVertical: 4.5,
  },

  block: {
    marginBottom: 1,
  },

  blockTitle: {
    fontSize: 7.3,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },

  orderNumber: {
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    marginBottom: 2,
  },

  customerName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
    marginBottom: 2,
  },

  phone: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },

  line: {
    fontSize: 8,
    lineHeight: 1.35,
    marginBottom: 1.2,
  },

  addressLine: {
    fontSize: 11.2,
    lineHeight: 1.42,
    marginBottom: 1.6,
  },

  productsTitle: {
    fontSize: 7.3,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2.4,
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
    marginTop: 2,
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
  },

  compactFields: {
    marginTop: 2,
    gap: 2.5,
  },

  footerLine: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },

  footerSmallText: {
    marginTop: 1.5,
    fontSize: 6.4,
    lineHeight: 1.2,
  },

  cutGuideText: {
    textAlign: "center",
    fontSize: 6,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  orderBlock: {
  marginBottom: 8,
  paddingBottom: 4,
},

dateLine: {
  fontSize: 7.8,
  lineHeight: 1.25,
  marginTop: 1,
},

addressBlock: {
  marginBottom: 5,
},

receiptBlock: {
  marginTop: 6,
  gap: 4,
},

fieldRow: {
  flexDirection: "row",
  alignItems: "flex-end",
  gap: 6,
},

fieldLabel: {
  fontSize: 7.4,
  fontFamily: "Helvetica-Bold",
},

fieldLine: {
  flex: 1,
  borderBottomWidth: 1,
  borderBottomColor: "#000000",
},

proofTitle: {
  marginTop: 4,
  fontSize: 8.2,
  fontFamily: "Helvetica-Bold",
  textTransform: "uppercase",
  letterSpacing: 0.4,
},

signatureRow: {
  marginTop: 5,
  flexDirection: "row",
  alignItems: "flex-end",
  gap: 6,
},

signatureLabel: {
  fontSize: 7.4,
  fontFamily: "Helvetica-Bold",
},

signatureLine: {
  flex: 1,
  borderBottomWidth: 1,
  borderBottomColor: "#000000",
},

cutGuideWrap: {
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 4,
},

cutGuideLine: {
  borderTopWidth: 0.8,
  borderTopColor: "#000000",
  borderStyle: "dashed",
},

});

function LocalDeliveryLabel({ docs }: { docs: LocalDeliveryDocuments }) {
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
    const maxVisibleItems = shouldUseCompactReceipt ? 6 : 8;
  const visibleItems = items.slice(0, maxVisibleItems);
  const hiddenItemsCount = Math.max(items.length - maxVisibleItems, 0);

  return (
    <View style={unifiedStyles.page}>
      <View style={unifiedStyles.header} wrap={false}>
        <Text style={unifiedStyles.headerTitle}>KEYFI</Text>
        <Text style={unifiedStyles.headerSubtitle}>PROFESSIONAL</Text>
      </View>

<View style={[unifiedStyles.block, unifiedStyles.orderBlock]} wrap={false}>
  <Text style={unifiedStyles.blockTitle}>Pedido</Text>
  <Text style={unifiedStyles.orderNumber}>{text(label.orderNumber)}</Text>
  <Text style={unifiedStyles.dateLine}>
    DATA: {formatPrintedDate(label.printedDate)}
  </Text>
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
        <Text style={unifiedStyles.addressLine}>{addressLine1 || "Não informado"}</Text>
        {addressLine2 ? <Text style={unifiedStyles.addressLine}>{addressLine2}</Text> : null}
        <Text style={unifiedStyles.addressLine}>{text(address?.neighborhood)}</Text>
        <Text style={unifiedStyles.addressLine}>{cityState || "Não informado"}</Text>
        <Text style={unifiedStyles.addressLine}>CEP: {text(address?.zipCode)}</Text>
      </View>
      <View style={unifiedStyles.separatorStrong} />

      <View style={unifiedStyles.block}>
        <Text style={unifiedStyles.productsTitle}>Produtos</Text>

        {visibleItems.map((item) => (
          <View key={item.id} style={unifiedStyles.itemRow}>
            <Text style={unifiedStyles.itemText}>
              {item.quantity}x {item.name}
            </Text>
            <Text style={unifiedStyles.checkbox}>[ ]</Text>
          </View>
         ))}
          {hiddenItemsCount > 0 ? (
          <Text style={unifiedStyles.itemText}>+ {hiddenItemsCount} item(ns) adicional(is)</Text>
        ) : null}

        <Text style={unifiedStyles.totals}>TOTAL DE ITENS: {totals.itemsQuantity}</Text>
      </View>

      <View style={unifiedStyles.separator} />

<View style={unifiedStyles.receiptBlock} wrap={false}>
  <View style={unifiedStyles.fieldRow}>
    <Text style={unifiedStyles.fieldLabel}>SEPARADO</Text>
    <View style={unifiedStyles.fieldLine} />
  </View>

  <View style={unifiedStyles.fieldRow}>
    <Text style={unifiedStyles.fieldLabel}>CONFERIDO</Text>
    <View style={unifiedStyles.fieldLine} />
  </View>

  <Text style={unifiedStyles.proofTitle}>COMPROVANTE DE ENTREGA</Text>

  <Text style={unifiedStyles.footerSmallText}>
    Recebi o pedido em perfeitas condições.
  </Text>

  <View style={unifiedStyles.signatureRow}>
    <Text style={unifiedStyles.signatureLabel}>ASSINATURA</Text>
    <View style={unifiedStyles.signatureLine} />
  </View>
</View>
      <View style={unifiedStyles.cutGuideWrap} wrap={false}>
        <View style={unifiedStyles.cutGuideLine} />
        <Text style={unifiedStyles.cutGuideText}>corte aqui</Text>
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
            <Page size={[mmToPt(80), mmToPt(100)]}>
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
          key={`${docs.documents.label.orderNumber ?? docs.documents.label.customer?.name ?? index}`}
          size={[mmToPt(80), mmToPt(100)]}
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