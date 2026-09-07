import type { Metadata } from "next";
import { getItemCatalogAction } from "@/app/actions/items";
import { ItemCatalog } from "./_components/item-catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รายการสินค้า | KRC ERP",
  description: "รายการสินค้ากลางสำหรับงานจัดซื้อ การผลิต และคลังสินค้า",
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    page?: string;
    pageSize?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const initialTypeCode = params.type?.toUpperCase() ?? "ALL";
  const initialPage = Math.max(1, Number(params.page) || 1);
  const initialPageSize = Math.min(200, Math.max(10, Number(params.pageSize) || 50));
  const initialSearch = params.q?.trim() || "";

  const result = await getItemCatalogAction({
    type: initialTypeCode,
    page: initialPage,
    pageSize: initialPageSize,
    search: initialSearch,
  });

  if ("error" in result) {
    return (
      <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {result.error}
      </section>
    );
  }

  return (
    <ItemCatalog
      initialData={result.data}
      initialTypeCode={initialTypeCode}
      initialPage={initialPage}
      initialPageSize={initialPageSize}
      initialSearch={initialSearch}
    />
  );
}
