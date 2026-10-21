import { toast } from "@/components/toast";
import { createBrowserFileDeliveryAdapter, deliverFileBlob } from "./file-delivery";
import { createExcelBlob, type SpreadsheetCell } from "./spreadsheet-export";

export async function exportExcelFile(rows: readonly (readonly SpreadsheetCell[])[], filename: string, sheetName: string): Promise<void> {
  try {
    const blob = await createExcelBlob(rows, sheetName);
    await exportSpreadsheetFile(blob, filename);
  } catch (error) {
    console.error("XLSX generation failed", error);
    toast.error("ไม่สามารถสร้างไฟล์ Excel ได้ กรุณาลองใหม่");
  }
}

export async function exportSpreadsheetFile(blob: Blob, filename: string): Promise<void> {
  try {
    await deliverFileBlob(blob, filename, createBrowserFileDeliveryAdapter());
  } catch (error) {
    console.error("Spreadsheet delivery failed", error);
    toast.error("ไม่สามารถส่งออกไฟล์ได้ กรุณาลองใหม่");
  }
}

export async function exportSpreadsheetUrl(url: string): Promise<void> {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    const blob = await response.blob();
    if (!response.ok || !/^(application\/(vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet)|octet-stream)|text\/csv)(;|$)/i.test(blob.type)) {
      throw new Error("Invalid spreadsheet export response");
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "report.xlsx";
    await exportSpreadsheetFile(blob, filename);
  } catch (error) {
    console.error("Spreadsheet export failed", error);
    toast.error("ไม่สามารถส่งออก Excel ได้ กรุณาลองใหม่ หรือเข้าสู่ระบบอีกครั้ง");
  }
}
