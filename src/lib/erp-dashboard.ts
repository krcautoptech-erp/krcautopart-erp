export type FulfillmentState =
  "not_received" | "partial" | "received" | "overdue";

export function classifyFulfillment(
  ordered: number,
  received: number,
  deliveryDate: string,
  today: string,
): FulfillmentState {
  if (received >= ordered && ordered > 0) return "received";
  if (deliveryDate < today) return "overdue";
  return received > 0 ? "partial" : "not_received";
}

export function monthKeys(through: Date, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        through.getUTCFullYear(),
        through.getUTCMonth() - (count - index - 1),
        1,
      ),
    );
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function normalizeAsOfDate(value: string | undefined, today: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return today;
  return value > today ? today : value;
}

export function normalizeReportedPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}
