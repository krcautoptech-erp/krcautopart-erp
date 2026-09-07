export const PURCHASE_REQUISITION_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "cancelled",
  "rejected",
] as const;

export type PurchaseRequisitionStatus =
  (typeof PURCHASE_REQUISITION_STATUSES)[number];

export type PurchaseRequisitionSummary = {
  department_name: string;
  document_date: string;
  id: number;
  needed_by_date: string | null;
  pr_number: string;
  remarks: string | null;
  requested_item_count: number;
  requested_total_qty: number;
  requester_name: string;
  status: PurchaseRequisitionStatus;
};

export const PURCHASE_REQUISITION_STATUS_META: Record<
  PurchaseRequisitionStatus,
  { chipClass: string; label: string; summaryClass: string }
> = {
  draft: {
    chipClass:
      "border-slate-500 bg-slate-500 text-white dark:border-slate-600 dark:bg-slate-600",
    label: "ร่าง",
    summaryClass:
      "border-slate-500 bg-slate-500 text-white dark:border-slate-600 dark:bg-slate-600",
  },
  approved: {
    chipClass:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
    label: "อนุมัติแล้ว",
    summaryClass:
      "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  },
  cancelled: {
    chipClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
    label: "ยกเลิก",
    summaryClass:
      "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
  },
  pending_approval: {
    chipClass:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-600",
    label: "รออนุมัติ",
    summaryClass:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-600",
  },
  rejected: {
    chipClass:
      "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
    label: "ปฏิเสธ",
    summaryClass:
      "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
  },
};

export function normalizePurchaseRequisitionStatus(
  status: string | null | undefined,
): PurchaseRequisitionStatus {
  switch (status) {
    case "approved":
    case "in_progress":
    case "closed":
      return "approved";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "draft":
      return "draft";
    case "pending_approval":
    default:
      return "pending_approval";
  }
}

export function formatDisplayDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function getPurchaseRequisitionStatusLabel(
  status: PurchaseRequisitionStatus,
) {
  return PURCHASE_REQUISITION_STATUS_META[status].label;
}
