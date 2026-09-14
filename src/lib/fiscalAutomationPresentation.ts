export type FiscalAutomationProjection = {
  automationStatus: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  policyPauseReason: string | null;
  lastErrorClass: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  reprocessRequestedAt: string | null;
  reprocessRequestedBy: string | null;
  isProcessing: boolean;
  leaseUntil: string | null;
  canReprocess: boolean;
  requiresReconciliation: boolean;
};

export type FiscalAutomationOwnership =
  | "none"
  | "automation"
  | "unknown-contract";

export type FiscalAutomationTone =
  | "neutral"
  | "pending"
  | "processing"
  | "warning"
  | "error"
  | "success";

export type FiscalAutomationPresentation = {
  ownership: FiscalAutomationOwnership;
  tone: FiscalAutomationTone;
  label: string;
  description?: string;
  blocksLegacyMutations: boolean;
  canReprocess: boolean;
  shouldPoll: boolean;
};

const policyPauseReasonLabel: Record<string, string> = {
  AUTO_CREATE_NFE_DISABLED: "Criação automática de NF-e desativada",
  AUTO_SEND_NFE_DISABLED: "Envio automático de NF-e desativado",
  AUTO_SYNC_NFE_DISABLED: "Sincronização automática de NF-e desativada",
};

function presentation(
  tone: FiscalAutomationTone,
  label: string,
  description?: string,
  shouldPoll = false
) {
  return { tone, label, description, shouldPoll };
}

export function getFiscalAutomationPresentation(
  automation: FiscalAutomationProjection | null | undefined
): FiscalAutomationPresentation {
  if (automation === null) {
    return {
      ownership: "none",
      ...presentation("neutral", "Sem automação fiscal"),
      blocksLegacyMutations: false,
      canReprocess: false,
    };
  }

  if (automation === undefined) {
    return {
      ownership: "unknown-contract",
      ...presentation(
        "warning",
        "Estado fiscal indisponível",
        "Atualize os dados antes de executar ações fiscais."
      ),
      blocksLegacyMutations: true,
      canReprocess: false,
    };
  }

  const reconciliationRequired =
    automation.requiresReconciliation ||
    automation.lastErrorCode === "NFE_SEND_RECONCILIATION_PENDING";

  let base: Pick<
    FiscalAutomationPresentation,
    "tone" | "label" | "description" | "shouldPoll"
  >;

  if (reconciliationRequired) {
    base = presentation(
      "error",
      "Reconciliação necessária",
      automation.lastErrorCode === "NFE_SEND_RECONCILIATION_PENDING"
        ? "O resultado do envio da NF-e precisa ser reconciliado antes de uma nova tentativa."
        : "Este pedido precisa de reconciliação antes de ser reprocessado."
    );
  } else {
    switch (automation.automationStatus) {
      case "QUEUED":
        base = presentation("pending", "Na fila", undefined, true);
        break;
      case "PROCESSING":
        base = presentation("processing", "Processando...", undefined, true);
        break;
      case "RETRY_SCHEDULED":
        base = presentation("warning", "Nova tentativa agendada", undefined, true);
        break;
      case "NEEDS_ACTION":
        base = presentation("warning", "Ação necessária");
        break;
      case "RECONCILIATION_REQUIRED":
        base = presentation(
          "error",
          "Reconciliação necessária",
          "Este pedido precisa de reconciliação antes de ser reprocessado."
        );
        break;
      case "INTEGRATION_BLOCKED":
        base = presentation("error", "Integração bloqueada");
        break;
      case "POLICY_PAUSED":
        base = presentation(
          "warning",
          "Automação pausada",
          automation.policyPauseReason
            ? policyPauseReasonLabel[automation.policyPauseReason] ??
              "Automação pausada por política fiscal"
            : "Automação pausada por política fiscal"
        );
        break;
      case "COMPLETE":
        base = presentation("success", "Concluído");
        break;
      default:
        base = presentation(
          "warning",
          "Status da automação indisponível",
          "Atualize os dados antes de executar ações fiscais."
        );
    }
  }

  return {
    ownership: "automation",
    ...base,
    blocksLegacyMutations: true,
    canReprocess: automation.canReprocess === true,
  };
}

export function getFiscalAutomationConflictMessage(
  errorCode: string | null | undefined,
  lastErrorCode?: string | null
) {
  if (errorCode === "FISCAL_RECONCILIATION_REQUIRED") {
    return lastErrorCode === "NFE_SEND_RECONCILIATION_PENDING"
      ? "O resultado do envio da NF-e precisa ser reconciliado antes de uma nova tentativa."
      : "Este pedido precisa de reconciliação antes de ser reprocessado.";
  }

  if (errorCode === "FISCAL_AUTOMATION_PROCESSING") {
    return "A automação fiscal já está sendo processada.";
  }

  return "A automação fiscal não pode ser reprocessada no estado atual.";
}

export function getFiscalAutomationConflict(status: unknown, code: unknown) {
  if (status !== 409) return { isConflict: false, code: null };

  return {
    isConflict: true,
    code: typeof code === "string" ? code : null,
  };
}

export function isFiscalAutomationReadAction(actionId: string, method: string) {
  return (
    method === "GET_EXTERNAL" ||
    actionId === "DOWNLOAD_DANFE" ||
    actionId === "DOWNLOAD_XML"
  );
}
