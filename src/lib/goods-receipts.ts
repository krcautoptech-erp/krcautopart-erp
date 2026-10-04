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
