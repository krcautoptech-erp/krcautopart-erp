"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft, Edit3, Trash2, X } from "lucide-react";
import type { CatalogItem, ItemTypeRecord } from "@/app/actions/items";
import type { ItemFormFieldKey, ItemFormFieldVisibility } from "@/lib/items";
import { formatDimension, type ItemLookup } from "./item-dynamic-columns";
import { ItemTypeBadge } from "@/components/item-type-badge";

interface ItemSideDrawerProps {
  item: CatalogItem | null;
  onClose: () => void;
  onEdit?: (item: CatalogItem) => void;
  onDelete?: (item: CatalogItem) => void;
  types: ItemTypeRecord[];
  warehouses: ItemLookup[];
  groups: ItemLookup[];
  grades: ItemLookup[];
  vendors: ItemLookup[];
}

type TabId = "main" | "details" | "purchase";
type FieldRow = {
  key: string;
  label: string;
  value: string;
  field?: ItemFormFieldKey;
  always?: boolean;
  tab: TabId;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "main", label: "ข้อมูลหลัก" },
  { id: "details", label: "รายละเอียด" },
  { id: "purchase", label: "การจัดซื้อและสต็อก" },
];

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} บาท`;
}

function showField(
  row: FieldRow,
  fields: Partial<Record<ItemFormFieldKey, ItemFormFieldVisibility>>,
) {
  if (row.always) return true;
  if (!row.field) return false;
  const visibility = fields[row.field];
  if (visibility === "hidden") return false;
  if (visibility === "required") return true;
  return row.value.trim() !== "" && row.value !== "-";
}

export function ItemSideDrawer({
  item,
  onClose,
  onEdit,
  onDelete,
  types,
  warehouses,
  groups,
  grades,
  vendors,
}: ItemSideDrawerProps) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("main");
  const [prevItemId, setPrevItemId] = useState(item?.id);
  if (item?.id !== prevItemId) {
    setPrevItemId(item?.id);
    setActiveTab("main");
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (!item) return;

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [item, onClose]);

  const type = useMemo(
    () => types.find((candidate) => candidate.code === item?.typeCode),
    [item?.typeCode, types],
  );

  const rows = useMemo(() => {
    if (!item) return [] satisfies FieldRow[];

    const form = item.form;
    const warehouseName =
      warehouses.find((w) => w.id === form.warehouseId)?.name || "-";
    const groupName = groups.find((g) => g.id === form.groupId)?.name || "-";
    const gradeName =
      grades.find((g) => g.id === form.gradeId)?.name ||
      form.gradeName ||
      form.material ||
      "-";
    const vendorName = vendors.find((v) => v.id === form.vendorId)?.name || "-";
    const dimension = formatDimension(
      form.thickness,
      form.width,
      form.length,
      form.dimensionUnit || "มม.",
    );

    return [
      { key: "code", label: "รหัสสินค้า", value: item.code || "-", always: true, tab: "main" },
      { key: "name", label: "ชื่อสินค้า", value: item.name || "-", always: true, tab: "main" },
      { key: "nameEn", label: "ชื่อสินค้า (อังกฤษ)", value: form.nameEn || "-", always: Boolean(form.nameEn), tab: "main" },
      { key: "type", label: "ประเภทสินค้า", value: item.typeCode || "-", always: true, tab: "main" },
      { key: "status", label: "สถานะ", value: item.status === "active" ? "ใช้งาน" : "ระงับ", always: true, tab: "main" },
      { key: "unit", label: "หน่วย", value: item.unit || "-", always: true, tab: "main" },
      { key: "control", label: "การควบคุม", value: item.control || "-", always: true, tab: "main" },
      { key: "brand", label: "ยี่ห้อ", value: form.brand || "-", field: "brand", tab: "details" },
      { key: "model", label: "รุ่น", value: form.model || "-", field: "model", tab: "details" },
      { key: "partNumber", label: "Part No.", value: form.partNumber || "-", field: "partNumber", tab: "details" },
      { key: "grade", label: "เกรดวัสดุ", value: gradeName, field: "materialGrade", tab: "details" },
      { key: "group", label: "กลุ่มสินค้า", value: groupName, field: "itemGroup", tab: "details" },
      { key: "dimension", label: "ขนาด", value: dimension, field: "dimensions", tab: "details" },
      { key: "thickness", label: "ความหนา", value: form.thickness ? `${form.thickness} ${form.dimensionUnit || "มม."}` : "-", field: "thickness", tab: "details" },
      { key: "width", label: "ความกว้าง", value: form.width ? `${form.width} ${form.dimensionUnit || "มม."}` : "-", field: "width", tab: "details" },
      { key: "length", label: "ความยาว", value: form.length ? `${form.length} ${form.dimensionUnit || "มม."}` : "-", field: "length", tab: "details" },
      { key: "standard", label: "มาตรฐาน", value: form.standard || "-", field: "standard", tab: "details" },
      { key: "plating", label: "การชุบผิว", value: form.plating || "-", field: "plating", tab: "details" },
      { key: "sheetsPerUnit", label: "จำนวนแผ่นต่อหน่วย", value: form.sheetsPerUnit ? `${form.sheetsPerUnit}` : "-", field: "sheetsPerUnit", tab: "details" },
      { key: "piecesPerSheet", label: "ชิ้นงานต่อแผ่น", value: form.piecesPerSheet ? `${form.piecesPerSheet}` : "-", field: "piecesPerSheet", tab: "details" },
      { key: "description", label: "คำอธิบาย", value: form.description || "-", field: "description", tab: "details" },
      { key: "warehouse", label: "คลังหลัก", value: warehouseName, field: "warehouse", tab: "purchase" },
      { key: "reorderPoint", label: "จุดสั่งซื้อ", value: form.reorderPoint !== null && form.reorderPoint !== undefined ? `${Number(form.reorderPoint).toLocaleString("th-TH")} ${item.unit || ""}` : "-", field: "reorderPoint", tab: "purchase" },
      { key: "leadTime", label: "Lead Time", value: form.leadTimeDays ? `${form.leadTimeDays} วัน` : "-", field: "leadTime", tab: "purchase" },
      { key: "vendor", label: "ผู้จำหน่าย", value: vendorName, field: "vendors", tab: "purchase" },
      { key: "costPrice", label: "มูลค่าทุน", value: money(form.costPrice), field: "costPrice", tab: "purchase" },
      { key: "sellingPrice", label: "ราคาขายกลาง", value: money(form.sellingPrice), field: "sellingPrice", tab: "purchase" },
      { key: "shelfLife", label: "อายุการเก็บ", value: form.shelfLifeDays ? `${form.shelfLifeDays} วัน` : "-", always: Boolean(form.shelfLifeDays), tab: "purchase" },
      { key: "expiryWarning", label: "แจ้งเตือนหมดอายุ", value: form.expiryWarningDays ? `${form.expiryWarningDays} วัน` : "-", always: Boolean(form.expiryWarningDays), tab: "purchase" },
    ] satisfies FieldRow[];
  }, [groups, grades, item, vendors, warehouses]);

  if (!item) return null;

  const fields: Partial<Record<ItemFormFieldKey, ItemFormFieldVisibility>> =
    type?.formFields ?? {};
  const visibleRows = rows.filter((row) => showField(row, fields));
  const rowsByTab = tabs.reduce(
    (acc, tab) => {
      acc[tab.id] = visibleRows.filter((row) => row.tab === tab.id);
      return acc;
    },
    {} as Record<TabId, FieldRow[]>,
  );
  const imageEnabled = fields.image !== "hidden";
  const hasImage = imageEnabled && Boolean(item.form.primaryImage);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-black/55"
      onClick={onClose}
      role="dialog"
    >
      <aside
        className="flex h-full w-full flex-col bg-white text-black shadow-2xl sm:w-[430px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="grid h-[58px] shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[#eeeeee] px-3 sm:h-[62px] sm:px-5">
          <button
            aria-label="ย้อนกลับ"
            className="grid h-9 w-9 place-items-center rounded-full text-black hover:bg-[#fafafa] sm:hidden"
            onClick={onClose}
            type="button"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="hidden text-[15px] font-bold text-[#c10b16] sm:block">
            KRC <span className="font-medium text-black">ERP</span>
          </div>
          <h2
            className="truncate text-center text-[15px] font-bold sm:text-[16px]"
            id={titleId}
          >
            รายละเอียดสินค้า
          </h2>
          <button
            aria-label="ปิดรายละเอียดสินค้า"
            className="hidden h-9 w-9 place-items-center justify-self-end rounded-full text-black hover:bg-[#fafafa] sm:grid"
            onClick={onClose}
            type="button"
          >
            <X size={21} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-6 sm:px-7 sm:pt-8">
          <section className={hasImage ? "flex items-center gap-4" : "flex items-center"}>
            {hasImage ? (
              <div className="grid h-[92px] w-[122px] shrink-0 place-items-center overflow-hidden rounded-[4px] bg-white">
                { }
                <img
                  alt={item.name}
                  className="max-h-full max-w-full object-contain"
                  src={item.form.primaryImage}
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-extrabold text-[#c10b16] sm:text-[20px]">
                {item.code}
              </p>
              <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-black">
                {item.name}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ItemTypeBadge code={item.typeCode} name={item.typeName} />
                <span className="rounded-[2px] border border-[#e02b35] px-2 py-0.5 text-[11px] font-bold text-[#c10b16]">
                  {item.status === "active" ? "ใช้งาน" : "ระงับ"}
                </span>
              </div>
            </div>
          </section>

          <nav className="mt-7 grid grid-cols-3 border-b border-[#e5e5e5] text-center text-[12px] font-semibold sm:text-[13px]">
            {tabs.map((tab) => {
              const count = rowsByTab[tab.id].length;
              return (
                <button
                  className={`relative h-10 px-1 ${
                    activeTab === tab.id ? "text-[#c10b16]" : "text-black"
                  } ${count === 0 ? "opacity-40" : ""}`}
                  disabled={count === 0}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                  {activeTab === tab.id ? (
                    <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#c10b16]" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <dl className="mt-6 text-[12px] sm:text-[13px]">
            {rowsByTab[activeTab].map((row) => (
              <div
                className="grid grid-cols-[118px_1fr] gap-4 border-b border-[#eeeeee] py-3 sm:grid-cols-[132px_1fr]"
                key={row.key}
              >
                <dt className="text-black">{row.label}</dt>
                <dd
                  className={`min-w-0 whitespace-pre-wrap break-words font-medium ${
                    row.key === "status" ? "text-[#c10b16]" : "text-black"
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {onEdit ? (
          <footer className="shrink-0 border-t border-[#eeeeee] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#c10b16] text-[16px] font-bold text-white"
              onClick={() => { onClose(); onEdit(item); }}
              type="button"
            >
              <Edit3 size={20} />
              แก้ไขข้อมูล
            </button>
          </footer>
        ) : null}

        <footer className="hidden shrink-0 grid-cols-[auto_1fr_1fr] gap-2 border-t border-[#eeeeee] bg-white px-7 py-4 sm:grid">
          {onDelete ? (
            <button
              className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] border border-rose-200 bg-rose-50 px-3 text-[13px] font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400"
              onClick={() => {
                onDelete(item);
              }}
              title="ลบรายการสินค้า"
              type="button"
            >
              <Trash2 size={14} />
              ลบ
            </button>
          ) : null}
          {onEdit ? (
            <button
              className="flex h-10 items-center justify-center gap-2 rounded-[4px] border border-[#e02b35] bg-white text-[13px] font-bold text-[#c10b16] hover:bg-[#fff6f6]"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
              type="button"
            >
              <Edit3 size={14} />
              แก้ไข
            </button>
          ) : (
            <span />
          )}
          <button
            className="h-10 rounded-[4px] bg-[#c10b16] text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(193,11,22,0.22)] hover:bg-[#a90812]"
            onClick={onClose}
            type="button"
          >
            ปิด
          </button>
        </footer>
      </aside>
    </div>
  );
}
