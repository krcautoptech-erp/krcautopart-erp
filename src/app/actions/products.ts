"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type ProductMutationInput = {
  part_number: string;
  part_name: string;
  material: string;
  plating: string;
  std_no: string;
  sheet_count: number | null;
  parts_per_sheet: number | null;
  primary_image: string | null;
  cost_price: number;
  selling_price: number;
  unit: string;
  status: string;
  model: string;
  erp_code: string;
};

export type ProductImportInput = Omit<ProductMutationInput, "primary_image"> & {
  primary_image?: string | null;
};

type ActionResult<T> = { success: true; data: T } | { error: string };
export type BulkImportProductsResult =
  | {
      success: boolean;
      createdCount: number;
      updatedCount: number;
      errors: string[];
      skippedCount: number;
    }
  | { error: string };

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeProductPayload(product: ProductMutationInput | ProductImportInput) {
  return {
    part_number: normalizeText(product.part_number),
    part_name: normalizeText(product.part_name),
    material: normalizeText(product.material),
    plating: normalizeText(product.plating),
    std_no: normalizeText(product.std_no),
    sheet_count: normalizeNullableNumber(product.sheet_count),
    parts_per_sheet: normalizeNullableNumber(product.parts_per_sheet),
    primary_image: product.primary_image ?? null,
    cost_price: normalizeNumber(product.cost_price),
    selling_price: normalizeNumber(product.selling_price),
    unit: normalizeText(product.unit) || "ชิ้น",
    status: normalizeText(product.status) || "ใช้งาน",
    model: normalizeText(product.model),
    erp_code: normalizeText(product.erp_code),
  };
}

async function resolveFgTypeId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number | null> {
  const { data } = await supabase
    .from("item_types")
    .select("id")
    .eq("type_code", "FG")
    .maybeSingle();
  if (data?.id) return Number(data.id);
  const { data: fallback } = await supabase
    .from("item_types")
    .select("id")
    .eq("form_template", "finished_good")
    .maybeSingle();
  return fallback?.id ? Number(fallback.id) : null;
}

async function resolveUnitId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitLabel: string,
): Promise<number | null> {
  const text = unitLabel.trim();
  const { data } = await supabase
    .from("raw_material_units")
    .select("id, unit_name, symbol")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  
  if (text) {
    const match = (data ?? []).find(
      (u) => u.symbol === text || u.unit_name === text || `${u.unit_name} (${u.symbol})` === text,
    );
    if (match) return Number(match.id);
  }
  return data?.[0]?.id ? Number(data[0].id) : null;
}

export async function createProductAction(product: ProductMutationInput): Promise<ActionResult<unknown>> {
  try {
    const supabase = await createClient();
    const payload = normalizeProductPayload(product);
    const fgTypeId = await resolveFgTypeId(supabase);
    if (!fgTypeId) return { error: "ไม่พบประเภทสินค้าสำเร็จรูป (FG)" };

    const unitId = await resolveUnitId(supabase, payload.unit);
    if (!unitId) return { error: "ไม่พบหน่วยนับสินค้าที่เลือก" };

    const itemCode = payload.erp_code || payload.part_number;
    if (!itemCode) return { error: "กรุณาระบุรหัสสินค้าหรือ Part Number" };

    const itemPayload = {
      item_type_id: fgTypeId,
      item_code: itemCode,
      item_name: payload.part_name,
      item_name_en: null,
      description: null,
      unit_id: unitId,
      tracking_method: "none",
      reorder_point: null,
      status: payload.status === "inactive" || payload.status === "ระงับการใช้งาน" ? "inactive" : "active",
      attributes: {
        legacySource: "product",
        partNumber: payload.part_number,
        model: payload.model,
        material: payload.material,
        gradeName: payload.material,
        standard: payload.std_no,
        plating: payload.plating,
        sheetsPerUnit: payload.sheet_count,
        piecesPerSheet: payload.parts_per_sheet,
        primaryImage: payload.primary_image,
        costPrice: payload.cost_price,
        sellingPrice: payload.selling_price,
      },
    };

    const { data, error } = await supabase
      .from("item_master")
      .insert(itemPayload)
      .select()
      .single();

    if (error) {
      console.error("Error creating product in item_master:", error);
      return { error: error.message };
    }

    revalidatePath("/items/finished-goods");
    revalidatePath("/items");
    return { success: true, data };
  } catch (error) {
    console.error("Server Action Exception:", error);
    return { error: "เกิดข้อผิดพลาดในการสร้างสินค้า" };
  }
}

export async function updateProductAction(
  id: string,
  product: ProductMutationInput,
): Promise<ActionResult<unknown>> {
  try {
    const supabase = await createClient();
    const payload = normalizeProductPayload(product);
    const fgTypeId = await resolveFgTypeId(supabase);
    const unitId = await resolveUnitId(supabase, payload.unit);
    const itemCode = payload.erp_code || payload.part_number;

    const attributes = {
      legacySource: "product",
      legacySourceId: id,
      partNumber: payload.part_number,
      model: payload.model,
      material: payload.material,
      gradeName: payload.material,
      standard: payload.std_no,
      plating: payload.plating,
      sheetsPerUnit: payload.sheet_count,
      piecesPerSheet: payload.parts_per_sheet,
      primaryImage: payload.primary_image,
      costPrice: payload.cost_price,
      sellingPrice: payload.selling_price,
    };

    const updatePayload: Record<string, unknown> = {
      item_code: itemCode,
      item_name: payload.part_name,
      status: payload.status === "inactive" || payload.status === "ระงับการใช้งาน" ? "inactive" : "active",
      attributes,
      updated_at: new Date().toISOString(),
    };
    if (unitId) updatePayload.unit_id = unitId;
    if (fgTypeId) updatePayload.item_type_id = fgTypeId;

    const isNumericId = /^\d+$/.test(id.trim());
    let query = supabase.from("item_master").update(updatePayload);
    if (isNumericId) {
      query = query.eq("id", Number(id));
    } else {
      query = query.eq("attributes->>legacySourceId", id);
    }

    const { data, error } = await query.select().maybeSingle();

    if (error) {
      console.error("Error updating product in item_master:", error);
      return { error: error.message };
    }

    revalidatePath("/items/finished-goods");
    revalidatePath("/items");
    return { success: true, data };
  } catch (error) {
    console.error("Server Action Exception:", error);
    return { error: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลสินค้า" };
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const isNumericId = /^\d+$/.test(id.trim());
    let itemMasterId: number | null = null;

    if (isNumericId) {
      itemMasterId = Number(id);
    } else {
      const { data: item } = await supabase
        .from("item_master")
        .select("id")
        .eq("attributes->>legacySourceId", id)
        .maybeSingle();
      if (item) {
        itemMasterId = item.id;
      }
    }

    if (itemMasterId) {
      const [poUsage, prUsage, grUsage, lotUsage, txUsage, prodTxUsage] = await Promise.all([
        supabase.from("purchase_order_items").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
        supabase.from("purchase_requisition_items").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
        supabase.from("goods_receipt_items").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
        supabase.from("inventory_lots").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
        supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
        supabase.from("product_transactions").select("id", { count: "exact", head: true }).eq("item_master_id", itemMasterId),
      ]);

      if (
        (poUsage.count ?? 0) > 0 ||
        (prUsage.count ?? 0) > 0 ||
        (grUsage.count ?? 0) > 0 ||
        (lotUsage.count ?? 0) > 0 ||
        (txUsage.count ?? 0) > 0 ||
        (prodTxUsage.count ?? 0) > 0
      ) {
        return {
          error: "ไม่สามารถลบสินค้านี้ได้เนื่องจากมีประวัติเอกสารหรือการเคลื่อนไหวสต็อกแล้ว ตามหลัก ERP แนะนำให้ปรับสถานะเป็น 'ระงับการใช้งาน' แทนเพื่อรักษาความถูกต้องของข้อมูล",
        };
      }
    }

    let query = supabase.from("item_master").delete();
    if (isNumericId) {
      query = query.eq("id", Number(id));
    } else {
      query = query.eq("attributes->>legacySourceId", id);
    }

    const { error } = await query;

    if (error) {
      console.error("Error deleting product from item_master:", error);
      return { error: error.message };
    }

    revalidatePath("/items/finished-goods");
    revalidatePath("/items");
    return { success: true, data: null };
  } catch (error) {
    console.error("Server Action Exception:", error);
    return { error: "เกิดข้อผิดพลาดในการลบสินค้า" };
  }
}

export async function bulkImportProductsAction(
  rows: ProductImportInput[],
): Promise<BulkImportProductsResult> {
  if (rows.length === 0) {
    return { error: "ไม่พบข้อมูลสินค้าสำหรับนำเข้า" };
  }

  try {
    const supabase = await createClient();
    const fgTypeId = await resolveFgTypeId(supabase);
    if (!fgTypeId) return { error: "ไม่พบประเภทสินค้าสำเร็จรูป (FG)" };

    const normalizedRows = rows
      .map(normalizeProductPayload)
      .filter((row) => row.part_number && row.part_name);

    if (normalizedRows.length === 0) {
      return { error: "ไม่พบแถวที่มี Part Number และชื่อชิ้นงานครบถ้วน" };
    }

    const partCodes = Array.from(new Set(normalizedRows.map((row) => row.erp_code || row.part_number)));
    const { data: existingItems, error: existingError } = await supabase
      .from("item_master")
      .select("id, item_code")
      .eq("item_type_id", fgTypeId)
      .in("item_code", partCodes);

    if (existingError) {
      console.error("Error loading existing products from item_master:", existingError);
      return { error: existingError.message };
    }

    const existingByCode = new Map(
      (existingItems ?? []).map((item) => [item.item_code.toUpperCase(), item.id]),
    );

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (const row of normalizedRows) {
      const itemCode = row.erp_code || row.part_number;
      const unitId = await resolveUnitId(supabase, row.unit);
      const existingId = existingByCode.get(itemCode.toUpperCase());

      const attributes = {
        legacySource: "product",
        partNumber: row.part_number,
        model: row.model,
        material: row.material,
        gradeName: row.material,
        standard: row.std_no,
        plating: row.plating,
        sheetsPerUnit: row.sheet_count,
        piecesPerSheet: row.parts_per_sheet,
        costPrice: row.cost_price,
        sellingPrice: row.selling_price,
      };

      if (existingId) {
        const { error: updateError } = await supabase
          .from("item_master")
          .update({
            item_name: row.part_name,
            unit_id: unitId,
            status: row.status === "inactive" || row.status === "ระงับการใช้งาน" ? "inactive" : "active",
            attributes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingId);

        if (updateError) {
          errors.push(`${row.part_number}: ${updateError.message}`);
        } else {
          updatedCount += 1;
        }
      } else {
        const { error: insertError } = await supabase.from("item_master").insert({
          item_type_id: fgTypeId,
          item_code: itemCode,
          item_name: row.part_name,
          unit_id: unitId,
          tracking_method: "none",
          status: row.status === "inactive" || row.status === "ระงับการใช้งาน" ? "inactive" : "active",
          attributes,
        });

        if (insertError) {
          errors.push(`${row.part_number}: ${insertError.message}`);
        } else {
          createdCount += 1;
        }
      }
    }

    if (createdCount > 0 || updatedCount > 0) {
      revalidatePath("/items/finished-goods");
      revalidatePath("/items");
    }

    return {
      success: errors.length === 0,
      createdCount,
      updatedCount,
      errors,
      skippedCount: rows.length - normalizedRows.length,
    };
  } catch (error) {
    console.error("Server Action Exception:", error);
    return { error: "เกิดข้อผิดพลาดในการนำเข้าข้อมูลสินค้า" };
  }
}
