"use client";

import { Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  deleteWarehouseAction,
  deleteWarehouseTypeAction,
  saveWarehouseAction,
  saveWarehouseTypeAction,
  setWarehouseStatusAction,
  type WarehouseRecord,
  type WarehouseSettingsData,
  type WarehouseTypeRecord,
} from "@/app/actions/warehouses";
import type { WarehouseInput, WarehouseTypeInput } from "@/lib/warehouses";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ActiveStatusBadge } from "@/components/status-badge";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { CompanyFormLogo } from "@/components/company-logo";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";

const PER_PAGE = 20;
const emptyWarehouse = (typeId = 0): WarehouseInput => ({ code: "", locationName: "", name: "", remarks: "", responsibleUserId: null, status: "active", typeId });
const emptyType: WarehouseTypeInput = { code: "", name: "", remarks: "", status: "active" };

export function WarehouseManagement({ initialData }: { initialData: WarehouseSettingsData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<"warehouses" | "types">("warehouses");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query).trim().toLocaleLowerCase("th");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [warehouseModal, setWarehouseModal] = useState<{ id: number | null; value: WarehouseInput } | null>(null);
  const [typeModal, setTypeModal] = useState<{ id: number | null; value: WarehouseTypeInput } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; kind: "warehouse" | "type"; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const locations = [...new Set(data.warehouses.map((item) => item.locationName).filter(Boolean))];
  const filtered = data.warehouses.filter((item) => {
    const matchesText = !deferredQuery || [item.code, item.name, item.typeName, item.locationName, item.responsibleName ?? ""].join(" ").toLocaleLowerCase("th").includes(deferredQuery);
    return matchesText && (typeFilter === "all" || item.typeId === Number(typeFilter)) && (locationFilter === "all" || item.locationName === locationFilter) && (statusFilter === "all" || item.status === statusFilter);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const refreshData = (next: WarehouseSettingsData) => { setData(next); setError(null); };
  const resetFilters = () => { setQuery(""); setTypeFilter("all"); setLocationFilter("all"); setStatusFilter("all"); setPage(1); };

  const submitWarehouse = (event: FormEvent) => {
    event.preventDefault();
    if (!warehouseModal) return;
    startTransition(async () => {
      const result = await saveWarehouseAction(warehouseModal.id, warehouseModal.value);
      if ("error" in result) {
        setError(result.error ?? "ไม่สามารถบันทึกข้อมูลคลังได้");
        toast.error("บันทึกไม่สำเร็จ", result.error ?? "ไม่สามารถบันทึกข้อมูลคลังได้");
        return;
      }
      toast.success(warehouseModal.id ? "แก้ไขข้อมูลคลังเรียบร้อยแล้ว" : "เพิ่มคลังสินค้าเรียบร้อยแล้ว", warehouseModal.value.name);
      refreshData(result.data);
      setWarehouseModal(null);
    });
  };

  const submitType = (event: FormEvent) => {
    event.preventDefault();
    if (!typeModal) return;
    startTransition(async () => {
      const result = await saveWarehouseTypeAction(typeModal.id, typeModal.value);
      if ("error" in result) {
        setError(result.error);
        toast.error("บันทึกไม่สำเร็จ", result.error);
        return;
      }
      toast.success(typeModal.id ? "แก้ไขประเภทคลังเรียบร้อยแล้ว" : "เพิ่มประเภทคลังเรียบร้อยแล้ว", typeModal.value.name);
      refreshData(result.data);
      setTypeModal(null);
    });
  };

  const toggleStatus = (item: WarehouseRecord) => startTransition(async () => {
    const status = item.status === "active" ? "inactive" : "active";
    const result = await setWarehouseStatusAction(item.id, status);
    if ("error" in result) {
      setError(result.error);
      toast.error("เปลี่ยนสถานะไม่สำเร็จ", result.error);
      return;
    }
    setData((current) => ({ ...current, warehouses: current.warehouses.map((row) => row.id === item.id ? { ...row, status } : row) }));
    toast.success(`เปลี่ยนสถานะเป็น "${status === "active" ? "ใช้งาน" : "ระงับ"}" เรียบร้อยแล้ว`, item.name);
  });

  const confirmDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = deleteTarget.kind === "warehouse" ? await deleteWarehouseAction(deleteTarget.id) : await deleteWarehouseTypeAction(deleteTarget.id);
      if ("error" in result) {
        setError(result.error);
        toast.error("ลบข้อมูลไม่สำเร็จ", result.error);
        setDeleteTarget(null);
        return;
      }
      setData((current) => deleteTarget.kind === "warehouse"
        ? { ...current, warehouses: current.warehouses.filter((item) => item.id !== deleteTarget.id) }
        : { ...current, types: current.types.filter((item) => item.id !== deleteTarget.id) });
      toast.success("ลบข้อมูลเรียบร้อยแล้ว", deleteTarget.name);
      setDeleteTarget(null);
    });
  };

  return (
    <div className="bg-surface-container-lowest">
      <header className="flex min-h-[92px] flex-col justify-between gap-4 border-b border-outline-variant px-6 py-4 lg:flex-row lg:items-center">
        <div><h1 className="text-[27px] font-bold tracking-[-0.02em] text-on-surface">ข้อมูลคลัง</h1><p className="mt-1 text-[14px] font-medium text-secondary">ข้อมูลกลางสำหรับรับสินค้า จัดเก็บ และควบคุมสต็อก</p></div>
        <div className="flex flex-wrap gap-2">
          <ExcelExportButton onClick={() => tab === "warehouses" ? exportWarehouses(filtered) : exportWarehouseTypes(data.types)} />
          {data.canManage ? <button className={primaryButton} onClick={() => tab === "warehouses" ? setWarehouseModal({ id: null, value: emptyWarehouse(data.types.find((type) => type.status === "active")?.id ?? 0) }) : setTypeModal({ id: null, value: emptyType })} type="button"><Plus size={17} />{tab === "warehouses" ? "เพิ่มคลัง" : "เพิ่มประเภทคลัง"}</button> : null}
        </div>
      </header>

      <div className="flex h-13 items-end gap-9 border-b border-outline-variant px-6">
        <Tab active={tab === "warehouses"} onClick={() => setTab("warehouses")}>รายการคลัง</Tab>
        <Tab active={tab === "types"} onClick={() => setTab("types")}>ประเภทคลัง</Tab>
      </div>

      {error ? <div className="mx-6 mt-3 border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-700" role="alert">{error}</div> : null}

      {tab === "warehouses" ? (
        <section>
          <div className="px-4 py-3 md:hidden">
            <MobileListFilters
              activeCount={[typeFilter, locationFilter, statusFilter].filter((value) => value !== "all").length}
              onClear={resetFilters}
              search={<ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหารหัสคลัง ชื่อคลัง หรือที่ตั้ง..." value={query} />}
            >
              <ListFilterSelect label="ประเภทคลัง" onChange={(value) => { setTypeFilter(value); setPage(1); }} value={typeFilter}><option value="all">ทั้งหมด</option>{data.types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</ListFilterSelect>
              <ListFilterSelect label="สาขา / ที่ตั้ง" onChange={(value) => { setLocationFilter(value); setPage(1); }} value={locationFilter}><option value="all">ทั้งหมด</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</ListFilterSelect>
              <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setPage(1); }} value={statusFilter}><option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับใช้งาน</option></ListFilterSelect>
            </MobileListFilters>
          </div>
          <div className="hidden gap-3 border-b border-outline-variant px-6 py-4 md:grid md:grid-cols-2 xl:grid-cols-[1.65fr_0.8fr_0.8fr_0.75fr_auto]">
            <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2" size={17} /><input className={`${controlClass} pl-10`} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ค้นหา รหัสคลัง, ชื่อคลัง, สาขา/ที่ตั้ง, ผู้รับผิดชอบ" value={query} /></label>
            <select className={controlClass} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} value={typeFilter}><option value="all">ประเภทคลัง: ทั้งหมด</option>{data.types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
            <select className={controlClass} onChange={(event) => { setLocationFilter(event.target.value); setPage(1); }} value={locationFilter}><option value="all">สาขา/ที่ตั้ง: ทั้งหมด</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select>
            <select className={controlClass} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} value={statusFilter}><option value="all">สถานะ: ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับใช้งาน</option></select>
            <button className={outlineButton} onClick={resetFilters} type="button"><RotateCcw size={16} />ล้างตัวกรอง</button>
          </div>
          <WarehouseTable canManage={data.canManage} items={pageItems} onDelete={(item) => setDeleteTarget({ id: item.id, kind: "warehouse", name: item.name })} onEdit={(item) => setWarehouseModal({ id: item.id, value: { code: item.code, locationName: item.locationName, name: item.name, remarks: item.remarks, responsibleUserId: item.responsibleUserId, status: item.status, typeId: item.typeId } })} onToggle={toggleStatus} page={safePage} />
          <Pager current={safePage} onChange={setPage} total={filtered.length} totalPages={totalPages} />
        </section>
      ) : <WarehouseTypeTable canManage={data.canManage} items={data.types} onDelete={(item) => setDeleteTarget({ id: item.id, kind: "type", name: item.name })} onEdit={(item) => setTypeModal({ id: item.id, value: { code: item.code, name: item.name, remarks: item.remarks, status: item.status } })} />}

      {warehouseModal ? <WarehouseModal data={data} modal={warehouseModal} error={error} isPending={isPending} onChange={(value) => setWarehouseModal({ ...warehouseModal, value })} onClose={() => { setWarehouseModal(null); setError(null); }} onSubmit={submitWarehouse} /> : null}
      {typeModal ? <WarehouseTypeModal modal={typeModal} error={error} isPending={isPending} onChange={(value) => setTypeModal({ ...typeModal, value })} onClose={() => { setTypeModal(null); setError(null); }} onSubmit={submitType} /> : null}
      <ConfirmModal
        confirmText="ลบข้อมูล"
        description={`คุณต้องการลบ ${deleteTarget?.kind === "warehouse" ? "คลัง" : "ประเภทคลัง"} "${deleteTarget?.name}" ใช่หรือไม่? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้`}
        isOpen={Boolean(deleteTarget)}
        itemName={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`ยืนยันการลบ${deleteTarget?.kind === "warehouse" ? "คลัง" : "ประเภทคลัง"}`}
        variant="danger"
      />
    </div>
  );
}

function WarehouseTable({ canManage, items, onDelete, onEdit, onToggle, page }: { canManage: boolean; items: WarehouseRecord[]; onDelete: (item: WarehouseRecord) => void; onEdit: (item: WarehouseRecord) => void; onToggle: (item: WarehouseRecord) => void; page: number }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1080px] table-fixed border-collapse"><thead className="bg-surface-container-low"><tr className="h-11 border-b border-outline-variant"><TH className="w-[6%] text-center">ลำดับ</TH><TH className="w-[11%]">รหัสคลัง</TH><TH className="w-[20%]">ชื่อคลัง</TH><TH className="w-[16%]">ประเภทคลัง</TH><TH className="w-[18%]">สาขา/ที่ตั้ง</TH><TH className="w-[17%]">ผู้รับผิดชอบ</TH><TH className="w-[10%] text-center">สถานะ</TH><TH className="w-[12%] text-center">จัดการ</TH></tr></thead><tbody>{items.map((item, index) => <tr className="h-13 border-b border-outline-variant hover:bg-surface-container-low/50" key={item.id}><TD className="text-center">{(page - 1) * PER_PAGE + index + 1}</TD><TD className="font-bold">{item.code}</TD><TD className="font-semibold">{item.name}</TD><TD>{item.typeName}</TD><TD>{item.locationName}</TD><TD>{item.responsibleName ?? "-"}</TD><TD className="text-center"><button className="inline-flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canManage} onClick={() => onToggle(item)} title={item.status === "active" ? "คลิกเพื่อระงับการใช้งาน" : "คลิกเพื่อเปิดใช้งาน"} type="button"><ActiveStatusBadge active={item.status === "active"} activeLabel="ใช้งาน" inactiveLabel="ระงับ" /></button></TD><TD><div className="flex justify-center gap-4">{canManage ? <><button aria-label={`แก้ไข ${item.name}`} onClick={() => onEdit(item)} type="button"><Pencil size={16} /></button><button aria-label={`ลบ ${item.name}`} className="text-primary" onClick={() => onDelete(item)} type="button"><Trash2 size={16} /></button></> : "-"}</div></TD></tr>)}{items.length === 0 ? <tr><td className="h-36 text-center text-secondary" colSpan={8}>ไม่พบข้อมูลคลังตามเงื่อนไขที่ค้นหา</td></tr> : null}</tbody></table></div>;
}

function WarehouseTypeTable({ canManage, items, onDelete, onEdit }: { canManage: boolean; items: WarehouseTypeRecord[]; onDelete: (item: WarehouseTypeRecord) => void; onEdit: (item: WarehouseTypeRecord) => void }) {
  return (
    <section className="px-5 py-5">
      <div className="max-w-full overflow-x-auto rounded-[3px] border border-outline-variant">
        <table className="w-full min-w-[680px] table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "53%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="bg-surface-container-low">
            <tr className="h-[58px]">
              <th className="border-r border-outline-variant px-3 text-center text-[14px] font-extrabold">ลำดับ</th>
              <th className="border-r border-outline-variant px-3 text-center text-[14px] font-extrabold">รหัสประเภท</th>
              <th className="border-r border-outline-variant px-5 text-left text-[14px] font-extrabold">ชื่อประเภทคลัง</th>
              <th className="border-r border-outline-variant px-3 text-center text-[14px] font-extrabold">จำนวนคลัง</th>
              <th className="border-r border-outline-variant px-3 text-center text-[14px] font-extrabold">สถานะ</th>
              <th className="px-3 text-center text-[14px] font-extrabold">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr className="h-[70px] border-t border-outline-variant" key={item.id}>
                <td className="border-r border-outline-variant px-3 text-center text-[14px] font-medium">{index + 1}</td>
                <td className="border-r border-outline-variant px-3 text-center text-[14px] font-medium">{item.code}</td>
                <td className="border-r border-outline-variant px-5 text-left text-[14px] font-medium">{item.name}</td>
                <td className="border-r border-outline-variant px-3 text-center text-[14px] font-medium">{item.warehouseCount}</td>
                <td className="border-r border-outline-variant px-3 text-center">
                  <div className="flex justify-center">
                    <ActiveStatusBadge active={item.status === "active"} activeLabel="ใช้งาน" inactiveLabel="ระงับ" />
                  </div>
                </td>
                <td className="px-3">
                  <div className="flex items-center justify-center gap-6">
                    {canManage ? (
                      <>
                        <button aria-label={`แก้ไข ${item.name}`} onClick={() => onEdit(item)} type="button">
                          <Pencil size={18} strokeWidth={2} />
                        </button>
                        <button aria-label={`ลบ ${item.name}`} onClick={() => onDelete(item)} type="button">
                          <Trash2 size={18} strokeWidth={2} />
                        </button>
                      </>
                    ) : "-"}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="h-36 text-center text-secondary" colSpan={6}>ยังไม่มีข้อมูลประเภทคลัง</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WarehouseModal({ data, error, isPending, modal, onChange, onClose, onSubmit }: { data: WarehouseSettingsData; error: string | null; isPending: boolean; modal: { id: number | null; value: WarehouseInput }; onChange: (value: WarehouseInput) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const value = modal.value;
  return <ModalShell isPending={isPending} onClose={onClose} title={modal.id ? "แก้ไขคลัง" : "เพิ่มคลัง"}><form onSubmit={onSubmit}><div className="space-y-5 p-6"><SectionTitle number="01">ข้อมูลคลัง</SectionTitle>{error ? <ErrorBox>{error}</ErrorBox> : null}<div className="grid gap-4 sm:grid-cols-2"><Field label="รหัสคลัง" required><input autoFocus className={controlClass} maxLength={20} onChange={(event) => onChange({ ...value, code: event.target.value.toUpperCase() })} placeholder="เช่น WH-01" value={value.code} /></Field><Field label="ชื่อคลัง" required><input className={controlClass} maxLength={100} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="เช่น คลังวัตถุดิบหลัก" value={value.name} /></Field><Field className="sm:col-span-2" label="ประเภทคลัง" required><select className={controlClass} onChange={(event) => onChange({ ...value, typeId: Number(event.target.value) })} value={value.typeId || ""}><option value="">เลือกประเภทคลัง</option>{data.types.filter((type) => type.status === "active" || type.id === value.typeId).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field></div><SectionTitle number="02">สถานที่และผู้ดูแล</SectionTitle><div className="grid gap-4 sm:grid-cols-2"><Field label="สาขา/อาคาร"><input className={controlClass} maxLength={150} onChange={(event) => onChange({ ...value, locationName: event.target.value })} placeholder="เช่น สำนักงานใหญ่ - บางพลี (ถ้ามี)" value={value.locationName} /></Field><Field label="ผู้รับผิดชอบ"><select className={controlClass} onChange={(event) => onChange({ ...value, responsibleUserId: event.target.value || null })} value={value.responsibleUserId ?? ""}><option value="">เลือกผู้รับผิดชอบ</option>{data.responsibleUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field></div><SectionTitle number="03">การใช้งาน</SectionTitle><div className="rounded-[4px] border border-outline-variant bg-surface-container-low p-3"><ToggleSwitch checked={value.status === "active"} label="สถานะเปิดใช้งานคลังสินค้า" onChange={(checked) => onChange({ ...value, status: checked ? "active" : "inactive" })} /></div><Field label="หมายเหตุ"><textarea className={`${controlClass} h-24 resize-none py-2.5`} maxLength={500} onChange={(event) => onChange({ ...value, remarks: event.target.value })} placeholder="ระบุหมายเหตุ (ถ้ามี)" value={value.remarks} /><span className="mt-1 block text-right text-[11px] text-secondary">{value.remarks.length} / 500</span></Field></div><ModalFooter isPending={isPending} onCancel={onClose} text="บันทึกข้อมูล" /></form></ModalShell>;
}

function WarehouseTypeModal({ error, isPending, modal, onChange, onClose, onSubmit }: { error: string | null; isPending: boolean; modal: { id: number | null; value: WarehouseTypeInput }; onChange: (value: WarehouseTypeInput) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const value = modal.value;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"><div className="max-h-[94vh] w-full max-w-[625px] overflow-y-auto rounded-[7px] border border-outline-variant bg-surface-container-lowest shadow-2xl"><header className="flex h-[80px] items-center border-b border-outline-variant px-7"><h2 className="text-[24px] font-bold">{modal.id ? "แก้ไขประเภทคลัง" : "เพิ่มประเภทคลัง"}</h2><span className="ml-auto mr-5"><CompanyFormLogo/></span><button aria-label="ปิด" disabled={isPending} onClick={onClose} type="button"><X size={24} /></button></header><form onSubmit={onSubmit}><div className="space-y-5 px-7 py-6"><SectionTitle number="01">ข้อมูลประเภทคลัง</SectionTitle>{error ? <ErrorBox>{error}</ErrorBox> : null}<Field label="รหัสประเภทคลัง" required><input autoFocus className={`${controlClass} h-[52px]`} maxLength={20} onChange={(event) => onChange({ ...value, code: event.target.value.toUpperCase() })} placeholder="เช่น RAW" value={value.code} /></Field><Field label="ชื่อประเภทคลัง" required><input className={`${controlClass} h-[52px]`} maxLength={100} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="เช่น คลังวัตถุดิบ" value={value.name} /></Field><div className="rounded-[4px] border border-outline-variant bg-surface-container-low p-3"><ToggleSwitch checked={value.status === "active"} label="สถานะเปิดใช้งานประเภทคลัง" onChange={(checked) => onChange({ ...value, status: checked ? "active" : "inactive" })} /></div><Field label="หมายเหตุ"><textarea className={`${controlClass} h-[130px] resize-none py-3`} maxLength={255} onChange={(event) => onChange({ ...value, remarks: event.target.value })} placeholder="ระบุหมายเหตุ (ถ้ามี)" value={value.remarks} /><span className="mt-1 block text-right text-[12px] text-secondary">{value.remarks.length} / 255</span></Field></div><footer className="grid grid-cols-2 gap-5 border-t border-outline-variant px-8 py-5"><button className={`${outlineButton} h-14`} disabled={isPending} onClick={onClose} type="button">ยกเลิก</button><button className={`${primaryButton} h-14`} disabled={isPending} type="submit">{isPending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</button></footer></form></div></div>;
}

function ModalShell({ children, isPending, onClose, title }: { children: React.ReactNode; isPending: boolean; onClose: () => void; title: string }) { return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"><div className="max-h-[94vh] w-full max-w-[720px] overflow-y-auto rounded-[5px] border border-outline-variant bg-surface-container-lowest shadow-2xl"><header className="flex h-15 items-center justify-between border-b border-outline-variant px-6"><div className="flex items-center gap-3"><CompanyFormLogo/><h2 className="text-[21px] font-bold">{title}</h2></div><button aria-label="ปิด" disabled={isPending} onClick={onClose} type="button"><X size={22} /></button></header>{children}</div></div>; }
function ModalFooter({ isPending, onCancel, text }: { isPending: boolean; onCancel: () => void; text: string }) { return <footer className="flex h-16 justify-end gap-3 border-t border-outline-variant px-6 py-3"><button className={outlineButton} disabled={isPending} onClick={onCancel} type="button">ยกเลิก</button><button className={primaryButton} disabled={isPending} type="submit">{isPending ? "กำลังบันทึก..." : text}</button></footer>; }
function Pager({ current, onChange, total, totalPages }: { current: number; onChange: (page: number) => void; total: number; totalPages: number }) { return <Pagination currentPage={current} onPageChange={onChange} pageSize={PER_PAGE} totalItems={total} totalPages={totalPages} />; }
function Field({ children, className = "", label, required = false }: { children: ReactNode; className?: string; label: string; required?: boolean }) { return <label className={className}><span className="mb-1.5 block text-[13px] font-bold">{label}{required ? <span className="ml-1 text-primary">*</span> : null}</span>{children}</label>; }
function SectionTitle({ children, number }: { children: ReactNode; number: string }) { return <div className="flex items-center gap-3 border-b border-outline-variant pb-2"><span className="font-black text-primary">{number}</span><h3 className="text-[16px] font-bold">{children}</h3></div>; }
function Tab({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) { return <button className={`h-full border-b-2 px-3 text-[14px] font-bold ${active ? "border-primary text-primary" : "border-transparent text-secondary"}`} onClick={onClick} type="button">{children}</button>; }
function TH({ children, className = "" }: { children: ReactNode; className?: string }) { return <th className={`px-3 text-left text-[13px] font-extrabold ${className}`}>{children}</th>; }
function TD({ children, className = "" }: { children: ReactNode; className?: string }) { return <td className={`px-3 text-[14px] font-medium ${className}`}>{children}</td>; }
function ErrorBox({ children }: { children: ReactNode }) { return <div className="border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{children}</div>; }

function exportWarehouses(items: WarehouseRecord[]) { const rows = [["ลำดับ", "รหัสคลัง", "ชื่อคลัง", "ประเภทคลัง", "สาขา/ที่ตั้ง", "ผู้รับผิดชอบ", "สถานะ"], ...items.map((item, index) => [index + 1, item.code, item.name, item.typeName, item.locationName, item.responsibleName ?? "", item.status === "active" ? "ใช้งาน" : "ระงับใช้งาน"])]; const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `warehouses-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); }
function exportWarehouseTypes(items: WarehouseTypeRecord[]) { const rows = [["ลำดับ", "รหัสประเภท", "ชื่อประเภทคลัง", "จำนวนคลัง", "สถานะ"], ...items.map((item, index) => [index + 1, item.code, item.name, item.warehouseCount, item.status === "active" ? "ใช้งาน" : "ระงับใช้งาน"])]; const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `warehouse-types-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); }

const controlClass = "h-10 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary dark:[color-scheme:dark]";
const outlineButton = "inline-flex h-10 items-center justify-center gap-2 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[14px] font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const primaryButton = "inline-flex h-10 items-center justify-center gap-2 rounded-[4px] bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary/95 disabled:opacity-50";
