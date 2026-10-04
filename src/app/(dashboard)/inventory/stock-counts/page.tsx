import type { Metadata } from "next";
import { getStockCountsAction } from "@/app/actions/stock-counts";
import { StockCountListPage } from "./_components/stock-count-list-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตรวจนับสต็อกจริง | KRC ERP" };

export default async function StockCountsPage() {
  const result = await getStockCountsAction();
  return <StockCountListPage initialRows={"data" in result ? result.data ?? [] : []} />;
}
