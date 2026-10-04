"use client";

import React from "react";
import { Upload, X } from "lucide-react";
import { ToggleSwitch } from "@/components/toggle-switch";
import { CompanyFormLogo } from "@/components/company-logo";

export type ProductDraft = {
  part_number: string;
  part_name: string;
  material: string;
  plating: string;
  std_no: string;
  sheet_count: string;
  parts_per_sheet: string;
  cost_price: string;
  selling_price: string;
  unit: string;
  status: string;
  model: string;
  erp_code: string;
};

export const PRODUCT_UNIT_OPTIONS = ["ชิ้น", "แผ่น", "กล่อง", "ชุด", "กิโลกรัม"] as const;
export const PRODUCT_STATUS_OPTIONS = ["ใช้งาน", "ระงับการใช้งาน"] as const;

export const inputClassName =
  "w-full rounded-none border-b border-outline-variant bg-transparent p-0 pb-1 text-[16px] leading-tight text-on-surface outline-none focus:border-primary focus:ring-0 cursor-text";

export function ProductModalShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-md">
      <div className="relative flex h-[100dvh] w-full max-w-[960px] flex-col overflow-hidden border border-outline-variant bg-white shadow-2xl animate-in fade-in zoom-in duration-200 dark:bg-surface-container-lowest sm:h-auto sm:max-h-[92dvh] sm:rounded">
        <header className="relative z-10 flex min-h-12 items-start justify-between gap-sm border-b border-outline bg-white/95 px-sm py-2 backdrop-blur-sm dark:bg-surface-container-lowest/95 sm:items-center sm:px-md">
          <div className="flex min-w-0 items-center gap-sm">
            <CompanyFormLogo className="shrink-0" />
            <h1
              className="font-headline-md text-[16px] leading-tight tracking-tight text-on-surface sm:text-[18px]"
              style={{ fontWeight: 700 }}
            >
              {title}
            </h1>
          </div>

          <div className="flex shrink-0 items-start gap-sm sm:items-center sm:gap-md">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-bold leading-none text-on-surface-variant">
                แบบฟอร์มข้อมูลสินค้ากลาง
              </p>
              <p className="text-[11px] font-bold text-primary">ข้อมูลสินค้ากลาง</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded border-none bg-transparent text-on-surface transition-colors duration-200 hover:bg-error-container hover:text-on-error-container"
              type="button"
              title="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ProductImagePanel({
  imageLabel,
  imageSrc,
  onFileChange,
  onRemoveImage,
}: {
  imageLabel: string;
  imageSrc: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage?: () => void;
}) {
  return (
    <section className="relative flex w-full shrink-0 flex-col justify-center border-b border-outline-variant bg-white/50 p-md select-none dark:bg-surface-container-lowest/30 lg:w-[40%] lg:border-b-0 lg:border-r lg:p-lg">
      <div className="group relative flex h-[220px] w-full flex-col items-center justify-center overflow-hidden border border-dashed border-outline-variant bg-white p-md dark:bg-surface-container-lowest sm:h-[280px] lg:h-auto lg:aspect-square">
        {imageSrc ? (
          <img
            alt={imageLabel}
            className="h-full w-full object-contain"
            src={imageSrc}
          />
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-sm text-center transition-colors hover:text-primary">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low text-secondary dark:bg-surface-container-high">
              <Upload className="h-8 w-8" />
            </div>
            <div>
              <p className="text-[16px] font-semibold leading-tight text-on-surface sm:text-[18px]">
                คลิกเพื่ออัปโหลดรูปสินค้า
              </p>
              <p className="text-[13px] leading-tight text-secondary sm:text-[14px]">
                รองรับไฟล์ PNG และ JPG
              </p>
            </div>
            <input className="hidden" type="file" accept="image/*" onChange={onFileChange} />
          </label>
        )}
      </div>

      {imageSrc ? (
        <div className="mt-md flex flex-col justify-between gap-sm sm:flex-row sm:items-center">
          <span className="border-l-2 border-primary pl-2 text-[11px] tracking-wide text-on-surface-variant">
            ตัวอย่างรูปสินค้าที่แนบ
          </span>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-[11px] font-bold text-primary hover:underline">
              เปลี่ยนรูปภาพ
              <input className="hidden" type="file" accept="image/*" onChange={onFileChange} />
            </label>
            {onRemoveImage ? (
              <button
                type="button"
                onClick={onRemoveImage}
                className="text-[11px] font-bold text-rose-600 hover:underline dark:text-rose-400"
              >
                ลบรูปภาพ
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ProductField({
  children,
  className,
  label,
  required = false,
  stepNumber,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  required?: boolean;
  stepNumber?: string;
}) {
  return (
    <div className={className ? `space-y-0.5 ${className}` : "space-y-0.5"}>
      <label className="flex items-center justify-between text-[14px] leading-tight text-on-surface-variant">
        <span className="font-bold">
          {label} {required ? <span className="text-error">*</span> : null}
        </span>
        {stepNumber ? <span className="font-mono text-primary/40">{stepNumber}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function ProductPriceField({
  label,
  onChange,
  tone,
  value,
}: {
  label: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  tone: string;
  value: string;
}) {
  return (
    <div className="col-span-1 space-y-0.5 rounded border border-outline-variant bg-surface-container-low p-2 dark:bg-surface-container-lowest">
      <label className="text-[12px] font-bold uppercase leading-tight text-on-surface-variant">
        {label}
      </label>
      <input
        className={`w-full border-none bg-transparent p-0 text-[20px] leading-none outline-none focus:ring-0 ${tone}`}
        style={{ fontWeight: 700 }}
        type="number"
        step="0.01"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

export function ProductStatusToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <ToggleSwitch checked={checked} label={checked ? "เปิดใช้งาน / Active" : "ปิดใช้งาน / Inactive"} onChange={onChange} />
  );
}
