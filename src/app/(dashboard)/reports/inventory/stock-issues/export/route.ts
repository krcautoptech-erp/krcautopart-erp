import ExcelJS from "exceljs";
import { getStockIssueReportAction, type StockIssueReportRow } from "@/app/actions/stock-issue-reports";
import { safeSpreadsheetText } from "@/lib/stock-report-export";
import { stockIssueReportFileName, type StockIssueReportStatus, type StockIssueReportView } from "@/lib/stock-issue-report";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const numeric = (value: string | null) => value && /^\d+$/.test(value) ? Number(value) : null;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = (["document", "product", "department"].includes(params.get("view") ?? "") ? params.get("view") : "document") as StockIssueReportView;
  const startDate = params.get("start"); const endDate = params.get("end");
  const status = (["posted", "cancelled"].includes(params.get("status") ?? "") ? params.get("status") : "all") as StockIssueReportStatus;
  if (!validDate(startDate) || !validDate(endDate) || startDate! > endDate!) return Response.json({ error: "ตัวกรองวันที่ไม่ถูกต้อง" }, { status: 400 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("authorize", { requested_permission: "inventory_issue.export" });
  if (!allowed) return Response.json({ error: "ไม่มีสิทธิ์ส่งออกรายงาน" }, { status: 403 });

  const base = { view, startDate: startDate!, endDate: endDate!, warehouseId: numeric(params.get("warehouse")), departmentId: numeric(params.get("department")), status, search: params.get("q")?.trim().slice(0, 100) ?? "", pageSize: 500 } as const;
  const rows: StockIssueReportRow[] = []; let report: Awaited<ReturnType<typeof getStockIssueReportAction>>["data"];
  for (let page = 1; ; page += 1) {
    const result = await getStockIssueReportAction({ ...base, page });
    if (!result.data) return Response.json({ error: result.error }, { status: 500 });
    report ??= result.data; rows.push(...result.data.rows);
    if (rows.length >= result.data.total) break;
  }

  const workbook = new ExcelJS.Workbook(); workbook.creator = "KRC ERP"; workbook.created = new Date();
  const sheet = workbook.addWorksheet(`รายงาน${view === "document" ? "ภาพรวม" : view === "product" ? "ตามสินค้า" : "ตามหน่วยงาน"}`, { views: [{ state: "frozen", ySplit: 6 }] });
  sheet.addRow(["รายงานการเบิกจ่ายสินค้า"]); sheet.mergeCells("A1:K1"); sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFB51020" } };
  sheet.addRow(["มุมมอง", view === "document" ? "ภาพรวม" : view === "product" ? "ตามสินค้า" : "ตามหน่วยงาน"]);
  sheet.addRow(["ช่วงวันที่", `${startDate} - ${endDate}`]);
  sheet.addRow(["สรุป", `${report?.summary.document_count ?? 0} เอกสาร · ${report?.summary.item_count ?? 0} รายการ · ${report?.summary.quantity_total ?? 0} หน่วย${report?.canViewCost ? ` · ${report.summary.amount_total ?? 0} บาท` : ""}`]);
  sheet.addRow(["สถานะ", status === "posted" ? "บันทึกแล้ว" : status === "cancelled" ? "ยกเลิก" : "ทั้งหมด"]);
  const headings = view === "document"
    ? ["ลำดับ", "วันที่", "เลขที่ใบเบิก", "ผู้เบิก", "หน่วยงาน", "จุดใช้งาน", "คลังจ่าย", "จำนวนรายการ", "จำนวนรวม", ...(report?.canViewCost ? ["มูลค่า (บาท)"] : []), "สถานะ"]
    : view === "product"
      ? ["ลำดับ", "รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "จำนวนใบเบิก", "จำนวนรายการ", "จำนวนรวม", ...(report?.canViewCost ? ["มูลค่า (บาท)"] : []), "เบิกล่าสุด"]
      : ["ลำดับ", "หน่วยงาน", "จำนวนใบเบิก", "จำนวนรายการ", "จำนวนรวม", ...(report?.canViewCost ? ["มูลค่า (บาท)"] : []), "ผู้เบิกล่าสุด", "วันที่ล่าสุด"];
  sheet.addRow(headings);
  rows.forEach((row, index) => sheet.addRow(view === "document"
    ? [index + 1, row.document_date, safeSpreadsheetText(row.code), safeSpreadsheetText(row.name), safeSpreadsheetText(row.department_name ?? ""), safeSpreadsheetText(row.work_point ?? ""), safeSpreadsheetText(row.warehouse_name ?? ""), row.item_count, row.quantity_total, ...(report?.canViewCost ? [row.amount_total] : []), row.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"]
    : view === "product"
      ? [index + 1, safeSpreadsheetText(row.code), safeSpreadsheetText(row.name), safeSpreadsheetText(row.unit_name ?? ""), row.issue_count, row.item_count, row.quantity_total, ...(report?.canViewCost ? [row.amount_total] : []), row.latest_date]
      : [index + 1, safeSpreadsheetText(row.name), row.issue_count, row.item_count, row.quantity_total, ...(report?.canViewCost ? [row.amount_total] : []), safeSpreadsheetText(row.latest_requester ?? ""), row.latest_date]));
  const header = sheet.getRow(6); header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB51020" } }; header.alignment = { vertical: "middle", horizontal: "center" };
  sheet.columns.forEach((column, index) => { column.width = [0, 2, 3, 4, 5, 6].includes(index) ? 20 : 14; });
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headings.length } };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${stockIssueReportFileName(view, startDate!, endDate!)}"`, "Cache-Control": "private, no-store" } });
}
