"use client";

import { PDFDocument } from "pdf-lib";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export type CorreiosBatchLabelsResult = {
  requested: number;
  opened: number;
  skipped: string[];
  invalid: string[];
};

function isPdfBytes(bytes: ArrayBuffer) {
  if (!bytes || bytes.byteLength < 4) return false;

  const header = new TextDecoder()
    .decode(new Uint8Array(bytes.slice(0, 4)))
    .trim();

  return header.startsWith("%PDF");
}

function base64ToArrayBuffer(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function urlToArrayBuffer(url: string) {
  if (url.startsWith("data:application/pdf")) {
    return base64ToArrayBuffer(url);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Não foi possível baixar a etiqueta pela URL.");
  }

  return response.arrayBuffer();
}

function tryExtractPdfReferenceFromJson(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;

  const direct =
    data.labelUrl ??
    data.url ??
    data.pdfUrl ??
    data.dataUrl ??
    data.base64 ??
    data.labelBase64;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const nestedKeys = ["data", "item", "shipment", "label"];

  for (const key of nestedKeys) {
    const nested = data[key];

    if (!nested || typeof nested !== "object") continue;

    const nestedResult = tryExtractPdfReferenceFromJson(nested);

    if (nestedResult) return nestedResult;
  }

  return null;
}

async function fetchCorreiosLabelPdfBytes(
  orderId: string
): Promise<ArrayBuffer | null> {
  const response = await api.get(endpoints.adminOrderShipping.label(orderId), {
    responseType: "arraybuffer",
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Sua sessão expirou ou você não tem permissão.");
  }

  if (response.status < 200 || response.status >= 300) {
    return null;
  }

  const contentType = String(response.headers?.["content-type"] ?? "")
    .toLowerCase()
    .trim();

  const bytes = response.data as ArrayBuffer;

  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    isPdfBytes(bytes)
  ) {
    return bytes;
  }

  if (
    contentType.includes("application/json") ||
    contentType.includes("text/")
  ) {
    const text = new TextDecoder().decode(new Uint8Array(bytes));

    try {
      const parsed = JSON.parse(text) as unknown;
      const pdfRef = tryExtractPdfReferenceFromJson(parsed);

      if (!pdfRef) return null;

      return urlToArrayBuffer(pdfRef);
    } catch {
      return null;
    }
  }

  return null;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function openCorreiosBatchLabelsPdf(
  orderIds: string[]
): Promise<CorreiosBatchLabelsResult> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));

  const finalPdf = await PDFDocument.create();

  const skipped: string[] = [];
  const invalid: string[] = [];

  let opened = 0;

  for (const orderId of uniqueOrderIds) {
    try {
      const labelBytes = await fetchCorreiosLabelPdfBytes(orderId);

      if (!labelBytes || !isPdfBytes(labelBytes)) {
        skipped.push(orderId);
        continue;
      }

      const sourcePdf = await PDFDocument.load(labelBytes, {
        ignoreEncryption: true,
      });

      const pages = await finalPdf.copyPages(
        sourcePdf,
        sourcePdf.getPageIndices()
      );

      for (const page of pages) {
        finalPdf.addPage(page);
      }

      opened += 1;
    } catch (err) {
      if (err instanceof Error && err.message.includes("permissão")) {
        throw err;
      }

      invalid.push(orderId);
    }
  }

  if (opened <= 0) {
    return {
      requested: uniqueOrderIds.length,
      opened: 0,
      skipped,
      invalid,
    };
  }

  const mergedBytes = await finalPdf.save();
  const blob = new Blob([uint8ArrayToArrayBuffer(mergedBytes)], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");

  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return {
    requested: uniqueOrderIds.length,
    opened,
    skipped,
    invalid,
  };
}