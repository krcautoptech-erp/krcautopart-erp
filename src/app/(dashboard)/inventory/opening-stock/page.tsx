import { getOpeningStockBatchesAction, getOpeningStockOptionsAction } from "@/app/actions/opening-stock";
import { OpeningStockRegister } from "./_components/opening-stock-register";
export const dynamic = "force-dynamic";
export const metadata = { title: "สต็อกตั้งต้น | KRC ERP" };
export default async function Page() {
  const [batches, options] = await Promise.all([getOpeningStockBatchesAction(), getOpeningStockOptionsAction()]);
  return <OpeningStockRegister batches={batches.data ?? []} options={options.data ?? { warehouses: [], items: [] }} error={batches.error ?? options.error} migrationRequired={Boolean(options.migrationRequired)} />;
}
