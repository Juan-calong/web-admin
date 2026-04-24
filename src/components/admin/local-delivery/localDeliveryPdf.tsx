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

const labelStyles = StyleSheet.create({
  page: {
    width: mmToPt(100),
    height: mmToPt(150),
    padding: 10,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000000",
    backgroundColor: "#ffffff",
  },
  box: {
    borderWidth: 1,
    borderColor: "#000000",
    height: "100%",
  },
  header: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: "#000000",
    textAlign: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  brand: {
    marginTop: 3,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  section: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  big: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
  },
  line: {
    fontSize: 9,
    lineHeight: 1.35,
  },
  item: {
    fontSize: 8.5,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  total: {
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
});

function LocalLabelDocument({ docs }: { docs: LocalDeliveryDocuments }) {
  const label = docs.documents.label;

  return (
    <Document>
      <Page size={[mmToPt(100), mmToPt(150)]} style={labelStyles.page}>
        <View style={labelStyles.box}>
          <View style={labelStyles.header}>
            <Text style={labelStyles.title}>{label.title}</Text>
            <Text style={labelStyles.brand}>{label.brand}</Text>
          </View>

          <View style={labelStyles.section}>
            <Text style={labelStyles.sectionTitle}>Pedido</Text>
            <Text style={labelStyles.big}>{text(label.orderNumber)}</Text>
            <Text style={labelStyles.line}>Data: {text(label.printedDate)}</Text>
          </View>

          <View style={labelStyles.section}>
            <Text style={labelStyles.sectionTitle}>Cliente</Text>
            <Text style={labelStyles.big}>{text(label.customer?.name)}</Text>
            <Text style={labelStyles.line}>
              Telefone: {text(label.customer?.phone)}
            </Text>
          </View>

          <View style={labelStyles.section}>
            <Text style={labelStyles.sectionTitle}>Endereço</Text>
            <Text style={labelStyles.line}>
              {text(label.address?.street)}, {text(label.address?.number)}
            </Text>

            {label.address?.complement ? (
              <Text style={labelStyles.line}>
                Complemento: {label.address.complement}
              </Text>
            ) : null}

            <Text style={labelStyles.line}>
              Bairro: {text(label.address?.neighborhood)}
            </Text>
            <Text style={labelStyles.line}>
              {text(label.address?.city)} - {text(label.address?.state)}
            </Text>
            <Text style={labelStyles.line}>
              CEP: {text(label.address?.zipCode)}
            </Text>
          </View>

          {label.deliveryNotes ? (
            <View style={labelStyles.section}>
              <Text style={labelStyles.sectionTitle}>Observação</Text>
              <Text style={labelStyles.line}>{label.deliveryNotes}</Text>
            </View>
          ) : null}

          <View style={labelStyles.section}>
            <Text style={labelStyles.sectionTitle}>Produtos</Text>

            {label.items.map((item) => (
              <Text key={item.id} style={labelStyles.item}>
                {item.quantity}x {item.name}
              </Text>
            ))}

            {label.hiddenItemsCount > 0 ? (
              <Text style={labelStyles.item}>
                + {label.hiddenItemsCount} item(ns) na lista de separação
              </Text>
            ) : null}

            <Text style={labelStyles.total}>
              Total de itens: {label.totals.itemsQuantity}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

const listStyles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#000000",
    backgroundColor: "#ffffff",
  },
  header: {
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#000000",
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 4,
    marginBottom: 6,
  },
  line: {
    fontSize: 10,
    lineHeight: 1.45,
  },
  item: {
    flexDirection: "row",
    gap: 6,
    fontSize: 10.5,
    lineHeight: 1.45,
    marginBottom: 6,
  },
  checkbox: {
    width: 22,
    fontFamily: "Helvetica-Bold",
  },
  itemText: {
    flex: 1,
  },
  total: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    fontFamily: "Helvetica-Bold",
  },
  signatureGrid: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  signatureBox: {
    width: "47%",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 5,
    minHeight: 30,
    fontSize: 9,
  },
});

function SeparationListDocument({ docs }: { docs: LocalDeliveryDocuments }) {
  const doc = docs.documents.separationList;

  return (
    <Document>
      <Page size="A4" style={listStyles.page}>
        <View style={listStyles.header}>
          <Text style={listStyles.title}>{doc.title}</Text>
          <Text style={listStyles.subtitle}>
            Pedido: {text(doc.orderNumber)}
          </Text>
        </View>

        <View style={listStyles.section}>
          <Text style={listStyles.sectionTitle}>Dados do pedido</Text>
          <Text style={listStyles.line}>Pedido: {text(doc.orderNumber)}</Text>
          <Text style={listStyles.line}>Data: {text(doc.printedDate)}</Text>
          <Text style={listStyles.line}>Tipo de entrega: ENTREGA LOCAL</Text>
        </View>

        <View style={listStyles.section}>
          <Text style={listStyles.sectionTitle}>Cliente</Text>
          <Text style={listStyles.line}>Nome: {text(doc.customer?.name)}</Text>
          <Text style={listStyles.line}>
            Telefone: {text(doc.customer?.phone)}
          </Text>
        </View>

        <View style={listStyles.section}>
          <Text style={listStyles.sectionTitle}>Endereço de entrega</Text>
          <Text style={listStyles.line}>
            {text(doc.address?.street)}, {text(doc.address?.number)}
          </Text>

          {doc.address?.complement ? (
            <Text style={listStyles.line}>
              Complemento: {doc.address.complement}
            </Text>
          ) : null}

          <Text style={listStyles.line}>
            Bairro: {text(doc.address?.neighborhood)}
          </Text>
          <Text style={listStyles.line}>
            {text(doc.address?.city)} - {text(doc.address?.state)}
          </Text>
          <Text style={listStyles.line}>CEP: {text(doc.address?.zipCode)}</Text>
        </View>

        {doc.deliveryNotes ? (
          <View style={listStyles.section}>
            <Text style={listStyles.sectionTitle}>Observação de entrega</Text>
            <Text style={listStyles.line}>{doc.deliveryNotes}</Text>
          </View>
        ) : null}

        <View style={listStyles.section}>
          <Text style={listStyles.sectionTitle}>Produtos para separar</Text>

          {doc.items.map((item) => (
            <View key={item.id} style={listStyles.item}>
              <Text style={listStyles.checkbox}>[ ]</Text>
              <Text style={listStyles.itemText}>
                {item.quantity}x {item.name}
                {item.sku ? ` — SKU: ${item.sku}` : ""}
              </Text>
            </View>
          ))}

          <Text style={listStyles.total}>
            Total de itens: {doc.totals.itemsQuantity}
          </Text>
        </View>

        <View style={listStyles.section}>
          <Text style={listStyles.sectionTitle}>Conferência</Text>

          <View style={listStyles.signatureGrid}>
            <Text style={listStyles.signatureBox}>Separado por</Text>
            <Text style={listStyles.signatureBox}>Conferido por</Text>
            <Text style={listStyles.signatureBox}>Data/Hora</Text>
            <Text style={listStyles.signatureBox}>Observação interna</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function openLocalDeliveryLabelPdf(orderId: string) {
  const docs = await fetchLocalDeliveryDocuments(orderId);
  const blob = await pdf(<LocalLabelDocument docs={docs} />).toBlob();
  openPdfBlob(blob);
}

export async function openLocalDeliverySeparationListPdf(orderId: string) {
  const docs = await fetchLocalDeliveryDocuments(orderId);
  const blob = await pdf(<SeparationListDocument docs={docs} />).toBlob();
  openPdfBlob(blob);
}