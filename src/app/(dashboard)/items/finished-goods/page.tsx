import type { ProductRecord } from "@/app/(dashboard)/products/_components/product-catalog";
import { ProductCatalog } from "@/app/(dashboard)/products/_components/product-catalog";
import { createClient } from "@/utils/supabase/server";
import { getItemLookupsAction, getItemMasterTabsAction } from "@/app/actions/items";
import { ItemMasterTabs } from "@/components/item-master-tabs";

export const dynamic = "force-dynamic";

export default async function FinishedGoodsPage() {
  const supabase = await createClient();
  const [itemMasterResult, gradesResult, tabsResult, catalogResult] = await Promise.all([
    supabase
      .from("item_master")
      .select(`
        id,
        item_code,
        item_name,
        item_name_en,
        description,
        unit_id,
        status,
        created_at,
        attributes,
        item_types!inner(type_code),
        unit:raw_material_units(symbol, unit_name)
      `)
      .eq("item_types.type_code", "FG")
      .order("item_code", { ascending: true }),
    supabase
      .from("raw_material_grades")
      .select("id, grade_name, status")
      .order("sort_order", { ascending: true })
      .order("grade_name", { ascending: true }),
    getItemMasterTabsAction(),
    getItemLookupsAction(),
  ]);

  if (itemMasterResult.error) {
    console.error("Error loading finished goods from item_master:", itemMasterResult.error);
  }
  if (gradesResult.error) {
    console.error("Error loading material grades from Supabase:", gradesResult.error);
  }

  const products: ProductRecord[] = (itemMasterResult.data || []).map((row) => {
    const attrs = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>;
    const unitObj = Array.isArray(row.unit) ? row.unit[0] : row.unit;
    const unitLabel = unitObj?.symbol || unitObj?.unit_name || "ชิ้น";
    return {
      id: String(row.id),
      part_number: String(attrs.partNumber ?? row.item_code ?? ""),
      part_name: String(row.item_name ?? ""),
      material: String(attrs.material ?? attrs.gradeName ?? ""),
      plating: String(attrs.plating ?? ""),
      std_no: String(attrs.standard ?? ""),
      sheet_count: attrs.sheetsPerUnit != null ? Number(attrs.sheetsPerUnit) : null,
      parts_per_sheet: attrs.piecesPerSheet != null ? Number(attrs.piecesPerSheet) : null,
      primary_image: attrs.primaryImage ? String(attrs.primaryImage) : null,
      cost_price: Number(attrs.costPrice ?? 0),
      selling_price: Number(attrs.sellingPrice ?? 0),
      unit: unitLabel,
      status: row.status === "inactive" ? "ระงับการใช้งาน" : "ใช้งาน",
      model: attrs.model ? String(attrs.model) : "",
      created_at: String(row.created_at ?? new Date().toISOString()),
      erp_code: String(row.item_code ?? ""),
    };
  });

  const itemTypes = "data" in tabsResult ? tabsResult.data : [];
  const itemCatalogData = "data" in catalogResult ? catalogResult.data : null;

  return (
    <section className="space-y-4">
      <ItemMasterTabs activeType="FG" itemTypes={itemTypes} />
      <ProductCatalog
        products={products}
        materialGrades={gradesResult.data || []}
        itemCatalogData={itemCatalogData}
      />
    </section>
  );
}
