"use client";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/use-body-scroll-lock";

import React, { useEffect } from "react";
import {
  X,
  Building,
  FileText,
  Receipt,
  QrCode,
  ArrowRightLeft,
} from "lucide-react";
import type { AssetRecord } from "@/lib/assets";
import { StatusBadge, statusTone } from "@/components/status-badge";

interface AssetSideDrawerProps {
  asset: AssetRecord | null;
  onClose: () => void;
  onOpenQr: (asset: AssetRecord) => void;
  onOpenTransfer?: (asset: AssetRecord) => void;
}

export function AssetSideDrawer({
  asset,
  onClose,
  onOpenQr,
  onOpenTransfer,
}: AssetSideDrawerProps) {
  useEffect(() => {
    if (!asset) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    lockBodyScroll();
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [asset, onClose]);

  if (!asset) return null;

  const formatDate = (val: string | null) => {
    if (!val) return "-";
    try {
      const d = new Date(val);
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return val;
    }
  };

  const formatPrice = (price: number | null) => {
    if (price == null) return "-";
    return `${price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;
  };

  return (
    <div className="fixed inset-0 z-[105] flex justify-end bg-black/55 transition-opacity animate-in fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-[430px] flex-col border-l border-outline-variant bg-surface-container-lowest shadow-2xl transition-transform animate-in slide-in-from-right duration-200" onClick={(event) => event.stopPropagation()}>
        {/* Header */}
        <header className="flex h-[62px] shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xs bg-primary/10 text-primary font-bold text-[13px]">
              AST
            </span>
            <div>
              <h3 className="text-[13px] font-bold text-on-surface">รายละเอียดสินทรัพย์</h3>
              <p className="text-[11px] font-mono font-semibold text-primary">{asset.itemCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-xs text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface"
          >
            <X size={16} />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-[12px]">
          {/* Main Title & Status */}
          <div className="rounded-sm border border-outline-variant p-4 bg-surface-container-lowest space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                {asset.itemTypeName || "สินทรัพย์"}
              </span>
              <StatusBadge tone={statusTone(asset.status)}>
                {asset.statusLabel}
              </StatusBadge>
            </div>
            <h2 className="text-[14px] font-bold text-on-surface leading-snug">{asset.itemName}</h2>

            <div className="flex items-center justify-between border-t border-outline-variant pt-2">
              <span className="text-secondary font-semibold text-[11px]">หมายเลข Serial Number:</span>
              <span className="font-mono font-black text-[13px] text-primary select-all">
                {asset.serialNumber}
              </span>
            </div>
          </div>

          {/* Quick Actions Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenQr(asset)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xs border border-outline-variant bg-surface-container-lowest px-3 font-semibold text-on-surface hover:bg-surface-container-high transition-colors text-[11px]"
            >
              <QrCode size={13} className="text-primary" />
              พิมพ์สติกเกอร์ / QR
            </button>
            {onOpenTransfer ? <button
              onClick={() => onOpenTransfer?.(asset)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xs border border-outline-variant bg-surface-container-lowest px-3 font-semibold text-on-surface hover:bg-surface-container-high transition-colors text-[11px]"
            >
              <ArrowRightLeft size={13} className="text-primary" />
              โอนย้าย / เปลี่ยนผู้ถือ
            </button> : null}
          </div>

          {/* Custodian & Location */}
          <section className="space-y-2.5">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
              <Building size={13} />
              ข้อมูลการครอบครองและสถานที่
            </h4>
            <div className="rounded-sm border border-outline-variant p-3.5 space-y-2 bg-surface-container-lowest">
              <div className="flex items-center justify-between">
                <span className="text-secondary">แผนกผู้ดูแล:</span>
                <span className="font-semibold text-on-surface">
                  {asset.departmentName || "ส่วนกลาง"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">ผู้รับผิดชอบ:</span>
                <span className="font-semibold text-on-surface">
                  {asset.custodianName || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">สถานที่ตั้ง/ห้อง:</span>
                <span className="font-semibold text-on-surface">
                  {asset.locationNote || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">วันหมดประกัน:</span>
                <span className="font-semibold text-primary">
                  {formatDate(asset.warrantyExpiryDate)}
                </span>
              </div>
            </div>
          </section>

          {/* Procurement & Receipt Traceability */}
          <section className="space-y-2.5">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
              <Receipt size={13} />
              ข้อมูลการจัดซื้อและการรับมอบ
            </h4>
            <div className="rounded-sm border border-outline-variant p-3.5 space-y-2 bg-surface-container-lowest">
              <div className="flex items-center justify-between">
                <span className="text-secondary">เลขที่ใบส่งของ (GR):</span>
                <span className="font-semibold text-primary font-mono">{asset.grNumber || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">วันที่รับมอบ (GR Date):</span>
                <span className="font-medium text-on-surface">{formatDate(asset.receiptDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">เลขที่ใบสั่งซื้อ (PO):</span>
                <span className="font-semibold text-on-surface font-mono">{asset.poNumber || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">ผู้ขาย (Vendor):</span>
                <span className="font-medium text-on-surface truncate max-w-[200px]" title={asset.vendorName || ""}>
                  {asset.vendorName || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-outline-variant pt-1.5">
                <span className="text-secondary">ราคาซื้อต่อหน่วย:</span>
                <span className="font-bold text-on-surface">{formatPrice(asset.unitPrice)}</span>
              </div>
            </div>
          </section>

          {/* Notes */}
          {asset.notes && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
                <FileText size={13} />
                หมายเหตุเพิ่มเติม
              </h4>
              <div className="rounded-sm border border-outline-variant p-3 bg-surface-container-lowest text-on-surface leading-relaxed whitespace-pre-wrap">
                {asset.notes}
              </div>
            </section>
          )}

          {/* Meta timestamps */}
          <div className="flex items-center justify-between text-[10px] text-secondary/60 pt-2">
            <span>บันทึกเมื่อ: {formatDate(asset.createdAt)}</span>
            <span>อัปเดตล่าสุด: {formatDate(asset.updatedAt)}</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex h-[64px] shrink-0 items-center justify-end border-t border-outline-variant bg-surface-container-lowest px-5">
          <button
            onClick={onClose}
            className="h-8 rounded-xs border border-outline-variant px-4 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high"
          >
            ปิดหน้าต่าง
          </button>
        </footer>
      </div>
    </div>
  );
}
