import type { Metadata } from "next";
import { getStockIssuesAction } from "@/app/actions/stock-issues";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { StockIssuePageClient } from "./_components/stock-issue-page-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ใบเบิกใช้สินค้า | KRC ERP" };

export default async function StockIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [result, documentContext] = await Promise.all([
    getStockIssuesAction(query),
    getCompanyDocumentContext(),
  ]);

  return (
    <StockIssuePageClient
      documentContext={documentContext}
      initialIssues={"data" in result ? result.data ?? [] : []}
      initialQuery={query}
    />
  );
}
