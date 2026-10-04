import type { Metadata } from "next";
import { getStockIssueReportAction } from "@/app/actions/stock-issue-reports";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";
import { StockIssueReport } from "./stock-issue-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รายงานการเบิกจ่ายสินค้า | KRC ERP" };

export default async function StockIssueReportPage() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const startDate = `${today.slice(0, 7)}-01`;
  const [result, documentContext, userResult] = await Promise.all([
    getStockIssueReportAction({ view: "document", startDate, endDate: today, status: "all", page: 1, pageSize: 20 }),
    getCompanyDocumentContext(),
    supabase.auth.getUser(),
  ]);
  if (!result.data) return <section className="p-6"><h1 className="text-xl font-bold">รายงานการเบิกจ่ายสินค้า</h1><p className="mt-4 text-red-600" role="alert">{result.error}</p></section>;
  const printedBy = userResult.data.user?.email?.split("@")[0]?.toUpperCase() || "KRC ERP";
  return <StockIssueReport documentContext={documentContext} initialData={result.data} printedBy={printedBy} today={today} />;
}
