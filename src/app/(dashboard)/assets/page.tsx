import { Metadata } from "next";
import {
  getAssetCatalogAction,
  getAssetSummaryAction,
  getAssetLookupsAction,
} from "@/app/actions/assets";
import { AssetCatalog } from "./_components/asset-catalog";

export const metadata: Metadata = {
  title: "สินทรัพย์และอุปกรณ์ (Fixed Assets) | KRC ERP",
  description: "ระบบทะเบียนสินทรัพย์ ครุภัณฑ์ และควบคุม Serial Number ประจำองค์กร",
};

export default async function AssetsPage(props: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    departmentId?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams?.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(searchParams?.pageSize) || 25));
  const search = searchParams?.search || "";
  const status = searchParams?.status || "ALL";
  const departmentId = searchParams?.departmentId || "";

  const [catalogRes, summaryRes, lookupsRes] = await Promise.all([
    getAssetCatalogAction({
      page,
      pageSize,
      search,
      status,
      departmentId,
    }),
    getAssetSummaryAction(),
    getAssetLookupsAction(),
  ]);

  const initialItems = catalogRes.success && catalogRes.data ? catalogRes.data.items : [];
  const initialPagination =
    catalogRes.success && catalogRes.data
      ? catalogRes.data.pagination
      : {
          currentPage: page,
          pageSize,
          totalCount: 0,
          totalPages: 1,
        };

  const initialSummary =
    summaryRes.success && summaryRes.data
      ? summaryRes.data
      : {
          totalCount: 0,
          inUseCount: 0,
          inStockCount: 0,
          repairCount: 0,
          disposedCount: 0,
        };

  const lookups =
    lookupsRes.success && lookupsRes.data
      ? lookupsRes.data
      : {
          departments: [],
        };

  return (
    <AssetCatalog
      initialItems={initialItems}
      initialPagination={initialPagination}
      initialSummary={initialSummary}
      lookups={lookups}
    />
  );
}
