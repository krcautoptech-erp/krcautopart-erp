"use server";

import { revalidatePath } from "next/cache";
import { normalizeItemFormFieldsForTemplate, normalizeItemType, validateItemType, type GenericItemInput, type ItemTypeInput } from "@/lib/items";
import { createClient } from "@/utils/supabase/server";

export type ItemTypeRecord = ItemTypeInput & { id: number; itemCount: number };
export type CatalogItem = { id: string; sourceId: number | string; code: string; name: string; typeCode: string; typeName: string; unit: string; control: string; status: "active" | "inactive"; source: "product" | "raw_material" | "item_master"; form: Partial<GenericItemInput> };
type ItemLookup = { id: number; name: string; code?: string };
export type ItemCatalogPagination = {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ItemCatalogData = {
  canManage: boolean;
  items: CatalogItem[];
  types: ItemTypeRecord[];
  units: ItemLookup[];
  warehouses: ItemLookup[];
  groups: ItemLookup[];
  grades: ItemLookup[];
  vendors: ItemLookup[];
  pagination?: ItemCatalogPagination;
};

export type GetItemCatalogParams = {
  type?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  all?: boolean;
};

type Client = Awaited<ReturnType<typeof createClient>>;

let cachedTypes: { data: ItemTypeRecord[]; timestamp: number } | null = null;
let cachedLookups: {
  units: ItemLookup[];
  warehouses: ItemLookup[];
  groups: ItemLookup[];
  grades: ItemLookup[];
  vendors: ItemLookup[];
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 60_000; // 60 seconds

export async function clearItemsServerCache() {
  cachedTypes = null;
  cachedLookups = null;
}

async function authClient(): Promise<{ supabase: Client } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase } : { error: "กรุณาเข้าสู่ระบบใหม่" };
}

async function permission(supabase: Client, key: string) {
  const { data } = await supabase.rpc("authorize", { requested_permission: key });
  return Boolean(data);
}

function friendly(message: string) {
  if (
    message.includes("form_field_config") &&
    message.includes("schema cache")
  ) {
    return "ฐานข้อมูลยังไม่ได้อัปเดตช่องตั้งค่าฟอร์มสินค้า (form_field_config) กรุณา apply migration ล่าสุดของ Supabase แล้วลองใหม่";
  }
  if (message.includes("item_types_code_key")) return "รหัสประเภทสินค้านี้ถูกใช้งานแล้ว";
  if (message.includes("item_types_name_key")) return "ชื่อประเภทสินค้านี้ถูกใช้งานแล้ว";
  if (message.includes("item_master_code_key")) return "รหัสสินค้านี้ถูกใช้งานแล้ว";
  if (message.includes("item_in_use")) return "ไม่สามารถลบรายการนี้ได้เนื่องจากมีประวัติเอกสารหรือการเคลื่อนไหวสินค้าแล้ว กรุณาระงับการใช้งานแทน";
  if (message.includes("item_not_found")) return "ไม่พบข้อมูลสินค้าในระบบ";
  if (message.includes("permission") || message.includes("row-level security")) return "คุณไม่มีสิทธิ์จัดการข้อมูลสินค้า";
  return message;
}

function unitLabel(value: unknown) {
  const unit = Array.isArray(value) ? value[0] : value;
  if (!unit || typeof unit !== "object") return "-";
  const record = unit as { symbol?: string | null; unit_name?: string | null };
  return record.symbol ?? record.unit_name ?? "-";
}

function attrObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nextCodeFromRows(
  prefix: string,
  rows: { code: string | null }[],
  padding = 4,
) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(\\d+)$`, "i");
  const highest = rows.reduce((max, row) => {
    const match = row.code?.trim().match(pattern);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return `${prefix}${String(highest + 1).padStart(padding, "0")}`;
}

async function loadTypes(supabase: Client, force = false): Promise<ItemTypeRecord[]> {
  const now = Date.now();
  if (!force && cachedTypes && now - cachedTypes.timestamp < CACHE_TTL_MS) {
    return cachedTypes.data;
  }

  const [typesResult, countResult] = await Promise.all([
    supabase.from("item_types").select("*").order("sort_order").order("id"),
    supabase.from("item_master").select("item_type_id"),
  ]);

  if (typesResult.error) throw typesResult.error;

  const countMap = new Map<number, number>();
  (countResult.data ?? []).forEach((row) => {
    const tid = Number(row.item_type_id);
    countMap.set(tid, (countMap.get(tid) ?? 0) + 1);
  });

  const result: ItemTypeRecord[] = (typesResult.data ?? []).map((row) => ({
    id: Number(row.id), code: row.type_code, name: row.type_name, nameEn: row.type_name_en ?? "",
    formTemplate: row.form_template, codeMode: row.code_mode, codePrefix: row.code_prefix ?? "",
    stocked: row.is_stocked, purchasable: row.is_purchasable, sellable: row.is_sellable,
    productionItem: row.is_production_item, lotControlled: row.lot_controlled,
    serialControlled: row.serial_controlled, expiryControlled: row.expiry_controlled,
    dimensionEnabled: row.dimension_enabled, reorderEnabled: row.reorder_enabled,
    formFields: normalizeItemFormFieldsForTemplate(row.form_field_config, row.form_template),
    status: row.status, itemCount: countMap.get(Number(row.id)) ?? 0,
  }));

  cachedTypes = { data: result, timestamp: now };
  return result;
}

async function loadLookups(supabase: Client, force = false) {
  const now = Date.now();
  if (!force && cachedLookups && now - cachedLookups.timestamp < CACHE_TTL_MS) {
    return cachedLookups;
  }

  const [units, warehouses, groups, grades, vendors] = await Promise.all([
    supabase.from("raw_material_units").select("id, unit_name, symbol").eq("status", "active").order("sort_order"),
    supabase.from("raw_material_warehouses").select("id, warehouse_code, warehouse_name").eq("status", "active").order("sort_order"),
    supabase.from("raw_material_groups").select("id, group_name").eq("status", "active").order("sort_order"),
    supabase.from("raw_material_grades").select("id, grade_name").eq("status", "active").order("sort_order"),
    supabase.from("vendors").select("id, vendor_name").eq("status", "ใช้งาน").order("vendor_name"),
  ]);

  const failed = units.error ?? warehouses.error ?? groups.error ?? grades.error ?? vendors.error;
  if (failed) throw failed;

  const result = {
    units: (units.data ?? []).map((row) => ({ id: Number(row.id), name: `${row.unit_name}${row.symbol ? ` (${row.symbol})` : ""}` })),
    warehouses: (warehouses.data ?? []).map((row) => ({ id: Number(row.id), code: row.warehouse_code, name: row.warehouse_name })),
    groups: (groups.data ?? []).map((row) => ({ id: Number(row.id), name: row.group_name })),
    grades: (grades.data ?? []).map((row) => ({ id: Number(row.id), name: row.grade_name })),
    vendors: (vendors.data ?? []).map((row) => ({ id: Number(row.id), name: row.vendor_name })),
    timestamp: now,
  };

  cachedLookups = result;
  return result;
}

export async function getItemLookupsAction(): Promise<{ data: ItemCatalogData } | { error: string }> {
  const auth = await authClient();
  if ("error" in auth) return auth;
  try {
    if (!(await permission(auth.supabase, "items.view"))) {
      return { error: "คุณไม่มีสิทธิ์ดูข้อมูลสินค้าและรายการกลาง" };
    }
    const [types, lookups, canManage] = await Promise.all([
      loadTypes(auth.supabase),
      loadLookups(auth.supabase),
      permission(auth.supabase, "items.create"),
    ]);
    return {
      data: {
        canManage,
        items: [],
        types,
        units: lookups.units,
        warehouses: lookups.warehouses,
        groups: lookups.groups,
        grades: lookups.grades,
        vendors: lookups.vendors,
      },
    };
  } catch (error) {
    return { error: friendly(error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้") };
  }
}

export async function getItemCatalogAction(
  params?: GetItemCatalogParams,
): Promise<{ data: ItemCatalogData } | { error: string }> {
  const auth = await authClient(); if ("error" in auth) return auth;
  try {
    if (!(await permission(auth.supabase, "items.view"))) {
      return { error: "คุณไม่มีสิทธิ์ดูข้อมูลสินค้าและรายการกลาง" };
    }
    const [types, lookups, canManage] = await Promise.all([
      loadTypes(auth.supabase),
      loadLookups(auth.supabase),
      permission(auth.supabase, "items.create"),
    ]);

    const typeCode = params?.type?.toUpperCase() ?? "ALL";
    const page = Math.max(1, Number(params?.page) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(params?.pageSize) || 50));
    const search = params?.search?.trim() || "";
    const fetchAll = Boolean(params?.all);

    let query = auth.supabase
      .from("item_master")
      .select(
        "id, item_code, item_name, item_name_en, description, unit_id, tracking_method, status, item_type_id, shelf_life_days, reorder_point, attributes, unit:raw_material_units(unit_name, symbol)",
        { count: "exact" },
      );

    if (typeCode !== "ALL") {
      const matchedType = types.find((t) => t.code.toUpperCase() === typeCode);
      if (matchedType) {
        query = query.eq("item_type_id", matchedType.id);
      }
    }

    if (search) {
      const sanitized = search.replace(/[,()]/g, "").trim();
      if (sanitized) {
        query = query.or(
          `item_code.ilike.%${sanitized}%,item_name.ilike.%${sanitized}%,item_name_en.ilike.%${sanitized}%,description.ilike.%${sanitized}%`,
        );
      }
    }

    query = query.order("item_code", { ascending: true });

    if (!fetchAll) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data: nativeRows, count: totalCount, error: itemsError } = await query;
    if (itemsError) return { error: friendly(itemsError.message) };

    const typeMap = new Map(types.map((type) => [type.id, type]));
    const items: CatalogItem[] = (nativeRows ?? []).map((row) => {
      const type = typeMap.get(Number(row.item_type_id));
      const attrs = attrObject(row.attributes);
      return {
        id: `item-${row.id}`,
        sourceId: row.id,
        code: row.item_code,
        name: row.item_name,
        typeCode: type?.code ?? "-",
        typeName: type?.name ?? "-",
        unit: unitLabel(row.unit),
        control: row.tracking_method === "none" ? "Stock" : row.tracking_method === "lot" ? "Lot" : "Serial",
        status: row.status === "inactive" ? "inactive" as const : "active" as const,
        source: "item_master" as const,
        form: {
          typeId: Number(row.item_type_id),
          code: row.item_code ?? "",
          name: row.item_name ?? "",
          nameEn: row.item_name_en ?? "",
          description: row.description ?? "",
          unitId: numberValue(row.unit_id),
          shelfLifeDays: numberValue(row.shelf_life_days),
          reorderPoint: numberValue(row.reorder_point),
          warehouseId: numberValue(attrs.warehouseId),
          groupId: numberValue(attrs.groupId),
          vendorId: numberValue(attrs.vendorId),
          gradeId: numberValue(attrs.gradeId),
          gradeName: textValue(attrs.gradeName) || textValue(attrs.material),
          material: textValue(attrs.material) || textValue(attrs.gradeName),
          brand: textValue(attrs.brand),
          model: textValue(attrs.model),
          partNumber: textValue(attrs.partNumber),
          standard: textValue(attrs.standard),
          plating: textValue(attrs.plating),
          sheetsPerUnit: numberValue(attrs.sheetsPerUnit),
          piecesPerSheet: numberValue(attrs.piecesPerSheet),
          leadTimeDays: numberValue(attrs.leadTimeDays),
          costPrice: numberValue(attrs.costPrice),
          sellingPrice: numberValue(attrs.sellingPrice),
          primaryImage: textValue(attrs.primaryImage),
          attachmentNames: stringArray(attrs.attachmentNames),
          thickness: numberValue(attrs.thickness),
          width: numberValue(attrs.width),
          length: numberValue(attrs.length),
          dimensionUnit: textValue(attrs.dimensionUnit) || "มม.",
          expiryWarningDays: numberValue(attrs.expiryWarningDays),
          status: row.status === "inactive" ? "inactive" as const : "active" as const,
        },
      };
    });

    const total = totalCount ?? items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: {
        canManage,
        items,
        types,
        units: lookups.units,
        warehouses: lookups.warehouses,
        groups: lookups.groups,
        grades: lookups.grades,
        vendors: lookups.vendors,
        pagination: {
          totalCount: total,
          page,
          pageSize,
          totalPages,
        },
      },
    };
  } catch (error) { return { error: friendly(error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลสินค้าได้") }; }
}

export async function getExportCatalogItemsAction(params?: {
  type?: string;
  search?: string;
}): Promise<{ data: CatalogItem[] } | { error: string }> {
  const result = await getItemCatalogAction({
    type: params?.type,
    search: params?.search,
    all: true,
  });
  if ("error" in result) return result;
  return { data: result.data.items };
}

export async function getItemMasterTabsAction() {
  const auth = await authClient(); if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "items.view"))) return { error: "คุณไม่มีสิทธิ์ดูข้อมูลสินค้า" };
  const { data, error } = await auth.supabase.from("item_types").select("type_code, type_name, form_template").eq("status", "active").order("sort_order").order("id");
  if (error) return { error: friendly(error.message) };
  return { data: (data ?? []).map((item) => ({ code: String(item.type_code), formTemplate: String(item.form_template), name: String(item.type_name) })) };
}

export async function getItemTypeSettingsAction() {
  const auth = await authClient(); if ("error" in auth) return auth;
  try {
    if (!(await permission(auth.supabase, "item_types.view"))) {
      return { error: "คุณไม่มีสิทธิ์ดูการตั้งค่าประเภทสินค้า" };
    }
    const [canCreate, canEdit, canDelete, types] = await Promise.all([
      permission(auth.supabase, "item_types.create"),
      permission(auth.supabase, "item_types.edit"),
      permission(auth.supabase, "item_types.delete"),
      loadTypes(auth.supabase),
    ]);
    return { data: { canManage: canCreate || canEdit, canDelete, types } };
  }
  catch (error) { return { error: friendly(error instanceof Error ? error.message : "ไม่สามารถโหลดประเภทสินค้าได้") }; }
}

export async function deleteItemTypeAction(id: number) {
  const auth = await authClient(); if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "item_types.delete"))) return { error: "คุณไม่มีสิทธิ์ลบประเภทสินค้า" };
  const { count, error: countError } = await auth.supabase.from("item_master").select("id", { count: "exact", head: true }).eq("item_type_id", id);
  if (countError) return { error: friendly(countError.message) };
  if ((count ?? 0) > 0) return { error: "ประเภทสินค้านี้ถูกใช้งานแล้ว กรุณาระงับการใช้งานแทน" };
  const { error } = await auth.supabase.from("item_types").delete().eq("id", id);
  if (error) return { error: friendly(error.message) };
  clearItemsServerCache();
  revalidatePath("/settings/item-types"); revalidatePath("/items");
  return { success: true as const };
}

export async function saveItemTypeAction(id: number | null, input: ItemTypeInput) {
  const value = normalizeItemType(input); const invalid = validateItemType(value); if (invalid) return { error: invalid };
  const auth = await authClient(); if ("error" in auth) return auth;
  const requiredPermission = id ? "item_types.edit" : "item_types.create";
  if (!(await permission(auth.supabase, requiredPermission))) {
    return { error: "คุณไม่มีสิทธิ์บันทึกประเภทสินค้า" };
  }
  if (value.status === "inactive" && !(await permission(auth.supabase, "item_types.deactivate"))) {
    return { error: "คุณไม่มีสิทธิ์ระงับประเภทสินค้า" };
  }
  const payload = { type_code: value.code, type_name: value.name, type_name_en: value.nameEn || null, form_template: value.formTemplate, code_mode: value.codeMode, code_prefix: value.codeMode === "auto" ? value.codePrefix : null, is_stocked: value.stocked, is_purchasable: value.purchasable, is_sellable: value.sellable, is_production_item: value.productionItem, lot_controlled: value.lotControlled, serial_controlled: value.serialControlled, expiry_controlled: value.expiryControlled, dimension_enabled: value.dimensionEnabled, reorder_enabled: value.reorderEnabled, form_field_config: value.formFields, status: value.status, updated_at: new Date().toISOString() };
  const result = id ? await auth.supabase.from("item_types").update(payload).eq("id", id) : await auth.supabase.from("item_types").insert(payload);
  if (result.error) return { error: friendly(result.error.message) };
  clearItemsServerCache();
  revalidatePath("/settings/item-types"); revalidatePath("/items"); return { success: true as const };
}

export async function reserveItemCodeAction(itemTypeId: number) {
  const auth = await authClient(); if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "items.create"))) return { error: "คุณไม่มีสิทธิ์เพิ่มสินค้า" };
  const { data, error } = await auth.supabase.rpc("reserve_item_code", { p_item_type_id: itemTypeId });
  if (error) return { error: friendly(error.message) };
  if (typeof data !== "string" || !data.trim()) return { error: "ไม่สามารถสร้างรหัสสินค้าได้" };
  return { success: true as const, data };
}

export async function previewItemCodeAction(itemTypeId: number) {
  const auth = await authClient(); if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "items.create"))) return { error: "คุณไม่มีสิทธิ์เพิ่มสินค้า" };

  const { data: type, error: typeError } = await auth.supabase
    .from("item_types")
    .select("id, code_mode, code_prefix, form_template")
    .eq("id", itemTypeId)
    .eq("status", "active")
    .single();
  if (typeError || !type) return { error: "ไม่พบประเภทสินค้าที่เลือก" };
  if (type.code_mode !== "auto") return { success: true as const, data: "" };

  const prefix = String(type.code_prefix ?? "").trim().toUpperCase();
  if (!prefix) return { error: "ประเภทสินค้านี้ยังไม่ได้ตั้งคำนำหน้ารหัส" };

  const { data, error } = await auth.supabase
    .from("item_master")
    .select("item_code")
    .eq("item_type_id", itemTypeId)
    .ilike("item_code", `${prefix}%`)
    .limit(1000);
  if (error) return { error: friendly(error.message) };
  return {
    success: true as const,
    data: nextCodeFromRows(
      prefix,
      (data ?? []).map((row) => ({ code: row.item_code })),
      type.form_template === "raw_material" ? 3 : 4,
    ),
  };
}

export async function saveGenericItemAction(input: GenericItemInput) {
  const auth = await authClient(); if ("error" in auth) return auth;
  const [canCreate, typeResult] = await Promise.all([
    permission(auth.supabase, "items.create"),
    auth.supabase.from("item_types").select("code_mode, form_template, form_field_config, is_stocked, is_purchasable, is_production_item, dimension_enabled, expiry_controlled, lot_controlled, serial_controlled").eq("id", input.typeId).eq("status", "active").single(),
  ]);
  if (!canCreate) {
    return { error: "คุณไม่มีสิทธิ์เพิ่มสินค้า" };
  }
  if (!input.name.trim() || !input.typeId || !input.unitId) return { error: "กรุณากรอกชื่อ ประเภท และหน่วยนับให้ครบ" };
  const type = typeResult.data;
  if (typeResult.error || !type) return { error: "ไม่พบประเภทสินค้าที่เลือก" };
  let code = input.code.trim().toUpperCase();
  if (type.code_mode === "auto" && !code) { const reserved = await auth.supabase.rpc("reserve_item_code", { p_item_type_id: input.typeId }); if (reserved.error) return { error: friendly(reserved.error.message) }; code = reserved.data; }
  if (!code) return { error: "กรุณาระบุรหัสสินค้า" };
  const fields = normalizeItemFormFieldsForTemplate(type.form_field_config, type.form_template);
  if (fields.warehouse === "required" && !input.warehouseId) return { error: "กรุณาเลือกคลังหลัก" };
  if (fields.itemGroup === "required" && !input.groupId) return { error: "กรุณาเลือกกลุ่มสินค้า" };
  const attributes = { warehouseId: input.warehouseId, groupId: input.groupId, vendorId: input.vendorId, gradeId: input.gradeId, brand: input.brand, model: input.model, partNumber: input.partNumber, standard: input.standard, plating: input.plating, sheetsPerUnit: input.sheetsPerUnit, piecesPerSheet: input.piecesPerSheet, leadTimeDays: input.leadTimeDays, costPrice: input.costPrice, sellingPrice: input.sellingPrice, primaryImage: input.primaryImage, attachmentNames: input.attachmentNames, thickness: input.thickness, width: input.width, length: input.length, dimensionUnit: input.dimensionUnit, expiryWarningDays: input.expiryWarningDays };
  const result = await auth.supabase.from("item_master").insert({ item_type_id: input.typeId, item_code: code, item_name: input.name.trim(), item_name_en: input.nameEn.trim() || null, description: input.description.trim() || null, unit_id: input.unitId, tracking_method: type.serial_controlled ? "serial" : type.lot_controlled ? "lot" : "none", shelf_life_days: input.shelfLifeDays, reorder_point: input.reorderPoint, attributes, status: input.status });
  if (result.error) return { error: friendly(result.error.message) };
  clearItemsServerCache();
  return { success: true as const };
}

export async function updateGenericItemAction(id: number, input: GenericItemInput) {
  const auth = await authClient(); if ("error" in auth) return auth;
  const [canEdit, typeResult] = await Promise.all([
    permission(auth.supabase, "items.edit"),
    auth.supabase.from("item_types").select("form_template, form_field_config, lot_controlled, serial_controlled").eq("id", input.typeId).single(),
  ]);
  if (!canEdit) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขสินค้า" };
  }
  if (!input.name.trim() || !input.typeId || !input.unitId) return { error: "กรุณากรอกชื่อ ประเภท และหน่วยนับให้ครบ" };
  const type = typeResult.data;
  if (typeResult.error || !type) return { error: "ไม่พบประเภทสินค้าที่เลือก" };
  const fields = normalizeItemFormFieldsForTemplate(type.form_field_config, type.form_template);
  if (fields.warehouse === "required" && !input.warehouseId) return { error: "กรุณาเลือกคลังหลัก" };
  if (fields.itemGroup === "required" && !input.groupId) return { error: "กรุณาเลือกกลุ่มสินค้า" };
  const attributes = { warehouseId: input.warehouseId, groupId: input.groupId, vendorId: input.vendorId, gradeId: input.gradeId, brand: input.brand, model: input.model, partNumber: input.partNumber, standard: input.standard, plating: input.plating, sheetsPerUnit: input.sheetsPerUnit, piecesPerSheet: input.piecesPerSheet, leadTimeDays: input.leadTimeDays, costPrice: input.costPrice, sellingPrice: input.sellingPrice, primaryImage: input.primaryImage, attachmentNames: input.attachmentNames, thickness: input.thickness, width: input.width, length: input.length, dimensionUnit: input.dimensionUnit, expiryWarningDays: input.expiryWarningDays };
  const result = await auth.supabase.from("item_master").update({ item_name: input.name.trim(), item_name_en: input.nameEn.trim() || null, description: input.description.trim() || null, unit_id: input.unitId, tracking_method: type.serial_controlled ? "serial" : type.lot_controlled ? "lot" : "none", shelf_life_days: input.shelfLifeDays, reorder_point: input.reorderPoint, attributes, status: input.status, updated_at: new Date().toISOString() }).eq("id", id);
  if (result.error) return { error: friendly(result.error.message) };
  clearItemsServerCache();
  return { success: true as const };
}

export type ItemDeletableCheck = {
  canDelete: boolean;
  numericId: number;
  itemCode: string;
  itemName: string;
  currentStatus: "active" | "inactive";
  poCount: number;
  prCount: number;
  grCount: number;
  lotCount: number;
  txCount: number;
};

export async function checkItemDeletableAction(
  id: number | string,
): Promise<{ data: ItemDeletableCheck } | { error: string }> {
  const auth = await authClient();
  if ("error" in auth) return auth;
  const rawId = typeof id === "string" ? id.replace(/^item-/, "").trim() : id;
  const numericId = Number(rawId);
  if (!numericId || isNaN(numericId)) {
    return { error: "ไม่พบรหัสสินค้าที่ต้องการตรวจสอบในระบบ" };
  }

  const { data: item, error: itemErr } = await auth.supabase
    .from("item_master")
    .select("id, item_code, item_name, status")
    .eq("id", numericId)
    .single();

  if (itemErr || !item) {
    return { error: "ไม่พบข้อมูลสินค้าในระบบ" };
  }

  const [poUsage, prUsage, grUsage, lotUsage, txUsage, prodTxUsage] = await Promise.all([
    auth.supabase.from("purchase_order_items").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
    auth.supabase.from("purchase_requisition_items").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
    auth.supabase.from("goods_receipt_items").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
    auth.supabase.from("inventory_lots").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
    auth.supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
    auth.supabase.from("product_transactions").select("id", { count: "exact", head: true }).eq("item_master_id", numericId),
  ]);

  const poCount = poUsage.count ?? 0;
  const prCount = prUsage.count ?? 0;
  const grCount = grUsage.count ?? 0;
  const lotCount = lotUsage.count ?? 0;
  const txCount = (txUsage.count ?? 0) + (prodTxUsage.count ?? 0);

  const canDelete = poCount === 0 && prCount === 0 && grCount === 0 && lotCount === 0 && txCount === 0;

  return {
    data: {
      canDelete,
      numericId,
      itemCode: item.item_code,
      itemName: item.item_name,
      currentStatus: item.status === "inactive" ? "inactive" : "active",
      poCount,
      prCount,
      grCount,
      lotCount,
      txCount,
    },
  };
}

export async function deactivateItemAction(id: number | string) {
  const auth = await authClient();
  if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "items.deactivate")) && !(await permission(auth.supabase, "items.edit"))) {
    return { error: "คุณไม่มีสิทธิ์จัดการสถานะสินค้า" };
  }

  const rawId = typeof id === "string" ? id.replace(/^item-/, "").trim() : id;
  const numericId = Number(rawId);
  if (!numericId || isNaN(numericId)) {
    return { error: "ไม่พบรหัสสินค้าที่ต้องการระงับในระบบ" };
  }

  const { error } = await auth.supabase
    .from("item_master")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", numericId);

  if (error) return { error: friendly(error.message) };

  clearItemsServerCache();
  revalidatePath("/items");
  return { success: true as const };
}

export async function deleteGenericItemAction(id: number | string) {
  const auth = await authClient(); if ("error" in auth) return auth;
  if (!(await permission(auth.supabase, "items.deactivate")) && !(await permission(auth.supabase, "items.edit"))) {
    return { error: "คุณไม่มีสิทธิ์ลบหรือจัดการสินค้า" };
  }

  const rawId = typeof id === "string" ? id.replace(/^item-/, "").trim() : id;
  const numericId = Number(rawId);
  if (!numericId || isNaN(numericId)) {
    return { error: "ไม่พบรหัสสินค้าที่ต้องการลบในระบบ" };
  }

  const { error } = await auth.supabase.rpc("delete_unused_item_master_record", {
    p_item_id: numericId,
  });
  if (error) return { error: friendly(error.message) };

  clearItemsServerCache();
  revalidatePath("/items");
  return { success: true as const };
}
