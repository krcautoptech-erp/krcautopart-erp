"use server";

import { revalidatePath } from "next/cache";
import { clearItemsServerCache } from "@/app/actions/items";
import {
  normalizeWarehouseInput,
  normalizeWarehouseTypeInput,
  validateWarehouseInput,
  validateWarehouseTypeInput,
  type WarehouseInput,
  type WarehouseStatus,
  type WarehouseTypeInput,
} from "@/lib/warehouses";
import { createClient } from "@/utils/supabase/server";

const SETTINGS_PATH = "/settings/warehouses";

export type WarehouseRecord = WarehouseInput & {
  id: number;
  responsibleName: string | null;
  typeName: string;
};

export type WarehouseTypeRecord = WarehouseTypeInput & {
  id: number;
  warehouseCount: number;
};

export type WarehouseSettingsData = {
  canManage: boolean;
  responsibleUsers: { id: string; name: string }[];
  types: WarehouseTypeRecord[];
  warehouses: WarehouseRecord[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AuthResult = { supabase: SupabaseClient } | { error: string };

function friendlyError(message: string) {
  if (message.includes("duplicate key") && message.includes("warehouse_code")) return "รหัสคลังนี้ถูกใช้งานแล้ว";
  if (message.includes("duplicate key") && message.includes("warehouse_name")) return "ชื่อคลังนี้ถูกใช้งานแล้ว";
  if (message.includes("duplicate key") && message.includes("type_code")) return "รหัสประเภทคลังนี้ถูกใช้งานแล้ว";
  if (message.includes("duplicate key") && message.includes("type_name")) return "ชื่อประเภทคลังนี้ถูกใช้งานแล้ว";
  if (message.includes("foreign key") || message.includes("violates foreign key")) return "ไม่สามารถลบข้อมูลที่ถูกนำไปใช้งานแล้ว กรุณาเปลี่ยนเป็นสถานะระงับ";
  if (message.includes("row-level security") || message.includes("permission denied")) return "คุณไม่มีสิทธิ์จัดการข้อมูลคลัง";
  return message;
}

async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase } : { error: "กรุณาเข้าสู่ระบบใหม่" };
}

async function canManage(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("authorize", {
    requested_permission: "warehouses.manage",
  });
  if (error) return false;
  return Boolean(data);
}

async function fetchSettings(supabase: SupabaseClient): Promise<{ data: WarehouseSettingsData } | { error: string }> {
  const [warehouseResult, typeResult, userResult, owner] = await Promise.all([
    supabase.from("raw_material_warehouses").select("id, warehouse_code, warehouse_name, warehouse_type_id, location_name, responsible_user_id, remarks, status").order("sort_order").order("warehouse_name"),
    supabase.from("warehouse_types").select("id, type_code, type_name, remarks, status").order("sort_order").order("type_name"),
    supabase.from("user_profiles").select("user_id, first_name, last_name").eq("status", "active").order("employee_number"),
    canManage(supabase),
  ]);
  const error = warehouseResult.error ?? typeResult.error ?? userResult.error;
  if (error) return { error: friendlyError(error.message) };

  const types = (typeResult.data ?? []).map((row) => ({
    code: row.type_code,
    id: Number(row.id),
    name: row.type_name,
    remarks: row.remarks ?? "",
    status: row.status === "inactive" ? "inactive" as const : "active" as const,
    warehouseCount: (warehouseResult.data ?? []).filter((warehouse) => warehouse.warehouse_type_id === row.id).length,
  }));
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const userNames = new Map((userResult.data ?? []).map((user) => [user.user_id, `${user.first_name} ${user.last_name}`.trim()]));

  return {
    data: {
      canManage: owner,
      responsibleUsers: (userResult.data ?? []).map((user) => ({ id: user.user_id, name: `${user.first_name} ${user.last_name}`.trim() })),
      types,
      warehouses: (warehouseResult.data ?? []).map((row) => ({
        code: row.warehouse_code,
        id: Number(row.id),
        locationName: row.location_name ?? "",
        name: row.warehouse_name,
        remarks: row.remarks ?? "",
        responsibleName: row.responsible_user_id ? userNames.get(row.responsible_user_id) ?? null : null,
        responsibleUserId: row.responsible_user_id,
        status: row.status === "inactive" ? "inactive" : "active",
        typeId: Number(row.warehouse_type_id),
        typeName: typeNames.get(Number(row.warehouse_type_id)) ?? "-",
      })),
    },
  };
}

export async function getWarehouseSettingsAction() {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  return fetchSettings(auth.supabase);
}

export async function getWarehousesAction() {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error, data: [] };

  const { data, error } = await auth.supabase
    .from("raw_material_warehouses")
    .select("id, warehouse_code, warehouse_name, status")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("warehouse_name", { ascending: true });

  if (error) return { error: friendlyError(error.message), data: [] };

  return {
    data: (data ?? []).map((row) => ({
      code: String(row.warehouse_code),
      id: Number(row.id),
      name: String(row.warehouse_name),
      status: String(row.status),
    })),
    success: true as const,
  };
}

async function requireManager(): Promise<AuthResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  if (!(await canManage(auth.supabase))) return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลคลัง" };
  return auth;
}

export async function saveWarehouseAction(id: number | null, input: WarehouseInput) {
  const value = normalizeWarehouseInput(input);
  const validationError = validateWarehouseInput(value);
  if (validationError) return { error: validationError };
  const auth = await requireManager();
  if ("error" in auth) return auth;

  const payload = {
    location_name: value.locationName || null,
    remarks: value.remarks || null,
    responsible_user_id: value.responsibleUserId,
    status: value.status,
    warehouse_code: value.code,
    warehouse_name: value.name,
    warehouse_type_id: value.typeId,
  };
  const result = id
    ? await auth.supabase.from("raw_material_warehouses").update(payload).eq("id", id).select("id").single()
    : await auth.supabase.from("raw_material_warehouses").insert(payload).select("id").single();
  if (result.error) return { error: friendlyError(result.error.message) };
  revalidatePath(SETTINGS_PATH);
  await clearItemsServerCache();
  const settings = await fetchSettings(auth.supabase);
  if ("error" in settings) return settings;
  return { data: settings.data, success: true as const };
}

export async function setWarehouseStatusAction(id: number, status: WarehouseStatus) {
  if (status !== "active" && status !== "inactive") return { error: "สถานะคลังไม่ถูกต้อง" };
  const auth = await requireManager();
  if ("error" in auth) return auth;
  const { error } = await auth.supabase.from("raw_material_warehouses").update({ status }).eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(SETTINGS_PATH);
  await clearItemsServerCache();
  return { success: true as const };
}

export async function deleteWarehouseAction(id: number) {
  const auth = await requireManager();
  if ("error" in auth) return auth;
  const { error } = await auth.supabase.from("raw_material_warehouses").delete().eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(SETTINGS_PATH);
  await clearItemsServerCache();
  return { success: true as const };
}

export async function saveWarehouseTypeAction(id: number | null, input: WarehouseTypeInput) {
  const value = normalizeWarehouseTypeInput(input);
  const validationError = validateWarehouseTypeInput(value);
  if (validationError) return { error: validationError };
  const auth = await requireManager();
  if ("error" in auth) return auth;
  const payload = {
    remarks: value.remarks || null,
    status: value.status,
    type_code: value.code,
    type_name: value.name,
  };
  const result = id
    ? await auth.supabase.from("warehouse_types").update(payload).eq("id", id)
    : await auth.supabase.from("warehouse_types").insert(payload);
  if (result.error) return { error: friendlyError(result.error.message) };
  revalidatePath(SETTINGS_PATH);
  const settings = await fetchSettings(auth.supabase);
  if ("error" in settings) return settings;
  return { data: settings.data, success: true as const };
}

export async function deleteWarehouseTypeAction(id: number) {
  const auth = await requireManager();
  if ("error" in auth) return auth;
  const { error } = await auth.supabase.from("warehouse_types").delete().eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(SETTINGS_PATH);
  return { success: true as const };
}
