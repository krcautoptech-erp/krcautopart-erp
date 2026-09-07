"use client";

import { X } from "lucide-react";
import { useState } from "react";

type DocumentCancelModalProps = {
  documentNumber: string;
  documentType: "ใบขอซื้อ" | "ใบสั่งซื้อ";
  isPending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function DocumentCancelModal({
  documentNumber,
  documentType,
  isPending,
  onClose,
  onConfirm,
}: DocumentCancelModalProps) {
  const [reason, setReason] = useState("");
  const normalizedLength = reason.trim().replace(/\s+/g, " ").length;
  const isValid = normalizedLength >= 10 && normalizedLength <= 500;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[140] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
    >
      <section className="w-full max-w-[520px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <header className="flex h-[62px] items-center justify-between border-b border-outline-variant px-5">
          <div>
            <h2 className="text-[18px] font-bold text-on-surface">
              ยกเลิก{documentType}
            </h2>
            <p className="text-[12px] font-medium text-secondary">
              {documentNumber}
            </p>
          </div>
          <button
            aria-label="ปิด"
            className="grid h-9 w-9 place-items-center text-on-surface hover:text-primary"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            <X size={21} />
          </button>
        </header>

        <div className="space-y-2 px-5 py-4">
          <label
            className="text-[13px] font-bold text-on-surface"
            htmlFor="document-cancellation-reason"
          >
            เหตุผลการยกเลิก <span className="text-primary">*</span>
          </label>
          <textarea
            autoFocus
            className="h-[118px] w-full resize-none rounded-[4px] border border-outline-variant bg-background p-3 text-[13px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary"
            id="document-cancellation-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร เพื่อใช้ตรวจสอบย้อนหลัง"
            value={reason}
          />
          <div className="flex justify-between text-[11px] font-medium">
            <span className={isValid ? "text-secondary" : "text-primary"}>
              ขั้นต่ำ 10 ตัวอักษร
            </span>
            <span className="text-secondary">{reason.length} / 500</span>
          </div>
        </div>

        <footer className="flex h-[64px] items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-9 rounded-[4px] border border-outline-variant px-5 text-[13px] font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            กลับ
          </button>
          <button
            className="h-9 rounded-[4px] bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isPending || !isValid}
            onClick={() => onConfirm(reason)}
            type="button"
          >
            {isPending ? "กำลังยกเลิก..." : `ยืนยันยกเลิก${documentType}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
