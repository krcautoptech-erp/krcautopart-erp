import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionStockCount,
  friendlyStockCountError,
  validateStockCountCreate,
  validateStockCountReview,
  stockCountDifference,
  stockCountProgress,
  isStockCountDateInRange,
  validateCountEntry,
  type CountEntry,
} from "./stock-counts.ts";

test("maps database failures to safe Thai messages", () => {
  assert.equal(friendlyStockCountError("stale_stock_count_snapshot"), "ยอดสต็อกเปลี่ยนหลังสร้างรอบ กรุณายกเลิกรอบนี้แล้วสร้างใหม่");
  assert.equal(friendlyStockCountError("lot_unit_cost_unavailable"), "ไม่พบต้นทุนของ Lot ที่มียอดเพิ่ม กรุณาตรวจสอบต้นทุนก่อนอนุมัติ");
  assert.equal(friendlyStockCountError("permission_denied"), "คุณไม่มีสิทธิ์ทำรายการนี้");
  assert.equal(friendlyStockCountError("relation public.stock_counts failed"), "ไม่สามารถบันทึกรอบตรวจนับได้");
});

test("validates a stock count round before creation", () => {
  assert.equal(validateStockCountCreate({ documentDate: "", warehouseId: 0, assignedTo: "", itemMasterIds: [], selectionScope: "all" }), "กรุณาระบุวันที่ตรวจนับ");
  assert.equal(validateStockCountCreate({ documentDate: "2026-10-02", warehouseId: 1, assignedTo: "u", itemMasterIds: [1, 1], selectionScope: "selected" }), "พบสินค้าซ้ำในรายการตรวจนับ");
  assert.equal(validateStockCountCreate({ documentDate: "2026-10-02", warehouseId: 1, assignedTo: "u", itemMasterIds: [1, 2], selectionScope: "selected" }), null);
});

test("requires complete counts and variance reasons before review", () => {
  assert.equal(validateStockCountReview([{ systemQty: 1, countedQty: null, reason: "" }]), "กรุณาตรวจนับให้ครบทุกรายการ");
  assert.equal(validateStockCountReview([{ systemQty: 1, countedQty: 2, reason: "" }]), "กรุณาระบุเหตุผลของรายการที่มียอดต่าง");
  assert.equal(validateStockCountReview([{ systemQty: 1, countedQty: 2, reason: "ตรวจพบเกิน" }]), null);
});

test("calculates four-decimal lot differences without floating drift", () => {
  assert.equal(stockCountDifference(10.0001, 10.0002), 0.0001);
  assert.equal(stockCountDifference(10.0002, 10.0001), -0.0001);
});

test("rejects negative, non-finite, and more-than-four-decimal counts", () => {
  for (const countedQty of [-1, Infinity, -Infinity, NaN, 1.00001, 1.000000000001, 0.000000000001]) {
    assert.notEqual(validateCountEntry({ systemQty: 1, countedQty }), null);
  }
  assert.equal(validateCountEntry({ systemQty: 1, countedQty: 1.0001 }), null);
  assert.equal(validateCountEntry({ systemQty: 1, countedQty: null }), null);
});

test("allows draft -> counting -> review -> approved and review -> recount -> counting only", () => {
  const allowed = [
    ["draft", "counting"],
    ["counting", "review"],
    ["review", "approved"],
    ["review", "recount"],
    ["recount", "counting"],
  ] as const;
  for (const [from, to] of allowed) assert.equal(canTransitionStockCount(from, to), true);
  for (const [from, to] of [
    ["draft", "review"],
    ["counting", "approved"],
    ["recount", "review"],
    ["approved", "counting"],
    ["cancelled", "draft"],
    ["review", "counting"],
  ] as const) assert.equal(canTransitionStockCount(from, to), false);
  for (const from of ["draft", "counting", "review", "recount"] as const) {
    assert.equal(canTransitionStockCount(from, "cancelled"), true);
  }
});

test("counts zero as completed and null as pending", () => {
  const entries: CountEntry[] = [
    { systemQty: 5, countedQty: 0 },
    { systemQty: 7, countedQty: null },
  ];
  assert.deepEqual(stockCountProgress(entries), { completed: 1, total: 2 });
  assert.deepEqual(stockCountProgress([]), { completed: 0, total: 0 });
});

test("filters stock count dates inclusively", () => {
  assert.equal(isStockCountDateInRange("2026-10-02", "2026-10-02", "2026-10-02"), true);
  assert.equal(isStockCountDateInRange("2026-10-01", "2026-10-02", ""), false);
  assert.equal(isStockCountDateInRange("2026-10-03", "", "2026-10-02"), false);
});

test("keeps opposite lot differences even when item net difference is zero", () => {
  const lots: CountEntry[] = [
    { systemQty: 10, countedQty: 9 },
    { systemQty: 10, countedQty: 11 },
  ];
  assert.deepEqual(lots.map(({ systemQty, countedQty }) => stockCountDifference(systemQty, countedQty!)), [-1, 1]);
});
