"use client";

import { X } from "lucide-react";
import type { FormEvent } from "react";
import type { DepartmentManagerCandidate } from "@/app/actions/departments";
import type { DepartmentInput } from "@/lib/departments";
import { ToggleSwitch } from "@/components/toggle-switch";

export type DepartmentFormMode = "create" | "edit";

export function DepartmentModal({
  draft,
  error,
  isSaving,
  managerCandidates,
  mode,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: DepartmentInput;
  error: string | null;
  isSaving: boolean;
  managerCandidates: DepartmentManagerCandidate[];
  mode: DepartmentFormMode;
  onChange: (draft: DepartmentInput) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isActive = draft.status === "active";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-[680px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onSubmit={onSubmit}
      >
        <header className="flex h-14 items-center justify-between border-b border-outline-variant px-5">
          <div className="flex items-center gap-3">
            <span className="rounded-[3px] bg-primary px-2.5 py-1 text-[12px] font-black tracking-wider text-white">
              KRC ERP
            </span>
            <h2 className="text-[20px] font-bold text-on-surface">
              {mode === "create" ? "เพิ่มแผนก" : "แก้ไขแผนก"}
            </h2>
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

        <div className="p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-outline-variant pb-2.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">
              01
            </span>
            <h3 className="text-[16px] font-bold text-on-surface">
              ข้อมูลแผนก
            </h3>
          </div>

          {error ? (
            <div
              className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <FormField label="รหัสแผนก" required>
              <input
                autoFocus
                className={inputClassName}
                maxLength={12}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    code: event.target.value.toUpperCase(),
                  })
                }
                placeholder="เช่น PUR"
                value={draft.code}
              />
            </FormField>

            <FormField label="ชื่อแผนก" required>
              <input
                className={inputClassName}
                maxLength={100}
                onChange={(event) =>
                  onChange({ ...draft, name: event.target.value })
                }
                placeholder="เช่น จัดซื้อ"
                value={draft.name}
              />
            </FormField>

            <FormField label="หัวหน้าแผนก">
              <select
                className={`${inputClassName} dark:[color-scheme:dark]`}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    managerUserId: event.target.value || null,
                  })
                }
                value={draft.managerUserId ?? ""}
              >
                <option value="">เลือกหัวหน้าแผนก</option>
                {managerCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="สถานะใช้งาน">
              <ToggleSwitch checked={isActive} label={isActive ? "ใช้งาน" : "ระงับ"} onChange={(checked) => onChange({ ...draft, status: checked ? "active" : "inactive" })} />
            </FormField>

            <FormField className="sm:col-span-2" label="หมายเหตุ">
              <textarea
                className="min-h-24 w-full resize-none rounded-[5px] border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary"
                maxLength={500}
                onChange={(event) =>
                  onChange({ ...draft, remarks: event.target.value })
                }
                placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
                value={draft.remarks}
              />
              <span className="mt-1 block text-right text-[11px] font-medium text-secondary">
                {draft.remarks.length} / 500
              </span>
            </FormField>
          </div>
        </div>

        <footer className="flex h-16 items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-9 min-w-[108px] rounded-[5px] border border-outline-variant px-5 text-[14px] font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 min-w-[142px] rounded-[5px] bg-primary px-5 text-[14px] font-bold text-white transition-colors hover:bg-primary/95 disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกแผนก"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function FormField({
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
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  "h-10 w-full rounded-[5px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary";
