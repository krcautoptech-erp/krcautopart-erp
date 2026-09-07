"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Printer,
} from "lucide-react";
import {
  updateAssetCustodianAction,
  updateAssetStatusAction,
} from "@/app/actions/assets";
import { StatusBadge, statusTone } from "@/components/status-badge";
import type { AssetLookupData, AssetRecord, AssetStatus } from "@/lib/assets";

type MobileTab = "details" | "qr" | "transfer";

interface AssetMobileLedgerProps {
  items: AssetRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  disabled: boolean;
  lookups: AssetLookupData;
  onPageChange: (page: number) => void;
  onSaved: (message: string) => void;
  onOpenTransfer: (asset: AssetRecord) => void;
}

const fieldClass =
  "h-10 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[13px] font-medium text-on-surface outline-none focus:border-primary";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatPrice(value: number | null) {
  if (value == null) return "-";
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ฿`;
}

function AssetDetailRows({ asset }: { asset: AssetRecord }) {
  const rows = [
    ["แผนก / ผู้ถือครอง", asset.departmentName || "ส่วนกลาง"],
    ["สถานที่ตั้ง", asset.locationNote || "-"],
    ["วันที่รับ (GR Date)", formatDate(asset.receiptDate)],
    ["เลขที่ใบส่งของ (GR)", asset.grNumber || "-"],
    ["เลขที่ใบสั่งซื้อ (PO)", asset.poNumber || "-"],
    ["ผู้ขาย (Vendor)", asset.vendorName || "-"],
    ["ราคาต่อหน่วย", formatPrice(asset.unitPrice)],
    ["สถานะสินทรัพย์", asset.statusLabel],
    ["การรับประกันถึง", formatDate(asset.warrantyExpiryDate)],
  ] as const;

  return (
    <div className="px-3 pb-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid min-h-10 grid-cols-[44%_56%] items-center border-b border-outline-variant/70 py-2 text-[12px] last:border-b-0"
        >
          <span className="pr-2 text-on-surface-variant">{label}</span>
          {label === "สถานะสินทรัพย์" ? (
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
              {value}
            </span>
          ) : (
            <span
              className={`min-w-0 break-words font-semibold ${
                label.includes("GR)") || label.includes("PO)")
                  ? "text-primary"
                  : "text-on-surface"
              }`}
            >
              {value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function AssetQrPanel({ asset }: { asset: AssetRecord }) {
  const qrUrl = useMemo(() => {
    const payload = encodeURIComponent(
      JSON.stringify({
        code: asset.itemCode,
        name: asset.itemName,
        serialNumber: asset.serialNumber,
        grNumber: asset.grNumber,
        poNumber: asset.poNumber,
      }),
    );
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${payload}`;
  }, [asset]);

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="border border-outline-variant bg-white p-3 text-black">
        <div className="flex items-center justify-between border-b border-black pb-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center bg-black text-[10px] font-black text-white">
              KRC
            </span>
            <span className="text-[11px] font-bold">KRC AUTOPART</span>
          </div>
          <span className="text-[9px] font-semibold text-neutral-500">FIXED ASSET TAG</span>
        </div>
        <div className="mt-3 flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`QR code ของ ${asset.itemCode}`}
            className="size-24 shrink-0 border border-neutral-300 object-contain"
            src={qrUrl}
          />
          <div className="min-w-0 space-y-1 text-[11px] leading-tight">
            <p className="text-[9px] text-neutral-500">รหัสทรัพย์สิน</p>
            <p className="font-extrabold">{asset.itemCode}</p>
            <p className="pt-0.5 text-[9px] text-neutral-500">ชื่อรายการ</p>
            <p className="font-semibold">{asset.itemName}</p>
            <p className="pt-0.5 text-[9px] text-neutral-500">SERIAL NUMBER</p>
            <p className="font-bold text-primary">{asset.serialNumber}</p>
          </div>
        </div>
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-2 text-[9px] text-neutral-500">
          <span>แผนก: {asset.departmentName || "ส่วนกลาง"}</span>
          <span>วันที่รับ: {formatDate(asset.receiptDate)}</span>
        </div>
      </div>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[3px] border border-primary bg-white text-[13px] font-bold text-primary active:bg-primary/[0.04]"
        onClick={() => window.print()}
        type="button"
      >
        <Printer size={15} />
        พิมพ์ป้ายทรัพย์สิน
      </button>
    </div>
  );
}

function AssetTransferPanel({
  asset,
  lookups,
  onSaved,
}: {
  asset: AssetRecord;
  lookups: AssetLookupData;
  onSaved: (message: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState(
    asset.departmentId ? String(asset.departmentId) : "",
  );
  const [custodianName, setCustodianName] = useState(asset.custodianName || "");
  const [locationNote, setLocationNote] = useState(asset.locationNote || "");
  const [status, setStatus] = useState<AssetStatus>(asset.status);
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState(
    asset.warrantyExpiryDate || "",
  );
  const [notes, setNotes] = useState(asset.notes || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const custodianResult = await updateAssetCustodianAction({
        assetId: asset.id,
        departmentId: departmentId ? Number(departmentId) : null,
        custodianName,
        locationNote,
        warrantyExpiryDate,
        notes,
      });
      if (!custodianResult.success) {
        setError(custodianResult.error || "ไม่สามารถบันทึกข้อมูลได้");
        return;
      }

      if (status !== asset.status) {
        const statusResult = await updateAssetStatusAction({
          assetId: asset.id,
          status,
          notes,
        });
        if (!statusResult.success) {
          setError(statusResult.error || "ไม่สามารถเปลี่ยนสถานะได้");
          return;
        }
      }

      onSaved("อัปเดตข้อมูลผู้ถือครองและสถานะทรัพย์สินสำเร็จ");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "เกิดข้อผิดพลาดในการบันทึก",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-3 px-3 pb-3 pt-1" onSubmit={handleSubmit}>
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <div>
        <label className="text-[11px] font-semibold text-on-surface-variant">แผนกผู้ถือครอง</label>
        <select
          className={`${fieldClass} mt-1`}
          onChange={(event) => setDepartmentId(event.target.value)}
          value={departmentId}
        >
          <option value="">ส่วนกลาง / ไม่ระบุ</option>
          {lookups.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-on-surface-variant">ผู้ถือครอง / ผู้รับผิดชอบ</label>
        <input
          className={`${fieldClass} mt-1`}
          onChange={(event) => setCustodianName(event.target.value)}
          placeholder="ระบุชื่อผู้รับผิดชอบ"
          value={custodianName}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-on-surface-variant">ตำแหน่งที่ตั้ง / ชั้น / ห้อง</label>
        <input
          className={`${fieldClass} mt-1`}
          onChange={(event) => setLocationNote(event.target.value)}
          placeholder="ระบุตำแหน่งที่ตั้ง"
          value={locationNote}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-semibold text-on-surface-variant">สถานะสินทรัพย์</label>
          <select
            className={`${fieldClass} mt-1 px-2`}
            onChange={(event) => setStatus(event.target.value as AssetStatus)}
            value={status}
          >
            <option value="in_use">ใช้งานอยู่</option>
            <option value="in_stock">พร้อมใช้งาน</option>
            <option value="under_repair">ส่งซ่อม</option>
            <option value="disposed">ตัดจำหน่าย</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-on-surface-variant">วันหมดอายุประกัน</label>
          <input
            className={`${fieldClass} mt-1 px-2`}
            onChange={(event) => setWarrantyExpiryDate(event.target.value)}
            type="date"
            value={warrantyExpiryDate}
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-on-surface-variant">หมายเหตุ / ประวัติการโอนย้าย</label>
        <textarea
          className="mt-1 min-h-20 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] outline-none focus:border-primary"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="ระบุเหตุผลหรือรายละเอียดการโอนย้าย"
          value={notes}
        />
      </div>
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[3px] bg-primary text-[13px] font-bold text-white disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        <ArrowRightLeft size={15} />
        {isSubmitting ? "กำลังบันทึก..." : "บันทึกการโอนย้าย"}
      </button>
    </form>
  );
}

export function AssetMobileLedger({
  items,
  page,
  pageSize,
  totalCount,
  totalPages,
  disabled,
  lookups,
  onPageChange,
  onSaved,
  onOpenTransfer,
}: AssetMobileLedgerProps) {
  const [expandedId, setExpandedId] = useState<number | null>(() => items[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<MobileTab>("details");

  const effectiveExpandedId =
    expandedId === null
      ? null
      : items.some((item) => item.id === expandedId)
        ? expandedId
        : (items[0]?.id ?? null);

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="border border-outline-variant bg-surface-container-lowest sm:hidden">
      <div className="grid h-10 grid-cols-[1fr_1.7fr_auto] items-center border-b border-outline-variant px-3 text-[11px] font-bold">
        <span>รหัสสินทรัพย์</span>
        <span>ชื่อรายการ / รุ่น</span>
        <span className="pr-7 text-right">สถานะ</span>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-on-surface-variant">
          ไม่พบข้อมูลสินทรัพย์
        </div>
      ) : (
        items.map((item, index) => {
          const isExpanded = effectiveExpandedId === item.id;
          return (
            <article
              className={`relative border-b border-outline-variant last:border-b-0 ${
                isExpanded ? "border-l-2 border-l-primary" : ""
              }`}
              key={item.id}
            >
              <button
                aria-expanded={isExpanded}
                className="grid min-h-[76px] w-full grid-cols-[22px_1fr_auto] items-start gap-2 px-3 py-3 text-left"
                onClick={() => {
                  setExpandedId(isExpanded ? null : item.id);
                  setActiveTab("details");
                }}
                type="button"
              >
                <span className="pt-0.5 text-[12px] font-semibold text-on-surface-variant">
                  {(page - 1) * pageSize + index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-primary">{item.itemCode}</span>
                  <span className="mt-0.5 block truncate text-[13px] font-bold text-on-surface">
                    {item.itemName}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-on-surface-variant">
                    {item.serialNumber}
                  </span>
                </span>
                <span className="flex items-center gap-2 pt-0.5">
                  <StatusBadge tone={statusTone(item.status)}>{item.statusLabel}</StatusBadge>
                  {isExpanded ? (
                    <ChevronUp className="text-primary" size={15} />
                  ) : (
                    <ChevronDown className="text-on-surface-variant" size={15} />
                  )}
                </span>
              </button>

              {isExpanded ? (
                <div className="border-t border-outline-variant bg-surface-container-lowest">
                  <div className="grid h-12 grid-cols-3 border-b border-outline-variant px-2">
                    {(
                      [
                        ["details", "ข้อมูล"],
                        ["qr", "ป้าย QR"],
                        ["transfer", "โอนย้าย"],
                      ] as const
                    ).map(([tab, label]) => (
                      <button
                        className={`relative text-[13px] font-bold ${
                          activeTab === tab ? "text-primary" : "text-on-surface"
                        }`}
                        key={tab}
                        onClick={() => {
                          if (tab === "transfer") {
                            onOpenTransfer(item);
                            return;
                          }
                          setActiveTab(tab);
                        }}
                        type="button"
                      >
                        {label}
                        {activeTab === tab ? (
                          <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
                        ) : null}
                      </button>
                    ))}
                  </div>

                  {activeTab === "details" ? <AssetDetailRows asset={item} /> : null}
                  {activeTab === "qr" ? <AssetQrPanel asset={item} /> : null}
                  {activeTab === "transfer" ? (
                    <AssetTransferPanel asset={item} lookups={lookups} onSaved={onSaved} />
                  ) : null}

                  {activeTab === "details" ? (
                    <div className="grid grid-cols-2 gap-2 border-t border-outline-variant p-2.5">
                      <button
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-primary bg-white text-[13px] font-bold text-primary"
                        onClick={() => setActiveTab("qr")}
                        type="button"
                      >
                        <Printer size={15} />
                        พิมพ์ป้าย
                      </button>
                      <button
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-primary bg-white text-[13px] font-bold text-primary"
                        onClick={() => onOpenTransfer(item)}
                        type="button"
                      >
                        <ArrowRightLeft size={15} />
                        เริ่มโอนย้าย
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      )}

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
