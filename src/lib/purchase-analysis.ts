export type PurchaseAnalysisView = "vendor" | "product";

export type PurchaseAnalysisFilters = {
  view: PurchaseAnalysisView;
  startDate: string;
  endDate: string;
  vendorId?: number | null;
  itemTypeId?: number | null;
  search?: string;
  page: number;
  pageSize: number;
};

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const displayDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export function purchaseAnalysisDeliveryLabel(dates: string[]) {
  const values = [...new Set(dates.filter(validDate))].sort();
  if (!values.length) return "-";
  return values.length === 1 ? displayDate(values[0]) : `${displayDate(values[0])} – ${displayDate(values.at(-1)!)}`;
}

export function uniquePurchaseAnalysisOptions<T extends { id: number }>(options: T[]) {
  const seen = new Set<number>();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export function purchaseAnalysisShareRows<T extends { name: string; total_value: number }>(
  rows: T[],
  limit = 4,
  totalValue?: number,
) {
  const ranked = [...rows]
    .filter((row) => Number.isFinite(row.total_value) && row.total_value > 0)
    .sort((a, b) => b.total_value - a.total_value);
  const visible = ranked.slice(0, Math.max(1, limit)).map((row) => ({ name: row.name, value: row.total_value }));
  const represented = ranked.reduce((sum, row) => sum + row.total_value, 0);
  const hidden = ranked.slice(Math.max(1, limit)).reduce((sum, row) => sum + row.total_value, 0);
  const unrepresented = Math.max(Number(totalValue ?? represented) - represented, 0);
  const other = hidden + unrepresented;
  return other > 0 ? [...visible, { name: "อื่น ๆ", value: other }] : visible;
}

export function validatePurchaseAnalysisFilters(filters: Pick<PurchaseAnalysisFilters, "view" | "startDate" | "endDate" | "page" | "pageSize">) {
  return !["vendor", "product"].includes(filters.view)
    || !validDate(filters.startDate)
    || !validDate(filters.endDate)
    || filters.startDate > filters.endDate
    || !Number.isSafeInteger(filters.page)
    || filters.page < 1
    || ![20, 50, 100, 500].includes(filters.pageSize)
    ? "ตัวกรองรายงานไม่ถูกต้อง"
    : null;
}

export function purchaseAnalysisExportUrl(filters: Omit<PurchaseAnalysisFilters, "page" | "pageSize">) {
  const params = new URLSearchParams({ view: filters.view, start: filters.startDate, end: filters.endDate });
  if (filters.vendorId) params.set("vendor", String(filters.vendorId));
  if (filters.itemTypeId) params.set("group", String(filters.itemTypeId));
  if (filters.search?.trim()) params.set("q", filters.search.trim());
  return `/reports/purchase/purchase-analysis/export?${params}`;
}

export function purchaseAnalysisFileName(view: PurchaseAnalysisView, startDate: string, endDate: string) {
  return `purchase-analysis-${view}-${startDate}-${endDate}.xlsx`;
}
