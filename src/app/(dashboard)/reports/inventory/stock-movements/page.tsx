import type { Metadata } from "next";
import { getStockMovementReportAction } from "@/app/actions/stock-reports";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";
import { StockMovementReport } from "./stock-movement-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รายงานความเคลื่อนไหวสต็อก | KRC ERP" };

export default async function StockMovementsPage() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const startDate = `${today.slice(0, 7)}-01`;
  const [result, documentContext, userResult] = await Promise.all([
    getStockMovementReportAction({ view: "summary", startDate, endDate: today, page: 1, pageSize: 20 }),
    getCompanyDocumentContext(),
    supabase.auth.getUser(),
  ]);

  if (!result.data) {
    return (
      <section className="p-6">
        <h1 className="text-xl font-bold">รายงานความเคลื่อนไหวสต็อก</h1>
        <p role="alert" className="mt-4 text-red-600">{result.error}</p>
      </section>
    );
  }

  const printedBy = userResult.data.user?.email?.split("@")[0]?.toUpperCase() || "KRC ERP";
  return (
    <StockMovementReport
      documentContext={documentContext}
      initialData={result.data}
      printedBy={printedBy}
      today={today}
    />
  );
}
