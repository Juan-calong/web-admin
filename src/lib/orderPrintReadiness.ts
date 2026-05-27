export type OrderPrintReadinessKind = "shipping" | "fiscal" | "danfe" | "xml" | "bundle";

export type OrderPrintReadinessStatusSource = {
  status?: string | null;
  message?: string | null;
  error?: string | null;
  applicable?: boolean | null;
};

export type OrderPrintReadinessFiscalSource = OrderPrintReadinessStatusSource & {
  danfeReady?: boolean | null;
  xmlReady?: boolean | null;
  nfeAuthorized?: boolean | null;
  blingOrderId?: string | number | null;
  blingNfeId?: string | number | null;
};

export type OrderPrintReadiness = {
  shipping?: OrderPrintReadinessStatusSource | null;
  fiscal?: OrderPrintReadinessFiscalSource | null;
  bundleStatus?: string | null;
  printReady?: boolean | null;
  danfeReady?: boolean | null;
  xmlReady?: boolean | null;
  message?: string | null;
  error?: string | null;
};

type OrderPrintReadinessTone = "ready" | "pending" | "generating" | "error" | "na";

const READY_TOKENS = [
  "READY",
  "PRONTO",
  "DONE",
  "COMPLETE",
  "COMPLETED",
  "SUCCESS",
  "OK",
  "AVAILABLE",
  "GENERATED",
  "EMITTED",
];

const PENDING_TOKENS = [
  "PENDING",
  "WAITING",
  "AWAITING",
  "QUEUED",
  "NOT_READY",
  "INCOMPLETE",
  "PARTIAL",
];

const GENERATING_TOKENS = [
  "GENERATING",
  "PROCESSING",
  "RUNNING",
  "EMITTING",
  "BUILDING",
];

const ERROR_TOKENS = [
  "ERROR",
  "FAILED",
  "FAIL",
  "INVALID",
  "REJECTED",
  "BLOCKED",
  "DENIED",
];

const NA_TOKENS = [
  "N_A",
  "NA",
  "N/A",
  "NOT_APPLICABLE",
  "NOT AVAILABLE",
  "NOT_AVAILABLE",
  "UNAVAILABLE",
  "SKIPPED",
];

function normalizeToken(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function includesToken(value: string, tokens: string[]) {
  const segments = value.split("_").filter(Boolean);

  return tokens.some((token) => {
    const normalizedToken = normalizeToken(token);

    return value === normalizedToken || segments.includes(normalizedToken);
  });
}

function toneFromStatus(value?: string | null): OrderPrintReadinessTone {
  const normalized = normalizeToken(value);

  if (!normalized) return "na";
  if (includesToken(normalized, ERROR_TOKENS)) return "error";
  if (includesToken(normalized, GENERATING_TOKENS)) return "generating";
  // Check negative/neutral states before READY-like tokens to avoid false positives.
  if (includesToken(normalized, NA_TOKENS)) return "na";
  if (includesToken(normalized, PENDING_TOKENS)) return "pending";
  if (includesToken(normalized, READY_TOKENS)) return "ready";

  return "pending";
}

function toneLabel(kind: OrderPrintReadinessKind, tone: OrderPrintReadinessTone, raw?: string | null) {
  const normalized = normalizeToken(raw);

  if (tone === "ready") return kind === "bundle" ? "Completo" : "Pronta";
  if (tone === "generating") return "Gerando";
  if (tone === "error") return "Erro";
  if (tone === "na") return "N/A";

  if (kind === "bundle" && includesToken(normalized, ["INCOMPLETE", "PARTIAL"])) {
    return "Incompleto";
  }

  return kind === "bundle" ? "Incompleto" : "Pendente";
}

function toneClasses(tone: OrderPrintReadinessTone) {
  if (tone === "ready") {
    return "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 ring-emerald-200";
  }

  if (tone === "error") {
    return "border-red-200/80 bg-red-50/90 text-red-700 ring-red-200";
  }

  if (tone === "na") {
    return "border-slate-200/80 bg-slate-100/90 text-slate-600 ring-slate-200";
  }

  return "border-amber-200/80 bg-amber-50/90 text-amber-700 ring-amber-200";
}

function sourceMessage(
  source?: Partial<OrderPrintReadinessStatusSource & OrderPrintReadiness> | null
) {
  const text = source?.error || source?.message || source?.status || "";
  return text ? String(text) : null;
}

function resolveSourceForKind(
  kind: OrderPrintReadinessKind,
  readiness?: OrderPrintReadiness | null
): { raw?: string | null; tone: OrderPrintReadinessTone; title: string } {
  const source =
    kind === "shipping"
      ? readiness?.shipping
      : kind === "fiscal"
        ? readiness?.fiscal
        : null;

  if (kind === "danfe") {
    const danfeReady = readiness?.fiscal?.danfeReady ?? readiness?.danfeReady;
    const raw = danfeReady === true ? "READY" : danfeReady === false ? "PENDING" : null;
    return {
      raw,
      tone: danfeReady === true ? "ready" : danfeReady === false ? "pending" : "na",
      title: sourceMessage(readiness?.fiscal) || sourceMessage(readiness) || "DANFE",
    };
  }

  if (kind === "xml") {
    const xmlReady = readiness?.fiscal?.xmlReady ?? readiness?.xmlReady;
    const raw = xmlReady === true ? "READY" : xmlReady === false ? "PENDING" : null;
    return {
      raw,
      tone: xmlReady === true ? "ready" : xmlReady === false ? "pending" : "na",
      title: sourceMessage(readiness?.fiscal) || sourceMessage(readiness) || "XML",
    };
  }

  if (kind === "bundle") {
    const raw = readiness?.bundleStatus || (readiness?.printReady === true ? "READY" : readiness?.printReady === false ? "INCOMPLETE" : null);
    const tone = toneFromStatus(raw);

    return {
      raw,
      tone,
      title: sourceMessage(readiness) || (raw ? String(raw) : "Bundle"),
    };
  }

  const raw = source?.status ?? null;
  const tone = source?.applicable === false ? "na" : toneFromStatus(raw);

  return {
    raw,
    tone,
    title: sourceMessage(source) || sourceMessage(readiness) || (raw ? String(raw) : kind === "shipping" ? "Etiqueta" : "NF-e"),
  };
}

export function isOrderPrintReady(readiness?: OrderPrintReadiness | null) {
  return readiness?.printReady === true;
}

export function getOrderPrintReadinessBadgeMeta(
  kind: OrderPrintReadinessKind,
  readiness?: OrderPrintReadiness | null
) {
  const resolved = resolveSourceForKind(kind, readiness);

  return {
    label: toneLabel(kind, resolved.tone, resolved.raw),
    className: toneClasses(resolved.tone),
    title: resolved.title,
  };
}
