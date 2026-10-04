"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { StatusBadge, statusTone } from "@/components/status-badge";
import type { AssetRecord } from "@/lib/assets";

interface AssetMobileLedgerProps {
  items: AssetRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onOpenDetails: (asset: AssetRecord) => void;
}

export function AssetMobileLedger({
  items,
  page,
  pageSize,
  totalCount,
  totalPages,
  disabled,
  onPageChange,
  onOpenDetails,
}: AssetMobileLedgerProps) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="border-t border-outline-variant bg-surface-container-lowest sm:hidden">
      <MobileEntityList
        actionLabel={(item) => `ดูรายละเอียด ${item.itemCode}`}
        disabled={disabled}
        emptyText="ไม่พบข้อมูลสินทรัพย์"
        getKey={(item) => item.id}
        items={items}
        meta={(item) => <>{item.itemTypeName || "สินทรัพย์"} · {item.serialNumber || "ไม่มี Serial Number"}</>}
        onAction={(item) => onOpenDetails(item)}
        onOpen={onOpenDetails}
        primary={(item) => item.itemCode}
        secondary={(item) => item.itemName}
        status={(item) => <StatusBadge tone={statusTone(item.status)}>{item.statusLabel}</StatusBadge>}
      />

      <footer className="flex min-h-12 items-center justify-between px-3 text-[12px] font-semibold">
        <span>
          แสดง {start} ถึง {end} จาก {totalCount} รายการ
        </span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <button
              aria-label="หน้าก่อนหน้า"
              className="grid size-8 place-items-center rounded-[3px] border border-outline-variant disabled:opacity-40"
              disabled={disabled || page <= 1}
              onClick={() => onPageChange(page - 1)}
              type="button"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="grid size-8 place-items-center rounded-[3px] bg-primary font-bold text-white">
              {page}
            </span>
            <button
              aria-label="หน้าถัดไป"
              className="grid size-8 place-items-center rounded-[3px] border border-outline-variant disabled:opacity-40"
              disabled={disabled || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              type="button"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
