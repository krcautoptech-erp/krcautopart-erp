import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildNotificationInboxHref,
  getNotificationDocumentNumber,
  groupNotificationInboxItems,
  parseNotificationInboxFilters,
} from "./notification-inbox.ts";

test("notification inbox sanitizes page, status, type, query, and dates", () => {
  assert.deepEqual(
    parseNotificationInboxFilters({
      endDate: "not-a-date",
      page: "-4",
      q: "  PR26100045  ",
      startDate: "2026-10-01",
      status: "unexpected",
      type: "purchase_order",
    }),
    {
      endDate: "",
      page: 1,
      q: "PR26100045",
      startDate: "2026-10-01",
      status: "all",
      type: "purchase_order",
    },
  );
});

test("notification inbox pagination keeps active filters", () => {
  const href = buildNotificationInboxHref(
    {
      endDate: "2026-10-04",
      page: 1,
      q: "PO2610",
      startDate: "2026-10-01",
      status: "unread",
      type: "purchase_order",
    },
    3,
  );

  assert.equal(
    href,
    "/notifications?q=PO2610&status=unread&type=purchase_order&startDate=2026-10-01&endDate=2026-10-04&page=3",
  );
});

test("notification inbox groups Bangkok dates into today, yesterday, and earlier", () => {
  const groups = groupNotificationInboxItems(
    [
      { createdAt: "2026-10-04T02:00:00.000Z", id: 1 },
      { createdAt: "2026-10-03T12:00:00.000Z", id: 2 },
      { createdAt: "2026-09-30T04:00:00.000Z", id: 3 },
    ],
    new Date("2026-10-04T08:00:00.000Z"),
  );

  assert.deepEqual(
    groups.map((group) => [group.label, group.items.map((item) => item.id)]),
    [
      ["วันนี้", [1]],
      ["เมื่อวาน", [2]],
      ["ก่อนหน้านี้", [3]],
    ],
  );
});

test("notification inbox extracts the related document number from real notification copy", () => {
  assert.equal(
    getNotificationDocumentNumber({
      message: "ใบสั่งซื้อได้รับการอนุมัติโดย ผู้ดูแล ระบบ",
      title: "อนุมัติใบสั่งซื้อ PO26090008",
    }),
    "PO26090008",
  );
  assert.equal(
    getNotificationDocumentNumber({
      message: "รับสินค้า GR26100078 เข้าคลังเรียบร้อยแล้ว",
      title: "รับสินค้าเข้าคลังเรียบร้อยแล้ว",
    }),
    "GR26100078",
  );
  assert.equal(
    getNotificationDocumentNumber({ message: "สรุปรายวัน", title: "สต็อกต่ำ" }),
    null,
  );
  assert.equal(
    getNotificationDocumentNumber({
      message: "คลังวัตถุดิบ",
      title: "ได้รับมอบหมายรอบตรวจนับ SC26100001",
    }),
    "SC26100001",
  );
});

test("notification page uses the shared mobile filters and the bell links to it", async () => {
  const [page, inbox, bell] = await Promise.all([
    readFile("src/app/(dashboard)/notifications/page.tsx", "utf8"),
    readFile("src/app/(dashboard)/notifications/notification-inbox.tsx", "utf8"),
    readFile("src/components/notification-bell.tsx", "utf8"),
  ]);

  assert.match(page, /searchParams: Promise/);
  assert.match(inbox, /MobileListFilters/);
  assert.match(inbox, /PushNotificationControl/);
  assert.match(inbox, /value="stock_count"/);
  assert.match(inbox, /ListDateRangeFilter/);
  assert.match(inbox, /md:hidden/);
  assert.match(inbox, /hidden grid-cols-.*md:grid/);
  assert.match(inbox, /หัวข้อและข้อความ/);
  assert.match(inbox, /เอกสารที่เกี่ยวข้อง/);
  assert.match(inbox, /การดำเนินการ/);
  assert.match(bell, /href="\/notifications"/);
  assert.match(bell, /setView\("unread"\)/);
  assert.match(bell, /notificationTypeIcon/);
  assert.match(bell, /ดูการแจ้งเตือนทั้งหมด/);
});
