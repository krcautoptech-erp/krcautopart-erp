import type { PurchaseRequisitionStatus } from "./purchase-requisitions";

export const PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE = 15;

export type PurchaseRequisitionPrintItem = {
  code: string;
  description: string;
  name: string;
  lineNo: number;
  neededByDate: string | null;
  quantity: number;
  remarks: string;
  unitName: string;
};

export type PurchaseRequisitionPrintApproval = {
  action: string;
  actorName: string;
  createdAt: string;
};

const PURCHASE_REQUISITION_HISTORY_LABELS: Record<string, string> = {
  approved: "พร้อมออก PO",
  cancelled: "ยกเลิกเอกสาร",
  created: "สร้างเอกสาร",
  edited: "แก้ไขเอกสาร",
  printed: "พิมพ์เอกสาร",
  rejected: "ส่งกลับแก้ไข",
  returned: "ส่งกลับแก้ไข",
  submitted: "ส่งให้ฝ่ายจัดซื้อตรวจสอบ",
};

export function getPurchaseRequisitionHistoryLabel(action: string) {
  return PURCHASE_REQUISITION_HISTORY_LABELS[action] ?? "อัปเดตเอกสาร";
}

export type PurchaseRequisitionPrintDetail = {
  approvals: PurchaseRequisitionPrintApproval[];
  departmentName: string;
  departmentManagerName: string | null;
  documentDate: string;
  id: number;
  items: PurchaseRequisitionPrintItem[];
  neededByDate: string | null;
  prNumber: string;
  remarks: string;
  requesterName: string;
  status: PurchaseRequisitionStatus;
};

function getPrItemSlotWeight<T>(item: T): number {
  if (!item || typeof item !== "object") return 1;
  const desc =
    (item as { description?: string; name?: string }).description ||
    (item as { name?: string }).name;
  if (!desc) return 1;
  if (desc.includes("\n") || desc.length > 45) return 2;
  return 1;
}

export function paginatePurchaseRequisitionItems<T>(
  items: readonly T[],
): T[][] {
  if (items.length === 0) {
    return [[]];
  }

  const pages: T[][] = [];
  let currentPage: T[] = [];
  let currentWeight = 0;

  for (const item of items) {
    const weight = getPrItemSlotWeight(item);
    if (
      currentPage.length > 0 &&
      currentWeight + weight > PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE
    ) {
      pages.push(currentPage);
      currentPage = [item];
      currentWeight = weight;
    } else {
      currentPage.push(item);
      currentWeight += weight;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}
