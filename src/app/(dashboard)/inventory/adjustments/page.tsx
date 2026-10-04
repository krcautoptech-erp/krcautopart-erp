import type { Metadata } from "next";
import { getStockAdjustmentsAction } from "@/app/actions/stock-adjustments";
import { StockAdjustmentPageClient } from "./_components/stock-adjustment-page-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ปรับปรุงสต็อก | KRC ERP" };

export default async function StockAdjustmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const result = await getStockAdjustmentsAction(query);
  return <StockAdjustmentPageClient initialRows={"data" in result ? result.data ?? [] : []} initialQuery={query} />;
}
