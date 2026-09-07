"use client";

import React, { useState } from "react";
import { X, ArrowRightLeft, CheckCircle2, User, Building, MapPin, Calendar, FileText } from "lucide-react";
import {
  updateAssetCustodianAction,
  updateAssetStatusAction,
} from "@/app/actions/assets";
import type { AssetRecord, AssetStatus } from "@/lib/assets";

interface AssetTransferModalProps {
  asset: AssetRecord | null;
  departments: { id: number; name: string; code: string | null }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function AssetTransferModal({
  asset,
  departments,
  onClose,
  onSaved,
}: AssetTransferModalProps) {
  const [departmentId, setDepartmentId] = useState<string>(
    asset?.departmentId ? String(asset.departmentId) : "",
  );
  const [custodianName, setCustodianName] = useState(asset?.custodianName || "");
  const [locationNote, setLocationNote] = useState(asset?.locationNote || "");
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState(
    asset?.warrantyExpiryDate || "",
  );
  const [status, setStatus] = useState<AssetStatus>(asset?.status || "in_use");
  const [notes, setNotes] = useState(asset?.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      // 1. Update Custodian / Location / Warranty
      const res1 = await updateAssetCustodianAction({
        assetId: asset.id,
        departmentId: departmentId ? Number(departmentId) : null,
        custodianName,
        locationNote,
        warrantyExpiryDate,
        notes,
      });

      if (!res1.success) {
        setError(res1.error || "ไม่สามารถบันทึกข้อมูลได้");
        setIsSubmitting(false);
        return;
      }

      // 2. Update status if changed
      if (status !== asset.status) {
        const res2 = await updateAssetStatusAction({
          assetId: asset.id,
          status,
          notes,
        });
        if (!res2.success) {
          setError(res2.error || "ไม่สามารถเปลี่ยนสถานะได้");
          setIsSubmitting(false);
          return;
        }
      }

      onSaved("อัปเดตข้อมูลผู้ถือครองและสถานะทรัพย์สินสำเร็จ");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    "w-full h-8 px-2.5 text-[12px] rounded-xs border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary font-medium";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-lg flex-col rounded-sm border border-outline-variant bg-surface-container-lowest shadow-2xl">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b border-outline-variant px-4">
          <div className="flex items-center gap-2 text-on-surface">
            <ArrowRightLeft size={16} className="text-primary" />
            <h3 className="text-[13px] font-bold">ส่งมอบ / โอนย้ายผู้ถือครองสินทรัพย์</h3>
          </div>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded-xs text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface"
          >
            <X size={15} />
          </button>
        </header>

        {/* Item Brief Info */}
        <div className="border-b border-outline-variant bg-surface-container-low px-4 py-2.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary">{asset.itemCode}</span>
            <span className="font-mono text-[11px] font-semibold text-secondary">
              SN: {asset.serialNumber}
            </span>
          </div>
          <p className="font-medium text-on-surface truncate">{asset.itemName}</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-xs border border-red-200 bg-red-50 p-2 text-[12px] font-medium text-red-600 dark:bg-red-950/30 dark:border-red-900">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Department */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
                <Building size={12} />
                แผนกผู้ถือครอง
              </label>
              <select
                className={`${fieldClass} mt-1`}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">-- ส่วนกลาง / ไม่ระบุ --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Custodian Name */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
                <User size={12} />
                ผู้ถือครอง / ผู้รับผิดชอบ
              </label>
              <input
                className={`${fieldClass} mt-1`}
                placeholder="เช่น สมชาย ใจดี"
                value={custodianName}
                onChange={(e) => setCustodianName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Location Note */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
                <MapPin size={12} />
                ตำแหน่งที่ตั้ง / ชั้น / ห้อง
              </label>
              <input
                className={`${fieldClass} mt-1`}
                placeholder="เช่น อาคาร A ชั้น 2 ห้องจัดซื้อ"
                value={locationNote}
                onChange={(e) => setLocationNote(e.target.value)}
              />
            </div>

            {/* Status */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
                <CheckCircle2 size={12} />
                สถานะสินทรัพย์
              </label>
              <select
                className={`${fieldClass} mt-1 font-semibold`}
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
              >
                <option value="in_use">🟢 ใช้งานอยู่ (In Use)</option>
                <option value="in_stock">🔵 พร้อมใช้งานในคลัง (In Stock)</option>
                <option value="under_repair">🟡 ส่งซ่อม/เคลม (Under Repair)</option>
                <option value="disposed">🔴 ชำรุด/ตัดจำหน่าย (Disposed)</option>
              </select>
            </div>
          </div>

          {/* Warranty Expiry */}
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
              <Calendar size={12} />
              วันหมดอายุประกัน (Warranty Expiry)
            </label>
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={warrantyExpiryDate}
              onChange={(e) => setWarrantyExpiryDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold text-on-surface/80">
              <FileText size={12} />
              หมายเหตุ / ประวัติการโอนย้าย
            </label>
            <textarea
              rows={2}
              className="w-full px-2.5 py-1.5 text-[12px] rounded-xs border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary font-medium"
              placeholder="เช่น ย้ายมาจากฝ่ายขาย ส่งมอบเมื่อ 03/09/2026..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Footer */}
          <footer className="mt-4 flex items-center justify-end gap-2 border-t border-outline-variant pt-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-xs border border-outline-variant px-4 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-8 items-center gap-1.5 rounded-xs bg-primary px-5 text-[12px] font-bold text-white shadow-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
