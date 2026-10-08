"use client";

import { KeyRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { validateManagedPassword } from "@/lib/user-management";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export function PasswordResetModal({
  error,
  isSaving,
  name,
  onClose,
  onSubmit,
}: {
  error: string | null;
  isSaving: boolean;
  name: string;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  useBodyScrollLock(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateManagedPassword(password);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    if (password !== confirmation) {
      setLocalError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    setLocalError(null);
    onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm overscroll-contain" onClick={onClose} role="dialog" aria-modal="true">
      <form
        className="w-full max-w-[460px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl overscroll-contain"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="flex h-14 items-center justify-between border-b border-outline-variant px-5">
          <div className="flex items-center gap-3">
            <KeyRound className="text-primary" size={20} />
            <div>
              <h2 className="text-[18px] font-bold text-on-surface">
                ตั้งรหัสผ่านใหม่
              </h2>
              <p className="text-[12px] font-medium text-secondary">{name}</p>
            </div>
          </div>
          <button
            aria-label="ปิดหน้าต่าง"
            className="text-on-surface hover:text-primary"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X size={21} />
          </button>
        </header>

        <div className="space-y-3 p-5">
          {localError || error ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {localError ?? error}
            </div>
          ) : null}
          <PasswordField
            autoFocus
            label="รหัสผ่านใหม่"
            onChange={setPassword}
            value={password}
          />
          <PasswordField
            label="ยืนยันรหัสผ่าน"
            onChange={setConfirmation}
            value={confirmation}
          />
          <p className="text-[11px] font-medium leading-5 text-secondary">
            อย่างน้อย 8 ตัวอักษร และต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข
          </p>
        </div>

        <footer className="flex h-14 items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-9 min-w-[96px] rounded-[5px] border border-outline-variant px-4 text-[14px] font-bold text-on-surface"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 min-w-[150px] rounded-[5px] bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function PasswordField({
  autoFocus = false,
  label,
  onChange,
  value,
}: {
  autoFocus?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-on-surface">
        {label} <span className="text-primary">*</span>
      </span>
      <input
        autoComplete="new-password"
        autoFocus={autoFocus}
        className="h-10 w-full rounded-[5px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none focus:border-primary"
        maxLength={72}
        minLength={8}
        onChange={(event) => onChange(event.target.value)}
        required
        type="password"
        value={value}
      />
    </label>
  );
}
