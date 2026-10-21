import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { scheduleAccess } from "@/lib/delivery-schedules.server";
import { parseDeliverySchedule } from "@/lib/delivery-schedules";
import { ScheduleWorkspace } from "../schedule-workspace";

export default async function DesignPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const access = await scheduleAccess();
  if ("error" in access) notFound();
  const filename = "KRCA001_October 2026 Rev.5.xlsx";
  const bytes = await readFile(path.join(process.cwd(), "docs", filename));
  const payload = await parseDeliverySchedule(bytes);
  return <><p className="mb-3 text-xs text-secondary">ตรวจหน้าจอจากไฟล์จริง — ยังไม่บันทึกเข้าทะเบียน</p><ScheduleWorkspace archives={[{ id: "00000000-0000-4000-8000-000000000001", customer_id: 1, customer_name: "ASICO", period: payload.period, revision: payload.revision, supplier_code: payload.supplierCode, filename, file_size: bytes.length, row_count: payload.rows.length, imported_by_name: "ยังไม่บันทึกเข้าทะเบียน", created_at: "2026-10-21T00:00:00+07:00" }]} initialPayload={payload} initialError={null} customers={[]} /></>;
}
