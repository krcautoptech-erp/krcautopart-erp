import type { Metadata } from "next";
import {
  getRolePermissionSettingsAction,
} from "@/app/actions/role-permissions";
import {
  getUserManagementPageAction,
  type UserListFilters,
} from "@/app/actions/users";
import { RolePermissionManagement } from "../roles/_components/role-permission-management";
import { AccessManagementTabs } from "./_components/access-management-tabs";
import { UserManagement } from "./_components/user-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ผู้ใช้งานและสิทธิ์ | KRC ERP",
  description: "จัดการบัญชีผู้ใช้งาน Role และขอบเขตการเข้าถึงระบบ",
};

function positiveInteger(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function UserManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const requestedTab = Array.isArray(parameters.tab)
    ? parameters.tab[0]
    : parameters.tab;

  if (requestedTab === "roles") {
    const result = await getRolePermissionSettingsAction();

    if ("error" in result) {
      return (
        <SettingsError
          message={result.error ?? "ไม่สามารถโหลดข้อมูล Role และสิทธิ์ได้"}
        />
      );
    }

    return (
      <RolePermissionManagement
        initialData={result.data}
        tabs={<AccessManagementTabs activeTab="roles" />}
      />
    );
  }

  const statusValue = Array.isArray(parameters.status)
    ? parameters.status[0]
    : parameters.status;
  const searchValue = Array.isArray(parameters.search)
    ? parameters.search[0]
    : parameters.search;
  const filters: UserListFilters = {
    departmentId: positiveInteger(parameters.department),
    page: positiveInteger(parameters.page),
    pageSize: 20,
    roleId: positiveInteger(parameters.role),
    search: searchValue?.slice(0, 100),
    status:
      statusValue === "active" || statusValue === "inactive"
        ? statusValue
        : undefined,
  };
  const result = await getUserManagementPageAction(filters);

  if ("error" in result) {
    return (
      <SettingsError
        message={result.error ?? "ไม่สามารถโหลดข้อมูลผู้ใช้งานได้"}
      />
    );
  }

  return (
    <UserManagement
      initialData={result.data}
      initialFilters={filters}
      tabs={<AccessManagementTabs activeTab="users" />}
    />
  );
}

function SettingsError({ message }: { message: string }) {
  return (
    <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      {message}
    </section>
  );
}
