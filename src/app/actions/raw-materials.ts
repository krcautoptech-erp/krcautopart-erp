"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type RawMaterialLookup = {
  id: number;
  code: string;
  name: string;
  status: "active" | "inactive";
};

export type RawMaterialUnitLookup = RawMaterialLookup & {
  allows_decimal: boolean;
  symbol: string;
};

export type RawMaterialRecord = {
  id: number;
  material_code: string;
  material_name: string;
  group_id: number;
  grade_id: number;
  thickness_mm: number;
  width_mm: number;
  length_mm: number;
  unit_id: number;
  reorder_point: number | null;
  warehouse_id: number;
  remark: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  group: RawMaterialLookup;
  grade: RawMaterialLookup;
  unit: RawMaterialUnitLookup;
  warehouse: RawMaterialLookup;
};

export type RawMaterialInput = {
  material_code: string;
  material_name: string;
  group_id: number;
  grade_id: number;
  thickness_mm: number;
  width_mm: number;
  length_mm: number;
  unit_id: number;
  reorder_point: number | null;
  warehouse_id: number;
  remark: string | null;
  status: "active" | "inactive";
};

const DIMENSION_UNIT_CODES = new Set(["MM", "MILLIMETER"]);

function isStockUnit(code: string) {
  return !DIMENSION_UNIT_CODES.has(code.trim().toUpperCase());
}

async function validateStockUnit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: number,
) {
  const { data, error } = await supabase
    .from("raw_material_units")
    .select("unit_code, status")
    .eq("id", unitId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data || data.status !== "active" || !isStockUnit(String(data.unit_code))) {
    return { error: "กรุณาเลือกหน่วยนับสต็อก เช่น แผ่น ม้วน ชิ้น หรือกิโลกรัม" };
  }

  return { success: true as const };
}

async function resolveRmTypeId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number | null> {
  const { data } = await supabase
    .from("item_types")
    .select("id")
    .eq("type_code", "RM")
    .maybeSingle();
  if (data?.id) return Number(data.id);
  const { data: fallback } = await supabase
    .from("item_types")
    .select("id")
    .eq("form_template", "raw_material")
    .maybeSingle();
  return fallback?.id ? Number(fallback.id) : null;
}

export async function reserveRawMaterialCodeAction() {
  try {
    const supabase = await createClient();
    const rmTypeId = await resolveRmTypeId(supabase);
    if (rmTypeId) {
      const { data, error } = await supabase.rpc("reserve_item_code", { p_item_type_id: rmTypeId });
      if (!error && typeof data === "string" && data.trim()) {
        return { success: true as const, data };
      }
    }
    const { data, error } = await supabase.rpc("reserve_raw_material_code");

    if (error) return { error: error.message };
    if (typeof data !== "string" || !/^RM\d{3,}$/.test(data)) {
      return { error: "ไม่สามารถสร้างรหัสวัตถุดิบได้" };
    }

    return { success: true as const, data };
  } catch (error) {
    console.error("reserveRawMaterialCodeAction error:", error);
    return { error: "ไม่สามารถสร้างรหัสวัตถุดิบได้" };
  }
}

function normalizeLookupRows<T extends { id: number; status: "active" | "inactive" }>(
  rows: T[],
  codeKey: keyof T,
  nameKey: keyof T,
): RawMaterialLookup[] {
  return rows.map((row) => ({
    id: row.id,
    code: String(row[codeKey]),
    name: String(row[nameKey]),
    status: row.status,
  }));
}

export async function getRawMaterialsAction() {
  try {
    const supabase = await createClient();

    const [itemMasterResult, groupsResult, gradesResult, unitsResult, warehousesResult] =
      await Promise.all([
        supabase
          .from("item_master")
          .select(`
            id,
            item_code,
            item_name,
            item_name_en,
            description,
            unit_id,
            reorder_point,
            status,
            attributes,
            created_at,
            updated_at,
            item_types!inner(type_code),
            unit:raw_material_units(id, unit_code, unit_name, symbol, allows_decimal, status)
          `)
          .eq("item_types.type_code", "RM")
          .order("item_code", { ascending: true }),
        supabase
          .from("raw_material_groups")
          .select("id, group_code, group_name, status")
          .order("sort_order", { ascending: true })
          .order("group_name", { ascending: true }),
        supabase
          .from("raw_material_grades")
          .select("id, grade_code, grade_name, status")
          .order("sort_order", { ascending: true })
          .order("grade_name", { ascending: true }),
        supabase
          .from("raw_material_units")
          .select("id, unit_code, unit_name, symbol, allows_decimal, status")
          .eq("status", "active")
          .not("unit_code", "in", '("MM","MILLIMETER")')
          .order("sort_order", { ascending: true })
          .order("unit_name", { ascending: true }),
        supabase
          .from("raw_material_warehouses")
          .select("id, warehouse_code, warehouse_name, status")
          .order("sort_order", { ascending: true })
          .order("warehouse_name", { ascending: true }),
      ]);

    if (itemMasterResult.error) return { error: itemMasterResult.error.message };
    if (groupsResult.error) return { error: groupsResult.error.message };
    if (gradesResult.error) return { error: gradesResult.error.message };
    if (unitsResult.error) return { error: unitsResult.error.message };
    if (warehousesResult.error) return { error: warehousesResult.error.message };

    const groupMap = new Map((groupsResult.data ?? []).map((g) => [Number(g.id), g]));
    const gradeMap = new Map((gradesResult.data ?? []).map((g) => [Number(g.id), g]));
    const warehouseMap = new Map((warehousesResult.data ?? []).map((w) => [Number(w.id), w]));

    const rawMaterials: RawMaterialRecord[] = (itemMasterResult.data ?? []).map((row) => {
      const attrs = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>;
      const groupId = Number(attrs.groupId ?? 0);
      const gradeId = Number(attrs.gradeId ?? 0);
      const warehouseId = Number(attrs.warehouseId ?? 0);
      const g = groupMap.get(groupId);
      const gr = gradeMap.get(gradeId);
      const wh = warehouseMap.get(warehouseId);
      const unitObj = Array.isArray(row.unit) ? row.unit[0] : row.unit;

      return {
        id: Number(row.id),
        material_code: String(row.item_code ?? ""),
        material_name: String(row.item_name ?? ""),
        group_id: groupId,
        grade_id: gradeId,
        thickness_mm: Number(attrs.thickness ?? 0),
        width_mm: Number(attrs.width ?? 0),
        length_mm: Number(attrs.length ?? 0),
        unit_id: Number(row.unit_id ?? unitObj?.id ?? 0),
        reorder_point: row.reorder_point != null ? Number(row.reorder_point) : null,
        warehouse_id: warehouseId,
        remark: row.description ? String(row.description) : null,
        status: row.status === "inactive" ? "inactive" : "active",
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? ""),
        group: {
          id: g?.id ?? 0,
          code: String(g?.group_code ?? ""),
          name: String(g?.group_name ?? "-"),
          status: (g?.status ?? "inactive") as "active" | "inactive",
        },
        grade: {
          id: gr?.id ?? 0,
          code: String(gr?.grade_code ?? ""),
          name: String(gr?.grade_name ?? "-"),
          status: (gr?.status ?? "inactive") as "active" | "inactive",
        },
        unit: {
          id: Number(unitObj?.id ?? 0),
          code: String(unitObj?.unit_code ?? ""),
          name: String(unitObj?.unit_name ?? ""),
          symbol: String(unitObj?.symbol ?? ""),
          allows_decimal: Boolean(unitObj?.allows_decimal),
          status: (unitObj?.status ?? "inactive") as "active" | "inactive",
        },
        warehouse: {
          id: wh?.id ?? 0,
          code: String(wh?.warehouse_code ?? ""),
          name: String(wh?.warehouse_name ?? "-"),
          status: (wh?.status ?? "inactive") as "active" | "inactive",
        },
      };
    });

    return {
      success: true as const,
      data: {
        grades: normalizeLookupRows(gradesResult.data ?? [], "grade_code", "grade_name"),
        groups: normalizeLookupRows(groupsResult.data ?? [], "group_code", "group_name"),
        rawMaterials,
        units: (unitsResult.data ?? []).map((row) => ({
          allows_decimal: Boolean(row.allows_decimal),
          code: String(row.unit_code),
          id: Number(row.id),
          name: String(row.unit_name),
          status: row.status === "inactive" ? "inactive" : "active",
          symbol: String(row.symbol),
        })) as RawMaterialUnitLookup[],
        warehouses: normalizeLookupRows(
          warehousesResult.data ?? [],
          "warehouse_code",
          "warehouse_name",
        ),
      },
    };
  } catch (error) {
    console.error("getRawMaterialsAction error:", error);
    return { error: "ไม่สามารถดึงข้อมูลวัตถุดิบได้" };
  }
}

export async function createRawMaterialAction(input: RawMaterialInput) {
  try {
    const supabase = await createClient();
    let normalizedCode = input.material_code.trim().toUpperCase();
    const normalizedName = input.material_name.trim();
    const unitValidation = await validateStockUnit(supabase, input.unit_id);
    if ("error" in unitValidation) return unitValidation;

    const rmTypeId = await resolveRmTypeId(supabase);
    if (!rmTypeId) return { error: "ไม่พบประเภทวัตถุดิบ (RM)" };

    if (!normalizedCode) {
      const reserved = await supabase.rpc("reserve_item_code", { p_item_type_id: rmTypeId });
      if (!reserved.error && typeof reserved.data === "string") {
        normalizedCode = reserved.data;
      }
    }

    if (normalizedCode !== "" && !/^RM\d{3,}$/.test(normalizedCode)) {
      return { error: "รูปแบบรหัสวัตถุดิบไม่ถูกต้อง" };
    }

    const itemPayload = {
      item_type_id: rmTypeId,
      item_code: normalizedCode || null,
      item_name: normalizedName,
      item_name_en: null,
      description: input.remark?.trim() || null,
      unit_id: input.unit_id,
      tracking_method: "lot",
      reorder_point: input.reorder_point,
      status: input.status,
      attributes: {
        legacySource: "raw_material",
        groupId: input.group_id,
        gradeId: input.grade_id,
        thickness: input.thickness_mm,
        width: input.width_mm,
        length: input.length_mm,
        warehouseId: input.warehouse_id,
        dimensionUnit: "มม.",
      },
    };

    const { error } = await supabase.from("item_master").insert(itemPayload);
    if (error) return { error: error.message };

    revalidatePath("/items/raw-materials");
    revalidatePath("/items");
    return { success: true as const };
  } catch (error) {
    console.error("createRawMaterialAction error:", error);
    return { error: "ไม่สามารถบันทึกวัตถุดิบได้" };
  }
}

export async function updateRawMaterialAction(id: number, input: RawMaterialInput) {
  try {
    const supabase = await createClient();
    const normalizedName = input.material_name.trim();
    const unitValidation = await validateStockUnit(supabase, input.unit_id);
    if ("error" in unitValidation) return unitValidation;

    const rmTypeId = await resolveRmTypeId(supabase);

    const attributes = {
      legacySource: "raw_material",
      legacySourceId: id,
      groupId: input.group_id,
      gradeId: input.grade_id,
      thickness: input.thickness_mm,
      width: input.width_mm,
      length: input.length_mm,
      warehouseId: input.warehouse_id,
      dimensionUnit: "มม.",
    };

    const updatePayload: Record<string, unknown> = {
      item_name: normalizedName,
      unit_id: input.unit_id,
      reorder_point: input.reorder_point,
      description: input.remark?.trim() || null,
      status: input.status,
      attributes,
      updated_at: new Date().toISOString(),
    };
    if (rmTypeId) updatePayload.item_type_id = rmTypeId;

    const { error } = await supabase
      .from("item_master")
      .update(updatePayload)
      .or(`id.eq.${id},attributes->>legacySourceId.eq.${id}`);

    if (error) return { error: error.message };

    revalidatePath("/items/raw-materials");
    revalidatePath("/items");
    return { success: true as const };
  } catch (error) {
    console.error("updateRawMaterialAction error:", error);
    return { error: "ไม่สามารถแก้ไขวัตถุดิบได้" };
  }
}

export async function deleteRawMaterialAction(id: number) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("item_master")
      .delete()
      .or(`id.eq.${id},attributes->>legacySourceId.eq.${id}`);

    if (error) return { error: error.message };

    revalidatePath("/items/raw-materials");
    revalidatePath("/items");
    return { success: true as const };
  } catch (error) {
    console.error("deleteRawMaterialAction error:", error);
    return { error: "ไม่สามารถลบวัตถุดิบได้" };
  }
}

export async function getRawMaterialWarehousesAction() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("raw_material_warehouses")
      .select("id, warehouse_code, warehouse_name, status")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("warehouse_name", { ascending: true });

    if (error) {
      console.error("getRawMaterialWarehousesAction error:", error);
      return { error: error.message, data: [] };
    }

    const formatted = (data ?? []).map((row) => ({
      id: Number(row.id),
      code: String(row.warehouse_code),
      name: String(row.warehouse_name),
      status: String(row.status),
    }));

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getRawMaterialWarehousesAction error:", error);
    return { error: "ไม่สามารถดึงข้อมูลคลังสินค้าได้", data: [] };
  }
}

export type RawMaterialImportInput = {
  material_code?: string;
  material_name: string;
  group_name: string;
  grade_name: string;
  thickness_mm: string | number;
  width_mm?: string | number | null;
  length_mm?: string | number | null;
  unit_symbol: string;
  reorder_point?: string | number | null;
  warehouse_name: string;
  status?: string;
  remark?: string | null;
};

export type BulkImportRawMaterialsResult =
  | {
      success: true;
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      errors?: string[];
    }
  | { error: string };

export async function bulkImportRawMaterialsAction(
  rows: RawMaterialImportInput[],
): Promise<BulkImportRawMaterialsResult> {
  if (rows.length === 0) {
    return { error: "ไม่พบข้อมูลวัตถุดิบสำหรับนำเข้า" };
  }

  try {
    const supabase = await createClient();
    const rmTypeId = await resolveRmTypeId(supabase);
    if (!rmTypeId) return { error: "ไม่พบประเภทวัตถุดิบ (RM)" };

    const [groupsRes, gradesRes, unitsRes, warehousesRes, existingRes] = await Promise.all([
      supabase.from("raw_material_groups").select("id, group_name"),
      supabase.from("raw_material_grades").select("id, grade_name"),
      supabase.from("raw_material_units").select("id, symbol, unit_code"),
      supabase.from("raw_material_warehouses").select("id, warehouse_name"),
      supabase.from("item_master").select("id, item_code").eq("item_type_id", rmTypeId),
    ]);

    if (groupsRes.error) return { error: `ดึงข้อมูลกลุ่มวัตถุดิบล้มเหลว: ${groupsRes.error.message}` };
    if (gradesRes.error) return { error: `ดึงข้อมูลเกรดวัสดุล้มเหลว: ${gradesRes.error.message}` };
    if (unitsRes.error) return { error: `ดึงข้อมูลหน่วยนับล้มเหลว: ${unitsRes.error.message}` };
    if (warehousesRes.error) return { error: `ดึงข้อมูลคลังสินค้าล้มเหลว: ${warehousesRes.error.message}` };
    if (existingRes.error) return { error: `ดึงข้อมูลรหัสวัตถุดิบเดิมล้มเหลว: ${existingRes.error.message}` };

    const groupMap = new Map<string, number>();
    (groupsRes.data ?? []).forEach((g) => {
      if (g.group_name) groupMap.set(g.group_name.trim().toLowerCase(), g.id);
    });

    const gradeMap = new Map<string, number>();
    (gradesRes.data ?? []).forEach((g) => {
      if (g.grade_name) gradeMap.set(g.grade_name.trim().toLowerCase(), g.id);
    });

    const unitMap = new Map<string, number>();
    (unitsRes.data ?? []).forEach((u) => {
      if (u.symbol) unitMap.set(u.symbol.trim().toLowerCase(), u.id);
      if (u.unit_code) unitMap.set(u.unit_code.trim().toLowerCase(), u.id);
    });

    const warehouseMap = new Map<string, number>();
    (warehousesRes.data ?? []).forEach((w) => {
      if (w.warehouse_name) warehouseMap.set(w.warehouse_name.trim().toLowerCase(), w.id);
    });

    const existingMap = new Map<string, number>();
    (existingRes.data ?? []).forEach((m) => {
      if (m.item_code) {
        existingMap.set(m.item_code.trim().toUpperCase(), m.id);
      }
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;

      const materialName = row.material_name?.trim();
      if (!materialName) {
        skippedCount++;
        errors.push(`แถวที่ ${lineNum}: ไม่พบชื่อวัตถุดิบ`);
        continue;
      }

      const groupNameClean = row.group_name?.trim().toLowerCase();
      const group_id = groupMap.get(groupNameClean);
      if (!group_id) {
        skippedCount++;
        errors.push(`แถวที่ ${lineNum}: ไม่พบกลุ่มวัตถุดิบ "${row.group_name}" ในระบบ`);
        continue;
      }

      const gradeNameClean = row.grade_name?.trim().toLowerCase();
      const grade_id = gradeMap.get(gradeNameClean);
      if (!grade_id) {
        skippedCount++;
        errors.push(`แถวที่ ${lineNum}: ไม่พบเกรดวัสดุ "${row.grade_name}" ในระบบ`);
        continue;
      }

      const unitSymbolClean = row.unit_symbol?.trim().toLowerCase();
      const unit_id = unitMap.get(unitSymbolClean);
      if (!unit_id) {
        skippedCount++;
        errors.push(`แถวที่ ${lineNum}: ไม่พบหน่วยนับ "${row.unit_symbol}" ในระบบ`);
        continue;
      }

      const warehouseNameClean = row.warehouse_name?.trim().toLowerCase();
      const warehouse_id = warehouseMap.get(warehouseNameClean);
      if (!warehouse_id) {
        skippedCount++;
        errors.push(`แถวที่ ${lineNum}: ไม่พบคลังสินค้า "${row.warehouse_name}" ในระบบ`);
        continue;
      }

      const thickness_mm = parseFloat(String(row.thickness_mm)) || 0;
      const width_mm = row.width_mm !== undefined && row.width_mm !== null && row.width_mm !== "" ? parseFloat(String(row.width_mm)) : null;
      const length_mm = row.length_mm !== undefined && row.length_mm !== null && row.length_mm !== "" ? parseFloat(String(row.length_mm)) : null;
      const reorder_point = row.reorder_point !== undefined && row.reorder_point !== null && row.reorder_point !== "" ? parseFloat(String(row.reorder_point)) : null;

      let status: "active" | "inactive" = "active";
      if (row.status) {
        const s = row.status.trim().toLowerCase();
        if (s === "ระงับ" || s === "inactive") {
          status = "inactive";
        }
      }

      const materialCode = row.material_code?.trim().toUpperCase() || "";

      const attributes = {
        legacySource: "raw_material",
        groupId: group_id,
        gradeId: grade_id,
        thickness: thickness_mm,
        width: width_mm,
        length: length_mm,
        warehouseId: warehouse_id,
        dimensionUnit: "มม.",
      };

      if (materialCode && existingMap.has(materialCode)) {
        const id = existingMap.get(materialCode)!;
        const { error: updateError } = await supabase
          .from("item_master")
          .update({
            item_name: materialName,
            unit_id,
            reorder_point,
            description: row.remark?.trim() || null,
            status,
            attributes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) {
          errors.push(`แถวที่ ${lineNum}: ${updateError.message}`);
          skippedCount++;
        } else {
          updatedCount++;
        }
      } else {
        const { error: insertError } = await supabase.from("item_master").insert({
          item_type_id: rmTypeId,
          item_code: materialCode || null,
          item_name: materialName,
          unit_id,
          tracking_method: "lot",
          reorder_point,
          description: row.remark?.trim() || null,
          status,
          attributes,
        });

        if (insertError) {
          errors.push(`แถวที่ ${lineNum}: ${insertError.message}`);
          skippedCount++;
        } else {
          createdCount++;
        }
      }
    }

    revalidatePath("/items/raw-materials");
    revalidatePath("/items");
    return {
      success: true,
      createdCount,
      updatedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("bulkImportRawMaterialsAction error:", error);
    return { error: "เกิดข้อผิดพลาดของระบบในการนำเข้าวัตถุดิบ" };
  }
}
