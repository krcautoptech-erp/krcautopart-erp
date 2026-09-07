import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRawMaterialSettingInput,
  validateRawMaterialSettingInput,
} from "./raw-material-settings.ts";

test("normalizes group and grade codes to uppercase", () => {
  const normalized = normalizeRawMaterialSettingInput("group", {
    code: " rm-steel ",
    name: " เหล็กแผ่นรีดร้อน ",
    sort_order: 1,
    status: "active",
  });

  assert.equal(normalized.code, "RM-STEEL");
  assert.equal(normalized.name, "เหล็กแผ่นรีดร้อน");
});

test("requires a symbol for unit settings", () => {
  const error = validateRawMaterialSettingInput("unit", {
    code: "SHEET",
    name: "แผ่น",
    sort_order: 1,
    status: "active",
    symbol: "",
  });

  assert.equal(error, "กรุณากรอกสัญลักษณ์หน่วยนับ");
});

test("rejects dimension units from stock unit settings", () => {
  assert.equal(
    validateRawMaterialSettingInput("unit", {
      allows_decimal: true,
      code: "MM",
      name: "มิลลิเมตร",
      sort_order: 1,
      status: "active",
      symbol: "มม.",
    }),
    "มิลลิเมตรเป็นหน่วยมิติ ไม่สามารถใช้เป็นหน่วยนับสต็อกได้",
  );
});

test("rejects negative sort order", () => {
  const error = validateRawMaterialSettingInput("grade", {
    code: "SPHC-PO",
    name: "SPHC-P/O",
    sort_order: -1,
    status: "active",
  });

  assert.equal(error, "ลำดับการแสดงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
});
