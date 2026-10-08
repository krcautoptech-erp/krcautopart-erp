import type { AppNotification } from "@/lib/notifications";

export const NOTIFICATION_PAGE_SIZE = 25;

export const NOTIFICATION_TYPES = [
  "all",
  "purchase_requisition",
  "purchase_order",
  "goods_receipt",
  "stock_count",
] as const;

export type NotificationInboxType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationInboxStatus = "all" | "read" | "unread";

export type NotificationInboxFilters = {
  endDate: string;
  page: number;
  q: string;
  startDate: string;
  status: NotificationInboxStatus;
  type: NotificationInboxType;
};

type SearchParameters = Record<
  string,
  string | string[] | undefined
>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function parseNotificationInboxFilters(
  parameters: SearchParameters,
): NotificationInboxFilters {
  const parsedPage = Number(first(parameters.page));
  const requestedStatus = first(parameters.status);
  const requestedType = first(parameters.type);

  return {
    endDate: isDate(first(parameters.endDate)) ? first(parameters.endDate)! : "",
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    q: (first(parameters.q) ?? "").trim().slice(0, 120),
    startDate: isDate(first(parameters.startDate))
      ? first(parameters.startDate)!
      : "",
    status:
      requestedStatus === "read" || requestedStatus === "unread"
        ? requestedStatus
        : "all",
    type: NOTIFICATION_TYPES.includes(
      requestedType as NotificationInboxType,
    )
      ? (requestedType as NotificationInboxType)
      : "all",
  };
}

export function buildNotificationInboxHref(
  filters: NotificationInboxFilters,
  page: number,
) {
  const parameters = new URLSearchParams();
  if (filters.q) parameters.set("q", filters.q);
  if (filters.status !== "all") parameters.set("status", filters.status);
  if (filters.type !== "all") parameters.set("type", filters.type);
  if (filters.startDate) parameters.set("startDate", filters.startDate);
  if (filters.endDate) parameters.set("endDate", filters.endDate);
  if (page > 1) parameters.set("page", String(page));
  const query = parameters.toString();
  return query ? `/notifications?${query}` : "/notifications";
}

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}

export function groupNotificationInboxItems<
  T extends Pick<AppNotification, "createdAt" | "id">,
>(items: T[], now: Date) {
  const today = dateKey(now);
  const yesterday = previousDateKey(today);
  const groups: Array<{ key: string; label: string; items: T[] }> = [
    { key: "today", label: "วันนี้", items: [] },
    { key: "yesterday", label: "เมื่อวาน", items: [] },
    { key: "earlier", label: "ก่อนหน้านี้", items: [] },
  ];

  for (const item of items) {
    const key = dateKey(new Date(item.createdAt));
    const target = key === today ? groups[0] : key === yesterday ? groups[1] : groups[2];
    target.items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
}

export function notificationTypeLabel(type: AppNotification["type"]) {
  switch (type) {
    case "purchase_requisition":
      return "ใบขอซื้อ";
    case "purchase_order":
      return "ใบสั่งซื้อ";
    case "goods_receipt":
      return "รับสินค้า";
    case "stock_count":
      return "ตรวจนับสต็อก";
  }
}

export function notificationTypeIcon(type: AppNotification["type"]) {
  switch (type) {
    case "purchase_requisition":
      return "assignment";
    case "purchase_order":
      return "receipt_long";
    case "goods_receipt":
      return "local_shipping";
    case "stock_count":
      return "fact_check";
  }
}

export function getNotificationDocumentNumber(notification: {
  message: string;
  title: string;
}) {
  const match = `${notification.title} ${notification.message}`.match(
    /\b(?:PR|PO|GR|SC)\d{6,}\b/i,
  );
  return match?.[0].toUpperCase() ?? null;
}

export function notificationSearchTerm(value: string) {
  return value.replace(/[(),.%_]/g, " ").replace(/\s+/g, " ").trim();
}

export type NotificationStatusCategory =
  | "approved"
  | "rejected"
  | "revision"
  | "submitted"
  | "completed"
  | "assigned"
  | "info";

export type NotificationVisualMeta = {
  badgeClass: string;
  badgeLabel: string;
  category: NotificationStatusCategory;
  displayTitle: string;
  iconBgClass: string;
  iconName: string;
};

export function getNotificationVisualMeta(notification: {
  message: string;
  title: string;
  type?: AppNotification["type"];
}): NotificationVisualMeta {
  const combined = `${notification.title} ${notification.message}`;
  let title = notification.title.trim();

  // 1. Revision / Send back
  if (/ส่งกลับ|แก้ไข|ส่งกลับแก้ไข/i.test(combined)) {
    return {
      badgeClass:
        "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30",
      badgeLabel: "ส่งกลับแก้ไข",
      category: "revision",
      displayTitle: title,
      iconBgClass:
        "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30",
      iconName: "edit_note",
    };
  }

  // 2. Rejected / Cancelled
  if (/ปฏิเสธ|ไม่อนุมัติ|ยกเลิก/i.test(combined)) {
    const isCancelled = /ยกเลิก/i.test(combined);
    return {
      badgeClass:
        "bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30",
      badgeLabel: isCancelled ? "ยกเลิก" : "ปฏิเสธ",
      category: "rejected",
      displayTitle: title,
      iconBgClass:
        "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30",
      iconName: "cancel",
    };
  }

  // 3. Approved
  if (/อนุมัติ|พร้อมออก PO|ผ่านการอนุมัติ/i.test(combined)) {
    const isReadyForPo = /พร้อมออก PO/i.test(notification.title);
    return {
      badgeClass:
        "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30",
      badgeLabel: isReadyForPo ? "พร้อมออก PO" : "อนุมัติแล้ว",
      category: "approved",
      displayTitle: title,
      iconBgClass:
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30",
      iconName: "check_circle",
    };
  }

  // 4. Goods Receipt / Completed
  if (
    notification.type === "goods_receipt" ||
    /รับสินค้าเข้าคลัง|รับสินค้า/i.test(combined)
  ) {
    return {
      badgeClass:
        "bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/30",
      badgeLabel: "รับเข้าคลัง",
      category: "completed",
      displayTitle: title,
      iconBgClass:
        "bg-teal-500/15 text-teal-600 dark:text-teal-400 ring-1 ring-teal-500/30",
      iconName: "local_shipping",
    };
  }

  // 5. Stock count assigned
  if (/มอบหมาย|รอบตรวจนับ/i.test(combined)) {
    return {
      badgeClass:
        "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30",
      badgeLabel: "มอบหมายงาน",
      category: "assigned",
      displayTitle: title,
      iconBgClass:
        "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/30",
      iconName: "assignment_ind",
    };
  }

  // 6. Submitted / Pending Review (new document created)
  if (
    /สร้างโดย|รออนุมัติ|รอฝ่ายจัดซื้อตรวจสอบ|รอตรวจสอบ/i.test(combined) ||
    /^(?:ใบขอซื้อ|ใบสั่งซื้อ)\s*(?:PR|PO)/i.test(title)
  ) {
    if (/^ใบขอซื้อ\s+PR/i.test(title)) {
      title = title.replace(/^ใบขอซื้อ\s+/i, "สร้างใบขอซื้อ ");
    } else if (/^ใบสั่งซื้อ\s+PO/i.test(title)) {
      title = title.replace(/^ใบสั่งซื้อ\s+/i, "สร้างใบสั่งซื้อ ");
    }
    return {
      badgeClass:
        "bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30",
      badgeLabel: "รอตรวจสอบ",
      category: "submitted",
      displayTitle: title,
      iconBgClass:
        "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30",
      iconName: "pending_actions",
    };
  }

  // Default fallback
  return {
    badgeClass:
      "bg-slate-500/15 text-slate-800 dark:text-slate-300 border border-slate-500/30",
    badgeLabel: "แจ้งเตือน",
    category: "info",
    displayTitle: title,
    iconBgClass:
      "bg-slate-500/15 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/30",
    iconName: notificationTypeIcon(notification.type ?? "purchase_order"),
  };
}
