import type { Metadata } from "next";
import { getGoodsReceiptsAction, getPendingPurchaseOrdersForReceiptAction } from "@/app/actions/inventory";
import { getWarehousesAction } from "@/app/actions/warehouses";
import { ReceiptListPage } from "./_components/receipt-list-page";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รับสินค้า | KRC ERP",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const query = firstValue(params.q).trim().slice(0, 100);
  const startDate = firstValue(params.start) || toIsoDate(monthStart);
  const endDate = firstValue(params.end) || toIsoDate(today);

  // Load goods receipts, pending POs, warehouses and company context
  const [grResult, pendingPoResult, warehousesResult, documentContext] = await Promise.all([
    getGoodsReceiptsAction({ search: query, startDate, endDate }),
    getPendingPurchaseOrdersForReceiptAction(),
    getWarehousesAction(),
    getCompanyDocumentContext(),
  ]);

  if ("error" in grResult) {
    console.error("Unable to load goods receipts:", grResult.error);
  }
  if ("error" in pendingPoResult) {
    console.error("Unable to load pending POs:", pendingPoResult.error);
  }
  if ("error" in warehousesResult) {
    console.error("Unable to load warehouses:", warehousesResult.error);
  }

  const goodsReceipts = "data" in grResult ? grResult.data : [];
  const pendingPOs = "data" in pendingPoResult ? pendingPoResult.data : [];
  const warehouses = "data" in warehousesResult ? warehousesResult.data : [];

  return (
    <ReceiptListPage
      initialGoodsReceipts={goodsReceipts}
      pendingPOs={pendingPOs}
      warehouses={warehouses}
      documentContext={documentContext}
      filters={{
        query,
        startDate,
        endDate,
      }}
    />
  );
}
