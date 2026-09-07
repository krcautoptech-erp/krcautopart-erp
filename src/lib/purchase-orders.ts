export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "partially_received",
  "received",
  "cancelled",
  "rejected",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type PurchaseOrderDecision = "approved" | "rejected";

export type PurchaseOrderSummary = {
  delivery_date: string;
  document_date: string;
  grand_total: number;
  id: number;
  item_count: number;
  po_number: string;
  pr_references: string[];
  status: PurchaseOrderStatus;
  vendor_id: number;
  vendor_name: string;
};

export type PurchaseOrderSourceItem = {
  availableQuantity: number;
  description: string;
  isStocked?: boolean;
  itemCode: string;
  itemName: string;
  itemTypeCode: string;
  neededByDate: string;
  prNumber: string;
  requestedQuantity: number;
  trackingMethod?: "none" | "lot" | "serial";
  requisitionId: number;
  requisitionItemId: number;
  unitName: string;
  warehouseId?: number | null;
};

export type PurchaseOrderEditData = {
  deliveryAddress: string;
  deliveryDate: string;
  documentDate: string;
  id: number;
  lines: Array<
    PurchaseOrderSourceItem & {
      discountAmount: string;
      quantity: string;
      remarks: string;
      taxRate: string;
      unitPrice: string;
    }
  >;
  poNumber: string;
  status: string;
  supplierNote: string;
  termsAndConditions: string;
  vendorId: number;
};

export type PurchaseOrderVendor = {
  creditTermName: string;
  id: number;
  paymentMethodName: string;
  taxRate: number;
  taxTypeName: string;
  vendorCode: string;
  vendorName: string;
};

export type PurchaseOrderLineSubmission = {
  deliveryDate: string;
  discountAmount: number;
  quantity: number;
  remarks: string;
  requisitionItemId: number;
  taxRate: number;
  unitPrice: number;
};

export type PurchaseOrderSubmission = {
  deliveryAddress: string;
  deliveryDate: string;
  documentDate: string;
  items: PurchaseOrderLineSubmission[];
  status: "draft" | "pending_approval";
  supplierNote: string;
  termsAndConditions: string;
  vendorId: number;
};

export function normalizePurchaseOrderItemType(
  value: string | null | undefined,
  itemCode = "",
) {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "RAW_MATERIAL") return "RM";
  if (normalized && normalized !== "LEGACY") return normalized;
  return itemCode.trim().toUpperCase().startsWith("RM") ? "RM" : "ITEM";
}

export const PURCHASE_ORDER_STATUS_META: Record<
  PurchaseOrderStatus,
  { className: string; label: string }
> = {
  approved: {
    className:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
    label: "อนุมัติแล้ว",
  },
  cancelled: {
    className:
      "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
    label: "ยกเลิก",
  },
  draft: {
    className:
      "border-slate-500 bg-slate-500 text-white dark:border-slate-600 dark:bg-slate-600",
    label: "ร่าง",
  },
  partially_received: {
    className:
      "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
    label: "รับบางส่วน",
  },
  pending_approval: {
    className:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-600",
    label: "รออนุมัติ",
  },
  received: {
    className:
      "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-500",
    label: "รับครบแล้ว",
  },
  rejected: {
    className:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
    label: "ปฏิเสธ",
  },
  sent: {
    className:
      "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
    label: "ส่งผู้ขายแล้ว",
  },
};

export function normalizePurchaseOrderStatus(
  value: string | null | undefined,
): PurchaseOrderStatus {
  return PURCHASE_ORDER_STATUSES.includes(value as PurchaseOrderStatus)
    ? (value as PurchaseOrderStatus)
    : "draft";
}

export function formatPurchaseOrderAmount(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function validatePurchaseOrderDecision(input: {
  decision: PurchaseOrderDecision;
  note: string;
  purchaseOrderId: number;
}): { error: string; success: false } | { success: true } {
  if (
    !Number.isSafeInteger(input.purchaseOrderId) ||
    input.purchaseOrderId <= 0
  ) {
    return { error: "เลขอ้างอิงใบสั่งซื้อไม่ถูกต้อง", success: false };
  }
  if (!["approved", "rejected"].includes(input.decision)) {
    return { error: "ผลการอนุมัติไม่ถูกต้อง", success: false };
  }
  const note = input.note.trim();
  if (input.decision === "rejected" && !note) {
    return { error: "กรุณาระบุเหตุผลที่ปฏิเสธใบสั่งซื้อ", success: false };
  }
  if (note.length > 500) {
    return { error: "หมายเหตุต้องไม่เกิน 500 ตัวอักษร", success: false };
  }
  return { success: true };
}

export function validatePurchaseOrderSubmission(
  input: PurchaseOrderSubmission,
): { error: string; success: false } | { success: true } {
  if (!Number.isSafeInteger(input.vendorId) || input.vendorId <= 0) {
    return { error: "กรุณาเลือกผู้ขาย", success: false };
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)
  ) {
    return {
      error: "กรุณาระบุวันที่เอกสารและวันที่ส่งมอบ",
      success: false,
    };
  }
  if (input.deliveryDate < input.documentDate) {
    return {
      error: "วันที่ส่งมอบต้องไม่อยู่ก่อนวันที่เอกสาร",
      success: false,
    };
  }
  if (input.items.length === 0 || input.items.length > 200) {
    return {
      error: "กรุณาเลือกรายการจาก PR อย่างน้อย 1 รายการ และไม่เกิน 200 รายการ",
      success: false,
    };
  }
  if (
    input.deliveryAddress.length > 1000 ||
    input.supplierNote.length > 1000 ||
    input.termsAndConditions.length > 2000
  ) {
    return { error: "ข้อความในเอกสารยาวเกินกำหนด", success: false };
  }

  const ids = new Set<number>();
  for (const item of input.items) {
    if (
      !Number.isSafeInteger(item.requisitionItemId) ||
      item.requisitionItemId <= 0 ||
      ids.has(item.requisitionItemId)
    ) {
      return { error: "พบรายการ PR ซ้ำหรือไม่ถูกต้อง", success: false };
    }
    ids.add(item.requisitionItemId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: "จำนวนสั่งซื้อต้องมากกว่า 0", success: false };
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return { error: "ราคาต่อหน่วยต้องไม่ติดลบ", success: false };
    }
    if (!Number.isFinite(item.discountAmount) || item.discountAmount < 0) {
      return { error: "ส่วนลดต้องไม่ติดลบ", success: false };
    }
    if (
      !Number.isFinite(item.taxRate) ||
      item.taxRate < 0 ||
      item.taxRate > 100
    ) {
      return { error: "อัตราภาษีไม่ถูกต้อง", success: false };
    }
  }
  return { success: true };
}
