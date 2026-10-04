import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStockCountDetailAction } from "@/app/actions/stock-counts";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { StockCountWorkspace } from "../_components/stock-count-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "เอกสารตรวจนับสต็อก | KRC ERP" };
export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [result, documentContext] = await Promise.all([
    getStockCountDetailAction(id),
    getCompanyDocumentContext(),
  ]);
  if (!("data" in result) || !result.data) notFound();
  return <StockCountWorkspace documentContext={documentContext} initialDetail={result.data} />;
}
