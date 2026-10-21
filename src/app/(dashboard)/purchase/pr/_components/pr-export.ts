import type { PurchaseRequisitionSummary } from "@/lib/purchase-requisitions";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";
import {
  formatDisplayDate,
  getPurchaseRequisitionStatusLabel,
} from "@/lib/purchase-requisitions";


export function exportPurchaseRequisitionsToExcel(
  requisitions: PurchaseRequisitionSummary[],
) {
  const headers = [
    "ลำดับ",
    "เลขที่ PR",
    "วันที่",
    "ผู้ขอซื้อ",
    "แผนก",
    "วันที่ต้องการใช้",
    "จำนวนรายการ",
    "สถานะ",
    "หมายเหตุ",
  ];

  const rows = requisitions.map((requisition, index) => [
    index + 1,
    requisition.pr_number,
    formatDisplayDate(requisition.document_date),
    requisition.requester_name,
    requisition.department_name,
    formatDisplayDate(requisition.needed_by_date),
    requisition.requested_item_count,
    getPurchaseRequisitionStatusLabel(requisition.status),
    requisition.remarks ?? "",
  ]);

  void exportExcelFile([headers, ...rows], `pr-list-${new Date().toISOString().slice(0, 10)}.xlsx`, "PR List");
}
