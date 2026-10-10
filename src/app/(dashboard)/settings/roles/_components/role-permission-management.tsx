"use client";

import { useListState, useRememberedListUrl } from "@/lib/use-list-state";

import { Plus, Search, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CompanyFormLogo } from "@/components/company-logo";
import {
  startTransition,
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createRoleAction,
  saveRolePermissionsAction,
  type RolePermissionSettingsData,
} from "@/app/actions/role-permissions";
import {
  filterPermissionGroups,
  getPermissionSelectionState,
  groupPermissionsByModule,
  PERMISSION_MODULE_CATEGORIES,
  toggleModulePermissions,
  togglePermissionWithViewDependency,
  type PermissionMatrixGroup,
} from "./permission-matrix";
import { useHasPermission } from "@/components/permission-context";
import { useUnsavedChanges } from "@/components/unsaved-changes";

const ACTION_COLUMNS = [
  { action: "view", label: "ดู" },
  { action: "create", label: "สร้าง" },
  { action: "count", label: "ตรวจนับ" },
  { action: "review", label: "ตรวจสอบ" },
  { action: "edit", label: "แก้ไข" },
  { action: "delete", label: "ลบ" },
  { action: "deactivate", label: "ระงับ" },
  { action: "cancel", label: "ยกเลิก" },
  { action: "approve", label: "อนุมัติ" },
  { action: "reject", label: "ปฏิเสธ" },
  { action: "export", label: "ส่งออก" },
] as const;

function groupByCategory(groups: PermissionMatrixGroup[]) {
  const remaining = new Set(groups.map((group) => group.moduleCode));

  return PERMISSION_MODULE_CATEGORIES.map((category) => {
    const categoryGroups = groups.filter((group) =>
      category.modules.includes(group.moduleCode),
    );
    categoryGroups.forEach((group) => remaining.delete(group.moduleCode));
    return { ...category, groups: categoryGroups };
  })
    .concat({
      label: "อื่นๆ",
      modules: [],
      groups: groups.filter((group) => remaining.has(group.moduleCode)),
    })
    .filter((category) => category.groups.length > 0);
}

type Feedback = {
  message: string;
  tone: "error" | "success";
};

export function RolePermissionManagement({
  initialData,
  tabs,
}: {
  initialData: RolePermissionSettingsData;
  tabs?: ReactNode;
}) {
  useRememberedListUrl();
  const router = useRouter();
  const canManageRoles = useHasPermission("roles.manage");
  const firstRole = initialData.roles[0] ?? null;
  const [selectedRoleId, setSelectedRoleId] = useState(firstRole?.id ?? 0);
  const [draftPermissionIds, setDraftPermissionIds] = useState<Set<number>>(
    new Set(firstRole ? initialData.rolePermissionIds[firstRole.id] ?? [] : []),
  );
  const [savedPermissionIds, setSavedPermissionIds] = useState<Set<number>>(
    new Set(firstRole ? initialData.rolePermissionIds[firstRole.id] ?? [] : []),
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [searchQuery, setSearchQuery] = useListState("searchQuery", "");
  const [mobileGroupCode, setMobileGroupCode] = useState<string | null>(null);
  const [mobileGroupSnapshot, setMobileGroupSnapshot] = useState<Set<number> | null>(null);

  const selectedRole =
    initialData.roles.find((role) => role.id === selectedRoleId) ?? firstRole;
  const hasChanges =
    draftPermissionIds.size !== savedPermissionIds.size ||
    [...draftPermissionIds].some(
      (permissionId) => !savedPermissionIds.has(permissionId),
    );

  const groupedPermissions = groupPermissionsByModule(initialData.permissions);
  const visibleGroups = filterPermissionGroups(
    groupedPermissions,
    searchQuery,
  );
  const visibleCategories = groupByCategory(visibleGroups);
  const mobileGroup = groupedPermissions.find(
    (group) => group.moduleCode === mobileGroupCode,
  );

  useUnsavedChanges("role-permissions", hasChanges);


  const handleRoleSelect = (roleId: number) => {
    if (
      hasChanges &&
      !window.confirm("มีการแก้ไขสิทธิ์ที่ยังไม่ได้บันทึก ต้องการยกเลิกหรือไม่")
    ) {
      return;
    }

    const rolePermissions = new Set(initialData.rolePermissionIds[roleId] ?? []);
    setSelectedRoleId(roleId);
    setDraftPermissionIds(rolePermissions);
    setSavedPermissionIds(new Set(rolePermissions));
    setFeedback(null);
    setSearchQuery("");
    setMobileGroupCode(null);
    setMobileGroupSnapshot(null);
  };

  const openMobileGroup = (group: PermissionMatrixGroup) => {
    setMobileGroupCode(group.moduleCode);
    setMobileGroupSnapshot(
      new Set(
        group.permissions
          .map((permission) => permission.id)
          .filter((permissionId) => draftPermissionIds.has(permissionId)),
      ),
    );
  };

  const closeMobileGroup = (restore: boolean) => {
    if (restore && mobileGroup && mobileGroupSnapshot) {
      const groupIds = new Set(
        mobileGroup.permissions.map((permission) => permission.id),
      );
      setDraftPermissionIds((current) => {
        const next = new Set(
          [...current].filter((permissionId) => !groupIds.has(permissionId)),
        );
        mobileGroupSnapshot.forEach((permissionId) => next.add(permissionId));
        return next;
      });
    }
    setMobileGroupCode(null);
    setMobileGroupSnapshot(null);
  };

  const handleModuleToggle = (group: PermissionMatrixGroup) => {
    if (selectedRole?.isOwner || !canManageRoles) return;
    setDraftPermissionIds((current) =>
      toggleModulePermissions(current, group),
    );
  };

  const handlePermissionToggle = (group: PermissionMatrixGroup, permissionId: number) => {
    if (selectedRole?.isOwner || !canManageRoles) return;

    setDraftPermissionIds((current) =>
      togglePermissionWithViewDependency(current, group, permissionId),
    );
  };

  const handleCancel = () => {
    setDraftPermissionIds(new Set(savedPermissionIds));
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!selectedRole || selectedRole.isOwner || !canManageRoles || !hasChanges) return;

    setIsSaving(true);
    const result = await saveRolePermissionsAction(
      selectedRole.id,
      [...draftPermissionIds],
    );
    setIsSaving(false);

    if ("error" in result && result.error) {
      setFeedback({ message: result.error, tone: "error" });
      return;
    }

    setSavedPermissionIds(new Set(draftPermissionIds));
    setFeedback({ message: "บันทึกสิทธิ์เรียบร้อยแล้ว", tone: "success" });
    startTransition(() => router.refresh());
  };

  if (!selectedRole) {
    return (
      <section className="border border-outline-variant bg-surface-container-lowest p-6 text-center text-[14px] font-semibold text-secondary">
        ยังไม่มี Role ในระบบ
      </section>
    );
  }

  return (
    <div className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0 sm:flex sm:items-baseline sm:gap-3">
          <h1 className="shrink-0 text-[20px] font-bold leading-tight tracking-[-0.02em] text-on-surface">
            ผู้ใช้งานและสิทธิ์
          </h1>
          <p className="mt-0.5 hidden truncate text-[12px] font-medium text-secondary sm:mt-0 sm:block">
            จัดการบัญชีผู้ใช้งาน Role และขอบเขตการเข้าถึงระบบ
          </p>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-3 text-[12px] font-bold text-white transition-colors hover:bg-primary/95 sm:px-4 sm:text-[13px]"
          onClick={() => {
            setFeedback(null);
            setIsCreateOpen(true);
          }}
          disabled={!canManageRoles}
          type="button"
        >
          <Plus size={16} strokeWidth={2.2} />
          เพิ่ม Role
        </button>
      </header>

      {tabs ? <Fragment key="access-tabs">{tabs}</Fragment> : null}

      {feedback ? (
        <div
          className={`border px-4 py-2.5 text-[13px] font-bold ${
            feedback.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="space-y-0 border border-outline-variant bg-surface-container-lowest lg:hidden">
        <label className="block border-b border-outline-variant p-3">
          <span className="mb-1 block text-[11px] font-bold text-secondary">Role ที่กำลังจัดการ</span>
          <select
            className="h-11 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
            onChange={(event) => handleRoleSelect(Number(event.target.value))}
            value={selectedRole.id}
          >
            {initialData.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.code} — {role.name}
              </option>
            ))}
          </select>
        </label>

        <div className="border-b border-outline-variant p-3">
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
              size={18}
            />
            <input
              aria-label="ค้นหาสิทธิ์บนมือถือ"
              className="h-11 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-[14px] outline-none placeholder:text-secondary focus:border-primary"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ค้นหาโมดูลหรือสิทธิ์..."
              value={searchQuery}
            />
          </label>
        </div>

        {visibleCategories.map((category) => (
          <section key={category.label}>
            <h2 className="border-b border-outline-variant bg-primary/[0.035] px-3 py-2 text-[13px] font-black text-primary">
              {category.label}
            </h2>
            {category.groups.map((group) => {
              const selectedCount = group.permissions.filter((permission) =>
                draftPermissionIds.has(permission.id),
              ).length;
              return (
                <button
                  className="flex min-h-14 w-full items-center gap-3 border-b border-outline-variant px-3 text-left transition-colors hover:bg-surface-container-low"
                  key={group.moduleCode}
                  onClick={() => openMobileGroup(group)}
                  type="button"
                >
                  <span className="min-w-0 flex-1 text-[14px] font-bold text-on-surface">
                    {group.moduleName}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-secondary">
                    {selectedCount}/{group.permissions.length}
                  </span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-on-surface">
                    chevron_right
                  </span>
                </button>
              );
            })}
          </section>
        ))}

        {visibleGroups.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13px] font-medium text-secondary">
            ไม่พบโมดูลหรือสิทธิ์ที่ค้นหา
          </p>
        ) : null}

        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-outline-variant bg-surface-container-lowest p-3">
          <button
            className="h-11 rounded-[3px] border border-outline-variant text-[14px] font-bold text-on-surface disabled:opacity-45"
            disabled={!hasChanges || isSaving}
            onClick={handleCancel}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-11 rounded-[3px] bg-primary text-[14px] font-bold text-white disabled:opacity-45"
            disabled={selectedRole.isOwner || !canManageRoles || !hasChanges || isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
          </button>
        </div>
      </div>

      <div className="hidden min-h-[calc(100vh-145px)] grid-cols-1 border border-outline-variant bg-surface-container-lowest lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-outline-variant lg:border-b-0 lg:border-r">
          <div className="flex h-11 items-center justify-between border-b border-outline-variant px-3.5">
            <h2 className="text-[14px] font-bold text-on-surface">รายการ Role</h2>
            <UserRoundCog className="text-secondary" size={18} />
          </div>
          <div>
            {initialData.roles.map((role) => {
              const isSelected = role.id === selectedRole.id;
              return (
                <button
                  className={`flex h-11 w-full items-center gap-2 border-b border-outline-variant px-3.5 text-left transition-colors ${
                    isSelected
                      ? "border-l-[3px] border-l-primary bg-primary/[0.055] text-primary"
                      : "border-l-[3px] border-l-transparent text-on-surface hover:bg-surface-container-low"
                  }`}
                  key={role.id}
                  onClick={() => handleRoleSelect(role.id)}
                  type="button"
                >
                  <span className="text-[13px] font-bold">{role.code}</span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
                      isSelected ? "text-primary" : "text-secondary"
                    }`}
                  >
                    {role.name}
                  </span>
                  <span className="text-[12px] font-semibold text-secondary">
                    {role.userCount}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-outline-variant px-3 py-1.5">
            <div className="mr-auto flex min-w-0 items-center gap-2">
              <h2 className="truncate text-[15px] font-bold text-on-surface">
                {selectedRole.code}
                <span className="mx-2 text-secondary">—</span>
                {selectedRole.name}
              </h2>
              {selectedRole.isOwner ? (
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[3px] border border-primary px-2 text-[11px] font-bold text-primary">
                  <ShieldCheck size={13} />
                  Role สูงสุด
                </span>
              ) : null}
              {hasChanges ? (
                <span className="hidden shrink-0 text-[11px] font-semibold text-amber-700 xl:inline dark:text-amber-300">
                  มีการแก้ไขที่ยังไม่บันทึก
                </span>
              ) : null}
            </div>
            <label className="relative min-w-[190px] flex-1 sm:max-w-[240px]">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary"
                size={15}
              />
              <input
                aria-label="ค้นหาสิทธิ์"
                className="h-8 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest pl-8 pr-3 text-[12px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ค้นหาโมดูลหรือสิทธิ์..."
                value={searchQuery}
              />
            </label>
            <button
              className="h-8 min-w-[82px] rounded-[3px] border border-outline-variant px-3 text-[12px] font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasChanges || isSaving}
              onClick={handleCancel}
              type="button"
            >
              ยกเลิก
            </button>
            <button
              className="h-8 min-w-[104px] rounded-[3px] bg-primary px-3 text-[12px] font-bold text-white transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={selectedRole.isOwner || !canManageRoles || !hasChanges || isSaving}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
            </button>
          </div>

          <div className="border-b border-primary/25 bg-primary/8 px-4 py-2 text-[12px] font-semibold text-on-surface">
            เลือกสิทธิ์ดำเนินการ ระบบจะเปิดสิทธิ์ “ดู” ของโมดูลนั้นให้อัตโนมัติ เพื่อให้ผู้ใช้เข้าถึงงานที่ได้รับมอบหมายได้
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="erp-data-table w-[856px] min-w-[856px] table-fixed">
              <colgroup>
                <col className="w-[240px]" />
                {ACTION_COLUMNS.map((column) => (
                  <col className="w-[56px]" key={column.action} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-container-lowest">
                <tr className="h-9 border-b border-outline-variant bg-surface-container-low">
                  <th className="sticky left-0 z-20 border-r border-outline-variant bg-surface-container-low px-3 text-left text-[13px] font-bold text-on-surface">
                    สิทธิ์
                  </th>
                  {ACTION_COLUMNS.map((column) => (
                    <th
                      className="px-0 text-center text-[12px] font-bold text-on-surface"
                      key={column.action}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCategories.map((category) => (
                  <Fragment key={category.label}>
                    <tr className="h-8 border-b border-outline-variant bg-surface-container-low">
                      <td
                        className="px-4 text-[12px] font-black uppercase tracking-[0.08em] text-primary"
                        colSpan={ACTION_COLUMNS.length + 1}
                      >
                        {category.label}
                      </td>
                    </tr>
                    {category.groups.map((group) => (
                      <PermissionModuleRow
                        draftPermissionIds={draftPermissionIds}
                        group={group}
                        isLocked={selectedRole.isOwner || !canManageRoles}
                        key={group.moduleCode}
                        onModuleToggle={() => handleModuleToggle(group)}
                        onPermissionToggle={handlePermissionToggle}
                      />
                    ))}
                  </Fragment>
                ))}
                {visibleGroups.length === 0 ? (
                  <tr>
                    <td
                      className="h-24 px-4 text-center text-[13px] font-medium text-secondary"
                      colSpan={ACTION_COLUMNS.length + 1}
                    >
                      ไม่พบโมดูลหรือสิทธิ์ที่ค้นหา
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {mobileGroup ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/35 lg:hidden" role="presentation">
          <section
            aria-label={`กำหนดสิทธิ์ ${mobileGroup.moduleName}`}
            aria-modal="true"
            className="flex max-h-[78dvh] w-full flex-col rounded-t-[8px] border border-outline-variant bg-surface-container-lowest shadow-[0_-8px_24px_rgb(0_0_0/0.16)]"
            role="dialog"
          >
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-outline-variant" />
            <header className="border-b border-outline-variant px-4 pb-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-bold text-on-surface">{mobileGroup.moduleName}</h2>
                  <p className="mt-0.5 text-[12px] font-medium text-secondary">
                    กำหนดสิทธิ์สำหรับ {selectedRole.code}
                  </p>
                </div>
                <button
                  aria-label="ปิดหน้าต่างสิทธิ์"
                  className="grid size-11 place-items-center text-on-surface"
                  onClick={() => closeMobileGroup(true)}
                  type="button"
                >
                  <X size={22} />
                </button>
              </div>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-[13px] font-bold text-primary">
                <MatrixCheckbox
                  label={`เลือกสิทธิ์ทั้งหมดของ ${mobileGroup.moduleName}`}
                  locked={selectedRole.isOwner || !canManageRoles}
                  onChange={() => handleModuleToggle(mobileGroup)}
                  permissionIds={mobileGroup.permissions.map((permission) => permission.id)}
                  selectedPermissionIds={draftPermissionIds}
                />
                เลือกทั้งหมด
              </label>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {ACTION_COLUMNS.map((column) => {
                const permission = mobileGroup.permissionsByAction[column.action];
                if (!permission) return null;
                return (
                  <label
                    className="flex min-h-14 items-center gap-3 border-b border-outline-variant py-2"
                    key={column.action}
                  >
                    <span className="min-w-0 flex-1 text-[15px] font-bold text-on-surface">
                      {column.label}
                    </span>
                    <MatrixCheckbox
                      label={`${mobileGroup.moduleName}: ${column.label}`}
                      locked={selectedRole.isOwner || !canManageRoles}
                      onChange={() => handlePermissionToggle(mobileGroup, permission.id)}
                      permissionIds={[permission.id]}
                      selectedPermissionIds={draftPermissionIds}
                    />
                  </label>
                );
              })}
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t border-outline-variant bg-surface-container-lowest p-3">
              <button
                className="h-11 rounded-[3px] border border-primary text-[14px] font-bold text-primary"
                onClick={() => closeMobileGroup(true)}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="h-11 rounded-[3px] bg-primary text-[14px] font-bold text-white"
                onClick={() => closeMobileGroup(false)}
                type="button"
              >
                ยืนยัน {mobileGroup.permissions.filter((permission) => draftPermissionIds.has(permission.id)).length} สิทธิ์
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isCreateOpen ? (
        <CreateRoleModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={(roleId) => {
            setIsCreateOpen(false);
            setSelectedRoleId(roleId);
            setDraftPermissionIds(new Set());
            setSavedPermissionIds(new Set());
            setFeedback({ message: "เพิ่ม Role เรียบร้อยแล้ว", tone: "success" });
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}

function MatrixCheckbox({
  label,
  locked,
  onChange,
  permissionIds,
  selectedPermissionIds,
}: {
  label: string;
  locked: boolean;
  onChange: () => void;
  permissionIds: number[];
  selectedPermissionIds: Set<number>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionState = getPermissionSelectionState(
    selectedPermissionIds,
    permissionIds,
  );

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = selectionState.indeterminate;
    }
  }, [selectionState.indeterminate]);

  if (permissionIds.length === 0) {
    return (
      <span
        aria-label={`${label}: ไม่มีสิทธิ์นี้`}
        className="text-[11px] font-medium text-outline"
        title="โมดูลนี้ไม่มีสิทธิ์ดังกล่าว"
      >
        —
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      aria-disabled={locked}
      aria-label={label}
      checked={selectionState.checked}
      className={`h-4 w-4 shrink-0 accent-[#247a36] ${
        locked ? "cursor-default" : "cursor-pointer"
      }`}
      onChange={locked ? undefined : onChange}
      readOnly={locked}
      tabIndex={locked ? -1 : 0}
      title={locked ? `${label} (Role นี้ถูกล็อก)` : label}
      type="checkbox"
    />
  );
}

function PermissionModuleRow({
  draftPermissionIds,
  group,
  isLocked,
  onModuleToggle,
  onPermissionToggle,
}: {
  draftPermissionIds: Set<number>;
  group: PermissionMatrixGroup;
  isLocked: boolean;
  onModuleToggle: () => void;
  onPermissionToggle: (group: PermissionMatrixGroup, permissionId: number) => void;
}) {
  return (
    <tr className="group h-10 border-b border-outline-variant transition-colors hover:bg-surface-container-low/50">
      <th className="sticky left-0 z-[5] border-r border-outline-variant bg-surface-container-lowest px-3 py-1 text-left align-middle group-hover:bg-surface-container-low">
        <span className="flex min-h-7 items-center gap-2 whitespace-normal">
          <MatrixCheckbox
            label={`เลือกสิทธิ์ทั้งหมดของ ${group.moduleName}`}
            locked={isLocked}
            onChange={onModuleToggle}
            permissionIds={group.permissions.map(
              (permission) => permission.id,
            )}
            selectedPermissionIds={draftPermissionIds}
          />
          <span className="py-0.5 text-[14px] font-bold leading-6 text-on-surface">
            {group.moduleName}
          </span>
        </span>
      </th>
      {ACTION_COLUMNS.map((column) => {
        const permission = group.permissionsByAction[column.action];

        return (
          <td className="px-0 text-center" key={column.action}>
            <MatrixCheckbox
              label={`${group.moduleName}: ${column.label}`}
              locked={isLocked}
              onChange={() => {
                if (permission) onPermissionToggle(group, permission.id);
              }}
              permissionIds={permission ? [permission.id] : []}
              selectedPermissionIds={draftPermissionIds}
            />
          </td>
        );
      })}
    </tr>
  );
}

function CreateRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (roleId: number) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    const result = await createRoleAction({ code, description, name });
    setIsSaving(false);

    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    if (typeof result.data !== "number") {
      setError("ไม่สามารถอ่านรหัส Role ที่สร้างได้");
      return;
    }

    onCreated(result.data);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-[520px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onSubmit={handleSubmit}
      >
        <header className="flex h-14 items-center justify-between border-b border-outline-variant px-5">
          <div className="flex items-center gap-3">
            <CompanyFormLogo />
            <h2 className="text-[19px] font-bold text-on-surface">เพิ่ม Role</h2>
          </div>
          <button
            aria-label="ปิด"
            className="text-secondary hover:text-on-surface"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="grid gap-4 p-5">
          {error ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          ) : null}
          <label className="grid gap-1.5">
            <span className="text-[13px] font-bold text-on-surface">
              รหัส Role <span className="text-primary">*</span>
            </span>
            <input
              autoFocus
              className={inputClassName}
              maxLength={30}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="เช่น SUPERVISOR"
              value={code}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-bold text-on-surface">
              ชื่อ Role <span className="text-primary">*</span>
            </span>
            <input
              className={inputClassName}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="เช่น หัวหน้างาน"
              value={name}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-bold text-on-surface">คำอธิบาย</span>
            <textarea
              className={`${inputClassName} h-20 resize-none py-2`}
              maxLength={255}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="ระบุขอบเขตการใช้งานของ Role"
              value={description}
            />
          </label>
        </div>

        <footer className="flex h-16 items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-10 min-w-[100px] rounded-[3px] border border-outline-variant px-4 text-[14px] font-bold text-on-surface hover:bg-surface-container-low"
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-10 min-w-[124px] rounded-[3px] bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary/95 disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "กำลังเพิ่ม..." : "เพิ่ม Role"}
          </button>
        </footer>
      </form>
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary";
