import ExcelJS from "exceljs";
import { getPurchaseAnalysisAction, type PurchaseAnalysisRow } from "@/app/actions/purchase-analysis";
import { purchaseAnalysisFileName, type PurchaseAnalysisView } from "@/lib/purchase-analysis";
import { safeSpreadsheetText } from "@/lib/stock-report-export";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
const validDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const numeric = (value: string | null) => value && /^\d+$/.test(value) ? Number(value) : null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view: PurchaseAnalysisView = url.searchParams.get("view") === "product" ? "product" : "vendor";
  const startDate = url.searchParams.get("start");
  const endDate = url.searchParams.get("end");
  if (!validDate(startDate) || !validDate(endDate) || startDate! > endDate!) return Response.json({ error: "ตัวกรองวันที่ไม่ถูกต้อง" }, { status: 400 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("authorize", { requested_permission: "po.export" });
  if (!allowed) return Response.json({ error: "ไม่มีสิทธิ์ส่งออกรายงาน" }, { status: 403 });

  const base = { view, startDate: startDate!, endDate: endDate!, vendorId: numeric(url.searchParams.get("vendor")), itemTypeId: numeric(url.searchParams.get("group")), search: url.searchParams.get("q")?.trim().slice(0, 100) ?? "", pageSize: 500 } as const;
  const rows: PurchaseAnalysisRow[] = [];
  let report: Awaited<ReturnType<typeof getPurchaseAnalysisAction>>["data"];
  for (let page = 1; ; page += 1) {
    const result = await getPurchaseAnalysisAction({ ...base, page });
    if (!result.data) return Response.json({ error: result.error }, { status: 500 });
    report ??= result.data; rows.push(...result.data.rows);
    if (rows.length >= result.data.total) break;
  }

  const workbook = new ExcelJS.Workbook(); workbook.creator = "KRC ERP"; workbook.created = new Date();
  const sheet = workbook.addWorksheet(view === "vendor" ? "สรุปตามผู้ขาย" : "สรุปตามสินค้า", { views: [{ state: "frozen", ySplit: 6 }] });
  sheet.addRow(["รายงานสรุปยอดซื้อแยกตามผู้ขายและสินค้า"]); sheet.mergeCells("A1:L1");
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFB51020" } };
  sheet.addRow(["มุมมอง", view === "vendor" ? "ผู้ขาย" : "สินค้า"]);
  sheet.addRow(["ช่วงวันที่", `${startDate} - ${endDate}`]);
  sheet.addRow(["สรุป", `${report?.summary.vendor_count ?? 0} ผู้ขาย · ${report?.summary.po_count ?? 0} PO · มูลค่า ${report?.summary.total_value ?? 0} บาท`]);
  sheet.addRow(["หมายเหตุ", "มูลค่าหลังส่วนลดก่อน VAT · ส่งตรงเวลา = จำนวนที่รับภายในกำหนด ÷ จำนวนที่รับทั้งหมด"]);
  const headings = ["ลำดับ", view === "vendor" ? "รหัสผู้ขาย" : "รหัสสินค้า", view === "vendor" ? "ผู้ขาย" : "สินค้า", "จำนวน PO", ...(view === "product" ? ["จำนวนผู้ขาย"] : []), "จำนวนสั่ง", "จำนวนรับ", "ค้างรับ", "มูลค่า PO", "ราคาเฉลี่ย", "% รับแล้ว", "% ส่งตรงเวลา"];
  sheet.addRow(headings);
  rows.forEach((row, index) => sheet.addRow([index + 1, safeSpreadsheetText(row.code), safeSpreadsheetText(row.name), row.po_count, ...(view === "product" ? [row.vendor_count] : []), Number(row.ordered_qty), Number(row.received_qty), Number(row.pending_qty), Number(row.total_value), Number(row.average_price), Number(row.received_rate) / 100, Number(row.on_time_rate) / 100]));
  const header = sheet.getRow(6); header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB51020" } }; header.alignment = { vertical: "middle", horizontal: "center" };
  sheet.columns.forEach((column, index) => { column.width = index === 2 ? 38 : index === 1 ? 18 : 14; });
  for (let row = 7; row <= sheet.rowCount; row += 1) { [9, 10].forEach((column) => { const cell = sheet.getRow(row).getCell(column); cell.numFmt = "#,##0.00"; }); [sheet.getRow(row).cellCount - 1, sheet.getRow(row).cellCount].forEach((column) => { sheet.getRow(row).getCell(column).numFmt = "0%"; }); }
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headings.length } };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${purchaseAnalysisFileName(view, startDate!, endDate!)}"`, "Cache-Control": "private, no-store" } });
}
