import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetTagPrintHtml } from "./asset-print.ts";
import type { AssetRecord } from "./assets.ts";

test("builds clean asset tag print HTML with physical dimensions and exact fields", () => {
  const mockAsset: AssetRecord = {
    id: 1,
    itemMasterId: 10,
    itemCode: "AST-001",
    itemName: "แท่นเจาะโลหะ",
    itemTypeCode: "EQ",
    itemTypeName: "เครื่องมือ",
    serialNumber: "SN-998877",
    status: "in_use",
    statusLabel: "กำลังใช้งาน",
    statusColor: "#008800",
    departmentId: 2,
    departmentName: "ฝ่ายผลิต",
    custodianName: "สมชาย",
    locationNote: "อาคาร 2",
    warrantyExpiryDate: "2027-12-31",
    notes: null,
    receiptId: 5,
    grNumber: "GR26090001",
    receiptDate: "2026-09-10",
    purchaseOrderId: 3,
    poNumber: "PO26090001",
    vendorId: 1,
    vendorName: "Vendor A",
    unitPrice: 15000,
    unitName: "เครื่อง",
    warehouseId: 1,
    warehouseName: "คลังหลัก",
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-10T00:00:00Z",
  };

  const qrUrl = "https://example.com/qr.png";
  const html = buildAssetTagPrintHtml(mockAsset, qrUrl);

  assert.ok(html.includes("AST-001"));
  assert.ok(html.includes("แท่นเจาะโลหะ"));
  assert.ok(html.includes("SN-998877"));
  assert.ok(html.includes("ฝ่ายผลิต"));
  assert.ok(html.includes("2026-09-10"));
  assert.ok(html.includes("85mm"));
  assert.ok(html.includes("KRC AUTOPART"));
});
