import assert from "node:assert/strict";
import test from "node:test";
import { filterPickerItems, togglePickerSelection } from "./item-picker.ts";

const items = [
  { id: "rm-1", code: "RM001", name: "Hot Rolled Steel Sheet", searchText: "เหล็กแผ่น", group: "วัตถุดิบ", active: true, disabled: false },
  { id: "fg-1", code: "FG001", name: "โต๊ะสำนักงาน รุ่น KRC-01", searchText: "สินค้าสำเร็จรูป", group: "สินค้าสำเร็จรูป", active: false, disabled: false },
  { id: "rm-2", code: "RM002", name: "Cold Rolled Steel Sheet", searchText: "เหล็กแผ่น", group: "วัตถุดิบ", disabled: true },
];

test("shared item picker searches code, name, and caller metadata", () => {
  assert.deepEqual(filterPickerItems(items, "fg001").map((item) => item.id), ["fg-1"]);
  assert.deepEqual(filterPickerItems(items, "สำนักงาน").map((item) => item.id), ["fg-1"]);
  assert.deepEqual(filterPickerItems(items, "เหล็กแผ่น").map((item) => item.id), ["rm-1", "rm-2"]);
});

test("shared item picker combines search with the optional item group filter", () => {
  assert.deepEqual(filterPickerItems(items, "steel", "วัตถุดิบ").map((item) => item.id), ["rm-1", "rm-2"]);
  assert.deepEqual(filterPickerItems(items, "", "สินค้าสำเร็จรูป").map((item) => item.id), ["fg-1"]);
});

test("shared item picker can hide inactive items", () => {
  assert.deepEqual(filterPickerItems(items, "", "", true).map((item) => item.id), ["rm-1", "rm-2"]);
});

test("shared item picker never selects disabled rows and supports single selection", () => {
  assert.deepEqual([...togglePickerSelection(new Set(), "rm-2", true, false)], []);
  assert.deepEqual([...togglePickerSelection(new Set(["rm-1"]), "fg-1", false, true)], ["fg-1"]);
});
