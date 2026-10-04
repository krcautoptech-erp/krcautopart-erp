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
