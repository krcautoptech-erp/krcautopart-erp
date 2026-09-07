"use client";

import React from "react";
import {
  AlertTriangle,
  Ban,
  FileCheck2,
  Package,
  RotateCcw,
  ShoppingCart,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import type { ItemDeletableCheck } from "@/app/actions/items";

export interface ItemDeletePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkData: ItemDeletableCheck | null;
  checking: boolean;
  onConfirmDelete: () => Promise<void> | void;
  onDeactivate: () => Promise<void> | void;
  actionLoading: boolean;
}

export function ItemDeletePromptModal({
  isOpen,
  onClose,
  checkData,
  checking,
  onConfirmDelete,
  onDeactivate,
  actionLoading,
}: ItemDeletePromptModalProps) {
  if (!isOpen) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-[160] grid place-items-center bg-black/60 p-4 backdrop-blur-[3px] animate-in fade-in duration-150"
    >
      <section className="w-full max-w-[490px] overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-3">
            {checking ? (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : checkData?.canDelete ? (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                <Trash2 size={20} />
              </div>
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <AlertTriangle size={20} />
              </div>
            )}
            <div>
              <h2 className="text-[17px] font-bold leading-tight text-on-surface">
                {checking
                  ? "กำลังตรวจสอบข้อมูลสินค้า..."
                  : checkData?.canDelete
                  ? "ยืนยันการลบรายการสินค้า"
                  : "ไม่สามารถลบรายการสินค้านี้ได้"}
              </h2>
              {checkData ? (
                <p className="mt-0.5 text-[12px] font-semibold text-primary dark:text-red-400">
                  {checkData.itemCode} - {checkData.itemName}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิด"
            disabled={actionLoading}
            onClick={onClose}
            className="-mr-1.5 -mt-1.5 grid h-8 w-8 place-items-center rounded-[4px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        {/* Content Body */}
        <div className="space-y-4 px-5 py-4 text-[13px]">
          {checking ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-on-surface-variant">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="mt-3 font-medium">กำลังตรวจสอบประวัติเอกสารและสต็อกในระบบ...</p>
            </div>
          ) : !checkData ? (
            <p className="text-on-surface-variant">ไม่พบข้อมูลสินค้าที่ต้องการตรวจสอบ</p>
          ) : checkData.canDelete ? (
            /* Case 1: Can delete safely */
            <div className="space-y-3">
              <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                  <FileCheck2 size={18} className="shrink-0 text-emerald-600" />
                  <span>สินค้านี้ยังไม่มีประวัติธุรกรรมใดๆ ในระบบ</span>
                </div>
                <p className="mt-1 text-[12px] text-emerald-700 dark:text-emerald-400">
                  ไม่พบใบขอซื้อ (PR), ใบสั่งซื้อ (PO), ประวัติการรับสินค้า (GR) หรือยอดเคลื่อนไหวทางคลัง สามารถลบออกจากฐานข้อมูลได้อย่างปลอดภัย
                </p>
              </div>
              <p className="text-on-surface-variant">
                คุณแน่ใจหรือไม่ว่าต้องการลบรายการสินค้านี้ออกจากระบบอย่างถาวร? การกระทำนี้ไม่สามารถเรียกคืนได้
              </p>
            </div>
          ) : (
            /* Case 2: Cannot delete (Has history) */
            <div className="space-y-3.5">
              <div className="rounded-[6px] border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-bold">
                  พบประวัติเอกสารหรือการเคลื่อนไหวของสินค้านี้ในระบบแล้ว:
                </p>
                <div className="mt-2.5 space-y-1.5 text-[12.5px]">
                  {checkData.poCount > 0 || checkData.prCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        มีประวัติในเอกสารจัดซื้อ <strong>{checkData.poCount + checkData.prCount}</strong> รายการ (PR: {checkData.prCount}, PO: {checkData.poCount})
                      </span>
                    </div>
                  ) : null}
                  {checkData.grCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <Package size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        มีประวัติการรับสินค้าเข้าคลัง (GR) <strong>{checkData.grCount}</strong> รายการ
                      </span>
                    </div>
                  ) : null}
                  {checkData.lotCount > 0 || checkData.txCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <RotateCcw size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        มีประวัติการเคลื่อนไหวสต็อก/ล็อต <strong>{checkData.lotCount + checkData.txCount}</strong> รายการ
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[4px] bg-surface-container-low/70 p-3 text-[12px] text-on-surface-variant">
                <p className="font-semibold text-on-surface">💡 คำแนะนำตามมาตรฐานระบบ ERP:</p>
                <p className="mt-0.5 leading-relaxed">
                  ระบบไม่อนุญาตให้ลบข้อมูลที่มีประวัติ เพื่อรักษาความถูกต้องของข้อมูลย้อนหลังและรายงานบัญชี/คลังสินค้า หากไม่ต้องการใช้งานต่อ แนะนำให้กด <strong>&quot;ระงับการใช้งาน&quot;</strong> แทน
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="flex items-center justify-end gap-2.5 border-t border-outline-variant bg-surface-container-low/40 px-5 py-3">
          {checking ? (
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container"
            >
              ยกเลิก
            </button>
          ) : checkData?.canDelete ? (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={onClose}
                className="h-9 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={onConfirmDelete}
                className="flex h-9 items-center gap-1.5 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                ใช่, ลบสินค้าออกจากระบบ
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={onClose}
                className="h-9 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                ปิดหน้าต่าง
              </button>
              {checkData?.currentStatus === "active" ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={onDeactivate}
                  className="flex h-9 items-center gap-1.5 rounded-[4px] bg-amber-600 px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                >
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                  ระงับการใช้งานสินค้านี้แทน
                </button>
              ) : (
                <span className="text-[12px] font-semibold text-neutral-500">
                  (สินค้านี้ถูกระงับการใช้งานอยู่แล้ว)
                </span>
              )}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
