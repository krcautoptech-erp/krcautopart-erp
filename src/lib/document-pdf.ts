import type { DocumentOrientation, DocumentPaperSize } from "./document-print.ts";

export type PdfDocumentOptions = {
  paperSize?: DocumentPaperSize;
  orientation?: DocumentOrientation;
};

/** Shared server renderer for all PDF exports. */
export async function requestDocumentPdf(html: string, options: PdfDocumentOptions = {}): Promise<Blob> {
  const response = await fetch("/api/documents/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, paperSize: options.paperSize ?? "A4", orientation: options.orientation ?? "portrait" }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "ไม่สามารถสร้างไฟล์ PDF ได้");
  }
  if (!response.headers.get("Content-Type")?.includes("application/pdf")) {
    throw new Error("เซิร์ฟเวอร์ไม่ได้ส่งไฟล์ PDF กรุณาเข้าสู่ระบบแล้วลองใหม่");
  }
  return response.blob();
}

