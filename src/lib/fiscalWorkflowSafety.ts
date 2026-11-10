export type FiscalWorkflowWriteSafety = {
  writesAllowed: boolean;
  requiresReconciliation?: boolean;
  reason?: string | null;
  legacyWritesEnabled?: boolean;
  authorityOwner?: string;
  individualAuthorization?: {
    approvalId: string;
    action: string;
    expiresAt: string;
    transportAuthorized: false;
  };
};

const mutations = new Set(['CREATE_SALES_ORDER', 'CREATE_NFE', 'SEND_NFE']);

export function applyFiscalWorkflowSafety<T extends { id: string; enabled: boolean; reason?: string | null }>({
  actions = [], writeSafety,
}: { actions?: T[]; writeSafety?: FiscalWorkflowWriteSafety | null }): T[] {
  return actions.map(action => mutations.has(action.id) &&
    (writeSafety?.writesAllowed !== true || writeSafety?.requiresReconciliation === true)
    ? { ...action, enabled: false, reason: writeSafety?.reason || 'Não foi possível confirmar a segurança das escritas fiscais.' }
    : action);
}
