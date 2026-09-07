import type { Metadata } from "next";
import { getWarehouseSettingsAction } from "@/app/actions/warehouses";
import { WarehouseManagement } from "./_components/warehouse-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ข้อมูลคลัง | KRC ERP",
  description: "ข้อมูลกลางสำหรับรับสินค้า จัดเก็บ และควบคุมสต็อก",
};

export default async function WarehouseSettingsPage() {
  const result = await getWarehouseSettingsAction();
  if ("error" in result) {
    return <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700">{result.error}</section>;
  }
  return <WarehouseManagement initialData={result.data} />;
}
