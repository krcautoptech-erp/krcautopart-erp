"use client";

import React, { useRef } from "react";
import { Printer, X, Tag, QrCode } from "lucide-react";
import type { AssetRecord } from "@/lib/assets";
import { printAssetTag } from "@/lib/asset-print";

interface AssetQrModalProps {
  asset: AssetRecord | null;
  onClose: () => void;
}

export function AssetQrModal({ asset, onClose }: AssetQrModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!asset) return null;

  const handlePrint = () => {
    void printAssetTag(asset, qrUrl);
  };

  // Build a clean asset QR content payload
  const qrDataText = encodeURIComponent(
    JSON.stringify({
      code: asset.itemCode,
      name: asset.itemName,
      sn: asset.serialNumber,
      po: asset.poNumber,
      gr: asset.grNumber,
    }),
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrDataText}`;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-md flex-col rounded-sm border border-outline-variant bg-surface-container-lowest shadow-2xl">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-outline-variant px-4">
          <div className="flex items-center gap-2 text-on-surface">
            <Tag size={16} className="text-primary" />
            <h3 className="text-[13px] font-bold">ป้ายสติกเกอร์ทรัพย์สิน (Asset Tag)</h3>
          </div>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded-xs text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface"
          >
            <X size={15} />
          </button>
        </header>

        {/* Body / Printable Label Preview */}
        <div className="p-6 bg-surface-container-low flex flex-col items-center justify-center">
          <div
            ref={printAreaRef}
            className="w-full max-w-[340px] rounded-sm border-2 border-dashed border-outline-variant bg-white p-4 text-black shadow-md"
          >
            {/* Tag Header */}
            <div className="flex items-center justify-between border-b border-black pb-2">
              <div className="flex items-center gap-1.5">
                <span className="grid size-6 place-items-center bg-black text-[10px] font-black text-white">
                  KRC
                </span>
                <span className="text-[11px] font-bold tracking-tight">KRC AUTOPART</span>
              </div>
              <span className="text-[9px] font-semibold text-neutral-600">FIXED ASSET TAG</span>
            </div>

            {/* Tag Content */}
            <div className="mt-3 flex items-start gap-3">
              {/* QR Image */}
              <div className="size-20 shrink-0 border border-neutral-300 p-0.5 bg-white">
                <img
                  src={qrUrl}
                  alt={`QR ${asset.serialNumber}`}
                  className="size-full object-contain"
                />
              </div>

              {/* Details */}
              <div className="flex-1 space-y-1 text-[11px] leading-tight">
                <div>
                  <span className="text-[9px] font-bold text-neutral-500">รหัสทรัพย์สิน</span>
                  <p className="font-extrabold text-neutral-900">{asset.itemCode}</p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-neutral-500">ชื่อรายการ</span>
                  <p className="line-clamp-2 font-semibold text-neutral-800" title={asset.itemName}>
                    {asset.itemName}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-neutral-500">SERIAL NUMBER</span>
                  <p className="font-mono font-black text-primary tracking-wide">
                    {asset.serialNumber}
                  </p>
                </div>
              </div>
            </div>

            {/* Tag Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-1.5 text-[9px] text-neutral-500 font-medium">
              <span>แผนก: {asset.departmentName || "ส่วนกลาง"}</span>
              <span>วันที่รับ: {asset.receiptDate || "-"}</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-on-surface/60 flex items-center gap-1">
            <QrCode size={13} />
            สแกนด้วยโทรศัพท์เพื่อตรวจสอบประวัติและสถานะประกันทันที
          </p>
        </div>

        {/* Footer */}
        <footer className="flex h-12 items-center justify-end gap-2 border-t border-outline-variant px-4 bg-surface-container-lowest">
          <button
            onClick={onClose}
            className="h-8 rounded-xs border border-outline-variant px-4 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high"
          >
            ปิด
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex h-8 items-center gap-1.5 rounded-xs bg-primary px-4 text-[12px] font-bold text-white shadow-xs hover:bg-primary/90"
          >
            <Printer size={13} />
            พิมพ์ป้ายสติกเกอร์
          </button>
        </footer>
      </div>
    </div>
  );
}
