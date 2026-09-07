"use server";

import { revalidatePath } from "next/cache";
import {
  getInternalAuthEmail,
  normalizeUsername,
  validateCreateUserInput,
  validateManagedPassword,
  validateUserProfileInput,
  type UserFormInput,
  type UserProfileInput,
  type UserStatus,
} from "@/lib/user-management";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type UserRecord = {
  approverUserId: string | null;
  departmentCode: string;
  departmentId: number;
  departmentName: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  lastSignInAt: string | null;
  positionName: string;
  roleCode: string;
  roleId: number;
  roleName: string;
  status: UserStatus;
  userId: string;
  username: string;
};

export type UserManagementOption = {
  code: string;
  id: number;
  name: string;
};

export type UserApproverOption = {
  employeeCode: string;
  id: string;
  name: string;
};

export type UserManagementOptions = {
  approvers: UserApproverOption[];
  departments: UserManagementOption[];
  nextEmployeeCode: string;
  roles: Array<UserManagementOption & { isOwner: boolean }>;
};

export type UserManagementPageData = {
  options: UserManagementOptions;
  page: number;
  pageSize: number;
  totalCount: number;
  users: UserRecord[];
};

export type UserListFilters = {
  departmentId?: number | null;
  page?: number;
  pageSize?: number;
  roleId?: number | null;
  search?: string;
  status?: UserStatus | null;
};

type AuthenticatedClient = Awaited<ReturnType<typeof createClient>>;

const USERS_PATH = "/settings/users";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getFriendlyUserError(message: string) {
  if (message.includes("SUPABASE_ADMIN_NOT_CONFIGURED")) {
    return "ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับจัดการบัญชีผู้ใช้";
  }
  if (message.includes("insufficient_privilege")) {
    return "เฉพาะ OWNER เท่านั้นที่สามารถจัดการผู้ใช้งานได้";
  }
  if (message.includes("rate_limit_exceeded")) {
    return "มีการดำเนินการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("user_profiles_username_unique")
  ) {
    return "Username นี้ถูกใช้งานแล้ว";
  }
  if (message.includes("department_not_found")) {
    return "ไม่พบแผนกที่เลือกหรือแผนกถูกระงับ";
  }
  if (message.includes("role_not_found")) {
    return "ไม่พบ Role ที่เลือกหรือ Role ถูกระงับ";
  }
  if (message.includes("approver_not_found")) {
    return "ไม่พบผู้อนุมัติที่เลือกหรือบัญชีถูกระงับ";
  }
  if (message.includes("self_approver_not_allowed")) {
    return "ผู้ใช้งานไม่สามารถเป็นผู้อนุมัติของตนเองได้";
  }
  if (message.includes("cannot_suspend_self")) {
    return "OWNER ไม่สามารถระงับบัญชีของตนเองได้";
  }
  if (message.includes("Password should be")) {
    return "รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัยของระบบ";
  }

  return "ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ";
}

async function requireOwner(): Promise<
  | { error: string }
  | { supabase: AuthenticatedClient; userId: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

  const { data: isOwner, error } = await supabase.rpc(
    "is_current_user_owner",
  );
  if (error) return { error: getFriendlyUserError(error.message) };
  if (!isOwner) {
    return { error: "เฉพาะ OWNER เท่านั้นที่สามารถเข้าถึงหน้านี้ได้" };
  }

  return { supabase, userId: user.id };
}

function normalizeFilters(filters: UserListFilters) {
  const page =
    Number.isSafeInteger(filters.page) && Number(filters.page) > 0
      ? Number(filters.page)
      : 1;
  const pageSize =
    Number.isSafeInteger(filters.pageSize) &&
    Number(filters.pageSize) >= 1 &&
    Number(filters.pageSize) <= 100
      ? Number(filters.pageSize)
      : 20;

  return {
    departmentId:
      Number.isSafeInteger(filters.departmentId) &&
      Number(filters.departmentId) > 0
        ? Number(filters.departmentId)
        : null,
    page,
    pageSize,
    roleId:
      Number.isSafeInteger(filters.roleId) && Number(filters.roleId) > 0
        ? Number(filters.roleId)
        : null,
    search: filters.search?.trim().slice(0, 100) || null,
    status:
      filters.status === "active" || filters.status === "inactive"
        ? filters.status
        : null,
  };
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    approverUserId: row.approver_user_id
      ? String(row.approver_user_id)
      : null,
    departmentCode: String(row.department_code),
    departmentId: Number(row.department_id),
    departmentName: String(row.department_name),
    employeeCode: String(row.employee_code),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    lastSignInAt: row.last_sign_in_at
      ? String(row.last_sign_in_at)
      : null,
    positionName: row.position_name ? String(row.position_name) : "",
    roleCode: String(row.role_code),
    roleId: Number(row.role_id),
    roleName: String(row.role_name),
    status: row.status === "inactive" ? "inactive" : "active",
    userId: String(row.user_id),
    username: String(row.username),
  };
}

function mapOptions(data: unknown): UserManagementOptions {
  const value =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  const departments = Array.isArray(value.departments)
    ? value.departments
    : [];
  const roles = Array.isArray(value.roles) ? value.roles : [];
  const approvers = Array.isArray(value.approvers) ? value.approvers : [];

  return {
    approvers: approvers.map((item) => {
      const option = item as Record<string, unknown>;
      return {
        employeeCode: String(option.employeeCode),
        id: String(option.id),
        name: String(option.name),
      };
    }),
    departments: departments.map((item) => {
      const option = item as Record<string, unknown>;
      return {
        code: String(option.code),
        id: Number(option.id),
        name: String(option.name),
      };
    }),
    nextEmployeeCode: String(value.nextEmployeeCode ?? "KRC001"),
    roles: roles.map((item) => {
      const option = item as Record<string, unknown>;
      return {
        code: String(option.code),
        id: Number(option.id),
        isOwner: Boolean(option.isOwner),
        name: String(option.name),
      };
    }),
  };
}

async function fetchUserManagementPage(
  supabase: AuthenticatedClient,
  filters: UserListFilters,
): Promise<{ data: UserManagementPageData } | { error: string }> {
  const normalized = normalizeFilters(filters);
  const [usersResult, optionsResult] = await Promise.all([
    supabase.rpc("get_user_management_page", {
      p_department_id: normalized.departmentId,
      p_page: normalized.page,
      p_page_size: normalized.pageSize,
      p_role_id: normalized.roleId,
      p_search: normalized.search,
      p_status: normalized.status,
    }),
    supabase.rpc("get_user_management_options"),
  ]);

  const error = usersResult.error ?? optionsResult.error;
  if (error) return { error: getFriendlyUserError(error.message) };

  const rows = (usersResult.data ?? []) as Record<string, unknown>[];

  return {
    data: {
      options: mapOptions(optionsResult.data),
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalCount: Number(rows[0]?.total_count ?? 0),
      users: rows.map(mapUser),
    },
  };
}

export async function getUserManagementPageAction(
  filters: UserListFilters = {},
) {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth;

    return await fetchUserManagementPage(auth.supabase, filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("getUserManagementPageAction error:", message);
    return { error: getFriendlyUserError(message) };
  }
}

export async function createManagedUserAction(input: UserFormInput) {
  const validationError = validateCreateUserInput(input);
  if (validationError) return { error: validationError };

  const username = normalizeUsername(input.username);

  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth;

    const { error: rateLimitError } = await auth.supabase.rpc(
      "assert_user_admin_rate_limit",
      { p_action_code: "user.created", p_max_operations: 20 },
    );
    if (rateLimitError) {
      return { error: getFriendlyUserError(rateLimitError.message) };
    }

    const admin = createAdminClient();
    const { data, error: createError } = await admin.auth.admin.createUser({
      app_metadata: { account_status: "active" },
      email: getInternalAuthEmail(username),
      email_confirm: true,
      password: input.password,
      user_metadata: {
        full_name: `${input.firstName.trim()} ${input.lastName.trim()}`,
        username,
      },
    });

    if (createError || !data.user) {
      return {
        error: getFriendlyUserError(
          createError?.message ?? "ไม่สามารถสร้างบัญชี Auth ได้",
        ),
      };
    }

    const { data: profileData, error: profileError } = await auth.supabase.rpc(
      "create_user_profile",
      {
        p_approver_user_id: input.approverUserId,
        p_department_id: input.departmentId,
        p_first_name: input.firstName.trim(),
        p_last_name: input.lastName.trim(),
        p_position_name: input.positionName.trim() || null,
        p_role_id: input.roleId,
        p_user_id: data.user.id,
        p_username: username,
      },
    );

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: getFriendlyUserError(profileError.message) };
    }

    const profile = Array.isArray(profileData) ? profileData[0] : profileData;
    revalidatePath(USERS_PATH);
    revalidatePath("/settings/departments");

    return {
      data: {
        employeeCode: String(
          (profile as Record<string, unknown> | null)?.employee_code ?? "",
        ),
        userId: data.user.id,
      },
      success: true as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("createManagedUserAction error:", message);
    return { error: getFriendlyUserError(message) };
  }
}

export async function updateManagedUserAction(
  userId: string,
  input: UserProfileInput,
) {
  if (!UUID_PATTERN.test(userId)) return { error: "รหัสผู้ใช้งานไม่ถูกต้อง" };
  const validationError = validateUserProfileInput(input);
  if (validationError) return { error: validationError };

  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth;

    const { error } = await auth.supabase.rpc("update_user_profile", {
      p_approver_user_id: input.approverUserId,
      p_department_id: input.departmentId,
      p_first_name: input.firstName.trim(),
      p_last_name: input.lastName.trim(),
      p_position_name: input.positionName.trim() || null,
      p_role_id: input.roleId,
      p_user_id: userId,
    });
    if (error) return { error: getFriendlyUserError(error.message) };

    revalidatePath(USERS_PATH);
    revalidatePath("/settings/departments");
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("updateManagedUserAction error:", message);
    return { error: getFriendlyUserError(message) };
  }
}

export async function resetManagedUserPasswordAction(
  userId: string,
  password: string,
) {
  if (!UUID_PATTERN.test(userId)) return { error: "รหัสผู้ใช้งานไม่ถูกต้อง" };
  const validationError = validateManagedPassword(password);
  if (validationError) return { error: validationError };

  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth;

    const { error: rateLimitError } = await auth.supabase.rpc(
      "assert_user_admin_rate_limit",
      { p_action_code: "user.password_reset", p_max_operations: 20 },
    );
    if (rateLimitError) {
      return { error: getFriendlyUserError(rateLimitError.message) };
    }

    const admin = createAdminClient();
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      userId,
      { password },
    );
    if (passwordError) {
      return { error: getFriendlyUserError(passwordError.message) };
    }

    const { error: auditError } = await auth.supabase.rpc(
      "record_user_password_reset",
      { p_user_id: userId },
    );
    if (auditError) return { error: getFriendlyUserError(auditError.message) };

    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("resetManagedUserPasswordAction error:", message);
    return { error: getFriendlyUserError(message) };
  }
}

export async function setManagedUserStatusAction(
  userId: string,
  status: UserStatus,
) {
  if (!UUID_PATTERN.test(userId)) return { error: "รหัสผู้ใช้งานไม่ถูกต้อง" };
  if (status !== "active" && status !== "inactive") {
    return { error: "สถานะผู้ใช้งานไม่ถูกต้อง" };
  }

  try {
    const auth = await requireOwner();
    if ("error" in auth) return auth;
    if (userId === auth.userId && status === "inactive") {
      return { error: "OWNER ไม่สามารถระงับบัญชีของตนเองได้" };
    }

    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { account_status: status },
      ban_duration: status === "inactive" ? "876000h" : "none",
    });
    if (authError) return { error: getFriendlyUserError(authError.message) };

    const { error: profileError } = await auth.supabase.rpc(
      "set_user_profile_status",
      { p_status: status, p_user_id: userId },
    );

    if (profileError) {
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: {
          account_status: status === "active" ? "inactive" : "active",
        },
        ban_duration: status === "active" ? "876000h" : "none",
      });
      return { error: getFriendlyUserError(profileError.message) };
    }

    revalidatePath(USERS_PATH);
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("setManagedUserStatusAction error:", message);
    return { error: getFriendlyUserError(message) };
  }
}
