import assert from "node:assert/strict";
import test from "node:test";
import { adjustmentDifference, validateStockAdjustmentDraft } from "./stock-adjustments.ts";

const validDraft = {
  adjustmentNumber: "AD26090001",
  documentDate: "2026-09-18",
  warehouseId: 1,
  reason: "ตรวจนับสต็อกประจำเดือน",
  notes: "",
  items: [{ itemMasterId: 11, systemQty: 10, countedQty: 12.3456, positiveUnitCost: 25.5 }],
};

test("calculates adjustment difference at database quantity precision", () => {
  assert.equal(adjustmentDifference(10, 12.3456), 2.3456);
  assert.equal(adjustmentDifference(0.0001, 0.0002), 0.0001);
});

test("accepts a complete adjustment and requires a positive cost only when stock increases", () => {
  assert.equal(validateStockAdjustmentDraft(validDraft), null);
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [{ ...validDraft.items[0], positiveUnitCost: null }] }), "กรุณาระบุต้นทุนต่อหน่วยสำหรับยอดปรับเพิ่ม");
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [{ ...validDraft.items[0], countedQty: 8, positiveUnitCost: null }] }), null);
});

test("rejects invalid precision, unchanged rows, negative counted stock, and duplicate items", () => {
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [{ ...validDraft.items[0], countedQty: 12.34567 }] }), "จำนวนตรวจนับต้องมีทศนิยมไม่เกิน 4 ตำแหน่ง");
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [{ ...validDraft.items[0], countedQty: 10 }] }), "ต้องมีอย่างน้อยหนึ่งรายการที่ยอดตรวจนับต่างจากยอดในระบบ");
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [{ ...validDraft.items[0], countedQty: -1 }] }), "จำนวนตรวจนับต้องไม่น้อยกว่า 0");
  assert.equal(validateStockAdjustmentDraft({ ...validDraft, items: [validDraft.items[0], validDraft.items[0]] }), "ไม่สามารถเพิ่มสินค้าซ้ำในใบปรับปรุงเดียวกันได้");
});
