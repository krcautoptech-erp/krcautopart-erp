"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { recordAuditExportAction, type AuditLogFilters, type AuditLogRecord } from "@/app/actions/audit-logs";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ListDateRangeFilter, ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { useHasPermission } from "@/components/permission-context";
import { StatusBadge } from "@/components/status-badge";

type AuditLogPageData = { page: number; pageSize: number; records: AuditLogRecord[]; total: number };

const moduleLabels: Record<string, string> = {
  app_roles: "บทบาท", assets: "สินทรัพย์", audit_logs: "Log ระบบ",
  company_document_settings: "ตั้งค่าเอกสาร", company_profiles: "ข้อมูลบริษัท",
  document_term_templates: "หมายเหตุเอกสาร", goods_receipts: "รับสินค้า",
  inventory_adjustments: "ปรับปรุงสต็อก", inventory_issues: "เบิกใช้สินค้า",
  stock_count: "ตรวจนับสต็อกจริง", stock_counts: "ตรวจนับสต็อกจริง",
  stock_count_lines: "รายการตรวจนับสต็อก", stock_count_lots: "ผลตรวจนับตาม Lot",
  items: "รายการสินค้า", purchase_orders: "ใบสั่งซื้อ (PO)",
  purchase_requisitions: "ใบขอซื้อ (PR)", role_permissions: "บทบาทและสิทธิ์",
  user_admin_audit_logs: "ผู้ใช้งาน", user_profiles: "ผู้ใช้งาน",
  user_roles: "สิทธิ์ผู้ใช้งาน", vendors: "คู่ค้า",
};

const fieldLabels: Record<string, string> = {
  status: "สถานะ", role_id: "บทบาท", department_id: "แผนก", approver_user_id: "ผู้อนุมัติ",
  updated_by: "แก้ไขโดย", purchase_order_status: "สถานะใบสั่งซื้อ",
  requisition_status: "สถานะใบขอซื้อ", receipt_status: "สถานะรับสินค้า",
  approved_at: "วันที่อนุมัติ", approved_by: "ผู้อนุมัติ", submitted_at: "วันที่ส่งอนุมัติ",
  rejected_at: "วันที่ไม่อนุมัติ", cancelled_at: "วันที่ยกเลิก", closed_at: "วันที่ปิดเอกสาร",
  pr_number: "เลขที่ใบขอซื้อ", po_number: "เลขที่ใบสั่งซื้อ", document_date: "วันที่เอกสาร",
  requester_name: "ผู้ขอซื้อ", department_name: "แผนก", needed_by_date: "วันที่ต้องการใช้",
  remarks: "หมายเหตุ", requested_item_count: "จำนวนรายการ", requested_total_qty: "จำนวนรวม",
  count_number: "เลขที่รอบตรวจนับ", warehouse_name: "คลังสินค้า", assigned_to_name: "ผู้ตรวจนับ",
  lot_number: "Lot", system_qty: "ยอดระบบ", counted_qty: "ยอดนับจริง", difference_qty: "ผลต่าง",
  reason: "เหตุผล", return_reason: "เหตุผลที่ส่งกลับ", approval_reason: "เหตุผลอนุมัติ",
  stock_adjustment_id: "ใบปรับปรุงสต็อก", owner_approval_override: "อนุมัติโดย OWNER",
  selection_scope: "ขอบเขตรายการ",
};

const valueLabels: Record<string, string> = {
  active: "ใช้งาน", approved: "อนุมัติแล้ว", cancelled: "ยกเลิก", closed: "ปิดเอกสารแล้ว",
  draft: "แบบร่าง", inactive: "ไม่ใช้งาน", in_progress: "กำลังดำเนินการ",
  pending_approval: "รออนุมัติ", rejected: "ไม่อนุมัติ",
  counting: "กำลังตรวจนับ", review: "รอตรวจสอบ", recount: "ส่งกลับตรวจนับ",
  all: "สินค้าทั้งหมด", selected: "เลือกเฉพาะสินค้า",
};

const sourceLabels: Record<string, string> = { application: "ระบบ ERP", database: "ระบบฐานข้อมูล", authentication: "ระบบยืนยันตัวตน" };
const hiddenChangeFields = new Set(["id", "created_at", "created_by", "updated_at", "updated_by"]);

function displayModule(record: AuditLogRecord) {
  return moduleLabels[record.moduleCode] ?? moduleLabels[record.moduleName] ?? record.moduleName.replaceAll("_", " ");
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "string" && valueLabels[value]) return valueLabels[value];
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return dateTime(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function entityText(record: AuditLogRecord) {
  const value = record.entityNumber ?? record.entityId;
  if (!value) return "ไม่มีรายการอ้างอิง";
  if (!/^\d+$/.test(value)) return value;
  return "ไม่มีเลขเอกสาร";
}

function summaryText(record: AuditLogRecord) {
  return `${record.actionLabel} ${entityText(record)}`;
}

function deviceText(value: string | null) {
  if (!value) return "–";
  if (/\bnode\b/i.test(value)) return "บริการภายในระบบ";
  const browser = /Edg\//.test(value) ? "Microsoft Edge" : /Chrome\//.test(value) ? "Google Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : null;
  const platform = /Windows NT/.test(value) ? "Windows" : /Mac OS X/.test(value) ? "macOS" : /Android/.test(value) ? "Android" : /iPhone|iPad/.test(value) ? "iOS" : null;
  return browser && platform ? `${browser} · ${platform}` : "อุปกรณ์อื่น";
}

function outcomeText(outcome: string) {
  return outcome === "success" ? "สำเร็จ" : outcome === "failure" ? "ไม่สำเร็จ" : outcome === "warning" ? "เฝ้าระวัง" : outcome;
}

function visibleChanges(record: AuditLogRecord) {
  return Object.entries(record.changedFields).flatMap(([field, value]) => {
    if ((field === "created" || field === "deleted") && value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !hiddenChangeFields.has(key))
        .map(([key, item]) => [key, field === "created" ? { after: item } : { before: item }] as const);
    }
    return hiddenChangeFields.has(field) ? [] : [[field, value] as const];
  });
}

function outcomeBadge(outcome: string) {
  if (outcome === "failure") return <StatusBadge tone="danger">ไม่สำเร็จ</StatusBadge>;
  if (outcome === "warning") return <StatusBadge tone="pending">เฝ้าระวัง</StatusBadge>;
  return <StatusBadge tone="success">สำเร็จ</StatusBadge>;
}

export function AuditLogManagement({ filters, initialData }: { filters: AuditLogFilters; initialData: AuditLogPageData }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canExport = useHasPermission("audit_logs.export");
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const activeFilters = [filters.module, filters.action, filters.outcome, filters.startDate || filters.endDate].filter(Boolean).length;

  const modules = useMemo(() => [...new Set(initialData.records.map((record) => record.moduleCode))].sort(), [initialData.records]);
  const actions = useMemo(() => [...new Set(initialData.records.map((record) => record.actionCode))].sort(), [initialData.records]);

  function navigate(values: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === "all") params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in values)) params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  async function exportRows() {
    if (!canExport || exporting) return;
    setExporting(true);
    const access = await recordAuditExportAction();
    if ("error" in access) { setExporting(false); return; }
    const rows = [
      ["วันที่/เวลา", "ผู้ดำเนินการ", "บทบาท", "โมดูล", "การกระทำ", "เอกสาร/รายการ", "ผลลัพธ์", "เลขอ้างอิงคำขอ"],
      ...initialData.records.map((record) => [dateTime(record.occurredAt), record.actorName, record.actorRole ?? "", displayModule(record), record.actionLabel, entityText(record), outcomeText(record.outcome), record.requestId ?? ""]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <section className="min-w-0">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-bold leading-tight">Log การใช้งานระบบ</h1>
            <span className="inline-flex h-7 items-center gap-1 rounded-[3px] border border-primary/40 px-2 text-[11px] font-bold text-primary"><span className="material-symbols-outlined text-[15px]">shield_lock</span>เฉพาะผู้มีสิทธิ์</span>
          </div>
          <p className="mt-1 text-[13px] font-medium text-secondary">ตรวจสอบกิจกรรมและการเปลี่ยนแปลงที่เกิดขึ้นในระบบ</p>
        </div>
        {canExport ? <button className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-outline-variant px-4 text-[13px] font-bold hover:border-primary hover:text-primary disabled:opacity-50" disabled={exporting || initialData.records.length === 0} onClick={exportRows} type="button"><span className="material-symbols-outlined text-[18px]">download</span>{exporting ? "กำลังส่งออก..." : "ส่งออก CSV"}</button> : null}
      </header>

      <MobileListFilters activeCount={activeFilters} onClear={() => router.push(pathname)} resultLabel={`แสดง ${initialData.total.toLocaleString("th-TH")} รายการ`} search={<ListSearchField defaultValue={filters.search} onChange={(value) => navigate({ search: value })} placeholder="ค้นหาผู้ใช้ เอกสาร รายการ หรือ Request ID..." />} title="ตัวกรอง Log">
        <ListFilterSelect defaultValue={filters.module ?? "all"} label="โมดูล" onChange={(value) => navigate({ module: value })}><option value="all">ทั้งหมด</option>{modules.map((module) => <option key={module} value={module}>{moduleLabels[module] ?? module.replaceAll("_", " ")}</option>)}</ListFilterSelect>
        <ListFilterSelect defaultValue={filters.action ?? "all"} label="การกระทำ" onChange={(value) => navigate({ action: value })}><option value="all">ทั้งหมด</option>{actions.map((action) => <option key={action} value={action}>{action === "insert" ? "สร้างข้อมูล" : action === "update" ? "แก้ไขข้อมูล" : action === "delete" ? "ลบข้อมูล" : action === "view" ? "เปิดดู" : action === "export" ? "ส่งออก" : action}</option>)}</ListFilterSelect>
        <ListFilterSelect defaultValue={filters.outcome ?? "all"} label="ผลลัพธ์" onChange={(value) => navigate({ outcome: value })}><option value="all">ทั้งหมด</option><option value="success">สำเร็จ</option><option value="failure">ไม่สำเร็จ</option><option value="warning">เฝ้าระวัง</option></ListFilterSelect>
        <ListDateRangeFilter defaultEndValue={filters.endDate} defaultStartValue={filters.startDate} minEnd={filters.startDate || undefined} onEndChange={(value) => navigate({ endDate: value })} onStartChange={(value) => navigate({ startDate: value })} />
      </MobileListFilters>

      <div className="mb-3 hidden gap-2 lg:grid lg:grid-cols-[minmax(250px,1.4fr)_150px_150px_150px_minmax(260px,1fr)]">
        <ListSearchField defaultValue={filters.search} onChange={(value) => navigate({ search: value })} placeholder="ค้นหาผู้ใช้ เอกสาร รายการ หรือ Request ID..." />
        <ListFilterSelect defaultValue={filters.module ?? "all"} label="โมดูล" onChange={(value) => navigate({ module: value })}><option value="all">ทั้งหมด</option>{modules.map((module) => <option key={module} value={module}>{moduleLabels[module] ?? module.replaceAll("_", " ")}</option>)}</ListFilterSelect>
        <ListFilterSelect defaultValue={filters.action ?? "all"} label="การกระทำ" onChange={(value) => navigate({ action: value })}><option value="all">ทั้งหมด</option>{actions.map((action) => <option key={action} value={action}>{action === "insert" ? "สร้างข้อมูล" : action === "update" ? "แก้ไขข้อมูล" : action === "delete" ? "ลบข้อมูล" : action === "view" ? "เปิดดู" : action === "export" ? "ส่งออก" : action}</option>)}</ListFilterSelect>
        <ListFilterSelect defaultValue={filters.outcome ?? "all"} label="ผลลัพธ์" onChange={(value) => navigate({ outcome: value })}><option value="all">ทั้งหมด</option><option value="success">สำเร็จ</option><option value="failure">ไม่สำเร็จ</option><option value="warning">เฝ้าระวัง</option></ListFilterSelect>
        <ListDateRangeFilter defaultEndValue={filters.endDate} defaultStartValue={filters.startDate} minEnd={filters.startDate || undefined} onEndChange={(value) => navigate({ endDate: value })} onStartChange={(value) => navigate({ startDate: value })} />
      </div>

      {activeFilters > 0 ? <div className="mb-2 flex items-center gap-2 text-[12px]"><span className="font-bold text-primary">ตัวกรองที่ใช้ {activeFilters}</span><button className="font-semibold text-secondary underline" onClick={() => router.push(pathname)} type="button">ล้างตัวกรองทั้งหมด</button></div> : null}

      <div className="hidden min-w-0 lg:block">
        <DataTableFrame>
          <DataTable className="min-w-[980px]">
            <colgroup><col className="w-[145px]" /><col className="w-[180px]" /><col className="w-[150px]" /><col className="w-[150px]" /><col /><col className="w-[115px]" /><col className="w-[56px]" /></colgroup>
            <thead><tr><th>วันที่/เวลา</th><th>ผู้ดำเนินการ</th><th>โมดูล</th><th>การกระทำ</th><th>เอกสาร/รายการ</th><th>ผลลัพธ์</th><th aria-label="ดูรายละเอียด" /></tr></thead>
            <tbody>{initialData.records.length ? initialData.records.map((record) => <tr className={`cursor-pointer hover:bg-primary/[0.04] ${selected?.id === record.id ? "bg-primary/[0.07]" : ""}`} key={record.id} onClick={() => setSelected(record)}><td>{dateTime(record.occurredAt)}</td><td><p className="font-bold">{record.actorName}</p><p className="text-[11px] text-secondary">{record.actorRole ?? "ระบบ"}</p></td><td>{displayModule(record)}</td><td>{record.actionLabel}</td><td><p className="font-bold">{entityText(record)}</p><p className="line-clamp-1 text-[11px] text-secondary">{summaryText(record)}</p></td><td>{outcomeBadge(record.outcome)}</td><td><button aria-label="ดูรายละเอียด" className="material-symbols-outlined text-[19px]" onClick={(event) => { event.stopPropagation(); setSelected(record); }} type="button">visibility</button></td></tr>) : <DataTableEmpty colSpan={7}>ไม่พบประวัติตามเงื่อนไข</DataTableEmpty>}</tbody>
          </DataTable>
          <Pagination currentPage={initialData.page} onPageChange={(page) => navigate({ page })} pageSize={initialData.pageSize} totalItems={initialData.total} />
        </DataTableFrame>
      </div>

      <div className="divide-y divide-outline-variant border-y border-outline-variant lg:hidden">
        {initialData.records.map((record) => <button className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto_18px] items-start gap-2 px-1 py-3 text-left" key={record.id} onClick={() => setSelected(record)} type="button"><span className="text-[11px] font-bold text-secondary">{new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(record.occurredAt))}</span><span className="min-w-0"><strong className="block truncate text-[13px]">{record.actorName} · {record.actionLabel}</strong><span className="block truncate text-[11px] text-secondary">{displayModule(record)} · {entityText(record)}</span></span>{outcomeBadge(record.outcome)}<span className="material-symbols-outlined text-[18px]">chevron_right</span></button>)}
        {!initialData.records.length ? <p className="py-12 text-center text-[13px] text-secondary">ไม่พบประวัติตามเงื่อนไข</p> : null}
        <Pagination currentPage={initialData.page} onPageChange={(page) => navigate({ page })} pageSize={initialData.pageSize} totalItems={initialData.total} />
      </div>

      {selected ? <><DesktopAuditDetail record={selected} onClose={() => setSelected(null)} /><MobileAuditDetail record={selected} onClose={() => setSelected(null)} /></> : null}
    </section>
  );
}

function DesktopAuditDetail({ onClose, record }: { onClose: () => void; record: AuditLogRecord }) {
  return <aside aria-label="รายละเอียดเหตุการณ์" className="fixed bottom-0 right-0 top-[70px] z-40 hidden w-[400px] overflow-hidden border-l border-outline-variant bg-background shadow-[-8px_0_24px_rgba(0,0,0,0.10)] lg:block"><header className="flex h-14 items-center justify-between border-b border-outline-variant px-4"><h2 className="text-[17px] font-bold">รายละเอียดเหตุการณ์</h2><button aria-label="ปิดรายละเอียด" className="grid size-9 place-items-center rounded-[3px] hover:bg-surface-container-low" onClick={onClose} type="button"><span className="material-symbols-outlined text-[22px]">close</span></button></header><div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4"><AuditDetailContent record={record} /></div></aside>;
}

function MobileAuditDetail({ onClose, record }: { onClose: () => void; record: AuditLogRecord }) {
  return <div className="fixed inset-0 z-50 bg-black/35 lg:hidden" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><aside aria-label="รายละเอียดเหตุการณ์" aria-modal="true" className="absolute inset-x-0 bottom-0 max-h-[76dvh] overflow-y-auto rounded-t-[10px] bg-background shadow-xl" role="dialog"><header className="sticky top-0 z-10 border-b border-outline-variant bg-background px-4"><div aria-hidden="true" className="mx-auto my-2 h-1 w-10 rounded-full bg-outline-variant" /><div className="flex h-12 items-center justify-between"><h2 className="text-[17px] font-bold">รายละเอียดเหตุการณ์</h2><button aria-label="ปิด" className="grid size-9 place-items-center" onClick={onClose} type="button"><span className="material-symbols-outlined">close</span></button></div></header><div className="p-4 pb-20"><AuditDetailContent record={record} /></div><div className="sticky bottom-0 border-t border-outline-variant bg-background p-3"><button className="h-11 w-full rounded-[4px] bg-primary font-bold text-white" onClick={onClose} type="button">ปิด</button></div></aside></div>;
}

function AuditDetailContent({ record }: { record: AuditLogRecord }) {
  const changes = visibleChanges(record);
  return <div className="space-y-4"><div className="flex items-center justify-between gap-3">{outcomeBadge(record.outcome)}<time className="text-[12px] text-secondary">{dateTime(record.occurredAt)}</time></div><div><h3 className="text-[16px] font-bold">{summaryText(record)}</h3><p className="mt-1 text-[12px] text-secondary">{displayModule(record)}</p></div><DetailSection title="ข้อมูลเหตุการณ์"><DetailRow label="ผู้ดำเนินการ" value={`${record.actorName}${record.actorRole ? ` (${record.actorRole})` : ""}`} /><DetailRow label="โมดูล" value={displayModule(record)} /><DetailRow label="การกระทำ" value={record.actionLabel} /><DetailRow label="เอกสาร/รายการ" value={entityText(record)} /><DetailRow label="เหตุผล" value={record.reason ?? "–"} /></DetailSection><DetailSection title="การเปลี่ยนแปลง">{changes.length ? changes.map(([field, value]) => { const change = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { after: value }; return <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-b border-outline-variant py-2 text-[12px] last:border-0" key={field}><strong>{fieldLabels[field] ?? "ข้อมูลเพิ่มเติม"}</strong><span className="break-words text-secondary">{displayValue(change.before)} <span className="mx-1 text-primary">→</span> {displayValue(change.after ?? change.created ?? change.deleted)}</span></div>; }) : <p className="py-3 text-[12px] text-secondary">ไม่มีค่ารายฟิลด์ที่เปลี่ยนแปลง</p>}</DetailSection><details className="border-t border-outline-variant pt-3"><summary className="cursor-pointer text-[13px] font-bold text-primary">ข้อมูลทางเทคนิค</summary><div className="mt-1"><DetailRow label="แหล่งที่มา" value={sourceLabels[record.source] ?? "ระบบ"} /><DetailRow label="IP Address" value={record.ipAddressMasked ?? "–"} /><DetailRow label="อุปกรณ์" value={deviceText(record.deviceSummary)} /><DetailRow label="เลขอ้างอิงคำขอ" value={record.requestId ?? "–"} /></div></details></div>;
}

function DetailSection({ children, title }: { children: React.ReactNode; title: string }) { return <section className="border-t border-outline-variant pt-3"><h3 className="mb-1 text-[13px] font-bold text-primary">{title}</h3>{children}</section>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-outline-variant py-2 text-[12px] last:border-0"><span className="font-medium text-secondary">{label}</span><strong className="break-all">{value}</strong></div>; }
