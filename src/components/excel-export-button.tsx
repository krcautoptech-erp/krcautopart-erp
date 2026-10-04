"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { useHasPermission } from "@/components/permission-context";
import { getExportPermission } from "@/lib/access-control";

type ExcelExportButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
};

export function ExcelExportButton({
  className = "",
  disabled,
  isLoading = false,
  label = "ส่งออก Excel",
  loadingLabel = "กำลังเตรียม Excel...",
  type = "button",
  ...props
}: ExcelExportButtonProps) {
  const canExport = useHasPermission(getExportPermission(usePathname()));
  if (!canExport) return null;

  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-4 text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled || isLoading}
      type={type}
    >
      {isLoading ? (
        <Loader2 aria-hidden="true" className="animate-spin text-primary" size={18} />
      ) : (
        <Image aria-hidden="true" alt="" height={20} src="/icon/icon-excel.svg" width={20} />
      )}
      {isLoading ? loadingLabel : label}
    </button>
  );
}
