import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLatestPurchasePrices,
  normalizePurchaseOrderItemType,
  validatePurchaseOrderSubmission,
} from "./purchase-orders.ts";

test("normalizes legacy raw-material type to RM", () => {
  assert.equal(normalizePurchaseOrderItemType("raw_material", "RM001"), "RM");
});

test("preserves configured Item Master type codes", () => {
  assert.equal(normalizePurchaseOrderItemType("office", "OFF0001"), "OFFICE");
});

test("infers RM for the legacy PO source RPC", () => {
  assert.equal(normalizePurchaseOrderItemType(null, "RM009"), "RM");
});

test("rejects a line delivery date before the PO document date", () => {
  const result = validatePurchaseOrderSubmission({
    deliveryAddress: "",
    deliveryDate: "2026-09-20",
    documentDate: "2026-09-15",
    items: [{ deliveryDate: "2026-09-14", discountAmount: 0, quantity: 1, remarks: "", requisitionItemId: 1, taxRate: 7, unitPrice: 100 }],
    status: "draft",
    supplierNote: "",
    termsAndConditions: "",
    vendorId: 1,
  });

  assert.deepEqual(result, { error: "วันที่ส่งมอบของแต่ละรายการต้องไม่อยู่ก่อนวันที่เอกสาร", success: false });
});

test("fills prices only from matching approved vendor-item references", () => {
  const lines = [
    { requisitionItemId: 11, unitPrice: "0" },
    { requisitionItemId: 12, unitPrice: "99" },
  ];
  const result = applyLatestPurchasePrices(lines, [
    {
      documentDate: "2026-09-20",
      poNumber: "PO26090001",
      requisitionItemId: 11,
      unitPrice: 125.5,
    },
  ]);

  assert.equal(result[0].unitPrice, "125.5");
  assert.equal(result[0].priceReference?.poNumber, "PO26090001");
  assert.equal(result[1].unitPrice, "");
  assert.equal(result[1].priceReference, null);
});

test("requires a positive unit price before saving a PO", () => {
  const result = validatePurchaseOrderSubmission({
    deliveryAddress: "",
    deliveryDate: "2026-09-20",
    documentDate: "2026-09-15",
    items: [{ deliveryDate: "2026-09-20", discountAmount: 0, quantity: 1, remarks: "", requisitionItemId: 1, taxRate: 7, unitPrice: 0 }],
    status: "draft",
    supplierNote: "",
    termsAndConditions: "",
    vendorId: 1,
  });

  assert.deepEqual(result, { error: "กรุณาระบุราคาต่อหน่วยให้มากกว่า 0", success: false });
});
