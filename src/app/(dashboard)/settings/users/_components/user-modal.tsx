"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  UserManagementOptions,
  UserRecord,
} from "@/app/actions/users";
import type { UserFormInput } from "@/lib/user-management";
import { CompanyFormLogo } from "@/components/company-logo";

export type UserModalMode = "create" | "edit" | "view";

type UserDraft = UserFormInput & {
  employeeCode: string;
  passwordConfirmation: string;
};

export function createUserDraft(
  options: UserManagementOptions,
  user?: UserRecord,
): UserDraft {
  return {
    approverUserId: user?.approverUserId ?? null,
    departmentId: user?.departmentId ?? options.departments[0]?.id ?? 0,
    employeeCode: user?.employeeCode ?? options.nextEmployeeCode,
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    password: "",
    passwordConfirmation: "",
    positionName: user?.positionName ?? "",
    roleId: user?.roleId ?? options.roles.find((role) => !role.isOwner)?.id ?? 0,
    username: user?.username ?? "",
  };
}

export function UserModal({
  draft,
  error,
  isSaving,
  mode,
  onChange,
  onClose,
  onSubmit,
  options,
}: {
  draft: UserDraft;
  error: string | null;
  isSaving: boolean;
  mode: UserModalMode;
  onChange: (draft: UserDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  options: UserManagementOptions;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isReadOnly = mode === "view";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[920px] overflow-y-auto rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onSubmit={onSubmit}
      >
        <header className="flex h-[58px] items-center justify-between border-b border-outline-variant px-5">
          <div className="flex items-center gap-3">
            <CompanyFormLogo />
            <div>
              <h2 className="text-[20px] font-bold leading-tight text-on-surface">
                {mode === "create"
                  ? "เพิ่มผู้ใช้งาน"
                  : mode === "edit"
                    ? "แก้ไขผู้ใช้งาน"
                    : "รายละเอียดผู้ใช้งาน"}
              </h2>
              <p className="text-[11px] font-medium text-secondary">
                จัดการบัญชี แผนก Role และสายอนุมัติของพนักงาน
              </p>
            </div>
          </div>
          <button
            aria-label="ปิดหน้าต่าง"
            className="text-on-surface transition-colors hover:text-primary"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X size={22} />
          </button>
        </header>

        <div className="grid md:grid-cols-2">
          <section className="space-y-3 border-b border-outline-variant p-5 md:border-b-0 md:border-r">
            <SectionTitle number="01" title="ข้อมูลพนักงาน" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="รหัสพนักงาน">
                <input
                  className={inputClass}
                  disabled
                  value={draft.employeeCode}
                />
              </Field>
              <Field label="Username" required>
                <input
                  autoComplete="off"
                  className={inputClass}
                  disabled={mode !== "create"}
                  maxLength={30}
                  minLength={8}
                  onChange={(event) =>
                    onChange({ ...draft, username: event.target.value })
                  }
                  placeholder="อย่างน้อย 8 ตัว เช่น somchai.krc"
                  required
                  value={draft.username}
                />
              </Field>
              <Field label="ชื่อ" required>
                <input
                  className={inputClass}
                  disabled={isReadOnly}
                  maxLength={100}
                  onChange={(event) =>
                    onChange({ ...draft, firstName: event.target.value })
                  }
                  required
                  value={draft.firstName}
                />
              </Field>
              <Field label="นามสกุล" required>
                <input
                  className={inputClass}
                  disabled={isReadOnly}
                  maxLength={100}
                  onChange={(event) =>
                    onChange({ ...draft, lastName: event.target.value })
                  }
                  required
                  value={draft.lastName}
                />
              </Field>
              <Field className="sm:col-span-2" label="ตำแหน่ง">
                <input
                  className={inputClass}
                  disabled={isReadOnly}
                  maxLength={120}
                  onChange={(event) =>
                    onChange({ ...draft, positionName: event.target.value })
                  }
                  placeholder="เช่น เจ้าหน้าที่จัดซื้อ"
                  value={draft.positionName}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3 p-5">
            <SectionTitle number="02" title="สิทธิ์และสายงาน" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="แผนก" required>
                <select
                  className={inputClass}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      departmentId: Number(event.target.value),
                    })
                  }
                  required
                  value={draft.departmentId}
                >
                  {options.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role" required>
                <select
                  className={inputClass}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    onChange({ ...draft, roleId: Number(event.target.value) })
                  }
                  required
                  value={draft.roleId}
                >
                  {options.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.code} - {role.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field className="sm:col-span-2" label="ผู้อนุมัติประจำ">
                <select
                  className={inputClass}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      approverUserId: event.target.value || null,
                    })
                  }
                  value={draft.approverUserId ?? ""}
                >
                  <option value="">ไม่กำหนด</option>
                  {options.approvers.map((approver) => (
                      <option key={approver.id} value={approver.id}>
                        {approver.employeeCode} - {approver.name}
                      </option>
                    ))}
                </select>
              </Field>

              {mode === "create" ? (
                <>
                  <Field label="รหัสผ่าน" required>
                    <div className="relative">
                      <input
                        autoComplete="new-password"
                        className={`${inputClass} pr-10`}
                        maxLength={72}
                        minLength={8}
                        onChange={(event) =>
                          onChange({ ...draft, password: event.target.value })
                        }
                        required
                        type={showPassword ? "text" : "password"}
                        value={draft.password}
                      />
                      <button
                        aria-label={
                          showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary"
                        onClick={() => setShowPassword((value) => !value)}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </Field>
                  <Field label="ยืนยันรหัสผ่าน" required>
                    <input
                      autoComplete="new-password"
                      className={inputClass}
                      maxLength={72}
                      minLength={8}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          passwordConfirmation: event.target.value,
                        })
                      }
                      required
                      type={showPassword ? "text" : "password"}
                      value={draft.passwordConfirmation}
                    />
                  </Field>
                  <p className="sm:col-span-2 text-[11px] font-medium leading-5 text-secondary">
                    รหัสผ่านต้องมี 8-72 ตัว และมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก
                    และตัวเลข ผู้ใช้งานไม่สามารถเปลี่ยนเองได้
                  </p>
                </>
              ) : null}
            </div>
          </section>
        </div>

        {error ? (
          <div
            className="mx-5 mb-3 border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <footer className="flex h-[58px] items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-9 min-w-[105px] rounded-[5px] border border-outline-variant px-4 text-[14px] font-bold text-on-surface"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            {isReadOnly ? "ปิด" : "ยกเลิก"}
          </button>
          {!isReadOnly ? (
            <button
              className="h-9 min-w-[145px] rounded-[5px] bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-50"
              disabled={isSaving}
              type="submit"
            >
              {isSaving
                ? "กำลังบันทึก..."
                : mode === "create"
                  ? "บันทึกผู้ใช้งาน"
                  : "บันทึกการแก้ไข"}
            </button>
          ) : null}
        </footer>
      </form>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-[5px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary disabled:bg-surface-container-low disabled:text-secondary focus:border-primary dark:[color-scheme:dark]";

function Field({
  children,
  className = "",
  label,
  required = false,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[13px] font-bold text-on-surface">
        {label} {required ? <span className="text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-outline-variant pb-2">
      <span className="text-[13px] font-extrabold tracking-[0.12em] text-primary">
        {number}
      </span>
      <h3 className="text-[16px] font-bold text-on-surface">{title}</h3>
    </div>
  );
}
