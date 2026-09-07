import type { PurchaseRequisitionSummary } from "@/lib/purchase-requisitions";
import {
  formatDisplayDate,
  getPurchaseRequisitionStatusLabel,
} from "@/lib/purchase-requisitions";

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  const headerRow = headers
    .map(
      (header) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map((value) => {
            const type =
              typeof value === "number" && Number.isFinite(value)
                ? "Number"
                : "String";

            return `<Cell><Data ss:Type="${type}">${escapeSpreadsheetXml(value)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="PR List">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pr-list-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}
