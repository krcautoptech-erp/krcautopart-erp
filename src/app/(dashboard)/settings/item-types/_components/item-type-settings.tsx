"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { ChevronDown, ChevronUp, Edit3, Eye, GripVertical, ImageIcon, Info, LockKeyhole, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import { deleteItemTypeAction, saveItemTypeAction, type ItemTypeRecord } from "@/app/actions/items";
import { defaultItemFormFields, type ItemFormFieldKey, type ItemFormFieldVisibility, type ItemFormTemplate, type ItemTypeInput } from "@/lib/items";
import { ToggleSwitch as Toggle } from "@/components/toggle-switch";
import { ActiveStatusBadge } from "@/components/status-badge";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { SettingsField, SettingsRadioGroup, settingsControlClass } from "@/components/settings-form";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";

const blank: ItemTypeInput = {
  code: "",
  name: "",
  nameEn: "",
  formTemplate: "general",
  codeMode: "auto",
  codePrefix: "",
  stocked: true,
  purchasable: true,
  sellable: false,
  productionItem: false,
  lotControlled: false,
  serialControlled: false,
  expiryControlled: false,
  dimensionEnabled: false,
  reorderEnabled: false,
  formFields: { ...defaultItemFormFields },
  status: "active",
};
const inputClass = `${settingsControlClass} !h-8 !text-[13px]`;
const templates: { value: ItemFormTemplate; label: string }[] = [
  { value: "general", label: "สินค้าทั่วไป" },
  { value: "raw_material", label: "วัตถุดิบ" },
  { value: "finished_good", label: "สินค้าสำเร็จรูป" },
  { value: "asset", label: "ครุภัณฑ์" },
  { value: "service", label: "บริการ" },
];
const usageFlags: { key: "purchasable" | "sellable" | "productionItem"; label: string }[] = [
  { key: "purchasable", label: "ซื้อได้" },
  { key: "sellable", label: "ขายได้" },
  { key: "productionItem", label: "ใช้ในการผลิต" },
];

const configurableFields: { key: ItemFormFieldKey; label: string }[] = [
  { key: "brand", label: "ยี่ห้อ / Brand" },
  { key: "model", label: "รุ่น / Model" },
  { key: "partNumber", label: "หมายเลขอะไหล่ / Part No." },
  { key: "dimensions", label: "ข้อมูลขนาด" },
  { key: "image", label: "รูปสินค้า" },
  { key: "attachments", label: "เอกสารแนบ" },
  { key: "description", label: "คำอธิบายเพิ่มเติม" },
  { key: "leadTime", label: "Lead Time" },
  { key: "vendors", label: "ผู้จำหน่าย" },
  { key: "materialGrade", label: "เกรดวัสดุ / Material Grade" },
  { key: "itemGroup", label: "กลุ่มสินค้า / กลุ่มวัตถุดิบ" },
  { key: "thickness", label: "ความหนา" },
  { key: "width", label: "ความกว้าง" },
  { key: "length", label: "ความยาว" },
  { key: "warehouse", label: "คลังหลัก" },
  { key: "reorderPoint", label: "จุดสั่งซื้อ" },
  { key: "standard", label: "มาตรฐาน / Standard" },
  { key: "plating", label: "งานชุบเคลือบผิว / Plating" },
  { key: "sheetsPerUnit", label: "จำนวนแผ่น / Sheets per unit" },
  { key: "piecesPerSheet", label: "ชิ้นงานต่อแผ่น / Workpieces per sheet" },
  { key: "costPrice", label: "ต้นทุน / Cost" },
  { key: "sellingPrice", label: "ราคาขายกลาง / Selling Price" },
];

const coreFields = ["รหัสสินค้า", "ชื่อสินค้า (ไทย)", "ชื่อสินค้า (อังกฤษ)", "หน่วยนับ", "ประเภทสินค้า"];

function StepSection({ children, number, subtitle, title }: { children: React.ReactNode; number: string; subtitle?: string; title: string }) {
  return <section className="border border-outline-variant bg-surface-container-lowest first:rounded-t-[4px] last:rounded-b-[4px] [&_label]:text-[12px] [&_legend]:text-[12px]"><header className="flex min-h-[38px] items-center gap-2 border-b border-outline-variant px-3 py-1"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-black text-white">{number}</span><span><strong className="block text-[14px] leading-[18px]">{title}</strong>{subtitle ? <span className="block text-[10px] leading-[13px] text-on-surface-variant">{subtitle}</span> : null}</span></header><div className="p-2.5">{children}</div></section>;
}

function FieldMode({ onChange, value }: { onChange: (value: ItemFormFieldVisibility) => void; value: ItemFormFieldVisibility }) {
  return <div className="grid grid-cols-3 overflow-hidden rounded-[3px] border border-outline-variant text-[11px]" role="group" aria-label="การแสดงช่อง"><button className={`h-7 px-2 ${value === "hidden" ? "bg-primary font-semibold text-white" : "bg-white"}`} onClick={()=>onChange("hidden")} type="button">ไม่แสดง</button><button className={`h-7 border-l border-outline-variant px-2 ${value === "optional" ? "bg-primary font-semibold text-white" : "bg-white"}`} onClick={()=>onChange("optional")} type="button">แสดง</button><button className={`h-7 border-l border-outline-variant px-2 ${value === "required" ? "bg-primary font-semibold text-white" : "bg-white"}`} onClick={()=>onChange("required")} type="button">บังคับ</button></div>;
}

function PreviewField({
  label,
  required = false,
  children,
  select = false,
}: {
  label: string;
  required?: boolean;
  children?: React.ReactNode;
  select?: boolean;
}) {
  return (
    <label className="text-[13px] font-semibold">
      {label}
      {required && <span className="text-primary"> *</span>}
      <div className="mt-1 flex h-10 items-center justify-between border border-outline-variant bg-surface-container-lowest px-3 text-[14px]">
        {children}
        {select && <ChevronDown size={17} />}
      </div>
    </label>
  );
}

function ItemFormPreview({ form }: { form: ItemTypeInput }) {
  const typeName = form.name || "ประเภทสินค้า";
  const typeCode = form.code || form.codePrefix || "TYPE";
  const previewSections: { number: string; title: string; keys: ItemFormFieldKey[] }[] = [
    { number: "02", title: "ข้อมูลจำแนกและรายละเอียด", keys: ["materialGrade", "itemGroup", "standard", "plating", "description"] },
    { number: "03", title: "ขนาดและการผลิต", keys: ["dimensions", "thickness", "width", "length", "sheetsPerUnit", "piecesPerSheet", "leadTime"] },
    { number: "04", title: "การจัดซื้อและสต็อก", keys: ["vendors", "warehouse", "reorderPoint"] },
    { number: "05", title: "ราคา รูปและเอกสาร", keys: ["costPrice", "sellingPrice", "image", "attachments"] },
  ];
  const labelByKey = new Map(configurableFields.map((field) => [field.key, field.label]));

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[6px] border border-outline-variant bg-white">
      <header className="flex h-[52px] shrink-0 items-center border-b border-outline-variant px-4">
        <strong className="text-[17px] text-primary">
          KRC <span className="text-on-surface">ERP</span>
        </strong>
        <h3 className="flex-1 text-center text-[18px] font-bold">เพิ่มรายการสินค้า</h3>
        <X size={22} aria-hidden="true" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2.5 grid gap-2 sm:grid-cols-[320px_1fr]">
          <div className="flex h-9 items-center rounded-[4px] border border-outline-variant bg-white px-3 text-[13px]">
            {typeCode} • {typeName}
          </div>
          <div className="flex h-9 items-center gap-2 rounded-full border border-primary/30 bg-red-50 px-3 text-[11px] font-semibold text-primary sm:justify-self-end">
            <Info size={18} />
            {form.codeMode === "auto" ? "สร้างรหัสอัตโนมัติ" : "กำหนดรหัสเอง"}
          </div>
        </div>

        <div className="space-y-1.5">
          <section className="overflow-hidden rounded-[5px] border border-outline-variant bg-white">
            <header className="flex h-[44px] items-center gap-2 border-b border-outline-variant px-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">01</span>
              <strong className="text-[14px]">ข้อมูลหลัก</strong>
              <ChevronUp className="ml-auto" size={18} />
            </header>
            <div className="grid gap-x-4 gap-y-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <PreviewField label="รหัสสินค้า" required={form.codeMode === "manual"}>
                {form.codeMode === "auto" ? `${form.codePrefix || typeCode}0001` : ""}
              </PreviewField>
              <PreviewField label="ชื่อสินค้า (ภาษาไทย)" required />
              <PreviewField label="ชื่อสินค้า (ภาษาอังกฤษ)" />
              <PreviewField label="หน่วยนับ" required select>
                <span className="text-on-surface-variant">เลือกหน่วยนับ</span>
              </PreviewField>
              <div className="text-[12px] font-medium leading-tight">
                สถานะ <span className="text-primary">*</span>
                <div className="mt-1.5 flex h-9 items-center"><Toggle checked onChange={() => undefined} /></div>
              </div>
              {(["brand", "model", "partNumber"] as ItemFormFieldKey[])
                .filter((key) => form.formFields[key] !== "hidden")
                .map((key) => (
                  <PreviewField key={key} label={labelByKey.get(key) ?? key} required={form.formFields[key] === "required"} />
                ))}
            </div>
          </section>
          {previewSections.map((section) => {
            const keys = section.keys.filter((key) => key !== "dimensions" && form.formFields[key] !== "hidden");
            if (!keys.length) return null;
            return (
              <section className="overflow-hidden rounded-[5px] border border-outline-variant bg-white" key={section.number}>
                <header className="flex h-[44px] items-center gap-2 border-b border-outline-variant px-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">{section.number}</span>
                  <strong className="text-[14px]">{section.title}</strong>
                  <ChevronUp className="ml-auto" size={18} />
                </header>
                <div className="grid gap-x-4 gap-y-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {keys.map((key) => {
                    const required = form.formFields[key] === "required";
                    const label = labelByKey.get(key) ?? key;
                    if (key === "image") return <label className="text-[12px] font-medium leading-tight" key={key}>{label}{required ? <span className="text-primary"> *</span> : null}<span className="mt-1.5 flex h-[76px] items-center justify-center gap-2 rounded-[4px] border border-dashed border-outline-variant bg-white text-[12px]"><ImageIcon size={18}/>คลิกเพื่อเลือกรูปสินค้า</span></label>;
                    if (key === "attachments") return <label className="text-[12px] font-medium leading-tight" key={key}>{label}{required ? <span className="text-primary"> *</span> : null}<span className="mt-1.5 flex h-[76px] items-center justify-center gap-2 rounded-[4px] border border-dashed border-outline-variant bg-white text-[12px]"><Paperclip size={17}/>คลิกเพื่อเลือกเอกสาร</span></label>;
                    return <PreviewField key={key} label={label} required={required} select={["materialGrade", "itemGroup", "vendors", "warehouse"].includes(key)} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <footer className="flex h-[62px] shrink-0 justify-end gap-3 border-t border-outline-variant px-5 py-3">
        <button
          type="button"
          className="border border-outline-variant px-8 text-[14px] font-bold"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          className="bg-primary px-8 text-[14px] font-bold text-on-primary"
        >
          บันทึกสินค้า
        </button>
      </footer>
    </section>
  );
}

export function ItemTypeSettings({
  canDelete,
  canManage,
  initialTypes,
}: {
  canDelete: boolean;
  canManage: boolean;
  initialTypes: ItemTypeRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ItemTypeRecord | null | "new">(null);
  const [form, setForm] = useState<ItemTypeInput>(blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemTypeRecord | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  function open(item?: ItemTypeRecord) {
    setEditing(item ?? "new");
    setForm(item ? { ...item, formFields: { ...item.formFields } } : { ...blank, formFields: { ...defaultItemFormFields } });
    setError("");
    setPreviewOpen(false);
    setFieldPickerOpen(false);
    setFieldSearch("");
  }
  async function submit() {
    setSaving(true);
    setError("");
    const result = await saveItemTypeAction(
      editing === "new" ? null : (editing?.id ?? null),
      form,
    );
    setSaving(false);
    if ("error" in result) {
      setError(result.error ?? "ไม่สามารถบันทึกประเภทสินค้าได้");
      toast.error("บันทึกประเภทสินค้าไม่สำเร็จ", result.error);
      return;
    }
    toast.success(editing === "new" ? "เพิ่มประเภทสินค้าเรียบร้อยแล้ว" : "บันทึกประเภทสินค้าเรียบร้อยแล้ว", form.name);
    setEditing(null);
    startTransition(() => router.refresh());
  }
  function remove(item: ItemTypeRecord) {
    if (item.itemCount > 0) {
      toast.warning("ไม่สามารถลบได้", `ประเภทสินค้านี้มีสินค้าผูกอยู่จำนวน ${item.itemCount} รายการ`);
      return;
    }
    setDeleteTarget(item);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError("");
    const result = await deleteItemTypeAction(deleteTarget.id);
    setDeletingId(null);
    if ("error" in result) {
      setDeleteError(result.error ?? "ไม่สามารถลบประเภทสินค้าได้");
      toast.error("ลบประเภทสินค้าไม่สำเร็จ", result.error);
      return;
    }
    toast.success("ลบประเภทสินค้าเรียบร้อยแล้ว", `${deleteTarget.code} - ${deleteTarget.name}`);
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <section className="min-w-0 bg-surface-container-lowest text-on-surface">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-1 pb-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">
            ตั้งค่าประเภทสินค้า
          </h1>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            กำหนดรูปแบบฟอร์ม การควบคุมสต็อก และการใช้งานของแต่ละประเภท
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => open()}
            className="flex h-10 items-center gap-2 rounded-[3px] bg-primary px-5 text-[14px] font-bold text-on-primary"
          >
            <Plus size={19} />
            เพิ่มประเภทสินค้า
          </button>
        )}
      </header>
      {deleteError && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">{deleteError}</p>}
      <div className="mt-4 border border-outline-variant">
        <div className="sm:hidden">
          <MobileEntityList
            actionLabel={(item) => `แก้ไข ${item.name}`}
            emptyText="ไม่พบข้อมูลประเภทสินค้า"
            getKey={(item) => item.id}
            items={initialTypes}
            meta={(item) => <>{templates.find((template) => template.value === item.formTemplate)?.label} · {item.itemCount.toLocaleString("th-TH")} รายการ</>}
            onAction={canManage ? (item) => open(item) : undefined}
            onOpen={canManage ? open : undefined}
            primary={(item) => item.code}
            secondary={(item) => <>{item.name}{item.nameEn ? ` · ${item.nameEn}` : ""}</>}
            status={(item) => <ActiveStatusBadge active={item.status === "active"} />}
          />
        </div>
        <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[900px] table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[9%]" />
            <col className="w-[30%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-surface-container">
            <tr>
              {[
                "ลำดับ",
                "รหัสประเภท",
                "ชื่อประเภทสินค้า",
                "แม่แบบฟอร์ม",
                "การควบคุม",
                "จำนวนรายการ",
                "สถานะ",
                "จัดการ",
              ].map((head) => (
                <th
                  key={head}
                  className="h-10 border-b border-outline-variant px-3 font-bold"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initialTypes.map((item, index) => (
              <tr
                key={item.id}
                className="h-12 border-b border-outline-variant last:border-b-0"
              >
                <td className="px-3">{index + 1}</td>
                <td className="px-3 font-bold">{item.code}</td>
                <td className="px-3">
                  <div className="max-h-10 overflow-hidden whitespace-normal break-words leading-5" title={`${item.name}${item.nameEn ? ` ${item.nameEn}` : ""}`}>
                    <strong>{item.name}</strong>
                    {item.nameEn && <span className="ml-2 text-on-surface-variant">{item.nameEn}</span>}
                  </div>
                </td>
                <td className="px-3">
                  {
                    templates.find(
                      (template) => template.value === item.formTemplate,
                    )?.label
                  }
                </td>
                <td className="px-3">
                  <div className="flex flex-wrap gap-1">
                    {item.lotControlled && (
                      <span className="border border-blue-300 px-2 text-blue-700">
                        Lot
                      </span>
                    )}
                    {item.serialControlled && (
                      <span className="border border-orange-300 px-2 text-orange-700">
                        Serial
                      </span>
                    )}
                    {item.stocked &&
                      !item.lotControlled &&
                      !item.serialControlled && (
                        <span className="border border-emerald-300 px-2 text-emerald-700">
                          Stock
                        </span>
                      )}
                    {!item.stocked && (
                      <span className="border border-neutral-300 px-2 text-neutral-600">
                        ไม่เข้าสต็อก
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 text-center">
                  {item.itemCount.toLocaleString("th-TH")}
                </td>
                <td className="px-3">
                  <ActiveStatusBadge active={item.status === "active"} />
                </td>
                <td className="px-3">
                  <div className="flex items-center gap-3">
                    {canManage && <button onClick={() => open(item)} aria-label={`แก้ไข ${item.name}`}><Edit3 size={18} /></button>}
                    {canDelete && <button aria-label={`ลบ ${item.name}`} className="text-primary disabled:cursor-not-allowed disabled:opacity-30" disabled={item.itemCount > 0 || deletingId === item.id} onClick={() => remove(item)} title={item.itemCount > 0 ? "มีสินค้าอ้างอิงอยู่ กรุณาระงับแทน" : "ลบประเภทสินค้า"} type="button"><Trash2 size={18} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <footer className="border border-t-0 border-outline-variant px-4 py-3 text-[13px]">
        ทั้งหมด {initialTypes.length} ประเภท
      </footer>
      {editing && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-0 sm:p-3" role="dialog" aria-modal="true">
          <section className="relative flex h-full w-full flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-[6px] sm:border sm:border-primary/40" style={{maxWidth:"980px"}}>
            <header className="shrink-0"><div className="flex h-[54px] items-center border-b border-outline-variant bg-white px-5"><h2 className="flex-1 text-left text-[19px] font-bold sm:text-center sm:text-[18px]">{editing === "new" ? "เพิ่มประเภทสินค้า" : "แก้ไขประเภทสินค้า"}</h2><button aria-label="ปิด" className="grid h-9 w-9 place-items-center sm:absolute sm:right-4" onClick={()=>setEditing(null)} type="button"><X size={20}/></button></div></header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white p-2.5 sm:p-0">
              <div className="grid items-start sm:grid-cols-[200px_minmax(0,1fr)]">
                <nav className="relative hidden self-stretch border-r border-outline-variant bg-[#fcfcfc] sm:block" aria-label="ขั้นตอนการตั้งค่า">
                  <span className="absolute left-[31px] top-[32px] h-[228px] w-px bg-[#cbd1d8]"/>
                  <div className="relative z-[1] flex flex-col gap-[82px] px-4 py-4">
                    {["ข้อมูลประเภทสินค้า","การใช้งานและการควบคุม","กำหนดช่องในฟอร์ม"].map((label,index)=><div className="flex items-center gap-2.5" key={label}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[12px] font-bold ${index === 0 ? "border-primary bg-primary text-white" : "border-[#b8c0ca] bg-white text-on-surface-variant"}`}>{index+1}</span><span className={`whitespace-nowrap text-[11px] font-semibold ${index === 0 ? "text-primary" : "text-on-surface"}`}>{label}</span></div>)}
                  </div>
                </nav>
                <div className="[&>section+section]:-mt-px">
                <StepSection number="1" title="ข้อมูลประเภทสินค้า">
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <SettingsField label="รหัสประเภทสินค้า" required><input className={inputClass} maxLength={20} onChange={(event)=>setForm({...form,code:event.target.value.toUpperCase()})} placeholder="เช่น MRO" value={form.code}/></SettingsField>
                    <SettingsField label="ชื่อประเภทสินค้า (ภาษาไทย)" required><input className={inputClass} maxLength={120} onChange={(event)=>setForm({...form,name:event.target.value})} value={form.name}/></SettingsField>
                    <SettingsField label="ชื่อประเภทสินค้า (ภาษาอังกฤษ)"><input className={inputClass} maxLength={120} onChange={(event)=>setForm({...form,nameEn:event.target.value})} value={form.nameEn}/></SettingsField>
                    <SettingsRadioGroup label="วิธีการสร้างรหัส *" onChange={(codeMode)=>setForm({...form,codeMode})} options={[{label:"อัตโนมัติ (Auto)",value:"auto"},{label:"กำหนดเอง (Manual)",value:"manual"}]} value={form.codeMode}/>
                    <SettingsField label="คำนำหน้ารหัส (Prefix)" required={form.codeMode === "auto"}><input className={inputClass} disabled={form.codeMode === "manual"} maxLength={12} onChange={(event)=>setForm({...form,codePrefix:event.target.value.toUpperCase()})} placeholder="เช่น MRO" value={form.codePrefix}/></SettingsField>
                    <div><p className="mb-1.5 text-[14px] font-semibold">สถานะ *</p><div className="flex h-9 items-center gap-3"><Toggle checked={form.status === "active"} onChange={(value)=>setForm({...form,status:value?"active":"inactive"})}/><span className="text-[14px]">{form.status === "active" ? "ใช้งาน" : "ระงับใช้งาน"}</span></div></div>
                  </div>
                </StepSection>

                <StepSection number="2" subtitle="กำหนดวิธีรับ การติดตาม และสิทธิ์การใช้งานของสินค้าประเภทนี้" title="การใช้งานและการควบคุม">
                  <div className="grid gap-2.5 lg:grid-cols-3">
                    <SettingsRadioGroup label="วิธีรับสินค้า *" onChange={(method)=>setForm({...form,stocked:method === "stock",formTemplate:method === "asset" ? "asset" : form.formTemplate === "asset" ? "general" : form.formTemplate})} options={[{label:"รับเข้าสต็อก",value:"stock"},{label:"ซื้อใช้ทันที",value:"direct"},{label:"สินทรัพย์",value:"asset"}]} value={form.formTemplate === "asset" ? "asset" : form.stocked ? "stock" : "direct"}/>
                    <SettingsRadioGroup label="การติดตาม Lot / Serial" onChange={(tracking)=>setForm({...form,lotControlled:tracking === "lot",serialControlled:tracking === "serial"})} options={[{label:"ไม่ติดตาม",value:"none"},{label:"Lot",value:"lot"},{label:"Serial",value:"serial"}]} value={form.serialControlled ? "serial" : form.lotControlled ? "lot" : "none"}/>
                    <fieldset><legend className="mb-2 text-[14px] font-semibold">การใช้งาน</legend><div className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2">{usageFlags.map((flag)=><label className="flex cursor-pointer items-center gap-2 text-[14px]" key={flag.key}><input checked={form[flag.key]} className="h-[17px] w-[17px] rounded-none accent-primary" onChange={(event)=>setForm({...form,[flag.key]:event.target.checked})} type="checkbox"/>{flag.label}</label>)}</div></fieldset>
                  </div>
                </StepSection>

                <StepSection number="3" subtitle="เลือกช่องที่ต้องการให้ผู้ใช้กรอกเมื่อเพิ่มสินค้า" title="กำหนดช่องในฟอร์ม">
                  <p className="mb-1.5 text-[12px] font-semibold">ข้อมูลหลัก (แก้ไขไม่ได้)</p>
                  <div className="mb-2.5 flex flex-wrap gap-2">{coreFields.map((field)=><span className="flex h-9 min-w-[108px] items-center justify-center gap-2 rounded-[5px] border border-[#dedfe3] bg-[#f3f3f4] px-3 text-[12px] font-semibold text-[#303238] shadow-[0_1px_2px_rgba(0,0,0,0.05)]" key={field}><LockKeyhole className="text-[#6d7076]" size={15}/>{field}</span>)}</div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[12px] font-semibold">ข้อมูลเพิ่มเติม (แสดงในฟอร์ม)</p><button className="flex h-8 items-center gap-1.5 rounded-[3px] border border-primary px-3 text-[12px] font-bold text-primary" onClick={()=>setFieldPickerOpen(true)} type="button"><Plus size={15}/>เลือกช่องจากระบบ</button></div>
                  <div className="overflow-hidden rounded-[3px] border border-outline-variant">
                    {configurableFields.map((field,index)=><div className={`grid min-h-9 grid-cols-[24px_minmax(0,1fr)_30px] items-center border-b border-outline-variant px-2 py-1 last:border-b-0 sm:grid-cols-[24px_minmax(0,1fr)_180px_30px] ${form.formFields[field.key] === "hidden" ? "bg-surface-container/40 text-on-surface-variant" : ""}`} key={field.key}><GripVertical className="text-on-surface-variant" size={14}/><span className="min-w-0 text-[12px] font-semibold">{index+1}. {field.label}</span><div className="col-span-2 col-start-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1"><FieldMode onChange={(visibility)=>setForm({...form,formFields:{...form.formFields,[field.key]:visibility},dimensionEnabled:field.key === "dimensions" ? visibility !== "hidden" : form.dimensionEnabled})} value={form.formFields[field.key]}/></div><button aria-label={`นำ ${field.label} ออก`} className="col-start-3 row-start-1 grid h-7 w-7 place-items-center text-primary sm:col-start-4" onClick={()=>setForm({...form,formFields:{...form.formFields,[field.key]:"hidden"},dimensionEnabled:field.key === "dimensions" ? false : form.dimensionEnabled})} type="button"><Trash2 size={14}/></button></div>)}
                  </div>
                </StepSection>
                </div>
              </div>
              {error ? <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p> : null}
            </div>
            <footer className="grid shrink-0 grid-cols-2 items-center gap-2 border-t border-outline-variant bg-white px-3 py-2 sm:grid-cols-[1fr_auto_auto]"><button className="col-span-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[3px] border border-primary px-4 text-[12px] font-bold text-primary sm:col-span-1 sm:w-fit" onClick={()=>setPreviewOpen(true)} type="button"><Eye size={15}/>Preview ฟอร์ม</button><button className="h-9 rounded-[3px] border border-outline-variant px-3 text-[13px] font-bold sm:min-w-24 sm:px-5" disabled={saving} onClick={()=>setEditing(null)} type="button">ยกเลิก</button><button className="h-9 rounded-[3px] bg-primary px-3 text-[13px] font-bold text-white disabled:opacity-50 sm:min-w-32 sm:px-5" disabled={saving} onClick={submit} type="button">{saving ? "กำลังบันทึก..." : "บันทึกประเภท"}</button></footer>
            {fieldPickerOpen ? <div className="absolute inset-0 z-20 flex items-end bg-black/25 sm:items-stretch sm:justify-end"><button aria-label="ปิดตัวเลือกช่อง" className="absolute inset-0 cursor-default" onClick={()=>setFieldPickerOpen(false)} type="button"/><aside className="relative flex max-h-[78%] w-full flex-col rounded-t-[12px] bg-white shadow-2xl sm:max-h-none sm:w-[360px] sm:rounded-none sm:border-l sm:border-outline-variant"><div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 sm:hidden"/><header className="flex h-12 shrink-0 items-center border-b border-outline-variant px-4"><strong className="text-[15px]">เลือกช่องจากระบบ</strong><button aria-label="ปิด" className="ml-auto grid h-9 w-9 place-items-center" onClick={()=>setFieldPickerOpen(false)} type="button"><X size={20}/></button></header><div className="p-3"><label className="flex h-10 items-center gap-2 rounded-[3px] border border-outline-variant px-3"><Search size={17}/><input className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" onChange={(event)=>setFieldSearch(event.target.value)} placeholder="ค้นหาช่องข้อมูล" value={fieldSearch}/></label></div><div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{configurableFields.filter(({label})=>label.toLocaleLowerCase().includes(fieldSearch.toLocaleLowerCase())).map((field)=>{const selected=form.formFields[field.key] !== "hidden";return <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-outline-variant px-1 text-[13px]" key={field.key}><input checked={selected} className="h-[17px] w-[17px] rounded-none accent-primary" onChange={(event)=>setForm({...form,formFields:{...form.formFields,[field.key]:event.target.checked?"optional":"hidden"},dimensionEnabled:field.key === "dimensions" ? event.target.checked : form.dimensionEnabled})} type="checkbox"/><span>{field.label}</span><GripVertical className="ml-auto text-on-surface-variant" size={16}/></label>})}</div><footer className="grid grid-cols-2 gap-2 border-t border-outline-variant p-3"><button className="h-10 rounded-[3px] border border-outline-variant text-[13px] font-bold" onClick={()=>setFieldPickerOpen(false)} type="button">ยกเลิก</button><button className="h-10 rounded-[3px] bg-primary text-[13px] font-bold text-white" onClick={()=>setFieldPickerOpen(false)} type="button">เพิ่มช่องที่เลือก</button></footer></aside></div> : null}
            {previewOpen ? <div className="absolute inset-0 z-10 flex justify-end bg-black/35"><div className="flex h-full w-full max-w-[720px] flex-col bg-surface-container-lowest shadow-2xl"><div className="flex h-12 items-center border-b border-outline-variant px-4"><Eye className="mr-2 text-primary" size={18}/><strong className="text-[14px]">ตัวอย่างฟอร์มสินค้า</strong><span className="ml-2 text-[11px] text-on-surface-variant">ตัวอย่างเท่านั้น</span><button aria-label="ปิด Preview" className="ml-auto grid h-10 w-10 place-items-center" onClick={()=>setPreviewOpen(false)} type="button"><X size={21}/></button></div><div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><ItemFormPreview form={form}/></div></div></div> : null}
          </section>
        </div>
      )}
      <ConfirmModal
        confirmText="ลบประเภทสินค้า"
        description={`คุณต้องการลบประเภทสินค้า "${deleteTarget?.code} - ${deleteTarget?.name}" ใช่หรือไม่?`}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ยืนยันการลบประเภทสินค้า"
        variant="danger"
      />
    </section>
  );
}
