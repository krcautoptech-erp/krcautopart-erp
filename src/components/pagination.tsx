"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  currentPage: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
  totalPages?: number;
};

function pageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const values: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) values.push("ellipsis");
  for (let page = start; page <= end; page += 1) values.push(page);
  if (end < totalPages - 1) values.push("ellipsis");
  values.push(totalPages);
  return values;
}

export function Pagination({ currentPage, disabled = false, onPageChange, pageSize, totalItems, totalPages: suppliedTotalPages }: PaginationProps) {
  const totalPages = Math.max(1, suppliedTotalPages ?? Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const buttonClass = "inline-flex h-10 min-w-10 items-center justify-center rounded-[8px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <footer className="flex min-h-[62px] flex-col gap-3 border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-[14px] font-medium text-on-surface md:flex-row md:items-center md:justify-between">
      <p>แสดง {start} ถึง {end} จาก {totalItems.toLocaleString("th-TH")} รายการ</p>
      <div className="flex flex-wrap items-center gap-4">
        <p>แสดง {pageSize.toLocaleString("th-TH")} รายการต่อหน้า</p>
        <nav aria-label="เปลี่ยนหน้ารายการ" className="flex items-center gap-2">
          <button aria-label="หน้าก่อนหน้า" className={buttonClass} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} type="button"><ChevronLeft size={17} /></button>
          {pageNumbers(page, totalPages).map((value, index) => value === "ellipsis" ? <span className="px-1 text-secondary" key={`ellipsis-${index}`}>...</span> : <button aria-current={value === page ? "page" : undefined} aria-label={`หน้าที่ ${value}`} className={`${buttonClass} ${value === page ? "!border-primary !bg-primary !text-white hover:!bg-primary" : ""}`} disabled={disabled} key={value} onClick={() => onPageChange(value)} type="button">{value}</button>)}
          <button aria-label="หน้าถัดไป" className={buttonClass} disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} type="button"><ChevronRight size={17} /></button>
        </nav>
      </div>
    </footer>
  );
}
