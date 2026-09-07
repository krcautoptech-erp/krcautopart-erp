import type { Metadata } from "next";
import {
  getCentralInventoryOptionsAction,
  getCentralInventoryStockAction,
} from "@/app/actions/inventory";
import { StockDashboardPage } from "./_components/stock-dashboard-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "สต็อกกลาง | KRC ERP" };

export default async function StockPage() {
  const [stockResult, optionsResult] = await Promise.all([
    getCentralInventoryStockAction(),
    getCentralInventoryOptionsAction(),
  ]);

  if ("error" in stockResult) console.error("Unable to load central inventory:", stockResult.error);
  if ("error" in optionsResult) console.error("Unable to load stock filters:", optionsResult.error);

  return (
    <StockDashboardPage
      initialRows={"data" in stockResult ? stockResult.data : []}
      initialSummary={"summary" in stockResult ? stockResult.summary : undefined}
      initialTotal={"total" in stockResult ? stockResult.total : 0}
      itemTypes={"itemTypes" in optionsResult ? optionsResult.itemTypes : []}
      warehouses={"warehouses" in optionsResult ? optionsResult.warehouses : []}
    />
  );
}
