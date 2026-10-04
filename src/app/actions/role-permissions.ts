"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type AppRoleRecord = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  isSystem: boolean;
  status: "active" | "inactive";
  userCount: number;
};

export type AppPermissionRecord = {
  id: number;
  code: string;
  name: string;
  moduleCode: string;
  moduleName: string;
  action:
    | "view"
    | "create"
    | "edit"
    | "delete"
    | "deactivate"
    | "cancel"
    | "approve"
    | "reject"
    | "manage"
    | "export"
    | "count"
    | "review";
};

export type RolePermissionSettingsData = {
  permissions: AppPermissionRecord[];
  rolePermissionIds: Record<number, number[]>;
  roles: AppRoleRecord[];
};

const SETTINGS_PATH = "/settings/users";

function getFriendlyRoleError(message: string) {
  if (message.includes("insufficient_privilege")) {
    return "คุณไม่มีสิทธิ์จัดการ Role และสิทธิ์";
  }
  if (message.includes("owner_role_is_locked")) {
    return "OWNER เป็น Role สูงสุดและไม่สามารถแก้ไขสิทธิ์ได้";
  }
  if (message.includes("invalid_role_code")) {
    return "รหัส Role ต้องเป็นภาษาอังกฤษตัวพิมพ์ใหญ่ ตัวเลข หรือขีดล่าง";
  }
  if (message.includes("invalid_role_name")) {
    return "กรุณากรอกชื่อ Role ให้ถูกต้อง";
  }
  if (message.includes("app_roles_code_unique")) {
    return "รหัส Role นี้ถูกใช้งานแล้ว";
  }
  if (message.includes("invalid_permission_selection")) {
    return "รายการสิทธิ์ไม่ถูกต้องหรือมีสิทธิ์ที่ถูกระงับ";
  }

  return message;
}

export async function getRolePermissionSettingsAction() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

    const { data: canView, error: authorizationError } = await supabase.rpc(
      "authorize",
      { requested_permission: "roles.view" },
    );

    if (authorizationError) return { error: authorizationError.message };
    if (!canView) return { error: "คุณไม่มีสิทธิ์เข้าถึงหน้า Role และสิทธิ์" };

    const [rolesResult, permissionsResult, mappingsResult, usersResult] =
      await Promise.all([
        supabase
          .from("app_roles")
          .select(
            "id, role_code, role_name, description, is_system, is_owner, status",
          )
          .order("sort_order", { ascending: true })
          .order("role_name", { ascending: true }),
        supabase
          .from("app_permissions")
          .select(
            "id, permission_code, permission_name, module_code, module_name, action_code",
          )
          .eq("status", "active")
          .order("module_sort_order", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("role_permissions")
          .select("role_id, permission_id"),
        supabase.from("user_roles").select("role_id"),
      ]);

    const firstError =
      rolesResult.error ??
      permissionsResult.error ??
      mappingsResult.error ??
      usersResult.error;
    if (firstError) return { error: firstError.message };

    const userCounts = new Map<number, number>();
    for (const assignment of usersResult.data ?? []) {
      const roleId = Number(assignment.role_id);
      userCounts.set(roleId, (userCounts.get(roleId) ?? 0) + 1);
    }

    const rolePermissionIds: Record<number, number[]> = {};
    for (const mapping of mappingsResult.data ?? []) {
      const roleId = Number(mapping.role_id);
      const permissionId = Number(mapping.permission_id);
      rolePermissionIds[roleId] = [
        ...(rolePermissionIds[roleId] ?? []),
        permissionId,
      ];
    }

    return {
      success: true as const,
      data: {
        permissions: (permissionsResult.data ?? []).map((permission) => ({
          action: permission.action_code as AppPermissionRecord["action"],
          code: String(permission.permission_code),
          id: Number(permission.id),
          moduleCode: String(permission.module_code).trim().toLowerCase(),
          moduleName: String(permission.module_name),
          name: String(permission.permission_name),
        })),
        rolePermissionIds,
        roles: (rolesResult.data ?? []).map((role) => ({
          code: String(role.role_code),
          description: role.description ? String(role.description) : null,
          id: Number(role.id),
          isOwner: Boolean(role.is_owner),
          isSystem: Boolean(role.is_system),
          name: String(role.role_name),
          status: role.status === "inactive" ? "inactive" : "active",
          userCount: userCounts.get(Number(role.id)) ?? 0,
        })),
      } satisfies RolePermissionSettingsData,
    };
  } catch (error) {
    console.error("getRolePermissionSettingsAction error:", error);
    return { error: "ไม่สามารถดึงข้อมูล Role และสิทธิ์ได้" };
  }
}

export async function createRoleAction(input: {
  code: string;
  description: string;
  name: string;
}) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const description = input.description.trim();

  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(code)) {
    return {
      error: "รหัส Role ต้องเป็นภาษาอังกฤษตัวพิมพ์ใหญ่ 2-30 ตัว",
    };
  }
  if (!name || name.length > 100) {
    return { error: "กรุณากรอกชื่อ Role ไม่เกิน 100 ตัวอักษร" };
  }
  if (description.length > 255) {
    return { error: "คำอธิบายต้องไม่เกิน 255 ตัวอักษร" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

    const { data, error } = await supabase.rpc("create_app_role", {
      p_description: description || null,
      p_role_code: code,
      p_role_name: name,
    });

    if (error) return { error: getFriendlyRoleError(error.message) };

    revalidatePath(SETTINGS_PATH);
    return { data: Number(data), success: true as const };
  } catch (error) {
    console.error("createRoleAction error:", error);
    return { error: "ไม่สามารถเพิ่ม Role ได้" };
  }
}

export async function saveRolePermissionsAction(
  roleId: number,
  permissionIds: number[],
) {
  if (!Number.isSafeInteger(roleId) || roleId <= 0) {
    return { error: "Role ไม่ถูกต้อง" };
  }

  const normalizedIds = Array.from(
    new Set(
      permissionIds.filter(
        (permissionId) =>
          Number.isSafeInteger(permissionId) && permissionId > 0,
      ),
    ),
  );
  if (normalizedIds.length !== permissionIds.length || normalizedIds.length > 100) {
    return { error: "รายการสิทธิ์ไม่ถูกต้อง" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

    const { error } = await supabase.rpc("replace_role_permissions", {
      p_permission_ids: normalizedIds,
      p_role_id: roleId,
    });

    if (error) return { error: getFriendlyRoleError(error.message) };

    revalidatePath(SETTINGS_PATH);
    return { success: true as const };
  } catch (error) {
    console.error("saveRolePermissionsAction error:", error);
    return { error: "ไม่สามารถบันทึกสิทธิ์ได้" };
  }
}
