"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import { Edit3, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocumentTermTemplateAction, saveDocumentTermTemplateAction } from "@/app/actions/document-terms";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ActiveStatusBadge } from "@/components/status-badge";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";
import { CompanyFormLogo } from "@/components/company-logo";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { DOCUMENT_TERM_LIMIT, documentTypeLabels, type DocumentTermTemplateInput, type DocumentTermTemplateRecord, type DocumentType } from "@/lib/document-terms";

const blank: DocumentTermTemplateInput = { code: "", documentType: "po", isDefault: false, name: "", status: "active", terms: [{ isActive: true, text: "" }], version: 1 };
const types = Object.keys(documentTypeLabels) as DocumentType[];
const inputClass = "mt-1 h-11 w-full rounded-[2px] border border-outline-variant bg-background px-3 py-2 text-[13px] leading-6 outline-none focus:border-primary disabled:bg-surface-container";

export function DocumentTermSettings({ canManage, initialTemplates }: { canManage: boolean; initialTemplates: DocumentTermTemplateRecord[] }) {
  useListScroll();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeType, setActiveType] = useListState<DocumentType>("activeType", "po");
  const [query, setQuery] = useListState("query", "");
  const [statusFilter, setStatusFilter] = useListState("statusFilter", "all");
  const [editing, setEditing] = useState<DocumentTermTemplateRecord | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentTermTemplateRecord | null>(null);
  const [form, setForm] = useState<DocumentTermTemplateInput>(blank);
  const [error, setError] = useState("");
  const filtered = useMemo(() => initialTemplates.filter((template) => template.documentType === activeType && (statusFilter === "all" || template.status === statusFilter) && `${template.code} ${template.name}`.toLowerCase().includes(query.toLowerCase())), [activeType, initialTemplates, query, statusFilter]);

  function open(template?: DocumentTermTemplateRecord) {
    setEditing(template ?? "new");
    setForm(template ? { code: template.code, documentType: template.documentType, isDefault: template.isDefault, name: template.name, status: template.status, terms: template.terms.map((term) => ({ ...term })), version: template.version } : { ...blank, documentType: activeType, terms: [{ isActive: true, text: "" }] });
    setError("");
  }
  function updateTerm(index: number, patch: Partial<DocumentTermTemplateInput["terms"][number]>) { setForm((current) => ({ ...current, terms: current.terms.map((term, itemIndex) => itemIndex === index ? { ...term, ...patch } : term) })); }
  function moveTerm(from: number, to: number) { if (to < 0 || to >= form.terms.length) return; setForm((current) => { const terms = [...current.terms]; const [term] = terms.splice(from, 1); terms.splice(to, 0, term); return { ...current, terms }; }); }
  function submit() {
    setError("");
    startTransition(async () => {
      const result = await saveDocumentTermTemplateAction(editing === "new" ? null : editing?.id ?? null, form);
      if ("error" in result) {
        setError(result.error ?? "ไม่สามารถบันทึกแม่แบบได้");
        toast.error("บันทึกแม่แบบไม่สำเร็จ", result.error);
        return;
      }
      toast.success(editing === "new" ? "เพิ่มแม่แบบเงื่อนไขเรียบร้อยแล้ว" : "บันทึกแม่แบบเงื่อนไขเรียบร้อยแล้ว", form.name);
      setEditing(null);
      router.refresh();
    });
  }
  function remove(template: DocumentTermTemplateRecord) {
    setDeleteTarget(template);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteDocumentTermTemplateAction(deleteTarget.id);
      if ("error" in result) {
        setError(result.error ?? "ไม่สามารถลบแม่แบบได้");
        toast.error("ลบแม่แบบไม่สำเร็จ", result.error);
        return;
      }
      toast.success("ลบแม่แบบเงื่อนไขเรียบร้อยแล้ว", `${deleteTarget.code} - ${deleteTarget.name}`);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return <section className="min-w-0 bg-surface-container-lowest text-on-surface">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-1 pb-4">
      <div><h1 className="text-[28px] font-bold leading-tight">ตั้งค่าเงื่อนไขเอกสาร</h1><p className="mt-1 text-[14px] text-on-surface-variant">กำหนดข้อความมาตรฐานสำหรับเอกสารแต่ละประเภท และนำไปใช้โดยอัตโนมัติ</p></div>
      {canManage && <button className="flex h-10 items-center gap-2 rounded-[3px] bg-primary px-5 text-[14px] font-bold text-on-primary" onClick={() => open()} type="button"><Plus size={19}/>เพิ่มแม่แบบ</button>}
    </header>
    <nav className="mt-4 flex max-w-full gap-8 overflow-x-auto border-b border-outline-variant" aria-label="ประเภทเอกสาร">
      {types.map((type) => <button className={`shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-[14px] font-bold ${activeType === type ? "border-primary text-primary" : "border-transparent"}`} key={type} onClick={() => setActiveType(type)} type="button">{documentTypeLabels[type]}</button>)}
    </nav>
    <div className="my-4"><MobileListFilters
      activeCount={statusFilter === "all" ? 0 : 1}
      onClear={() => setStatusFilter("all")}
      search={<ListSearchField onChange={setQuery} placeholder="ค้นหารหัสหรือชื่อแม่แบบ" value={query} />}
    >
      <ListFilterSelect label="สถานะ" onChange={setStatusFilter} value={statusFilter}><option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></ListFilterSelect>
    </MobileListFilters></div>
    <div className="my-4 hidden flex-wrap justify-between gap-3 md:flex">
      <label className="relative min-w-0 flex-1 basis-full sm:max-w-[430px] sm:basis-[290px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18}/><input className="h-11 w-full rounded-[3px] border border-outline-variant bg-background pl-10 pr-3 text-[13px] outline-none focus:border-primary" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารหัสหรือชื่อแม่แบบ" value={query}/></label>
      <select className="h-11 min-w-0 flex-1 rounded-[3px] border border-outline-variant bg-background px-3 text-[13px] sm:min-w-[180px] sm:flex-none" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">สถานะ: ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></select>
    </div>
    {error && !editing && <p className="mb-3 border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</p>}
    <div className="border border-outline-variant sm:hidden"><MobileEntityList actionLabel={(template) => `แก้ไข ${template.name}`} emptyText="ไม่พบแม่แบบเงื่อนไข" getKey={(template) => template.id} items={filtered} meta={(template) => <>{documentTypeLabels[template.documentType]} · {template.terms.length} เงื่อนไข{template.isDefault ? " · ค่าเริ่มต้น" : ""}</>} onAction={canManage ? (template) => open(template) : undefined} onOpen={canManage ? open : undefined} primary={(template) => template.code} secondary={(template) => template.name} status={(template) => <ActiveStatusBadge active={template.status === "active"}/>} /></div>
    <div className="hidden sm:block"><DataTableFrame><DataTable className="min-w-[900px]">
      <thead><tr><th className="w-[6%] text-center">ลำดับ</th><th className="w-[12%]">รหัสแม่แบบ</th><th>ชื่อแม่แบบ</th><th className="w-[16%]">ประเภทเอกสาร</th><th className="w-[12%] text-center">จำนวนเงื่อนไข</th><th className="w-[11%] text-center">ค่าเริ่มต้น</th><th className="w-[10%] text-center">สถานะ</th><th className="w-[10%] text-center">จัดการ</th></tr></thead>
      <tbody>{filtered.length ? filtered.map((template, index) => <tr key={template.id}><td className="text-center">{index + 1}</td><td className="font-bold text-primary">{template.code}</td><td>{template.name}</td><td>{documentTypeLabels[template.documentType]}</td><td className="text-center">{template.terms.length}</td><td className="text-center">{template.isDefault ? <span className="inline-flex h-[22px] items-center border border-emerald-400 px-2 text-[11px] font-bold text-emerald-700">ค่าเริ่มต้น</span> : "-"}</td><td className="text-center"><ActiveStatusBadge active={template.status === "active"}/></td><td><div className="flex justify-center gap-3">{canManage && <><button aria-label={`แก้ไข ${template.name}`} onClick={() => open(template)}><Edit3 size={18}/></button><button aria-label={`ลบ ${template.name}`} className="text-primary disabled:opacity-30" disabled={template.isDefault || pending} onClick={() => remove(template)}><Trash2 size={18}/></button></>}</div></td></tr>) : <DataTableEmpty colSpan={8}/>}</tbody>
    </DataTable></DataTableFrame></div>
    <footer className="border border-t-0 border-outline-variant px-4 py-3 text-[13px]">ทั้งหมด {filtered.length} แม่แบบ</footer>
    {editing && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true">
      <section className="flex max-h-[94vh] w-full max-w-[1014px] flex-col overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-outline-variant px-4"><div className="flex min-w-0 items-center gap-4"><CompanyFormLogo/><h2 className="text-[19px] font-bold">{editing === "new" ? "เพิ่มแม่แบบเงื่อนไข" : "แก้ไขแม่แบบเงื่อนไข"}</h2></div><button aria-label="ปิด" onClick={() => setEditing(null)}><X size={22}/></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_1fr_0.55fr]">
            <label className="text-[13px] font-semibold">รหัสแม่แบบ *<input className={inputClass} disabled={editing !== "new"} onChange={(e) => setForm({...form, code:e.target.value})} value={form.code}/></label>
            <label className="text-[13px] font-semibold">ชื่อแม่แบบ *<input className={inputClass} onChange={(e) => setForm({...form, name:e.target.value})} value={form.name}/></label>
            <label className="text-[13px] font-semibold">ประเภทเอกสาร *<select className={inputClass} onChange={(e) => setForm({...form, documentType:e.target.value as DocumentType})} value={form.documentType}>{types.map((type) => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}</select></label>
            <label className="text-[13px] font-semibold">เวอร์ชัน<input className={inputClass} min={1} onChange={(e) => setForm({...form,version:Number(e.target.value)})} type="number" value={form.version}/></label>
          </div>
          <div className="mt-5 grid gap-5 border-y border-outline-variant py-3 sm:grid-cols-2"><ToggleSwitch checked={form.isDefault} label="ตั้งเป็นค่าเริ่มต้นเมื่อสร้างเอกสารใหม่" onChange={(value) => setForm({...form,isDefault:value})}/><ToggleSwitch checked={form.status === "active"} label="สถานะใช้งาน" onChange={(value) => setForm({...form,status:value ? "active":"inactive"})}/></div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-[15px] font-bold">รายการเงื่อนไข</h3><p className="text-[12px] text-on-surface-variant">จัดเรียงลำดับเงื่อนไขที่ต้องการให้แสดงในเอกสาร ({form.terms.length}/{DOCUMENT_TERM_LIMIT})</p></div><button className="flex h-9 items-center gap-2 rounded-[2px] border border-primary px-4 text-[13px] font-bold text-primary disabled:opacity-40" disabled={form.terms.length >= DOCUMENT_TERM_LIMIT} onClick={() => setForm({...form,terms:[...form.terms,{isActive:true,text:""}]})} type="button"><Plus size={17}/>เพิ่มเงื่อนไข</button></div>
          <div className="mt-3 overflow-x-auto border border-outline-variant"><table className="w-full min-w-[680px] table-fixed text-[13px]"><thead className="bg-surface-container"><tr className="h-10 border-b border-outline-variant"><th className="w-[5%]"></th><th className="w-[7%]">ลำดับ</th><th className="text-left">เงื่อนไข</th><th className="w-[15%]">แสดงในเอกสาร</th><th className="w-[8%]">จัดการ</th></tr></thead><tbody>{form.terms.map((term,index)=><tr className="border-b border-outline-variant last:border-0" key={index}><td className="text-center"><button aria-label="เลื่อนเงื่อนไข" onClick={() => moveTerm(index,index === 0 ? 1:index-1)} type="button"><GripVertical size={18}/></button></td><td className="text-center">{index+1}</td><td className="p-2"><textarea className="block min-h-[52px] w-full resize-y rounded-[2px] border border-outline-variant bg-background px-3 py-3 text-[13px] leading-6 outline-none focus:border-primary" maxLength={500} onChange={(e)=>updateTerm(index,{text:e.target.value})} rows={1} value={term.text}/></td><td><div className="flex justify-center"><ToggleSwitch checked={term.isActive} onChange={(value)=>updateTerm(index,{isActive:value})}/></div></td><td className="text-center"><button aria-label="ลบเงื่อนไข" className="text-primary disabled:opacity-30" disabled={form.terms.length === 1} onClick={()=>setForm({...form,terms:form.terms.filter((_,itemIndex)=>itemIndex!==index)})}><Trash2 size={18}/></button></td></tr>)}</tbody></table></div>
          {error && <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700">{error}</p>}
        </div>
        <footer className="flex h-[62px] shrink-0 justify-end gap-3 border-t border-outline-variant px-5 py-3"><button className="border border-outline-variant px-8 text-[14px] font-bold" onClick={()=>setEditing(null)}>ยกเลิก</button><button className="bg-primary px-8 text-[14px] font-bold text-on-primary disabled:opacity-50" disabled={pending} onClick={submit}>{pending?"กำลังบันทึก...":"บันทึกแม่แบบ"}</button></footer>
      </section>
    </div>}
    <ConfirmModal
      confirmText="ลบแม่แบบ"
      description={`คุณต้องการลบแม่แบบเงื่อนไข "${deleteTarget?.code} - ${deleteTarget?.name}" ใช่หรือไม่?`}
      isOpen={Boolean(deleteTarget)}
      onClose={() => setDeleteTarget(null)}
      onConfirm={confirmDelete}
      title="ยืนยันการลบแม่แบบเงื่อนไข"
      variant="danger"
    />
  </section>;
}
