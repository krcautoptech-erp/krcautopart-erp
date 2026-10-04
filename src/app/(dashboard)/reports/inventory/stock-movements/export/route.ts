import ExcelJS from "exceljs";
import { getStockMovementReportAction, type StockJournalRow, type StockSummaryRow } from "@/app/actions/stock-reports";
import { safeSpreadsheetText, stockReportFileName } from "@/lib/stock-report-export";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const numeric = (value: string | null) => value && /^\d+$/.test(value) ? Number(value) : null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "journal" ? "journal" : url.searchParams.get("view") === "card" ? "card" : "summary";
  const startDate = url.searchParams.get("start");
  const endDate = url.searchParams.get("end");
  if (!validDate(startDate) || !validDate(endDate) || startDate! > endDate!) return Response.json({ error: "ตัวกรองวันที่ไม่ถูกต้อง" }, { status: 400 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("authorize", { requested_permission: "inventory.export" });
  if (!allowed) return Response.json({ error: "ไม่มีสิทธิ์ส่งออกรายงาน" }, { status: 403 });

  const base = {
    view, startDate: startDate!, endDate: endDate!, warehouseId: numeric(url.searchParams.get("warehouse")),
    itemTypeId: numeric(url.searchParams.get("group")), movementKind: url.searchParams.get("kind"),
    search: url.searchParams.get("q") ?? "", itemMasterId: numeric(url.searchParams.get("item")), pageSize: 500,
  } as const;
  const allRows: Array<StockSummaryRow | StockJournalRow> = [];
  let firstOptions: { warehouses: Array<{ id: number; name: string }>; groups: Array<{ id: number; name: string }> } | null = null;
  for (let page = 1; ; page += 1) {
    const result = await getStockMovementReportAction({ ...base, page });
    if (!result.data) return Response.json({ error: result.error }, { status: 500 });
    firstOptions ??= result.data.options;
    allRows.push(...result.data.rows);
    if (allRows.length >= result.data.total) break;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KRC ERP"; workbook.created = new Date();
  const sheet = workbook.addWorksheet(view === "summary" ? "สรุปตามสินค้า" : view === "journal" ? "รายการเคลื่อนไหว" : "Stock Card", { views: [{ state: "frozen", ySplit: 6 }] });
  const warehouseName = firstOptions?.warehouses.find((row) => row.id === base.warehouseId)?.name ?? "ทั้งหมด";
  const groupName = firstOptions?.groups.find((row) => row.id === base.itemTypeId)?.name ?? "ทั้งหมด";
  sheet.addRow(["รายงานความเคลื่อนไหวสต็อก"]); sheet.mergeCells("A1:L1");
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFB51020" } };
  sheet.addRow(["มุมมอง", view === "summary" ? "สรุปตามสินค้า" : view === "journal" ? "รายการเคลื่อนไหวรวม" : "Stock Card"]);
  sheet.addRow(["ช่วงวันที่", `${startDate} - ${endDate}`, "คลัง", warehouseName, "กลุ่ม", groupName]);
  sheet.addRow(["คำค้นหา", safeSpreadsheetText(base.search || "-"), "สร้างเมื่อ", new Date()]);
  sheet.addRow([]);

  if (view === "summary") {
    sheet.addRow(["รหัสสินค้า", "ชื่อสินค้า", "คลัง", "หน่วย", "ยอดยกมา", "รับเข้า", "จ่ายออก", "ปรับปรุง", "คงเหลือปลายงวด"]);
    for (const row of allRows as StockSummaryRow[]) sheet.addRow([safeSpreadsheetText(row.item_code), safeSpreadsheetText(row.item_name), safeSpreadsheetText(row.warehouse_name), safeSpreadsheetText(row.unit_name), Number(row.opening), Number(row.received), Number(row.issued), Number(row.adjustment), Number(row.closing)]);
  } else {
    sheet.addRow(["วันที่-เวลา", "รหัสสินค้า", "ชื่อสินค้า", "คลัง", "ประเภท", "เลขที่เอกสาร", "Lot / Serial", "เปลี่ยนแปลง", "คงเหลือ", "หน่วย", "ผู้ดำเนินการ"]);
    for (const row of allRows as StockJournalRow[]) sheet.addRow([new Date(row.created_at), safeSpreadsheetText(row.item_code), safeSpreadsheetText(row.item_name), safeSpreadsheetText(row.warehouse_name), safeSpreadsheetText(row.movement_kind), safeSpreadsheetText(row.reference_doc_number), safeSpreadsheetText(row.lot_number), Number(row.quantity_change), Number(row.balance), safeSpreadsheetText(row.unit_name), safeSpreadsheetText(row.actor_name)]);
  }
  const header = sheet.getRow(6); header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB51020" } }; header.alignment = { vertical: "middle", horizontal: "center" };
  sheet.columns.forEach((column, index) => { column.width = index === 1 ? 34 : index === 2 ? 22 : 16; });
  for (let row = 7; row <= sheet.rowCount; row += 1) sheet.getRow(row).eachCell((cell) => { if (typeof cell.value === "number") cell.numFmt = "#,##0.0000"; });
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: sheet.getRow(6).cellCount } };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${stockReportFileName(view, startDate!, endDate!)}"`,
    "Cache-Control": "private, no-store",
  } });
}
