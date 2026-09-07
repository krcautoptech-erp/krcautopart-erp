import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPurchaseRequisitionItemDescription,
  getPurchaseRequisitionItemKey,
  normalizePurchaseRequisitionRows,
  validatePurchaseRequisitionSubmission,
} from "./purchase-requisition-form.ts";

const items = [
  {
    allowsDecimal: false,
    code: "RM001",
    description: "เหล็กแผ่นรีดร้อน SPHC-P/O 2.60 × 93 × 1,220 มม.",
    gradeName: "SPHC-P/O",
    id: 1,
    lengthMm: 1220,
    name: "เหล็กแผ่นรีดร้อน",
    thicknessMm: 2.6,
    unitId: 10,
    unitName: "แผ่น",
    unitSymbol: "แผ่น",
    widthMm: 93,
    source: "raw_material" as const,
    typeCode: "RM",
    typeName: "วัตถุดิบ",
  },
  {
    allowsDecimal: true,
    code: "OFF0001",
    description: "กระดาษถ่ายเอกสาร A4 80 แกรม",
    gradeName: "",
    id: 2,
    lengthMm: 0,
    name: "กระดาษถ่ายเอกสาร A4 80 แกรม",
    thicknessMm: 0,
    unitId: 11,
    unitName: "รีม",
    unitSymbol: "รีม",
    widthMm: 0,
    source: "item_master" as const,
    typeCode: "OFF",
    typeName: "ของใช้สำนักงาน",
  },
];

test("formats the item description supplied by Item Master", () => {
  assert.equal(
    formatPurchaseRequisitionItemDescription(items[0]),
    "เหล็กแผ่นรีดร้อน SPHC-P/O 2.60 × 93 × 1,220 มม.",
  );
});

test("builds a collision-safe key for items from different sources", () => {
  assert.equal(getPurchaseRequisitionItemKey(items[0]), "raw_material:1");
  assert.equal(getPurchaseRequisitionItemKey(items[1]), "item_master:2");
  assert.equal(
    getPurchaseRequisitionItemKey({
      id: 1,
      source: "item_master",
    }),
    "item_master:1",
  );
  assert.notEqual(
    getPurchaseRequisitionItemKey(items[0]),
    getPurchaseRequisitionItemKey({
      id: 1,
      source: "item_master",
    }),
  );
});

test("accepts a valid PR submission", () => {
  const result = validatePurchaseRequisitionSubmission(
    {
      items: [
        {
          neededByDate: "2028-12-31",
          quantity: 20,
          source: "raw_material",
          sourceId: 1,
          remarks: "เร่งใช้",
        },
      ],
      neededByDate: "2028-12-31",
      remarks: "ใช้สำหรับงานผลิต",
    },
    items,
  );

  assert.equal(result.success, true);
});

test("rejects duplicate items from the same source", () => {
  const result = validatePurchaseRequisitionSubmission(
    {
      items: [
        { neededByDate: "2028-12-31", quantity: 2, source: "raw_material", sourceId: 1, remarks: "" },
        { neededByDate: "2028-12-31", quantity: 3, source: "raw_material", sourceId: 1, remarks: "" },
      ],
      neededByDate: "2028-12-31",
      remarks: "",
    },
    items,
  );

  assert.deepEqual(result, {
    error: "ไม่สามารถเพิ่มสินค้า/บริการซ้ำในใบขอซื้อได้",
    success: false,
  });
});

test("rejects decimal quantities for units that require whole numbers", () => {
  const result = validatePurchaseRequisitionSubmission(
    {
      items: [
        {
          neededByDate: "2028-12-31",
          quantity: 1.5,
          source: "raw_material",
          sourceId: 1,
          remarks: "",
        },
      ],
      neededByDate: "2028-12-31",
      remarks: "",
    },
    items,
  );

  assert.deepEqual(result, {
    error: "จำนวนของ RM001 ต้องเป็นจำนวนเต็ม",
    success: false,
  });
});

test("accepts decimal quantities when the unit allows them", () => {
  const result = validatePurchaseRequisitionSubmission(
    {
      items: [
        {
          neededByDate: "2028-12-31",
          quantity: 12.5,
          source: "item_master",
          sourceId: 2,
          remarks: "",
        },
      ],
      neededByDate: "2028-12-31",
      remarks: "",
    },
    items,
  );

  assert.equal(result.success, true);
});

test("assigns stable unique row ids when loaded PR items have missing or duplicate ids", () => {
  const rows = normalizePurchaseRequisitionRows(
    [
      { id: undefined, neededByDate: "2028-12-31", note: "", quantity: "2", itemKey: "raw_material:1" },
      { id: undefined, neededByDate: "2028-12-31", note: "", quantity: "3", itemKey: "item_master:2" },
      { id: 1, neededByDate: "2028-12-31", note: "", quantity: "4", itemKey: "item_master:3" },
    ],
    "2028-12-31",
  );

  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
});
