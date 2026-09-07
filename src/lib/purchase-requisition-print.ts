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
  approved: "อนุมัติ",
  cancelled: "ยกเลิกเอกสาร",
  created: "สร้างเอกสาร",
  edited: "แก้ไขเอกสาร",
  printed: "พิมพ์เอกสาร",
  rejected: "ปฏิเสธ",
  returned: "ส่งกลับแก้ไข",
  submitted: "ส่งอนุมัติ",
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

export function paginatePurchaseRequisitionItems<T>(items: readonly T[]): T[][] {
  if (items.length === 0) {
    return [[]];
  }

  const pages: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE
  ) {
    pages.push(
      items.slice(
        index,
        index + PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE,
      ),
    );
  }

  return pages;
}
