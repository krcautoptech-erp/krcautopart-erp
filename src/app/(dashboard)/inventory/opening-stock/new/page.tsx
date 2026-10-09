import { randomUUID } from "node:crypto";
import { getOpeningStockOptionsAction } from "@/app/actions/opening-stock";
import { OpeningStockEditor } from "../_components/opening-stock-editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "นำเข้าสต็อกตั้งต้น | KRC ERP" };
export default async function Page() {
  const options = await getOpeningStockOptionsAction();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  return <OpeningStockEditor options={options.data ?? { warehouses: [], items: [] }} error={options.error} migrationRequired={Boolean(options.migrationRequired)} requestKey={randomUUID()} today={today} />;
}
