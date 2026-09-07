import type { Metadata } from "next";
import { getItemTypeSettingsAction } from "@/app/actions/items";
import { ItemTypeSettings } from "./_components/item-type-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าประเภทสินค้า | KRC ERP",
  description: "กำหนดประเภทสินค้า รูปแบบฟอร์ม และการควบคุมรายการ",
};

export default async function ItemTypesPage() {
  const result = await getItemTypeSettingsAction();
  if ("error" in result) {
    return <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{result.error}</section>;
  }
  return <ItemTypeSettings canDelete={result.data.canDelete} canManage={result.data.canManage} initialTypes={result.data.types} />;
}
