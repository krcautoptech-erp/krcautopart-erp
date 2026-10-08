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

export function normalizeDateRange(
  startInput: string | undefined,
  endInput: string | undefined,
  today: string,
) {
  const end = normalizeAsOfDate(endInput, today);
  let start = startInput;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    start = `${end.slice(0, 7)}-01`;
  } else {
    const parsed = new Date(`${start}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== start
    ) {
      start = `${end.slice(0, 7)}-01`;
    }
  }
  if (start > end) {
    start = end;
  }
  return { startDate: start, endDate: end };
}

export function normalizeReportedPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

export const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function getLastMonthRange(today: string): {
  startDate: string;
  endDate: string;
} {
  const [y, m] = today.split("-").map(Number);
  const lastDayOfPrevMonth = new Date(Date.UTC(y, m - 1, 0));
  const endDate = lastDayOfPrevMonth.toISOString().slice(0, 10);
  const startDate = `${endDate.slice(0, 7)}-01`;
  return { startDate, endDate };
}

export function formatThaiDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "-";
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export function formatThaiRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "-";
  if (startDate === endDate) return formatThaiDate(startDate);
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  if (sy === ey && sm === em) {
    return `${sd} – ${ed} ${THAI_MONTHS_SHORT[em - 1]} ${ey + 543}`;
  }
  if (sy === ey) {
    return `${sd} ${THAI_MONTHS_SHORT[sm - 1]} – ${ed} ${THAI_MONTHS_SHORT[em - 1]} ${ey + 543}`;
  }
  return `${sd} ${THAI_MONTHS_SHORT[sm - 1]} ${sy + 543} – ${ed} ${THAI_MONTHS_SHORT[em - 1]} ${ey + 543}`;
}

export type CalendarMatrixDay = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
};

export function getCalendarMatrix(
  year: number,
  month: number,
): CalendarMatrixDay[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startDayOfWeek = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();

  const cells: CalendarMatrixDay[] = [];

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    const prevDate = new Date(Date.UTC(year, month - 2, prevDay));
    cells.push({
      date: prevDate.toISOString().slice(0, 10),
      day: prevDay,
      isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({
      date: dateStr,
      day,
      isCurrentMonth: true,
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    const nextDate = new Date(Date.UTC(year, month, nextDay));
    cells.push({
      date: nextDate.toISOString().slice(0, 10),
      day: nextDay,
      isCurrentMonth: false,
    });
    nextDay++;
  }

  return cells;
}


