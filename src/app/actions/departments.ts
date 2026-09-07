"use server";

import { revalidatePath } from "next/cache";
import {
  normalizeDepartmentInput,
  validateDepartmentInput,
  type DepartmentInput,
  type DepartmentStatus,
} from "@/lib/departments";
import { createClient } from "@/utils/supabase/server";

export type DepartmentRecord = {
  code: string;
  id: number;
  managerName: string | null;
  managerUserId: string | null;
  name: string;
  remarks: string;
  status: DepartmentStatus;
  userCount: number;
};

export type DepartmentManagerCandidate = {
  id: string;
  name: string;
};

export type DepartmentSettingsData = {
  canManage: boolean;
  departments: DepartmentRecord[];
  managerCandidates: DepartmentManagerCandidate[];
};

const SETTINGS_PATH = "/settings/departments";
type AuthenticatedClient = Awaited<ReturnType<typeof createClient>>;
type AuthenticationResult =
  | { error: string }
  | { supabase: AuthenticatedClient };

function getFriendlyDepartmentError(message: string) {
  if (message.includes("insufficient_privilege")) {
    return "คุณไม่มีสิทธิ์จัดการข้อมูลแผนก";
  }
  if (
    message.includes("departments_code_unique") ||
    message.includes("duplicate key") &&
      message.includes("department_code")
  ) {
    return "รหัสแผนกนี้ถูกใช้งานแล้ว";
  }
  if (
    message.includes("departments_name_unique_idx") ||
    message.includes("duplicate key") &&
      message.includes("lower")
  ) {
    return "ชื่อแผนกนี้ถูกใช้งานแล้ว";
  }
  if (message.includes("department_has_users")) {
    return "ไม่สามารถลบแผนกที่มีผู้ใช้งานอยู่ได้ กรุณาระงับการใช้งานแทน";
  }
  if (message.includes("department_not_found")) {
    return "ไม่พบข้อมูลแผนก";
  }
  if (message.includes("manager_not_found")) {
    return "ไม่พบผู้ใช้งานที่เลือกเป็นหัวหน้าแผนก";
  }
  if (message.includes("invalid_department")) {
    return "ข้อมูลแผนกไม่ถูกต้อง";
  }

  return message;
}

function mapDepartment(row: Record<string, unknown>): DepartmentRecord {
  return {
    code: String(row.department_code),
    id: Number(row.id),
    managerName: row.manager_name ? String(row.manager_name) : null,
    managerUserId: row.manager_user_id
      ? String(row.manager_user_id)
      : null,
    name: String(row.department_name),
    remarks: row.remarks ? String(row.remarks) : "",
    status: row.status === "inactive" ? "inactive" : "active",
    userCount: Number(row.user_count ?? 0),
  };
}

async function requireUser(): Promise<AuthenticationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "กรุณาเข้าสู่ระบบใหม่" };
  }

  return { supabase };
}

async function fetchDepartmentSettings(
  supabase: AuthenticatedClient,
): Promise<{ data: DepartmentSettingsData } | { error: string }> {
  const [departmentsResult, candidatesResult, managePermissionResult] =
    await Promise.all([
    supabase.rpc("get_department_settings"),
    supabase.rpc("get_department_manager_candidates"),
    supabase.rpc("authorize", { requested_permission: "departments.manage" }),
  ]);

  const firstError =
    departmentsResult.error ??
    candidatesResult.error ??
    managePermissionResult.error;
  if (firstError) {
    return { error: getFriendlyDepartmentError(firstError.message) };
  }

  return {
    data: {
      canManage: Boolean(managePermissionResult.data),
      departments: ((departmentsResult.data ?? []) as Record<string, unknown>[]).map(
        mapDepartment,
      ),
      managerCandidates: (
        (candidatesResult.data ?? []) as Record<string, unknown>[]
      ).map((candidate) => ({
        id: String(candidate.user_id),
        name: String(candidate.display_name),
      })),
    } satisfies DepartmentSettingsData,
  };
}

export async function getDepartmentSettingsAction() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    return await fetchDepartmentSettings(auth.supabase);
  } catch (error) {
    console.error("getDepartmentSettingsAction error:", error);
    return { error: "ไม่สามารถดึงข้อมูลแผนกได้" };
  }
}

export async function createDepartmentAction(input: DepartmentInput) {
  const normalized = normalizeDepartmentInput(input);
  const validationError = validateDepartmentInput(normalized);
  if (validationError) return { error: validationError };

  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    const { data: departmentId, error } = await auth.supabase.rpc(
      "create_department",
      {
        p_department_code: normalized.code,
        p_department_name: normalized.name,
        p_manager_user_id: normalized.managerUserId,
        p_remarks: normalized.remarks || null,
        p_status: normalized.status,
      },
    );

    if (error) return { error: getFriendlyDepartmentError(error.message) };

    const settings = await fetchDepartmentSettings(auth.supabase);
    if ("error" in settings) return settings;
    const department = settings.data.departments.find(
      (item) => item.id === Number(departmentId),
    );
    if (!department) return { error: "ไม่พบข้อมูลแผนกที่เพิ่งสร้าง" };

    revalidatePath(SETTINGS_PATH);
    return { data: department, success: true as const };
  } catch (error) {
    console.error("createDepartmentAction error:", error);
    return { error: "ไม่สามารถเพิ่มแผนกได้" };
  }
}

export async function updateDepartmentAction(
  departmentId: number,
  input: DepartmentInput,
) {
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) {
    return { error: "ข้อมูลแผนกไม่ถูกต้อง" };
  }

  const normalized = normalizeDepartmentInput(input);
  const validationError = validateDepartmentInput(normalized);
  if (validationError) return { error: validationError };

  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    const { error } = await auth.supabase.rpc("update_department", {
      p_department_code: normalized.code,
      p_department_id: departmentId,
      p_department_name: normalized.name,
      p_manager_user_id: normalized.managerUserId,
      p_remarks: normalized.remarks || null,
      p_status: normalized.status,
    });

    if (error) return { error: getFriendlyDepartmentError(error.message) };

    const settings = await fetchDepartmentSettings(auth.supabase);
    if ("error" in settings) return settings;
    const department = settings.data.departments.find(
      (item) => item.id === departmentId,
    );
    if (!department) return { error: "ไม่พบข้อมูลแผนกที่แก้ไข" };

    revalidatePath(SETTINGS_PATH);
    return { data: department, success: true as const };
  } catch (error) {
    console.error("updateDepartmentAction error:", error);
    return { error: "ไม่สามารถแก้ไขแผนกได้" };
  }
}

export async function setDepartmentStatusAction(
  departmentId: number,
  status: DepartmentStatus,
) {
  if (
    !Number.isSafeInteger(departmentId) ||
    departmentId <= 0 ||
    (status !== "active" && status !== "inactive")
  ) {
    return { error: "ข้อมูลแผนกไม่ถูกต้อง" };
  }

  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    const { error } = await auth.supabase.rpc("set_department_status", {
      p_department_id: departmentId,
      p_status: status,
    });
    if (error) return { error: getFriendlyDepartmentError(error.message) };

    revalidatePath(SETTINGS_PATH);
    return { success: true as const };
  } catch (error) {
    console.error("setDepartmentStatusAction error:", error);
    return { error: "ไม่สามารถเปลี่ยนสถานะแผนกได้" };
  }
}

export async function deleteDepartmentAction(departmentId: number) {
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) {
    return { error: "ข้อมูลแผนกไม่ถูกต้อง" };
  }

  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    const { error } = await auth.supabase.rpc("delete_department", {
      p_department_id: departmentId,
    });
    if (error) return { error: getFriendlyDepartmentError(error.message) };

    revalidatePath(SETTINGS_PATH);
    return { success: true as const };
  } catch (error) {
    console.error("deleteDepartmentAction error:", error);
    return { error: "ไม่สามารถลบแผนกได้" };
  }
}
