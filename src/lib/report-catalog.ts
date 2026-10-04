export type ReportCatalogItem = {
  category: "purchase" | "inventory" | "finance";
  description: string;
  group: "pr" | "po" | "vendor" | "receipt" | "return" | "inventory" | "finance";
  href: string;
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
  orientation?: "portrait" | "landscape";
};

export const REPORT_CATALOG: readonly ReportCatalogItem[] = [
  { id: "pending-receipts", category: "purchase", group: "receipt", name: "สินค้าค้างรับและติดตามกำหนดส่ง", description: "รายการสินค้าที่สั่งซื้อแล้วแต่ยังไม่ได้รับครบ และติดตามกำหนดส่งจากผู้ขาย", owner: "ฝ่ายจัดซื้อ", updatedAt: "15/09/2026", href: "/reports/purchase/pending-receipts", orientation: "portrait" },
  { id: "purchase-history", category: "purchase", group: "po", name: "ประวัติการสั่งซื้อ", description: "แสดงประวัติการสั่งซื้อทั้งหมดตามช่วงเวลา", owner: "ฝ่ายจัดซื้อ", updatedAt: "10/09/2026", href: "#", orientation: "portrait" },
  { id: "vendor-delay", category: "purchase", group: "vendor", name: "วิเคราะห์การส่งล่าช้าของผู้ขาย", description: "วิเคราะห์สถิติและแนวโน้มการส่งสินค้าล่าช้าของผู้ขาย", owner: "ฝ่ายจัดซื้อ", updatedAt: "05/09/2026", href: "#", orientation: "portrait" },
  { id: "purchase-by-vendor", category: "purchase", group: "vendor", name: "ยอดซื้อตามผู้ขาย/สินค้า", description: "สรุปยอดซื้อแยกตามผู้ขายและสินค้า", owner: "ฝ่ายจัดซื้อ", updatedAt: "21/09/2026", href: "/reports/purchase/purchase-analysis", orientation: "portrait" },
  { id: "pr-without-po", category: "purchase", group: "pr", name: "PR ที่ยังไม่ออก PO", description: "รายการใบขอซื้อ (PR) ที่ยังไม่ได้ออกใบสั่งซื้อ (PO)", owner: "ฝ่ายจัดซื้อ", updatedAt: "12/09/2026", href: "#", orientation: "portrait" },
  { id: "quote-comparison", category: "purchase", group: "vendor", name: "เปรียบเทียบราคาเสนอจากผู้ขาย", description: "เปรียบเทียบราคาเสนอของผู้ขายแต่ละราย", owner: "ฝ่ายจัดซื้อ", updatedAt: "05/08/2026", href: "#", orientation: "portrait" },
  { id: "po-status", category: "purchase", group: "po", name: "สถานะใบสั่งซื้อ (PO)", description: "แสดงสถานะและความคืบหน้าของใบสั่งซื้อ", owner: "ฝ่ายจัดซื้อ", updatedAt: "01/08/2026", href: "#", orientation: "portrait" },
  { id: "goods-receipts", category: "purchase", group: "receipt", name: "รายงานการรับสินค้า", description: "สรุปรายการรับสินค้าตามใบสั่งซื้อ", owner: "คลังสินค้า", updatedAt: "29/07/2026", href: "#", orientation: "portrait" },
  { id: "open-po-aging", category: "purchase", group: "po", name: "อายุใบสั่งซื้อค้างรับ", description: "วิเคราะห์อายุของใบสั่งซื้อที่ยังไม่ได้รับครบ", owner: "ฝ่ายจัดซื้อ", updatedAt: "25/07/2026", href: "#", orientation: "portrait" },
  { id: "po-commitment", category: "purchase", group: "po", name: "วงเงินคงเหลือของใบสั่งซื้อ", description: "แสดงวงเงินคงเหลือของใบสั่งซื้อแต่ละรายการ", owner: "ฝ่ายจัดซื้อ", updatedAt: "18/07/2026", href: "#", orientation: "portrait" },
  { id: "vendor-score", category: "purchase", group: "vendor", name: "ประเมินผลผู้ขาย", description: "สรุปคะแนนผู้ขายด้านคุณภาพ ราคา และการส่งมอบ", owner: "ฝ่ายจัดซื้อ", updatedAt: "10/07/2026", href: "#", orientation: "portrait" },
  { id: "stock-balance", category: "inventory", group: "inventory", name: "สรุปสินค้าคงเหลือ", description: "สรุปจำนวนสินค้าคงเหลือแยกตามคลังและสินค้า", owner: "คลังสินค้า", updatedAt: "14/09/2026", href: "#", orientation: "portrait" },
  { id: "stock-movement", category: "inventory", group: "inventory", name: "รายงานความเคลื่อนไหวสต็อก", description: "สรุปตามสินค้า รายการเคลื่อนไหวรวม และ Stock Card", owner: "คลังสินค้า", updatedAt: "16/09/2026", href: "/reports/inventory/stock-movements", orientation: "landscape" },
  { id: "stock-issues", category: "inventory", group: "inventory", name: "รายงานการเบิกจ่ายสินค้า", description: "สรุปการเบิกสินค้าแยกตามเอกสาร สินค้า และหน่วยงาน", owner: "คลังสินค้า", updatedAt: "20/09/2026", href: "/reports/inventory/stock-issues", orientation: "portrait" },
  { id: "expiring-stock", category: "inventory", group: "inventory", name: "สินค้าที่ใกล้หมดอายุ", description: "รายการสินค้าใกล้หมดอายุพร้อมจำนวนคงเหลือ", owner: "คลังสินค้า", updatedAt: "11/09/2026", href: "#", orientation: "portrait" },
  { id: "payables", category: "finance", group: "finance", name: "รายงานเจ้าหนี้คงค้าง", description: "ยอดเจ้าหนี้คงค้างแยกตามผู้ขายและอายุหนี้", owner: "ฝ่ายการเงิน", updatedAt: "14/09/2026", href: "#", orientation: "portrait" },
  { id: "payment-history", category: "finance", group: "finance", name: "รายละเอียดการชำระเจ้าหนี้", description: "รายการชำระเงินให้ผู้ขายตามช่วงเวลา", owner: "ฝ่ายการเงิน", updatedAt: "09/09/2026", href: "#", orientation: "portrait" },
];

/** Reports without a real route are specifications, not user-facing features. */
export const AVAILABLE_REPORT_CATALOG = REPORT_CATALOG.filter((report) => report.href !== "#");

export const REPORT_CATEGORY_META = {
  purchase: { label: "จัดซื้อ", icon: "folder", count: 2 },
  inventory: { label: "คลังสินค้า", icon: "folder", count: 2 },
  finance: { label: "การเงิน", icon: "folder", count: 0 },
} as const;
