import type { ReactNode } from "react";

export type StatusTone = "neutral" | "pending" | "success" | "danger" | "info";

const tones: Record<StatusTone, string> = {
  neutral: "border-slate-500 bg-slate-500 text-white dark:border-slate-600 dark:bg-slate-600",
  pending: "border-amber-500 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-600",
  success: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
  danger: "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
  info: "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
};

export function StatusBadge({ children, className = "", tone = "neutral" }: { children: ReactNode; className?: string; tone?: StatusTone }) {
  return <span className={`inline-flex h-[22px] items-center justify-center rounded-[3px] border px-[8px] text-[11px] font-bold leading-none whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
}

export function ActiveStatusBadge({ active, activeLabel = "ใช้งาน", inactiveLabel = "ระงับ" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <StatusBadge tone={active ? "success" : "danger"}>{active ? activeLabel : inactiveLabel}</StatusBadge>;
}

export function statusTone(status: string): StatusTone {
  if (["active", "approved", "completed", "received", "posted", "in_use", "ใช้งาน", "ใช้งานอยู่", "อนุมัติแล้ว"].includes(status)) return "success";
  if (["pending", "pending_approval", "sent", "partially_received", "under_repair", "รออนุมัติ", "ส่งซ่อม/เคลม"].includes(status)) return "pending";
  if (["cancelled", "rejected", "inactive", "scrapped", "disposed", "ระงับ", "ระงับการใช้งาน", "ตัดจำหน่าย"].includes(status)) return "danger";
  if (["in_progress", "processing", "in_stock", "allocated", "พร้อมใช้งาน (ในคลัง)", "จองแล้ว"].includes(status)) return "info";
  return "neutral";
}
