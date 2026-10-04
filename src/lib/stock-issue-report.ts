export type StockIssueReportView = "document" | "product" | "department";
export type StockIssueReportStatus = "all" | "posted" | "cancelled";

export type StockIssueReportFilters = {
  view: StockIssueReportView;
  startDate: string;
  endDate: string;
  warehouseId?: number | null;
  departmentId?: number | null;
  status?: StockIssueReportStatus;
  search?: string;
  page: number;
  pageSize: number;
};

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function validateStockIssueReportFilters(filters: Pick<StockIssueReportFilters, "view" | "startDate" | "endDate" | "page" | "pageSize">) {
  return !["document", "product", "department"].includes(filters.view)
    || !validDate(filters.startDate)
    || !validDate(filters.endDate)
    || filters.startDate > filters.endDate
    || !Number.isSafeInteger(filters.page)
    || filters.page < 1
    || ![20, 50, 100, 500].includes(filters.pageSize)
    ? "ตัวกรองรายงานไม่ถูกต้อง"
    : null;
}

export function stockIssueReportExportUrl(filters: Omit<StockIssueReportFilters, "page" | "pageSize">) {
  const params = new URLSearchParams({ view: filters.view, start: filters.startDate, end: filters.endDate });
  if (filters.warehouseId) params.set("warehouse", String(filters.warehouseId));
  if (filters.departmentId) params.set("department", String(filters.departmentId));
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search?.trim()) params.set("q", filters.search.trim());
  return `/reports/inventory/stock-issues/export?${params}`;
}

export function stockIssueReportFileName(view: StockIssueReportView, startDate: string, endDate: string) {
  return `stock-issue-${view}-${startDate}-${endDate}.xlsx`;
}
