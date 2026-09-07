import type { PurchaseOrderStatus } from "./purchase-orders";

export const PURCHASE_ORDER_PRINT_ROWS_PER_PAGE = 15;

export type PurchaseOrderPrintItem = {
  discountAmount: number;
  itemCode: string;
  itemDescription: string;
  lineNo: number;
  lineTotal: number;
  quantity: number;
  taxRate: number;
  unitName: string;
  unitPrice: number;
};

export type PurchaseOrderPrintDetail = {
  approvedAt: string;
  approverName: string;
  buyerName: string;
  creditTermName: string;
  deliveryAddress: string;
  deliveryDate: string;
  discountAmount: number;
  documentDate: string;
  grandTotal: number;
  id: number;
  items: PurchaseOrderPrintItem[];
  paymentMethodName: string;
  poNumber: string;
  prReferences: string[];
  status: PurchaseOrderStatus;
  subtotal: number;
  supplierNote: string;
  taxAmount: number;
  taxTypeName: string;
  termsAndConditions: string;
  vendor: {
    address: string;
    branch: string;
    code: string;
    contactName: string;
    email: string;
    name: string;
    phone: string;
    taxId: string;
  };
};

export function paginatePurchaseOrderItems<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];

  const pages: T[][] = [];
  for (
    let index = 0;
    index < items.length;
    index += PURCHASE_ORDER_PRINT_ROWS_PER_PAGE
  ) {
    pages.push(items.slice(index, index + PURCHASE_ORDER_PRINT_ROWS_PER_PAGE));
  }
  return pages;
}

const THAI_DIGITS = [
  "ศูนย์",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า",
];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
const THAI_MILLION = "ล้าน";

function readThaiGroup(value: number) {
  if (value === 0) return "";

  const digits = String(value).padStart(6, "0").split("").map(Number);
  let text = "";

  digits.forEach((digit, index) => {
    if (digit === 0) return;
    const position = digits.length - index - 1;

    if (position === 0 && digit === 1 && text) {
      text += "เอ็ด";
    } else if (position === 1 && digit === 1) {
      text += "สิบ";
      return;
    } else if (position === 1 && digit === 2) {
      text += "ยี่สิบ";
      return;
    } else {
      text += THAI_DIGITS[digit];
    }

    text += THAI_POSITIONS[position];
  });

  return text;
}

function readThaiInteger(value: number): string {
  if (value === 0) return THAI_DIGITS[0];
  if (value < 1_000_000) return readThaiGroup(value);

  const high = Math.floor(value / 1_000_000);
  const low = value % 1_000_000;
  return `${readThaiInteger(high)}${THAI_MILLION}${low ? readThaiGroup(low) : ""}`;
}

export function formatThaiBahtText(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const roundedSatang = Math.round(safeValue * 100);
  const baht = Math.floor(roundedSatang / 100);
  const satang = roundedSatang % 100;
  const bahtText = `${readThaiInteger(baht)}บาท`;

  return satang === 0
    ? `${bahtText}ถ้วน`
    : `${bahtText}${readThaiInteger(satang)}สตางค์`;
}
