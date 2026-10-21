export const SUPPLIER_DOCUMENT_TYPES = [
  { value: "delivery_note", label: "ใบส่งของ" },
  { value: "tax_invoice", label: "ใบกำกับภาษี" },
  { value: "delivery_note_tax_invoice", label: "ใบส่งของ/ใบกำกับภาษี" },
  { value: "other", label: "เอกสารอื่น" },
] as const;

export type SupplierDocumentType =
  (typeof SUPPLIER_DOCUMENT_TYPES)[number]["value"];

export function supplierDocumentTypeLabel(value: string | null | undefined) {
  return SUPPLIER_DOCUMENT_TYPES.find((item) => item.value === value)?.label ?? "เอกสารผู้ขาย";
}

export function getGoodsReceiptQuantityTotals(items: readonly { quantity_received: number; unit_name: string }[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.unit_name, (totals.get(item.unit_name) ?? 0) + item.quantity_received);
  }
  return Array.from(totals, ([unit, quantity]) => ({ unit, quantity }));
}

export function getGoodsReceiptPrintRowLimit(currentRows: number, availableHeight: number, contentHeight: number) {
  return contentHeight > availableHeight + 1 ? Math.max(1, currentRows - 1) : currentRows;
}
