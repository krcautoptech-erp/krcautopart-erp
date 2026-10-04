import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStockIssueHistory, formatIssueLotNumber, getStockIssueCreateActions, getStockRequestLineNumbers, projectIssueCostRows, suggestIssueLots, skipsIssueFifo, validateStockIssueDraft } from "./stock-issues.ts";

test("print and next-document actions unlock only after an issue is saved", () => {
  assert.deepEqual(getStockIssueCreateActions(null), { canPrint: false, canCreateNext: false, canSave: true });
  assert.deepEqual(getStockIssueCreateActions("IS26090002"), { canPrint: true, canCreateNext: true, canSave: false });
});

test("A5 stock request provides eight writable item lines", () => {
  assert.deepEqual(getStockRequestLineNumbers(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("stock issue printing uses the shared vector print pipeline", () => {
  const source = readFileSync(new URL("../app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx", import.meta.url), "utf8");
  assert.match(source, /exportElementPdf/);
  assert.match(source, /printElement/);
  assert.doesNotMatch(source, /html2pdf|html2canvas|window\.print/);
});

test("permission repair keeps stock-issue cancellation assignable", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260923150258_repair_complete_permission_catalog.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /'inventory_issue\.cancel'/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /where role\.is_owner/);
});

test("document history includes posting and the linked reversal after cancellation", () => {
  assert.deepEqual(buildStockIssueHistory({
    createdAt: "2026-09-10T02:14:00Z",
    createdByName: "ผู้ดูแล ระบบ",
    cancelledAt: "2026-09-11T03:00:00Z",
    cancelledByName: "ผู้ดูแล ระบบ",
    cancellationReason: "บันทึกจำนวนผิดจากเอกสารหน้างาน",
    reversalNumber: "RV26090001",
  }), [
    { at: "2026-09-10T02:14:00Z", event: "บันทึกตัดสต็อก", actor: "ผู้ดูแล ระบบ", note: "—" },
    { at: "2026-09-11T03:00:00Z", event: "ยกเลิกและคืนสต็อก", actor: "ผู้ดูแล ระบบ", note: "RV26090001 · บันทึกจำนวนผิดจากเอกสารหน้างาน" },
  ]);
});

test("lot display removes only the redundant LOT prefix", () => {
  assert.equal(formatIssueLotNumber("LOT2608000201"), "2608000201");
  assert.equal(formatIssueLotNumber("260910009-42"), "260910009-42");
});

test("FIFO exception means taking a later lot while an earlier lot remains, not editing quantity", () => {
  const lots = [{ id: 1, lotNumber: "001", receivedAt: "2026-08-01", onHandQty: 800 }, { id: 2, lotNumber: "002", receivedAt: "2026-08-02", onHandQty: 200 }];
  assert.equal(skipsIssueFifo(lots, [{ lotId: 1, quantity: 200 }]), false);
  assert.equal(skipsIssueFifo(lots, []), false);
  assert.equal(skipsIssueFifo(lots, [{ lotId: 2, quantity: 100 }]), true);
  assert.equal(skipsIssueFifo(lots, [{ lotId: 1, quantity: 800 }, { lotId: 2, quantity: 100 }]), false);
});

const validDraft = {
  documentDate: "2026-09-10",
  requesterName: "นายสมชาย ใจดี",
  departmentId: 1,
  workPoint: "งานขึ้นรูป",
  warehouseId: 1,
  reason: "ผลิตตามแผนการผลิตประจำวัน",
  items: [{ itemMasterId: 11, quantity: 10, onHandQty: 20 }],
};

test("FIFO splits across lots and explicit allocations must balance without duplicates", () => {
  const lots = [{ id: 1, lotNumber: "001", receivedAt: "2026-08-01", onHandQty: 6 }, { id: 2, lotNumber: "002", receivedAt: "2026-08-02", onHandQty: 20 }];
  assert.deepEqual(suggestIssueLots(lots, 10), [{ lotId: 1, quantity: 6 }, { lotId: 2, quantity: 4 }]);
  const check = (allocations: Array<{ lotId: number; quantity: number }>) => validateStockIssueDraft({ ...validDraft, items: [{ ...validDraft.items[0], allocations }] });
  assert.equal(check([{ lotId: 2, quantity: 10 }]), null);
  assert.equal(check([{ lotId: 2, quantity: 9 }]), "ยอดจัดสรร Lot ต้องเท่ากับจำนวนเบิก");
  assert.equal(check([{ lotId: 2, quantity: 5 }, { lotId: 2, quantity: 5 }]), "ข้อมูลจัดสรร Lot ไม่ถูกต้อง");
  assert.equal(check([{ lotId: 2, quantity: NaN }]), "ข้อมูลจัดสรร Lot ไม่ถูกต้อง");
});

test("display rows preserve actual cost layers instead of averaging them", () => {
  const lots = [{ id: 1, lotNumber: "LOT001", receivedAt: "2026-08-01", onHandQty: 100, costLayers: [{ quantity: 50, unitCost: 100 }, { quantity: 50, unitCost: 120 }] }];
  assert.deepEqual(projectIssueCostRows(lots, [{ lotId: 1, quantity: 100 }], true), [
    { lotId: 1, lotNumber: "LOT001", quantity: 50, unitCost: 100, amount: 5000 },
    { lotId: 1, lotNumber: "LOT001", quantity: 50, unitCost: 120, amount: 6000 },
  ]);
});

test("accepts a complete issue and rejects unsafe quantities", () => {
  assert.equal(validateStockIssueDraft({ ...validDraft, reason: "" }), null);
  assert.equal(validateStockIssueDraft({ ...validDraft, reason: "x".repeat(501) }), "เหตุผลการเบิกต้องไม่เกิน 500 ตัวอักษร");
  assert.equal(validateStockIssueDraft(validDraft), null);
  assert.equal(
    validateStockIssueDraft({
      ...validDraft,
      items: [{ itemMasterId: 11, quantity: 21, onHandQty: 20 }],
    }),
    "จำนวนเบิกต้องไม่เกินยอดคงเหลือ",
  );
  assert.equal(
    validateStockIssueDraft({
      ...validDraft,
      items: [
        { itemMasterId: 11, quantity: 1, onHandQty: 20 },
        { itemMasterId: 11, quantity: 1, onHandQty: 20 },
      ],
    }),
    "ไม่สามารถเพิ่มสินค้าซ้ำในใบเบิกเดียวกันได้",
  );
});
