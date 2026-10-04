export type PurchaseRequisitionDecision = "ready_for_po" | "returned";

export type PurchaseRequisitionDecisionInput = {
  decision: PurchaseRequisitionDecision;
  note: string;
  requisitionId: number;
};

export function validatePurchaseRequisitionDecision(
  input: PurchaseRequisitionDecisionInput,
) {
  if (
    !Number.isSafeInteger(input.requisitionId) ||
    input.requisitionId <= 0
  ) {
    return {
      error: "ไม่พบใบขอซื้อที่ต้องการดำเนินการ",
      success: false as const,
    };
  }

  const note = input.note.trim();

  if (input.decision === "returned" && !note) {
    return {
      error: "กรุณาระบุเหตุผลที่ส่งใบขอซื้อกลับแก้ไข",
      success: false as const,
    };
  }

  if (note.length > 500) {
    return {
      error: "หมายเหตุต้องไม่เกิน 500 ตัวอักษร",
      success: false as const,
    };
  }

  return { success: true as const };
}
