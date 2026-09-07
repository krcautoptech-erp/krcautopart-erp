"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";

export type VendorSettingCategory =
  | "vendor-groups"
  | "customer-types"
  | "credit-terms"
  | "payment-methods"
  | "tax-types";

export type VendorSettingStatus = "ใช้งาน" | "ระงับการใช้งาน";

export type VendorSettingRecord = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: VendorSettingStatus;
  created_at: string;
  updated_at: string;
  credit_days?: number;
  tax_rate?: number;
};

export type VendorSettingInput = {
  code: string;
  name: string;
  description: string | null;
  status: VendorSettingStatus;
  credit_days?: number;
  tax_rate?: number;
};

type VendorSettingTableConfig = {
  label: string;
  table: string;
  autoCodePrefix?: string;
};

type ActionResult<T> = { success: true; data: T } | { error: string };
type VendorSettingsData = Record<VendorSettingCategory, VendorSettingRecord[]>;

const VENDOR_SETTING_TABLES: Record<VendorSettingCategory, VendorSettingTableConfig> = {
  "vendor-groups": {
    autoCodePrefix: "VG",
    label: "กลุ่มผู้ขาย",
    table: "vendor_groups",
  },
  "customer-types": {
    autoCodePrefix: "CT",
    label: "ประเภทลูกค้า",
    table: "partner_customer_types",
  },
  "credit-terms": {
    label: "เครดิตเทอม",
    table: "vendor_credit_terms",
  },
  "payment-methods": {
    label: "วิธีชำระเงิน",
    table: "vendor_payment_methods",
  },
  "tax-types": {
    label: "ประเภทภาษี",
    table: "vendor_tax_types",
  },
};

const PARTNER_SETTINGS_PATH = "/partner-settings";

async function hasPartnerSettingPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  permission: "partner_settings.view" | "partner_settings.manage",
) {
  const { data } = await supabase.rpc("authorize", {
    requested_permission: permission,
  });
  return Boolean(data);
}

function getTableConfig(category: VendorSettingCategory) {
  return VENDOR_SETTING_TABLES[category];
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeStatus(value: string | null | undefined): VendorSettingStatus {
  return value === "ระงับการใช้งาน" ? "ระงับการใช้งาน" : "ใช้งาน";
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isAutoCodeCategory(category: VendorSettingCategory) {
  return Boolean(VENDOR_SETTING_TABLES[category].autoCodePrefix);
}

function getAutoCodeSeries(category: VendorSettingCategory) {
  if (category === "vendor-groups") return "VG" as const;
  if (category === "customer-types") return "CT" as const;
  return null;
}

function buildPayload(category: VendorSettingCategory, input: VendorSettingInput) {
  const payload: Record<string, string | number | null> = {
    code: normalizeCode(input.code),
    description: normalizeText(input.description) || null,
    name: normalizeText(input.name),
    status: normalizeStatus(input.status),
  };

  if (category === "credit-terms") {
    payload.credit_days = Math.max(0, Math.trunc(normalizeNumber(input.credit_days)));
  }

  if (category === "tax-types") {
    payload.tax_rate = Math.min(100, Math.max(0, normalizeNumber(input.tax_rate)));
  }

  return payload;
}

export async function reserveVendorSettingCodeAction(
  category: VendorSettingCategory,
): Promise<{ success: true; code: string } | { error: string }> {
  const series = getAutoCodeSeries(category);

  if (!series) {
    return { error: "รายการนี้ไม่ได้ใช้รหัสอัตโนมัติ" };
  }

  const supabase = await createClient();
  if (!(await hasPartnerSettingPermission(supabase, "partner_settings.manage"))) {
    return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าคู่ค้า" };
  }

  const result = await reserveBusinessNumberAction(
    series,
    new Date().toISOString().slice(0, 10),
  );

  if (!result.success) {
    return { error: result.error };
  }

  return { success: true, code: result.number };
}

function validatePayload(payload: Record<string, string | number | null>) {
  if (!payload.code || typeof payload.code !== "string") {
    return "กรุณากรอกรหัสรายการ";
  }

  if (!payload.name || typeof payload.name !== "string") {
    return "กรุณากรอกชื่อรายการ";
  }

  return null;
}

export async function getVendorSettingsAction(): Promise<ActionResult<VendorSettingsData>> {
  try {
    const supabase = await createClient();
    if (!(await hasPartnerSettingPermission(supabase, "partner_settings.view"))) {
      return { error: "คุณไม่มีสิทธิ์ดูข้อมูลตั้งค่าคู่ค้า" };
    }

    const entries = await Promise.all(
      Object.entries(VENDOR_SETTING_TABLES).map(async ([category, config]) => {
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          .order("code", { ascending: true });

        if (error) {
          throw new Error(`${config.label}: ${error.message}`);
        }

        return [category, data ?? []] as const;
      }),
    );

    return {
      success: true,
      data: Object.fromEntries(entries) as VendorSettingsData,
    };
  } catch (error) {
    console.error("Error loading vendor settings:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการดึงข้อมูลตั้งค่าคู่ค้า",
    };
  }
}

export async function createVendorSettingAction(
  category: VendorSettingCategory,
  input: VendorSettingInput,
): Promise<ActionResult<VendorSettingRecord>> {
  try {
    const config = getTableConfig(category);
    const payload = buildPayload(category, input);
    const validationError = isAutoCodeCategory(category)
      ? !payload.name || typeof payload.name !== "string"
        ? "กรุณากรอกชื่อรายการ"
        : null
      : validatePayload(payload);

    if (validationError) {
      return { error: validationError };
    }

    const supabase = await createClient();
    if (!(await hasPartnerSettingPermission(supabase, "partner_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าคู่ค้า" };
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error(`Error creating ${config.label}:`, error);
      return { error: error.code === "23505" ? "รหัสรายการนี้มีอยู่ในระบบแล้ว" : error.message };
    }

    revalidatePath(PARTNER_SETTINGS_PATH);
    return { success: true, data: data as VendorSettingRecord };
  } catch (error) {
    console.error("Vendor setting create exception:", error);
    return { error: "เกิดข้อผิดพลาดในการสร้างข้อมูลตั้งค่าคู่ค้า" };
  }
}

export async function updateVendorSettingAction(
  category: VendorSettingCategory,
  id: number,
  input: VendorSettingInput,
): Promise<ActionResult<VendorSettingRecord>> {
  try {
    const config = getTableConfig(category);
    const payload = buildPayload(category, input);
    const validationError = validatePayload(payload);

    if (validationError) {
      return { error: validationError };
    }

    const supabase = await createClient();
    if (!(await hasPartnerSettingPermission(supabase, "partner_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าคู่ค้า" };
    }
    const { data, error } = await supabase
      .from(config.table)
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating ${config.label}:`, error);
      return { error: error.code === "23505" ? "รหัสรายการนี้มีอยู่ในระบบแล้ว" : error.message };
    }

    revalidatePath(PARTNER_SETTINGS_PATH);
    return { success: true, data: data as VendorSettingRecord };
  } catch (error) {
    console.error("Vendor setting update exception:", error);
    return { error: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลตั้งค่าคู่ค้า" };
  }
}

export async function deleteVendorSettingAction(
  category: VendorSettingCategory,
  id: number,
): Promise<ActionResult<null>> {
  try {
    const config = getTableConfig(category);
    const supabase = await createClient();
    if (!(await hasPartnerSettingPermission(supabase, "partner_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าคู่ค้า" };
    }
    const { error } = await supabase.from(config.table).delete().eq("id", id);

    if (error) {
      console.error(`Error deleting ${config.label}:`, error);
      return { error: error.message };
    }

    revalidatePath(PARTNER_SETTINGS_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("Vendor setting delete exception:", error);
    return { error: "เกิดข้อผิดพลาดในการลบข้อมูลตั้งค่าคู่ค้า" };
  }
}

export async function toggleVendorSettingStatusAction(
  category: VendorSettingCategory,
  id: number,
  currentStatus: VendorSettingStatus,
): Promise<ActionResult<VendorSettingRecord>> {
  try {
    const config = getTableConfig(category);
    const nextStatus: VendorSettingStatus =
      currentStatus === "ใช้งาน" ? "ระงับการใช้งาน" : "ใช้งาน";

    const supabase = await createClient();
    if (!(await hasPartnerSettingPermission(supabase, "partner_settings.manage"))) {
      return { error: "คุณไม่มีสิทธิ์จัดการข้อมูลตั้งค่าคู่ค้า" };
    }
    const { data, error } = await supabase
      .from(config.table)
      .update({ status: nextStatus })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Error toggling ${config.label}:`, error);
      return { error: error.message };
    }

    revalidatePath(PARTNER_SETTINGS_PATH);
    return { success: true, data: data as VendorSettingRecord };
  } catch (error) {
    console.error("Vendor setting toggle exception:", error);
    return { error: "เกิดข้อผิดพลาดในการเปลี่ยนสถานะตั้งค่าคู่ค้า" };
  }
}
