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

function mmToPt(mm: number) {
  return mm * 2.8346456693;
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
  width: mmToPt(100),
  height: mmToPt(150),
  padding: 7,
  fontFamily: "Helvetica",
  fontSize: 8,
  color: "#000000",
  backgroundColor: "#ffffff",
},

  box: {
    borderWidth: 1,
    borderColor: "#000000",
    minHeight: "100%",
  },

  header: {
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderBottomWidth: 1.5,
    borderBottomColor: "#000000",
    textAlign: "center",
  },

  title: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  brand: {
    marginTop: 2,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },

section: {
  paddingVertical: 5,
  paddingHorizontal: 7,
  borderBottomWidth: 1,
  borderBottomColor: "#000000",
},

compactSection: {
  paddingVertical: 4,
  paddingHorizontal: 7,
  borderBottomWidth: 1,
  borderBottomColor: "#000000",
},

  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 3,
    letterSpacing: 0.2,
  },

  orderNumber: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },

  customerName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },

line: {
  fontSize: 8,
  lineHeight: 1.25,
},

strongLine: {
  fontSize: 8.5,
  fontFamily: "Helvetica-Bold",
  lineHeight: 1.25,
},

  itemRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 2.5,
  },

  checkbox: {
    width: 14,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },

itemText: {
  flex: 1,
  fontSize: 7.8,
  lineHeight: 1.2,
},

total: {
  marginTop: 4,
  paddingTop: 4,
  borderTopWidth: 1,
  borderTopColor: "#000000",
  fontSize: 8.5,
  fontFamily: "Helvetica-Bold",
},

  signatureGrid: {
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },

  signatureBox: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 3,
    fontSize: 7.5,
  },
});

function UnifiedLocalDeliveryDocument({
  docs,
}: {
  docs: LocalDeliveryDocuments;
}) {
  const label = docs.documents.label;
  const separation = docs.documents.separationList;

  const items = separation.items?.length ? separation.items : label.items;
  const totals = separation.totals ?? label.totals;
  const customer = separation.customer ?? label.customer;
  const address = separation.address ?? label.address;
  const deliveryNotes = separation.deliveryNotes ?? label.deliveryNotes;

  return (
    <Document>
      <Page size={[mmToPt(100), mmToPt(150)]} style={unifiedStyles.page}>
        <View style={unifiedStyles.box}>
          <View style={unifiedStyles.header} wrap={false}>
            <Text style={unifiedStyles.title}>ENTREGA LOCAL</Text>
            <Text style={unifiedStyles.brand}>{label.brand || "KEYFI"}</Text>
          </View>

          <View style={unifiedStyles.compactSection} wrap={false}>
            <Text style={unifiedStyles.sectionTitle}>Pedido</Text>
            <Text style={unifiedStyles.orderNumber}>
              {text(label.orderNumber)}
            </Text>
            <Text style={unifiedStyles.line}>
              Data: {text(label.printedDate)}
            </Text>
          </View>

          <View style={unifiedStyles.compactSection} wrap={false}>
            <Text style={unifiedStyles.sectionTitle}>Cliente</Text>
            <Text style={unifiedStyles.customerName}>
              {text(customer?.name)}
            </Text>
            <Text style={unifiedStyles.strongLine}>
              Telefone: {text(customer?.phone)}
            </Text>
          </View>

          <View style={unifiedStyles.section} wrap={false}>
            <Text style={unifiedStyles.sectionTitle}>Endereço</Text>
            <Text style={unifiedStyles.line}>
              {text(address?.street)}, {text(address?.number)}
            </Text>

            {address?.complement ? (
              <Text style={unifiedStyles.line}>
                Complemento: {address.complement}
              </Text>
            ) : null}

            <Text style={unifiedStyles.line}>
              Bairro: {text(address?.neighborhood)}
            </Text>
            <Text style={unifiedStyles.line}>
              {text(address?.city)} - {text(address?.state)}
            </Text>
            <Text style={unifiedStyles.line}>
              CEP: {text(address?.zipCode)}
            </Text>
          </View>

          {deliveryNotes ? (
            <View style={unifiedStyles.compactSection} wrap={false}>
              <Text style={unifiedStyles.sectionTitle}>Observação</Text>
              <Text style={unifiedStyles.line}>{deliveryNotes}</Text>
            </View>
          ) : null}

          <View style={unifiedStyles.section}>
            <Text style={unifiedStyles.sectionTitle}>
              Produtos para separar
            </Text>

            {items.map((item) => (
              <View key={item.id} style={unifiedStyles.itemRow}>
                <Text style={unifiedStyles.checkbox}>[ ]</Text>
<Text style={unifiedStyles.itemText}>
  {item.quantity}x {item.name}
</Text>
              </View>
            ))}

            <Text style={unifiedStyles.total}>
              Total de itens: {totals.itemsQuantity}
            </Text>
          </View>
          

          <View style={unifiedStyles.compactSection} wrap={false}>
            <Text style={unifiedStyles.sectionTitle}>Conferência</Text>

            <View style={unifiedStyles.signatureGrid}>
              <Text style={unifiedStyles.signatureBox}>Separado por</Text>
              <Text style={unifiedStyles.signatureBox}>Conferido por</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function openLocalDeliveryUnifiedPdf(orderId: string) {
  const docs = await fetchLocalDeliveryDocuments(orderId);
  const blob = await pdf(<UnifiedLocalDeliveryDocument docs={docs} />).toBlob();
  openPdfBlob(blob);
}