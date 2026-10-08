"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, X, AlertCircle } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export type ConfirmModalProps = {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void> | void;
  title: string;
  description?: string;
  message?: string;
  itemName?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "warning" | "primary";
  variant?: "danger" | "warning" | "primary";
  danger?: boolean;
  requiresReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
  isPending?: boolean;
  loading?: boolean;
};

export function ConfirmModal({
  isOpen,
  open,
  onClose,
  onConfirm,
  title,
  description,
  message,
  itemName,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  tone,
  variant,
  danger,
  requiresReason = false,
  reasonLabel = "เหตุผลการดำเนินการ",
  reasonPlaceholder = "ระบุเหตุผลในการทำรายการ...",
  minReasonLength = 10,
  isPending,
  loading,
}: ConfirmModalProps) {
  const show = isOpen ?? open ?? false;
  useBodyScrollLock(show);
  const activeTone = (danger ? "danger" : undefined) || variant || tone || "danger";
  const activeDescription = description ?? message;
  const activePending = isPending ?? loading ?? false;
  const [reason, setReason] = useState("");
  const [prevShow, setPrevShow] = useState(show);
  if (show !== prevShow) {
    setPrevShow(show);
    if (show) {
      setReason("");
    }
  }

  if (!show) return null;

  const trimmedReason = reason.trim().replace(/\s+/g, " ");
  const isReasonValid = !requiresReason || trimmedReason.length >= minReasonLength;

  const toneConfig = {
    danger: {
      badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
      buttonClass: "bg-primary text-white hover:bg-primary/95 shadow-sm",
      icon: Trash2,
      iconClass: "text-primary dark:text-red-400",
    },
    warning: {
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
      buttonClass: "bg-amber-600 text-white hover:bg-amber-700 shadow-sm",
      icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
    },
    primary: {
      badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400",
      buttonClass: "bg-primary text-white hover:bg-primary/95 shadow-sm",
      icon: AlertCircle,
      iconClass: "text-primary dark:text-red-400",
    },
  }[activeTone];

  const IconComponent = toneConfig.icon;

  const handleConfirm = async () => {
    if (requiresReason && !isReasonValid) return;
    await onConfirm(reason);
  };

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-[160] grid place-items-center bg-black/60 p-4 backdrop-blur-[3px] animate-in fade-in duration-150 overscroll-contain"
    >
      <section
        className="w-full max-w-[480px] overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-2xl animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${toneConfig.badgeClass}`}>
              <IconComponent size={20} className={toneConfig.iconClass} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-on-surface leading-tight">
                {title}
              </h2>
              {itemName ? (
                <p className="mt-0.5 text-[12px] font-semibold text-primary dark:text-red-400">
                  {itemName}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิด"
            disabled={activePending}
            onClick={onClose}
            className="-mr-1.5 -mt-1.5 grid h-8 w-8 place-items-center rounded-[4px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {activeDescription ? (
            <p className="text-[13px] font-medium leading-relaxed text-on-surface-variant">
              {activeDescription}
            </p>
          ) : null}

          {requiresReason && (
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-modal-reason"
                className="block text-[13px] font-bold text-on-surface"
              >
                {reasonLabel} <span className="text-primary">*</span>
              </label>
              <textarea
                id="confirm-modal-reason"
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                maxLength={500}
                rows={3}
                disabled={activePending}
                className="w-full resize-none rounded-[4px] border border-outline-variant bg-surface-container-lowest p-3 text-[13px] font-medium text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary"
              />
              <div className="flex justify-between text-[11px] font-medium">
                <span className={isReasonValid ? "text-on-surface-variant/60" : "text-primary"}>
                  ขั้นต่ำ {minReasonLength} ตัวอักษร
                </span>
                <span className="text-on-surface-variant/60">{reason.length} / 500</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2.5 border-t border-outline-variant bg-surface-container-low/40 px-5 py-3">
          <button
            type="button"
            disabled={activePending}
            onClick={onClose}
            className="h-9 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={activePending || (requiresReason && !isReasonValid)}
            onClick={handleConfirm}
            className={`h-9 rounded-[4px] px-5 text-[13px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${toneConfig.buttonClass}`}
          >
            {isPending ? "กำลังดำเนินการ..." : confirmText}
          </button>
        </footer>
      </section>
    </div>
  );
}
