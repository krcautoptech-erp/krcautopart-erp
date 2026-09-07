import type { Metadata } from "next";
import { getRawMaterialsAction } from "@/app/actions/raw-materials";
import { RawMaterialManagement } from "@/app/(dashboard)/inventory/materials/_components/raw-material-management";
import { getItemLookupsAction, getItemMasterTabsAction } from "@/app/actions/items";
import { ItemMasterTabs } from "@/components/item-master-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "วัตถุดิบ | KRC ERP",
  description: "จัดการข้อมูลวัตถุดิบหลักสำหรับงานจัดซื้อ คลังสินค้า และการผลิต",
};

export default async function RawMaterialsPage() {
  const [result, tabsResult, catalogResult] = await Promise.all([
    getRawMaterialsAction(),
    getItemMasterTabsAction(),
    getItemLookupsAction(),
  ]);

  if ("error" in result) {
    return (
      <section className="rounded-[10px] border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700">
        {result.error}
      </section>
    );
  }

  const itemTypes = "data" in tabsResult ? tabsResult.data : [];
  const itemCatalogData = "data" in catalogResult ? catalogResult.data : null;

  return (
    <section className="space-y-4">
      <ItemMasterTabs activeType="RM" itemTypes={itemTypes} />
      <RawMaterialManagement
        initialGrades={result.data.grades}
        initialGroups={result.data.groups}
        initialRawMaterials={result.data.rawMaterials}
        initialUnits={result.data.units}
        initialWarehouses={result.data.warehouses}
        itemCatalogData={itemCatalogData}
      />
    </section>
  );
}
