import type { Metadata } from "next";
import { getStockCountCreateOptionsAction } from "@/app/actions/stock-counts";
import { StockCountCreatePage } from "../_components/stock-count-create-page";

export const metadata: Metadata = { title: "สร้างรอบตรวจนับ | KRC ERP" };
export default async function NewStockCountPage() {
  const result = await getStockCountCreateOptionsAction();
  return <StockCountCreatePage initialOptions={"data" in result ? result.data : undefined} />;
}
