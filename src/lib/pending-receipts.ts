import type { StatusTone } from "@/components/status-badge";

export type PendingReceiptStatus = { label: string; tone: StatusTone };

export function pendingReceiptStatus(dueDate: string, sentAt: string | null, todayIso: string): PendingReceiptStatus {
  if (!sentAt) return { label: "รอส่ง PO", tone: "neutral" };
  const days = Math.round((Date.parse(dueDate) - Date.parse(todayIso)) / 86_400_000);
  if (days < 0) return { label: `เกินกำหนด ${Math.abs(days)} วัน`, tone: "danger" };
  if (days === 0) return { label: "ครบกำหนดวันนี้", tone: "pending" };
  if (days <= 7) return { label: "ใกล้ครบกำหนด", tone: "pending" };
  return { label: "กำลังจัดส่ง", tone: "success" };
}

export function purchaseOrderSearchHref(poNumber: string, documentDate: string) {
  const params = new URLSearchParams({ q: poNumber, start: documentDate, end: documentDate });
  return `/purchase/po?${params.toString()}`;
}
