"use client";

import { useRememberedListUrl } from "@/lib/use-list-state";

import {
  CirclePause,
  CirclePlay,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createManagedUserAction,
  resetManagedUserPasswordAction,
  setManagedUserStatusAction,
  updateManagedUserAction,
  type UserListFilters,
  type UserManagementPageData,
  type UserRecord,
} from "@/app/actions/users";
import { ActiveStatusBadge } from "@/components/status-badge";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { usePermissions } from "@/components/permission-context";
import { canManageUsers } from "@/lib/permission-ui";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import {
  validateCreateUserInput,
  validateUserProfileInput,
} from "@/lib/user-management";
import { PasswordResetModal } from "./password-reset-modal";
import { exportUsersToExcel } from "./user-export";
import {
  createUserDraft,
  UserModal,
  type UserModalMode,
} from "./user-modal";

type Feedback = { message: string; tone: "error" | "success" };

export function UserManagement({
  initialData,
  initialFilters,
  tabs,
}: {
  initialData: UserManagementPageData;
  initialFilters: UserListFilters;
  tabs?: ReactNode;
}) {
  useRememberedListUrl();
  const router = useRouter();
  const { isOwner } = usePermissions();
  const canCreate = canManageUsers(isOwner);
  const canEdit = canManageUsers(isOwner);
  const canChangeStatus = canManageUsers(isOwner);
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [departmentId, setDepartmentId] = useState(
    initialFilters.departmentId?.toString() ?? "",
  );
  const [roleId, setRoleId] = useState(
    initialFilters.roleId?.toString() ?? "",
  );
  const [status, setStatus] = useState(initialFilters.status ?? "");
  const [modalMode, setModalMode] = useState<UserModalMode | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [draft, setDraft] = useState(() =>
    createUserDraft(initialData.options),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();

  const [previousFilters, setPreviousFilters] = useState(initialFilters);
  if (previousFilters !== initialFilters) {
    setPreviousFilters(initialFilters);
    setSearch(initialFilters.search ?? "");
    setDepartmentId(initialFilters.departmentId?.toString() ?? "");
    setRoleId(initialFilters.roleId?.toString() ?? "");
    setStatus(initialFilters.status ?? "");
  }

  const updateUrl = useEffectEvent((nextSearch: string) => {
    const parameters = new URLSearchParams();
    if (nextSearch.trim()) parameters.set("search", nextSearch.trim());
    if (departmentId) parameters.set("department", departmentId);
    if (roleId) parameters.set("role", roleId);
    if (status) parameters.set("status", status);
    const query = parameters.toString();
    router.replace(query ? `/settings/users?${query}` : "/settings/users");
  });

  useEffect(() => {
    if (search === (initialFilters.search ?? "")) return;
    const timer = window.setTimeout(() => updateUrl(search), 300);
    return () => window.clearTimeout(timer);
  }, [search, initialFilters.search]);

  const navigateWithFilters = (
    overrides: Partial<{
      departmentId: string;
      page: number;
      roleId: string;
      search: string;
      status: string;
    }>,
  ) => {
    const parameters = new URLSearchParams();
    const values = {
      departmentId,
      page: initialData.page,
      roleId,
      search,
      status,
      ...overrides,
    };
    if (values.search.trim()) parameters.set("search", values.search.trim());
    if (values.departmentId)
      parameters.set("department", values.departmentId);
    if (values.roleId) parameters.set("role", values.roleId);
    if (values.status) parameters.set("status", values.status);
    if (values.page > 1) parameters.set("page", String(values.page));
    const query = parameters.toString();
    startTransition(() => {
      router.replace(query ? `/settings/users?${query}` : "/settings/users");
    });
  };

  const openModal = (mode: UserModalMode, user?: UserRecord) => {
    setSelectedUser(user ?? null);
    setDraft(createUserDraft(initialData.options, user));
    setFormError(null);
    setFeedback(null);
    setModalMode(mode);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedUser(null);
    setFormError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modalMode || modalMode === "view") return;

    const input = {
      approverUserId: draft.approverUserId,
      departmentId: draft.departmentId,
      firstName: draft.firstName,
      lastName: draft.lastName,
      password: draft.password,
      positionName: draft.positionName,
      roleId: draft.roleId,
      username: draft.username,
    };
    const validationError =
      modalMode === "create"
        ? validateCreateUserInput(input)
        : validateUserProfileInput(input);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (
      modalMode === "create" &&
      draft.password !== draft.passwordConfirmation
    ) {
      setFormError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    startTransition(async () => {
      const result =
        modalMode === "create"
          ? await createManagedUserAction(input)
          : selectedUser
            ? await updateManagedUserAction(selectedUser.userId, input)
            : { error: "ไม่พบผู้ใช้งานที่ต้องการแก้ไข" };
      if ("error" in result) {
        setFormError(result.error ?? "ไม่สามารถบันทึกผู้ใช้งานได้");
        return;
      }

      closeModal();
      setFeedback({
        message:
          modalMode === "create"
            ? "เพิ่มผู้ใช้งานเรียบร้อยแล้ว"
            : "แก้ไขผู้ใช้งานเรียบร้อยแล้ว",
        tone: "success",
      });
      router.refresh();
    });
  };

  const handleResetPassword = (password: string) => {
    if (!resetTarget) return;
    setFormError(null);
    startTransition(async () => {
      const result = await resetManagedUserPasswordAction(
        resetTarget.userId,
        password,
      );
      if ("error" in result) {
        setFormError(result.error ?? "ไม่สามารถตั้งรหัสผ่านใหม่ได้");
        return;
      }
      setResetTarget(null);
      setFeedback({
        message: "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว",
        tone: "success",
      });
    });
  };

  const handleStatus = (user: UserRecord) => {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await setManagedUserStatusAction(
        user.userId,
        nextStatus,
      );
      if ("error" in result) {
        setFeedback({
          message: result.error ?? "ไม่สามารถเปลี่ยนสถานะผู้ใช้งานได้",
          tone: "error",
        });
        return;
      }
      setFeedback({
        message:
          nextStatus === "active"
            ? "เปิดใช้งานบัญชีเรียบร้อยแล้ว"
            : "ระงับบัญชีเรียบร้อยแล้ว",
        tone: "success",
      });
      router.refresh();
    });
  };

  const totalPages = Math.max(
    1,
    Math.ceil(initialData.totalCount / initialData.pageSize),
  );

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 sm:flex sm:items-baseline sm:gap-3">
          <h1 className="shrink-0 text-[20px] font-bold tracking-[-0.025em] text-on-surface">
            ผู้ใช้งานและสิทธิ์
          </h1>
          <p className="mt-0.5 truncate text-[12px] font-medium text-secondary sm:mt-0">
            จัดการบัญชีผู้ใช้งาน Role และขอบเขตการเข้าถึงระบบ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExcelExportButton onClick={() => exportUsersToExcel(initialData.users)} />
          {canCreate ? <button
            className="inline-flex h-9 items-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/95"
            onClick={() => openModal("create")}
            type="button"
          >
            <Plus size={17} />
            เพิ่มผู้ใช้งาน
          </button> : null}
        </div>
      </header>

      {tabs ? <Fragment key="access-tabs">{tabs}</Fragment> : null}

      {feedback ? (
        <div
          className={`border px-3 py-2 text-[13px] font-bold ${
            feedback.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}

      <MobileListFilters
        activeCount={[departmentId, roleId, status].filter(Boolean).length}
        onClear={() => { setSearch(""); setDepartmentId(""); setRoleId(""); setStatus(""); startTransition(() => router.replace("/settings/users")); }}
        search={<ListSearchField onChange={setSearch} placeholder="ค้นหารหัสพนักงาน / ชื่อผู้ใช้งาน" value={search} />}
      >
        <ListFilterSelect label="แผนก" onChange={(value) => { setDepartmentId(value); navigateWithFilters({ departmentId: value, page: 1 }); }} value={departmentId}><option value="">ทั้งหมด</option>{initialData.options.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="Role" onChange={(value) => { setRoleId(value); navigateWithFilters({ page: 1, roleId: value }); }} value={roleId}><option value="">ทั้งหมด</option>{initialData.options.roles.map((role) => <option key={role.id} value={role.id}>{role.code}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); navigateWithFilters({ page: 1, status: value }); }} value={status}><option value="">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></ListFilterSelect>
      </MobileListFilters>
      <div className="hidden min-w-0 grid-cols-1 gap-2 md:grid md:grid-cols-2 lg:grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(120px,.75fr))_auto]">
        <label className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
            size={16}
          />
          <input
            className={filterClass + " pl-9"}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหารหัสพนักงาน / ชื่อผู้ใช้งาน"
            value={search}
          />
        </label>
        <select
          className={filterClass}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            navigateWithFilters({
              departmentId: event.target.value,
              page: 1,
            });
          }}
          value={departmentId}
        >
          <option value="">แผนก: ทั้งหมด</option>
          {initialData.options.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          className={filterClass}
          onChange={(event) => {
            setRoleId(event.target.value);
            navigateWithFilters({ page: 1, roleId: event.target.value });
          }}
          value={roleId}
        >
          <option value="">Role: ทั้งหมด</option>
          {initialData.options.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.code}
            </option>
          ))}
        </select>
        <select
          className={filterClass}
          onChange={(event) => {
            setStatus(event.target.value);
            navigateWithFilters({ page: 1, status: event.target.value });
          }}
          value={status}
        >
          <option value="">สถานะ: ทั้งหมด</option>
          <option value="active">ใช้งาน</option>
          <option value="inactive">ระงับ</option>
        </select>
        <button
          className="h-9 rounded-[4px] border border-primary px-4 text-[13px] font-bold text-primary hover:bg-primary/5"
          onClick={() => {
            setSearch("");
            setDepartmentId("");
            setRoleId("");
            setStatus("");
            startTransition(() => router.replace("/settings/users"));
          }}
          type="button"
        >
          ล้างตัวกรอง
        </button>
      </div>

      <section className="overflow-hidden rounded-[4px] border border-outline-variant bg-surface-container-lowest">
        <div className="sm:hidden">
          <MobileEntityList
            actionLabel={(user) => `${canEdit ? "แก้ไข" : "ดูรายละเอียด"} ${user.firstName}`}
            emptyText="ไม่พบข้อมูลผู้ใช้งาน"
            getKey={(user) => user.userId}
            items={initialData.users}
            meta={(user) => <>{user.departmentName} · {user.roleCode} · {user.username}</>}
            onAction={(user) => openModal(canEdit ? "edit" : "view", user)}
            onOpen={(user) => openModal("view", user)}
            primary={(user) => user.employeeCode}
            secondary={(user) => <>{user.firstName} {user.lastName}</>}
            status={(user) => <ActiveStatusBadge active={user.status === "active"} />}
          />
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="erp-data-table min-w-[1180px]">
            <thead className="bg-surface-container-low">
              <tr className="h-8 border-b border-outline-variant">
                <TableHeader className="w-[4%] text-center">ลำดับ</TableHeader>
                <TableHeader className="w-[10%]">รหัสพนักงาน</TableHeader>
                <TableHeader className="w-[15%]">ชื่อ-นามสกุล</TableHeader>
                <TableHeader className="w-[14%]">Username</TableHeader>
                <TableHeader className="w-[12%]">แผนก</TableHeader>
                <TableHeader className="w-[11%]">Role</TableHeader>
                <TableHeader className="w-[14%]">เข้าใช้ล่าสุด</TableHeader>
                <TableHeader className="w-[8%] text-center">สถานะ</TableHeader>
                <TableHeader className="w-[12%] text-center">จัดการ</TableHeader>
              </tr>
            </thead>
            <tbody>
              {initialData.users.map((user, index) => (
                <tr
                  className="h-[31px] border-b border-outline-variant last:border-0 hover:bg-surface-container-low/55"
                  key={user.userId}
                >
                  <TableCell className="text-center">
                    {(initialData.page - 1) * initialData.pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {user.employeeCode}
                  </TableCell>
                  <TableCell className="truncate font-semibold">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell className="truncate">{user.username}</TableCell>
                  <TableCell className="truncate">
                    {user.departmentName}
                  </TableCell>
                  <TableCell>{user.roleCode}</TableCell>
                  <TableCell>
                    {formatLastSignIn(user.lastSignInAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    <ActiveStatusBadge active={user.status === "active"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-4">
                      <ActionIcon
                        label={`ดูรายละเอียด ${user.firstName}`}
                        onClick={() => openModal("view", user)}
                      >
                        <Eye size={15} />
                      </ActionIcon>
                      {canEdit ? <ActionIcon
                        label={`แก้ไข ${user.firstName}`}
                        onClick={() => openModal("edit", user)}
                      >
                        <Pencil size={15} />
                      </ActionIcon> : null}
                      {canEdit ? <ActionIcon
                        label={`ตั้งรหัสผ่านใหม่ให้ ${user.firstName}`}
                        onClick={() => {
                          setFormError(null);
                          setResetTarget(user);
                        }}
                      >
                        <KeyRound size={15} />
                      </ActionIcon> : null}
                      {canChangeStatus ? <ActionIcon
                        label={
                          user.status === "active"
                            ? `ระงับ ${user.firstName}`
                            : `เปิดใช้งาน ${user.firstName}`
                        }
                        onClick={() => handleStatus(user)}
                      >
                        {user.status === "active" ? (
                          <CirclePause size={15} />
                        ) : (
                          <CirclePlay size={15} />
                        )}
                      </ActionIcon> : null}
                    </div>
                  </TableCell>
                </tr>
              ))}
              {initialData.users.length === 0 ? (
                <tr>
                  <td
                    className="h-24 text-center text-[13px] font-medium text-secondary"
                    colSpan={9}
                  >
                    ไม่พบผู้ใช้งานตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Pagination currentPage={initialData.page} disabled={isPending} onPageChange={(page) => navigateWithFilters({ page })} pageSize={20} totalItems={initialData.totalCount} totalPages={totalPages} />
      </section>

      {modalMode ? (
        <UserModal
          draft={draft}
          error={formError}
          isSaving={isPending}
          mode={modalMode}
          onChange={setDraft}
          onClose={closeModal}
          onSubmit={handleSubmit}
          options={initialData.options}
        />
      ) : null}

      {resetTarget ? (
        <PasswordResetModal
          error={formError}
          isSaving={isPending}
          name={`${resetTarget.employeeCode} - ${resetTarget.firstName} ${resetTarget.lastName}`}
          onClose={() => {
            if (!isPending) {
              setResetTarget(null);
              setFormError(null);
            }
          }}
          onSubmit={handleResetPassword}
        />
      ) : null}
    </div>
  );
}

const filterClass =
  "h-9 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-3 text-[13px] font-semibold text-on-surface outline-none placeholder:font-medium placeholder:text-secondary focus:border-primary dark:[color-scheme:dark]";

function formatLastSignIn(value: string | null) {
  if (!value) return "ยังไม่เคยเข้าใช้";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}


function ActionIcon({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="text-on-surface transition-colors hover:text-primary disabled:opacity-40"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function TableHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-2 text-left text-[12px] font-extrabold text-on-surface ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-2 text-[12px] font-medium text-on-surface ${className}`}
    >
      {children}
    </td>
  );
}
