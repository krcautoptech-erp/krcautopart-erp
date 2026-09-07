import assert from "node:assert/strict";
import test from "node:test";
import {
  formatThaiBahtText,
  paginatePurchaseOrderItems,
  PURCHASE_ORDER_PRINT_ROWS_PER_PAGE,
} from "./purchase-order-print.ts";

test("keeps exactly 15 purchase order items on one page", () => {
  const items = Array.from(
    { length: PURCHASE_ORDER_PRINT_ROWS_PER_PAGE },
    (_, index) => index + 1,
  );

  assert.deepEqual(paginatePurchaseOrderItems(items), [items]);
});

test("moves the sixteenth purchase order item to a second page", () => {
  const items = Array.from({ length: 16 }, (_, index) => index + 1);
  const pages = paginatePurchaseOrderItems(items);

  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 15);
  assert.deepEqual(pages[1], [16]);
});

test("formats Thai baht text for whole baht and satang", () => {
  assert.equal(formatThaiBahtText(0), "ศูนย์บาทถ้วน");
  assert.equal(formatThaiBahtText(1_082_979.1), "หนึ่งล้านแปดหมื่นสองพันเก้าร้อยเจ็ดสิบเก้าบาทสิบสตางค์");
});
