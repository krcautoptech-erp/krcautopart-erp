"use client";

import { Plus, Search, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { useRouter } from "next/navigation";
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
  toggleModulePermissions,
  type PermissionMatrixGroup,
} from "./permission-matrix";

const ACTION_COLUMNS = [
  { action: "view", label: "ดู" },
  { action: "create", label: "สร้าง" },
  { action: "edit", label: "แก้ไข" },
  { action: "delete", label: "ลบ" },
  { action: "deactivate", label: "ระงับ" },
  { action: "cancel", label: "ยกเลิก" },
  { action: "approve", label: "อนุมัติ" },
  { action: "reject", label: "ปฏิเสธ" },
] as const;

const MODULE_CATEGORIES: { label: string; modules: string[] }[] = [
  { label: "ข้อมูลกลาง", modules: ["items", "assets", "partners"] },
  { label: "จัดซื้อและคลังสินค้า", modules: ["pr", "po", "inventory"] },
  {
    label: "ตั้งค่าระบบ",
    modules: [
      "company",
      "partner_settings",
      "material_settings",
      "item_types",
      "document_terms",
      "warehouses",
      "departments",
    ],
  },
  { label: "ผู้ใช้งานและความปลอดภัย", modules: ["users", "roles"] },
  { label: "Legacy / เดิม", modules: ["mdm"] },
];

function groupByCategory(groups: PermissionMatrixGroup[]) {
  const remaining = new Set(groups.map((group) => group.moduleCode));

  return MODULE_CATEGORIES.map((category) => {
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
  const router = useRouter();
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
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

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
  };

  const handleModuleToggle = (group: PermissionMatrixGroup) => {
    if (selectedRole?.isOwner) return;
    setDraftPermissionIds((current) =>
      toggleModulePermissions(current, group),
    );
  };

  const handlePermissionToggle = (permissionId: number) => {
    if (selectedRole?.isOwner) return;

    setDraftPermissionIds((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const handleCancel = () => {
    setDraftPermissionIds(new Set(savedPermissionIds));
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!selectedRole || selectedRole.isOwner || !hasChanges) return;

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
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-on-surface">
            ผู้ใช้งานและสิทธิ์
          </h1>
          <p className="mt-1 text-[13px] font-medium text-secondary">
            จัดการบัญชีผู้ใช้งาน Role และขอบเขตการเข้าถึงระบบ
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[4px] bg-primary px-5 text-[14px] font-bold text-white transition-colors hover:bg-primary/95"
          onClick={() => {
            setFeedback(null);
            setIsCreateOpen(true);
          }}
          type="button"
        >
          <Plus size={18} strokeWidth={2.2} />
          เพิ่ม Role
        </button>
      </header>

      {tabs}

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

      <div className="grid min-h-[calc(100vh-175px)] grid-cols-1 border border-outline-variant bg-surface-container-lowest lg:grid-cols-[245px_minmax(0,1fr)]">
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
              disabled={selectedRole.isOwner || !hasChanges || isSaving}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="erp-data-table min-w-[980px]">
              <colgroup>
                <col className="w-[500px]" />
                {ACTION_COLUMNS.map((column) => (
                  <col className="w-[60px]" key={column.action} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-container-lowest">
                <tr className="h-9 border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 text-left text-[14px] font-bold text-on-surface">
                    สิทธิ์
                  </th>
                  {ACTION_COLUMNS.map((column) => (
                    <th
                      className="px-0 text-center text-[13px] font-bold text-on-surface"
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
                        isLocked={selectedRole.isOwner}
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
  onPermissionToggle: (permissionId: number) => void;
}) {
  return (
    <tr className="h-10 border-b border-outline-variant transition-colors hover:bg-surface-container-low/50">
      <th className="px-3 py-1 text-left align-middle">
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
          <span className="shrink-0 py-0.5 text-[11px] font-semibold uppercase leading-5 text-secondary">
            {group.moduleCode}
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
                if (permission) onPermissionToggle(permission.id);
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
            <span className="rounded-[3px] bg-primary px-2.5 py-1 text-[11px] font-black tracking-wider text-white">
              KRC ERP
            </span>
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
