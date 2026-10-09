import { getOpeningStockOptionsAction, getOpeningStockDetailAction } from "@/app/actions/opening-stock";
import { OpeningStockEditor } from "../_components/opening-stock-editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "เอกสารสต็อกตั้งต้น | KRC ERP" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [options, result] = await Promise.all([getOpeningStockOptionsAction(), getOpeningStockDetailAction(Number(id))]);
  if (!result.data) return <p role="alert" className="p-5">{result.error}</p>;
  return <OpeningStockEditor key={`${id}:${result.data.revision}`} canEdit={result.canEdit} batch={result.data} events={result.events} options={options.data ?? { warehouses: [], items: [] }} error={options.error} migrationRequired={Boolean(options.migrationRequired)} requestKey={result.data.request_key} today={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())} />;
}
