"use server";

import { revalidatePath } from "next/cache";
import { clearItemsServerCache } from "@/app/actions/items";
import {
  normalizeRawMaterialSettingInput,
  validateRawMaterialSettingInput,
  type RawMaterialSettingInput,
  type RawMaterialSettingKind,
  type RawMaterialSettingStatus,
} from "@/lib/raw-material-settings";
import { createClient } from "@/utils/supabase/server";

export type RawMaterialSettingRecord = {
  allows_decimal: boolean;
  code: string;
  id: number;
  name: string;
  sort_order: number;
  status: RawMaterialSettingStatus;
  symbol: string;
};

type SettingConfig = {
  codeColumn: string;
  nameColumn: string;
  table: "raw_material_groups" | "raw_material_grades" | "raw_material_units";
};

const SETTINGS_PATH = "/settings/materials";
const INVENTORY_MATERIALS_PATH = "/items/raw-materials";

const SETTING_CONFIG: Record<RawMaterialSettingKind, SettingConfig> = {
  grade: {
    codeColumn: "grade_code",
    nameColumn: "grade_name",
    table: "raw_material_grades",
  },
  group: {
    codeColumn: "group_code",
    nameColumn: "group_name",
    table: "raw_material_groups",
  },
  unit: {
    codeColumn: "unit_code",
    nameColumn: "unit_name",
    table: "raw_material_units",
  },
};

async function hasMaterialSettingPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  permission: "material_settings.view" | "material_settings.manage",
) {
  const { data } = await supabase.rpc("authorize", {
    requested_permission: permission,
  });
  return Boolean(data);
}

function mapSettingRow(
  kind: RawMaterialSettingKind,
  row: Record<string, unknown>,
): RawMaterialSettingRecord {
  const config = SETTING_CONFIG[kind];

  return {
    allows_decimal: kind === "unit" && Boolean(row.allows_decimal),
    code: String(row[config.codeColumn] ?? ""),
    id: Number(row.id),
    name: String(row[config.nameColumn] ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    status: row.status === "inactive" ? "inactive" : "active",
    symbol: kind === "unit" ? String(row.symbol ?? "") : "",
  };
}

function getSelectColumns(kind: RawMaterialSettingKind) {
  const config = SETTING_CONFIG[kind];
  const baseColumns = `id, ${config.codeColumn}, ${config.nameColumn}, sort_order, status`;
  return kind === "unit" ? `${baseColumns}, symbol, allows_decimal` : baseColumns;
}

function buildMutationPayload(
  kind: RawMaterialSettingKind,
  input: RawMaterialSettingInput,
) {
  const config = SETTING_CONFIG[kind];
  const normalized = normalizeRawMaterialSettingInput(kind, input);
  const payload: Record<string, unknown> = {
    [config.codeColumn]: normalized.code,
    [config.nameColumn]: normalized.name,
    sort_order: normalized.sort_order,
    status: normalized.status,
  };

  if (kind === "unit") {
    payload.symbol = normalized.symbol;
    payload.allows_decimal = normalized.allows_decimal;
  }

  return payload;
}

async function revalidateSettingPaths() {
  await clearItemsServerCache();
  revalidatePath(SETTINGS_PATH);
  revalidatePath(INVENTORY_MATERIALS_PATH);
}

export async function getRawMaterialSettingsAction() {
  try {
    const supabase = await createClient();
    if (!(await hasMaterialSettingPermission(supabase, "material_settings.view"))) {
      return { error: "คุณไม่มีสิทธิ์ดูข้อมูลตั้งค่าวัตถุดิบ" };
    }

    const kinds: RawMaterialSettingKind[] = ["group", "grade", "unit"];
    const results = await Promise.all(
      kinds.map((kind) => {
        const config = SETTING_CONFIG[kind];
        return supabase
          .from(config.table)
          .select(getSelectColumns(kind))
          .order("sort_order", { ascending: true })
          .order(config.nameColumn, { ascending: true });
      }),
    );

    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) return { error: failedResult.error.message };

    return {
      success: true as const,
      data: {
        grades: (results[1].data ?? []).map((row) =>
          mapSettingRow("grade", row as unknown as Record<string, unknown>),
        ),
        groups: (results[0].data ?? []).map((row) =>
          mapSettingRow("group", row as unknown as Record<string, unknown>),
        ),
        units: (results[2].data ?? []).map((row) =>
          mapSettingRow("unit", row as unknown as Record<string, unknown>),
        ),
      },
    };
  } catch (error) {
    console.error("getRawMaterialSettingsAction error:", error);
    return { error: "ไม่สามารถดึงข้อมูลตั้งค่าวัตถุดิบได้" };
  }
}

export async function createRawMaterialSettingAction(
  kind: RawMaterialSettingKind,
  input: RawMaterialSettingInput,
) {
  const validationError = validateRawMaterialSettingInput(kind, input);
  if (validationError) return { error: validationError };

  try {
    const supabase = await createClient();
    if (!(await hasMaterialSettingPermission(supabase, "material_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าวัตถุดิบ" };
    }
    const config = SETTING_CONFIG[kind];
    const normalized = normalizeRawMaterialSettingInput(kind, input);
    const { data: existing } = await supabase
      .from(config.table)
      .select("id")
      .eq(config.codeColumn, normalized.code)
      .maybeSingle();

    if (existing) return { error: `รหัส ${normalized.code} ถูกใช้งานแล้ว` };

    const { data, error } = await supabase
      .from(config.table)
      .insert(buildMutationPayload(kind, input))
      .select(getSelectColumns(kind))
      .single();

    if (error) return { error: error.message };

    await revalidateSettingPaths();
    return {
      success: true as const,
      data: mapSettingRow(kind, data as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("createRawMaterialSettingAction error:", error);
    return { error: "ไม่สามารถเพิ่มข้อมูลตั้งค่าวัตถุดิบได้" };
  }
}

export async function updateRawMaterialSettingAction(
  kind: RawMaterialSettingKind,
  id: number,
  input: RawMaterialSettingInput,
) {
  const validationError = validateRawMaterialSettingInput(kind, input);
  if (validationError) return { error: validationError };

  try {
    const supabase = await createClient();
    if (!(await hasMaterialSettingPermission(supabase, "material_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าวัตถุดิบ" };
    }
    const config = SETTING_CONFIG[kind];
    const normalized = normalizeRawMaterialSettingInput(kind, input);
    const { data: existing } = await supabase
      .from(config.table)
      .select("id")
      .eq(config.codeColumn, normalized.code)
      .neq("id", id)
      .maybeSingle();

    if (existing) return { error: `รหัส ${normalized.code} ถูกใช้งานแล้ว` };

    const { data, error } = await supabase
      .from(config.table)
      .update(buildMutationPayload(kind, input))
      .eq("id", id)
      .select(getSelectColumns(kind))
      .single();

    if (error) return { error: error.message };

    await revalidateSettingPaths();
    return {
      success: true as const,
      data: mapSettingRow(kind, data as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("updateRawMaterialSettingAction error:", error);
    return { error: "ไม่สามารถแก้ไขข้อมูลตั้งค่าวัตถุดิบได้" };
  }
}

export async function toggleRawMaterialSettingStatusAction(
  kind: RawMaterialSettingKind,
  id: number,
  currentStatus: RawMaterialSettingStatus,
) {
  try {
    const supabase = await createClient();
    if (!(await hasMaterialSettingPermission(supabase, "material_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าวัตถุดิบ" };
    }
    const config = SETTING_CONFIG[kind];
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    const { data, error } = await supabase
      .from(config.table)
      .update({ status: nextStatus })
      .eq("id", id)
      .select(getSelectColumns(kind))
      .single();

    if (error) return { error: error.message };

    await revalidateSettingPaths();
    return {
      success: true as const,
      data: mapSettingRow(kind, data as unknown as Record<string, unknown>),
    };
  } catch (error) {
    console.error("toggleRawMaterialSettingStatusAction error:", error);
    return { error: "ไม่สามารถเปลี่ยนสถานะได้" };
  }
}

export async function deleteRawMaterialSettingAction(
  kind: RawMaterialSettingKind,
  id: number,
) {
  try {
    const supabase = await createClient();
    if (!(await hasMaterialSettingPermission(supabase, "material_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าวัตถุดิบ" };
    }
    const config = SETTING_CONFIG[kind];
    const { error } = await supabase.from(config.table).delete().eq("id", id);

    if (error?.code === "23503") {
      return { error: "รายการนี้ถูกใช้งานอยู่ จึงไม่สามารถลบได้ กรุณาระงับการใช้งานแทน" };
    }
    if (error) return { error: error.message };

    await revalidateSettingPaths();
    return { success: true as const };
  } catch (error) {
    console.error("deleteRawMaterialSettingAction error:", error);
    return { error: "ไม่สามารถลบข้อมูลตั้งค่าวัตถุดิบได้" };
  }
}
