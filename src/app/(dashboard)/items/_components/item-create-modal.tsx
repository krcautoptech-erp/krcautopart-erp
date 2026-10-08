"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, FileText, ImageIcon, Trash2, Upload, X } from "lucide-react";
import { updateProductAction } from "@/app/actions/products";
import { updateRawMaterialAction } from "@/app/actions/raw-materials";
import {
  previewItemCodeAction,
  saveGenericItemAction,
  updateGenericItemAction,
  type CatalogItem,
  type ItemCatalogData,
} from "@/app/actions/items";
import type {
  GenericItemInput,
  ItemFormFieldKey,
  ItemFormFieldVisibility,
} from "@/lib/items";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges, useUnsavedChangesContext } from "@/components/unsaved-changes";

const control =
  "h-9 w-full rounded-[4px] border border-[#d8dde3] bg-white px-2.5 text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-1 focus:ring-primary/15 disabled:bg-white disabled:text-on-surface disabled:opacity-100";
const sectionBorder = "border-[#d8dde3]";
const fieldSections: { id: string; title: string; keys: ItemFormFieldKey[] }[] =
  [
    {
      id: "details",
      title: "ข้อมูลจำแนกและรายละเอียด",
      keys: [
        "materialGrade",
        "itemGroup",
        "standard",
        "plating",
        "description",
      ],
    },
    {
      id: "production",
      title: "ขนาดและการผลิต",
      keys: [
        "dimensions",
        "thickness",
        "width",
        "length",
        "sheetsPerUnit",
        "piecesPerSheet",
        "leadTime",
      ],
    },
    {
      id: "stock",
      title: "การจัดซื้อและสต็อก",
      keys: ["vendors", "warehouse", "reorderPoint"],
    },
    {
      id: "files",
      title: "ราคา รูปและเอกสาร",
      keys: ["costPrice", "sellingPrice", "image", "attachments"],
    },
  ];

function emptyForm(typeId: number, unitId: number | null, warehouseId: number | null = null): GenericItemInput {
  return {
    typeId,
    code: "",
    name: "",
    nameEn: "",
    description: "",
    unitId,
    shelfLifeDays: null,
    reorderPoint: null,
    warehouseId,
    groupId: null,
    vendorId: null,
    thickness: null,
    width: null,
    length: null,
    dimensionUnit: "มม.",
    expiryWarningDays: null,
    brand: "",
    model: "",
    partNumber: "",
    gradeId: null,
    standard: "",
    plating: "",
    sheetsPerUnit: null,
    piecesPerSheet: null,
    leadTimeDays: null,
    costPrice: null,
    sellingPrice: null,
    primaryImage: "",
    attachmentNames: [],
    status: "active",
  };
}

function formFromItem(item: CatalogItem, fallbackTypeId: number, fallbackUnitId: number | null): GenericItemInput {
  return {
    ...emptyForm(Number(item.form.typeId ?? fallbackTypeId), fallbackUnitId),
    ...item.form,
    typeId: Number(item.form.typeId ?? fallbackTypeId),
    code: String(item.form.code ?? item.code),
    name: String(item.form.name ?? item.name),
    unitId: item.form.unitId ?? fallbackUnitId,
    status: item.status,
  };
}

function Field({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="min-w-0 text-[12px] font-medium leading-tight">
      {label}
      {required ? <span className="text-primary"> *</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Section({
  children,
  number,
  open,
  onToggle,
  title,
}: {
  children: ReactNode;
  number: string;
  open: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[5px] border ${sectionBorder} bg-white`}>
      <button
        aria-expanded={open}
        className={`flex h-[44px] w-full items-center gap-2 border-b ${sectionBorder} px-3 text-left`}
        onClick={onToggle}
        type="button"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">
          {number}
        </span>
        <strong className="text-[14px]">{title}</strong>
        <ChevronDown
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          size={18}
        />
      </button>
      <div className={`${open ? "block" : "hidden"} p-3`}>
        {children}
      </div>
    </section>
  );
}

type ItemCreateModalProps = {
  data: ItemCatalogData;
  initialTypeCode?: string;
  item?: CatalogItem;
  onClose: () => void;
  onSaved: () => void;
};

export function ItemCreateModal(props: ItemCreateModalProps) {
  return <ItemFormEditor key={props.item?.id ?? "new"} {...props} />;
}

function ItemFormEditor({
  data,
  initialTypeCode,
  item,
  onClose,
  onSaved,
}: ItemCreateModalProps) {
  const types = useMemo(
    () => data.types.filter((item) => item.status === "active"),
    [data.types],
  );
  const initialType =
    types.find((type) => type.id === item?.form.typeId) ??
    types.find((type) => type.code === initialTypeCode) ??
    types[0];
  const fgWarehouseId = data.warehouses.find((warehouse) => warehouse.code === "WH01")?.id ?? null;
  const isEdit = Boolean(item);
  const [form, setForm] = useState(() =>
    item
      ? formFromItem(item, initialType?.id ?? 0, data.units[0]?.id ?? null)
      : emptyForm(initialType?.id ?? 0, data.units[0]?.id ?? null, initialType?.code === "FG" ? fgWarehouseId : null),
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    main: true,
    details: true,
    production: true,
    stock: false,
    files: false,
  });
  const [error, setError] = useState("");
  const [previewCode, setPreviewCode] = useState<{
    code: string;
    typeId: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const { primaryImage: omittedImage, attachmentNames: omittedAttachments, ...draftValue } = form;
  const [initialDraftValue] = useState(() => draftValue);
  const [initialFiles] = useState(() => ({ primaryImage: form.primaryImage, attachmentNames: form.attachmentNames }));
  const draftKey = `master-item:${item?.id ?? "new"}`;
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: draftKey, value: draftValue, initialValue: initialDraftValue,
    revision: item ? JSON.stringify(initialDraftValue) : "",
    onRestore: (value) => {
      const validLookup = (id: number | null, options: { id: number }[]) => id === null || options.some((option) => option.id === id);
      if (!validLookup(value.typeId, types) || !validLookup(value.unitId, data.units) ||
          !validLookup(value.warehouseId, data.warehouses) || !validLookup(value.groupId, data.groups) ||
          !validLookup(value.gradeId, data.grades) || !validLookup(value.vendorId, data.vendors)) {
        throw new Error("ข้อมูลตัวเลือกในฉบับร่างเปลี่ยนแล้ว กรุณาตรวจสอบก่อนกู้คืน");
      }
      setForm({ ...value, primaryImage: initialFiles.primaryImage, attachmentNames: initialFiles.attachmentNames });
    },
  });
  useUnsavedChanges(draftKey, hasChanges || omittedImage !== initialFiles.primaryImage || JSON.stringify(omittedAttachments) !== JSON.stringify(initialFiles.attachmentNames));
  const { requestNavigation } = useUnsavedChangesContext();
  const closeForm = () => { if (!saving) requestNavigation(onClose); };
  const type = useMemo(
    () => types.find((item) => item.id === form.typeId),
    [form.typeId, types],
  );
  const fields = type?.formFields;
  const visibility = (key: ItemFormFieldKey): ItemFormFieldVisibility =>
    fields?.[key] ?? "hidden";
  const shown = (key: ItemFormFieldKey) => visibility(key) !== "hidden";
  const required = (key: ItemFormFieldKey) => visibility(key) === "required";
  const requiredKeys = type
    ? Object.entries(type.formFields)
        .filter(([, value]) => value === "required")
        .map(([key]) => key as ItemFormFieldKey)
    : [];
  const completedRequired = requiredKeys.filter((key) => {
    const map: Partial<Record<ItemFormFieldKey, unknown>> = {
      brand: form.brand,
      model: form.model,
      partNumber: form.partNumber,
      materialGrade: form.gradeId,
      itemGroup: form.groupId,
      thickness: form.thickness,
      width: form.width,
      length: form.length,
      warehouse: form.warehouseId,
      reorderPoint: form.reorderPoint,
      standard: form.standard,
      plating: form.plating,
      sheetsPerUnit: form.sheetsPerUnit,
      piecesPerSheet: form.piecesPerSheet,
      leadTime: form.leadTimeDays,
      vendors: form.vendorId,
      costPrice: form.costPrice,
      sellingPrice: form.sellingPrice,
      image: form.primaryImage,
      attachments: form.attachmentNames.length,
      description: form.description,
    };
    return (
      map[key] !== "" &&
      map[key] !== null &&
      map[key] !== undefined &&
      map[key] !== 0
    );
  }).length;

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (isEdit || !type || type.codeMode !== "auto") return;

    previewItemCodeAction(type.id).then((result) => {
      if (cancelled) return;
      if ("success" in result) {
        setPreviewCode({ code: result.data, typeId: type.id });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isEdit, type]);

  const set = useCallback(<K extends keyof GenericItemInput>(
    key: K,
    value: GenericItemInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);
  function numberValue(value: string) {
    return value === "" ? null : Number(value);
  }
  function changeType(typeId: number) {
    if (isEdit) return;
    setForm(emptyForm(typeId, data.units[0]?.id ?? null, types.find((item) => item.id === typeId)?.code === "FG" ? fgWarehouseId : null));
    setPreviewCode(null);
    setError("");
  }
  function imageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const img = document.createElement("img");
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = String(e.target?.result ?? "");
      img.src = src;
      img.onload = () => {
        const MAX_DIM = 1000;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.8);
          set("primaryImage", compressed);
        } else {
          set("primaryImage", src);
        }
      };
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!type || !form.name.trim() || !form.unitId)
      return setError("กรุณากรอกชื่อสินค้าและหน่วยนับให้ครบ");
    if (type.codeMode === "manual" && !form.code.trim())
      return setError("กรุณากรอกรหัสสินค้า");
    if (completedRequired < requiredKeys.length)
      return setError("กรุณากรอกช่องบังคับที่มีเครื่องหมาย * ให้ครบ");
    setSaving(true);
    setError("");
    const submitForm =
      !isEdit && type.codeMode === "auto" ? { ...form, code: "" } : form;
    let result: { error: string } | { success: true; data?: unknown };
    if (isEdit && item?.source === "raw_material") {
      result = await updateRawMaterialAction(Number(item.sourceId), {
        material_code: submitForm.code,
        material_name: form.name,
        group_id: form.groupId ?? 0,
        grade_id: form.gradeId ?? 0,
        thickness_mm: form.thickness ?? 0,
        width_mm: form.width ?? 0,
        length_mm: form.length ?? 0,
        unit_id: form.unitId,
        reorder_point: form.reorderPoint,
        warehouse_id: form.warehouseId ?? 0,
        remark: form.description || null,
        status: form.status,
      });
    } else if (isEdit && item?.source === "product") {
      const unit =
        data.units.find((unitItem) => unitItem.id === form.unitId)?.name ?? "ชิ้น";
      const grade =
        data.grades.find((gradeItem) => gradeItem.id === form.gradeId)?.name ?? "";
      result = await updateProductAction(String(item.sourceId), {
        erp_code: submitForm.code,
        part_number: form.partNumber,
        part_name: form.name,
        material: grade,
        plating: form.plating,
        std_no: form.standard,
        sheet_count: form.sheetsPerUnit,
        parts_per_sheet: form.piecesPerSheet,
        primary_image: form.primaryImage || null,
        cost_price: form.costPrice ?? 0,
        selling_price: form.sellingPrice ?? 0,
        unit,
        status: form.status === "active" ? "ใช้งาน" : "ระงับการใช้งาน",
        model: form.model,
      });
    } else if (isEdit && item?.source === "item_master") {
      result = await updateGenericItemAction(Number(item.sourceId), submitForm);
    } else result = await saveGenericItemAction(submitForm);
    setSaving(false);
    if ("error" in result && result.error) return setError(result.error);
    clearDraft();
    onSaved();
  }

  function renderField(key: ItemFormFieldKey) {
    if (!shown(key)) return null;
    const req = required(key);
    const text = (
      label: string,
      value: string,
      update: (value: string) => void,
    ) => (
      <Field key={key} label={label} required={req}>
        <input
          className={control}
          value={value}
          onChange={(e) => update(e.target.value)}
        />
      </Field>
    );
    const num = (
      label: string,
      value: number | null,
      update: (value: number | null) => void,
      suffix?: string,
    ) => (
      <Field key={key} label={label} required={req}>
        <div className="flex">
          <input
            className={`${control} ${suffix ? "rounded-r-none" : ""}`}
            min="0"
            type="number"
            value={value ?? ""}
            onChange={(e) => update(numberValue(e.target.value))}
          />
          {suffix ? (
            <span className="grid h-9 place-items-center rounded-r-[3px] border border-l-0 border-[#d8dde3] bg-white px-2.5 text-[11px]">
              {suffix}
            </span>
          ) : null}
        </div>
      </Field>
    );
    switch (key) {
      case "brand":
        return text("ยี่ห้อ / Brand", form.brand, (v) => set("brand", v));
      case "model":
        return text("รุ่น / Model", form.model, (v) => set("model", v));
      case "partNumber":
        return text("หมายเลขอะไหล่ / Part No.", form.partNumber, (v) =>
          set("partNumber", v),
        );
      case "materialGrade": {
        const matchedGradeId = form.gradeId ?? data.grades.find(
          (g) => g.name.toLowerCase() === (form.gradeName || form.material || "").toLowerCase()
        )?.id ?? "";
        return (
          <Field key={key} label="เกรดวัสดุ / Material Grade" required={req}>
            <div className="space-y-1.5">
              <select
                className={control}
                value={matchedGradeId}
                onChange={(e) => {
                  const val = numberValue(e.target.value);
                  set("gradeId", val);
                  if (val) {
                    const matched = data.grades.find((g) => g.id === val);
                    if (matched) {
                      set("gradeName", matched.name);
                      set("material", matched.name);
                    }
                  }
                }}
              >
                <option value="">เลือกเกรดวัสดุ</option>
                {data.grades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {!form.gradeId && (form.gradeName || form.material) && !matchedGradeId && (
                <div className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
                  <span>เกรดระบุเดิม:</span>
                  <span className="font-semibold text-primary">
                    {form.gradeName || form.material}
                  </span>
                </div>
              )}
            </div>
          </Field>
        );
      }
      case "itemGroup":
        return (
          <Field key={key} label="กลุ่มสินค้า / กลุ่มวัตถุดิบ" required={req}>
            <select
              className={control}
              value={form.groupId ?? ""}
              onChange={(e) => set("groupId", numberValue(e.target.value))}
            >
              <option value="">เลือกกลุ่มสินค้า</option>
              {data.groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        );
      case "standard":
        return text("มาตรฐาน / Standard", form.standard, (v) =>
          set("standard", v),
        );
      case "plating":
        return text("งานชุบเคลือบผิว / Plating", form.plating, (v) =>
          set("plating", v),
        );
      case "description":
        return (
          <Field key={key} label="คำอธิบายเพิ่มเติม" required={req}>
            <textarea
              className="min-h-[76px] w-full rounded-[4px] border border-[#d8dde3] bg-white p-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/15"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        );
      case "thickness":
        return num(
          "ความหนา",
          form.thickness,
          (v) => set("thickness", v),
          "มม.",
        );
      case "width":
        return num("ความกว้าง", form.width, (v) => set("width", v), "มม.");
      case "length":
        return num("ความยาว", form.length, (v) => set("length", v), "มม.");
      case "dimensions":
        return null;
      case "sheetsPerUnit":
        return num("จำนวนแผ่น / Sheets per unit", form.sheetsPerUnit, (v) =>
          set("sheetsPerUnit", v),
        );
      case "piecesPerSheet":
        return num(
          "ชิ้นงานต่อแผ่น / Workpieces per sheet",
          form.piecesPerSheet,
          (v) => set("piecesPerSheet", v),
        );
      case "leadTime":
        return num(
          "Lead Time",
          form.leadTimeDays,
          (v) => set("leadTimeDays", v),
          "วัน",
        );
      case "vendors":
        return (
          <Field key={key} label="ผู้จำหน่าย" required={req}>
            <select
              className={control}
              value={form.vendorId ?? ""}
              onChange={(e) => set("vendorId", numberValue(e.target.value))}
            >
              <option value="">เลือกผู้จำหน่าย</option>
              {data.vendors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        );
      case "warehouse":
        return (
          <Field key={key} label="คลังหลัก" required={req}>
            <select
              className={control}
              value={form.warehouseId ?? ""}
              onChange={(e) => set("warehouseId", numberValue(e.target.value))}
            >
              <option value="">เลือกคลังหลัก</option>
              {data.warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        );
      case "reorderPoint":
        return num("จุดสั่งซื้อ", form.reorderPoint, (v) =>
          set("reorderPoint", v),
        );
      case "costPrice":
        return num(
          "ต้นทุน / Cost",
          form.costPrice,
          (v) => set("costPrice", v),
          "บาท",
        );
      case "sellingPrice":
        return num(
          "ราคาขายกลาง / Selling Price",
          form.sellingPrice,
          (v) => set("sellingPrice", v),
          "บาท",
        );
      case "image":
        return (
          <Field key={key} label="รูปสินค้า" required={req}>
            {form.primaryImage ? (
              <div className="flex items-center gap-3 rounded-[4px] border border-[#d8dde3] bg-white p-2.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-[#d8dde3] bg-surface-container-low">
                  <img
                    alt="รูปสินค้า"
                    className="h-full w-full object-contain"
                    src={form.primaryImage}
                  />
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/20">
                    <Upload size={14} />
                    เปลี่ยนรูปภาพ
                    <input
                      accept="image/*"
                      className="sr-only"
                      onChange={imageChange}
                      type="file"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => set("primaryImage", "")}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400"
                  >
                    <Trash2 size={13} />
                    ลบรูป
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex h-[76px] cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed border-[#d8dde3] bg-white text-[12px] transition-colors hover:border-primary/60 hover:text-primary">
                <ImageIcon size={18} />
                คลิกเพื่อเลือกรูปสินค้า
                <input
                  accept="image/*"
                  className="sr-only"
                  onChange={imageChange}
                  type="file"
                />
              </label>
            )}
          </Field>
        );
      case "attachments":
        return (
          <Field key={key} label="เอกสารแนบ" required={req}>
            <label className="flex h-[76px] cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed border-[#d8dde3] bg-white text-[12px]">
              <FileText size={18} />
              {form.attachmentNames.length
                ? form.attachmentNames.join(", ")
                : "คลิกเพื่อเลือกเอกสาร"}
              <input
                className="sr-only"
                multiple
                onChange={(e) =>
                  set(
                    "attachmentNames",
                    Array.from(e.target.files ?? []).map((file) => file.name),
                  )
                }
                type="file"
              />
            </label>
          </Field>
        );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden overscroll-none bg-black/55 p-0 sm:p-3"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-[7px] sm:border sm:border-[#d8dde3]"
        style={{ maxWidth: 1120 }}
      >
        <header className="flex h-[52px] shrink-0 items-center border-b border-[#d8dde3] px-4">
          <strong className="text-[17px] text-primary">
            KRC <span className="text-on-surface">ERP</span>
          </strong>
          <h2 className="flex-1 text-center text-[18px] font-bold">
            {isEdit ? "แก้ไขรายการสินค้า" : "เพิ่มรายการสินค้า"}
          </h2>
          <button
            aria-label="ปิด"
            className="grid h-10 w-10 place-items-center"
            onClick={closeForm}
            type="button"
          >
            <X size={22} />
          </button>
        </header>
        {draftPrompt}
        <p className="px-4 pt-2 text-xs text-secondary">ฉบับร่างไม่เก็บรูปและเอกสารที่แนบ หากกู้คืนกรุณาเลือกไฟล์ใหม่อีกครั้ง</p>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto bg-white p-2 sm:p-3">
          <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full sm:w-[320px]">
              <select
                aria-label="ประเภทสินค้า"
                className={control}
                disabled={isEdit}
                value={form.typeId}
                onChange={(e) => changeType(Number(e.target.value))}
              >
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} • {item.name}
                  </option>
                ))}
              </select>
            </div>
            {type ? (
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <span className="rounded-full border border-primary/30 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-primary">
                  {type.codeMode === "auto" ? "สร้างรหัสอัตโนมัติ" : "กำหนดรหัสเอง"}
                </span>
                {type.sellable ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
                    ขายได้
                  </span>
                ) : null}
                {type.productionItem ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
                    ใช้ในการผลิต
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Section
              number="01"
              open={openSections.main}
              onToggle={() =>
                setOpenSections({ ...openSections, main: !openSections.main })
              }
              title="ข้อมูลหลัก"
            >
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="รหัสสินค้า"
                  required={type?.codeMode === "manual"}
                >
                  <input
                    className={control}
                    readOnly={isEdit || type?.codeMode === "auto"}
                    placeholder={
                      type?.codeMode === "auto"
                        ? "กำลังสร้างรหัส..."
                        : "กรอกรหัสสินค้า"
                    }
                    value={
                      isEdit
                        ? form.code
                        : type?.codeMode === "auto"
                        ? previewCode?.typeId === type.id
                          ? previewCode.code
                          : ""
                        : form.code
                    }
                    onChange={(e) => set("code", e.target.value)}
                  />
                </Field>
                <Field label="ชื่อสินค้า (ภาษาไทย)" required>
                  <input
                    className={control}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="ชื่อสินค้า (ภาษาอังกฤษ)">
                  <input
                    className={control}
                    value={form.nameEn}
                    onChange={(e) => set("nameEn", e.target.value)}
                  />
                </Field>
                <Field label="หน่วยนับ" required>
                  <select
                    className={control}
                    value={form.unitId ?? ""}
                    onChange={(e) => set("unitId", numberValue(e.target.value))}
                  >
                    {data.units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="text-[12px] font-medium leading-tight">
                  สถานะ *
                  <div className="mt-1.5 flex h-9 items-center gap-2">
                    <ToggleSwitch
                      checked={form.status === "active"}
                      label={form.status === "active" ? "ใช้งาน" : "ระงับ"}
                      onChange={(checked) =>
                        set("status", checked ? "active" : "inactive")
                      }
                    />
                  </div>
                </div>
                {["brand", "model", "partNumber"].map((key) =>
                  renderField(key as ItemFormFieldKey),
                )}
              </div>
            </Section>
            {fieldSections.map((section, index) => {
              const visible = section.keys.filter(shown);
              if (!visible.length) return null;
              return (
                <Section
                  key={section.id}
                  number={String(index + 2).padStart(2, "0")}
                  open={openSections[section.id]}
                  onToggle={() =>
                    setOpenSections({
                      ...openSections,
                      [section.id]: !openSections[section.id],
                    })
                  }
                  title={section.title}
                >
                  <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map(renderField)}
                  </div>
                </Section>
              );
            })}
          </div>
          {error ? (
            <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#d8dde3] bg-white px-3 py-2">
          <div className="flex w-full items-center gap-2 text-[11px] sm:w-auto sm:text-[12px]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white">
              <Check size={13} />
            </span>
            กรอกแล้ว {completedRequired} / {requiredKeys.length} ช่องบังคับ
          </div>
          <button
            className="ml-auto h-9 min-w-24 rounded-[4px] border border-[#d8dde3] px-5 text-[12px] font-bold"
            onClick={closeForm}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 min-w-36 rounded-[4px] bg-primary px-5 text-[12px] font-bold text-white disabled:opacity-50"
            disabled={saving}
            onClick={submit}
            type="button"
          >
            {saving ? "กำลังบันทึก..." : isEdit ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
          </button>
        </footer>
      </div>
    </div>
  );
}
