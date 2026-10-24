export type LocalDeliveryAction = "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_PROBLEM";
type LocalOrder = {
  id: string; code?: string | null; status?: string; orderStatus?: string;
  paymentStatus?: string | null; adminApprovalStatus?: string | null;
  localDeliveryStatus?: string | null; localDeliveryPackedAt?: string | null;
  localDeliveryOutForDeliveryAt?: string | null; localDeliveryDeliveredAt?: string | null; localDeliveryProblemAt?: string | null;
};
export type LocalDeliveryResult = { orderId: string; ok: boolean; reason?: string; status?: string };
const reasons: Record<string, string> = {
  LOCAL_PACKING_REQUIRED: "Confirme o pedido como empacotado antes de registrar a saída.",
  LOCAL_DEPARTURE_REQUIRED: "Registre a saída para entrega antes desta ação.",
  LOCAL_MILESTONES_INVALID: "Histórico de etapas inconsistente; solicite revisão, sem preencher horários automaticamente.",
  LOCAL_DELIVERY_TERMINAL: "Pedido já entregue; não é possível voltar a uma etapa anterior.",
  LOCAL_TRANSITION_INVALID: "Esta ação não corresponde à etapa atual da entrega.",
  LOCAL_TRANSITION_CONFLICT: "O pedido foi atualizado em outra sessão. Atualize os dados antes de continuar.",
  FISCAL_POSTING_BLOCKED: "Movimentação bloqueada: verifique a autorização fiscal e as pendências de reconciliação.",
  FISCAL_STATE_BLOCKED: "Movimentação bloqueada por pendência fiscal; não reenvie documentos automaticamente.",
  PAYMENT_NOT_PAID: "Aguarde a confirmação do pagamento.",
  ADMIN_NOT_APPROVED: "Aguarde a aprovação comercial do pedido.",
  ORDER_CANCELED: "Pedido cancelado; movimentação não permitida.",
  NOT_LOCAL_DELIVERY: "Este pedido não é de entrega local.",
  ORDER_NOT_FOUND: "Pedido não encontrado; atualize a lista.",
  ALREADY_PACKED: "Pedido já empacotado; horário original preservado.",
  ALREADY_OUT_FOR_DELIVERY: "Saída já registrada; horário original preservado.",
  ALREADY_DELIVERED: "Pedido já entregue; histórico preservado.",
  ALREADY_DELIVERY_PROBLEM: "Problema já registrado; histórico preservado.",
  DUPLICATE_ORDER_ID: "Pedido repetido na solicitação; nenhuma ação adicional executada.",
};
export function localDeliveryActionBlock(order: LocalOrder, target: LocalDeliveryAction): string | null {
  const state = order.localDeliveryStatus || "PENDING_SEPARATION";
  if (state === "DELIVERED" || order.localDeliveryDeliveredAt) return reasons.LOCAL_DELIVERY_TERMINAL;
  if ((order.orderStatus || order.status) === "CANCELED") return reasons.ORDER_CANCELED;
  if (order.paymentStatus !== "PAID") return reasons.PAYMENT_NOT_PAID;
  if (order.adminApprovalStatus !== "APPROVED") return reasons.ADMIN_NOT_APPROVED;
  const valid = (v?: string | null) => !!v && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now();
  const packed = valid(order.localDeliveryPackedAt);
  const departed = packed && valid(order.localDeliveryOutForDeliveryAt) && Date.parse(order.localDeliveryOutForDeliveryAt!) >= Date.parse(order.localDeliveryPackedAt!);
  if (state === target) return reasons[`ALREADY_${target}`];
  if (target === "PACKED") {
    if (state !== "PENDING_SEPARATION") return reasons.LOCAL_TRANSITION_INVALID;
    return order.localDeliveryPackedAt || order.localDeliveryOutForDeliveryAt || order.localDeliveryProblemAt ? reasons.LOCAL_MILESTONES_INVALID : null;
  }
  if (target === "OUT_FOR_DELIVERY") {
    if (!["PACKED", "DELIVERY_PROBLEM"].includes(state)) return reasons.LOCAL_PACKING_REQUIRED;
    const problemValid = departed && valid(order.localDeliveryProblemAt) && Date.parse(order.localDeliveryProblemAt!) >= Date.parse(order.localDeliveryOutForDeliveryAt!);
    return packed && (state !== "DELIVERY_PROBLEM" || problemValid) ? null : reasons.LOCAL_MILESTONES_INVALID;
  }
  if (state !== "OUT_FOR_DELIVERY") return reasons.LOCAL_DEPARTURE_REQUIRED;
  return departed ? null : reasons.LOCAL_MILESTONES_INVALID;
}
export function localDeliveryResultMessage(item: LocalDeliveryResult, orders: LocalOrder[]): string {
  const order = orders.find(o => o.id === item.orderId);
  const label = order?.code || item.orderId.slice(0, 8);
  return `${label}: ${item.ok ? "etapa registrada." : reasons[item.reason || ""] || "Ação recusada. Atualize os dados e confira as pendências do pedido."}`;
}
// List refreshes are paginated. A successful GET alone cannot confirm that an
// affected order was refreshed; retain the retry lock if any target is absent.
export function localDeliveryRefreshComplete(orders: LocalOrder[], affectedIds: string[]): boolean {
  const ids = new Set(orders.map(order => order.id));
  return affectedIds.every(id => ids.has(id));
}
