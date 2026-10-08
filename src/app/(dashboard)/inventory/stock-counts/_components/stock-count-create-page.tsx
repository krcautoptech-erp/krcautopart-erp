"use client";

import "./stock-count.css";
import "./stock-count-mobile.css";
import "./stock-count-visual.css";
import "@/app/(dashboard)/inventory/adjustments/_components/stock-adjustment-theme.css";
import "@/components/document-form.css";
import { useEffect, useState, useTransition } from "react";
import { Check, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createStockCountAction,
  getStockCountCreateOptionsAction,
  startStockCountAction,
  type StockCountCreateOptions,
  type StockCountOption,
} from "@/app/actions/stock-counts";
import { CompanyFormLogo } from "@/components/company-logo";
import { ItemPicker } from "@/components/item-picker";
import { toast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useFormDraft } from "@/components/form-draft";
import { validateStockCountCreate } from "@/lib/stock-counts";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
export function StockCountCreatePage({
  initialOptions,
  onClose,
}: {
  initialOptions?: StockCountCreateOptions;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<StockCountCreateOptions>(
    initialOptions ?? { warehouses: [], assignees: [], items: [] },
  );
  const [documentDate, setDocumentDate] = useState(today);
  const [warehouseId, setWarehouseId] = useState(0);
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [restoring, setRestoring] = useState(false);
  const draftValue = { documentDate, warehouseId, assignedTo, notes, scope, selected: [...selected] };
  const [initialDraft] = useState(draftValue);
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: "stock-count:new", value: draftValue, initialValue: initialDraft,
    onRestore: async (draft) => {
      setRestoring(true);
      try {
        const result = await getStockCountCreateOptionsAction(draft.warehouseId);
        if (!("data" in result) || !result.data) throw new Error(result.error ?? "โหลดสินค้าไม่สำเร็จ");
        if (draft.warehouseId && !result.data.warehouses.some((row) => row.id === draft.warehouseId)) {
          throw new Error("คลังสินค้าที่บันทึกไว้ไม่พร้อมใช้งาน กรุณาละทิ้งข้อมูลเดิมและเลือกคลังใหม่");
        }
        if (draft.assignedTo && !result.data.assignees.some((row) => row.id === draft.assignedTo)) {
          throw new Error("ผู้ตรวจนับที่บันทึกไว้ไม่พร้อมใช้งาน กรุณาละทิ้งข้อมูลเดิมและเลือกผู้ตรวจนับใหม่");
        }
        if (draft.scope !== "all" && draft.scope !== "selected") throw new Error("ขอบเขตตรวจนับที่บันทึกไว้ไม่ถูกต้อง");
        if (draft.selected.some((id) => !result.data!.items.some((item) => item.id === id))) {
          throw new Error("สินค้าที่บันทึกไว้บางรายการไม่พร้อมใช้งาน กรุณาละทิ้งข้อมูลเดิมและเลือกสินค้าใหม่");
        }
        setOptions(result.data);
        setDocumentDate(draft.documentDate);
        setWarehouseId(draft.warehouseId);
        setAssignedTo(draft.assignedTo);
        setNotes(draft.notes);
        setScope(draft.scope);
        setSelected(new Set(draft.selected));
      } finally { setRestoring(false); }
    },
  });
  useUnsavedChanges("stock-count-create", hasChanges);
  useEffect(() => {
    if (!warehouseId) return;
    let active = true;
    void getStockCountCreateOptionsAction(warehouseId).then((result) => {
      if (!active) return;
      if (!("data" in result) || !result.data)
        return toast.error(result.error ?? "โหลดสินค้าไม่สำเร็จ");
      setOptions(result.data);
    });
    return () => {
      active = false;
    };
  }, [warehouseId]);
  const selectedItems =
    scope === "all"
      ? options.items
      : options.items.filter((item) => selected.has(item.id));
  const lotCount = selectedItems.reduce(
    (sum, item) => sum + Math.max(1, item.lotCount),
    0,
  );
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = (startNow = false) => {
    if (restoring) return;
    const input = {
      documentDate,
      warehouseId,
      assignedTo,
      notes,
      itemMasterIds: selectedItems.map((item) => item.id),
      selectionScope: scope,
    };
    const error = validateStockCountCreate(input);
    if (error) {
      toast.error(error);
      return;
    }
    startTransition(async () => {
      const result = await createStockCountAction(input);
      if (!("success" in result)) {
        toast.error(result.error);
        return;
      }
      const id = Number(result.id);
      clearDraft();
      if (startNow) {
        const started = await startStockCountAction(id);
        if (!("success" in started)) {
          toast.error(started.error);
          router.push(`/inventory/stock-counts/${id}`);
          return;
        }
      }
      toast.success(`สร้าง ${result.countNumber} แล้ว`);
      router.push(`/inventory/stock-counts/${id}`);
    });
  };
  const handleCancel = () => {
    if (onClose) {
      onClose();
    } else {
      router.push("/inventory/stock-counts");
    }
  };

  return (
    <div className="adjustment-overlay" role="presentation">
      <section
        aria-labelledby="stock-count-create-title"
        aria-modal="true"
        className="document-form adjustment-modal document-adjustment-form stock-count-create-modal"
        role="dialog"
      >
        <header className="document-form-header flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CompanyFormLogo className="document-brand" />
            <div>
              <h2 id="stock-count-create-title">สร้างรอบตรวจนับ</h2>
              <small className="text-secondary">ยังไม่เริ่มตรวจนับ · เลขที่รอบตรวจนับสร้างอัตโนมัติ</small>
            </div>
          </div>
          <button aria-label="ปิด" onClick={handleCancel} type="button">
            <X />
          </button>
        </header>
        {draftPrompt}
        <fieldset className="document-form-body min-w-0 border-0 p-0" disabled={restoring}>
          <section className="p-4 sm:p-5">
            <div className="document-fields">
              <label className="document-field">
                <span>คลังสินค้า *</span>
                <select
                  value={warehouseId}
                  onChange={(event) => {
                    setWarehouseId(Number(event.target.value));
                    setOptions((current) => ({ ...current, items: [] }));
                    setSelected(new Set());
                  }}
                >
                  <option value={0}>เลือกคลังสินค้า</option>
                  {options.warehouses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="document-field">
                <span>วันที่เอกสาร *</span>
                <input
                  max={today()}
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                />
              </label>
              <label className="document-field">
                <span>ผู้รับผิดชอบ *</span>
                <select
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                >
                  <option value="">เลือกผู้ตรวจนับ</option>
                  {options.assignees.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="document-field">
                <span>ขอบเขตรายการ *</span>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <input
                      checked={scope === "all"}
                      name="scope"
                      onChange={() => {
                        setScope("all");
                        setPickerOpen(false);
                      }}
                      type="radio"
                    />
                    สินค้าทั้งหมด
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <input
                      checked={scope === "selected"}
                      name="scope"
                      onChange={() => setScope("selected")}
                      type="radio"
                    />
                    เลือกเฉพาะสินค้า
                  </label>
                </div>
              </div>
              <label className="document-field wide">
                <span>หมายเหตุ</span>
                <textarea
                  maxLength={1000}
                  placeholder="เช่น ตรวจนับประจำเดือนตุลาคม 2569"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="adjustment-lines">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                รายการสินค้า ({scope === "all" ? options.items.length : selectedItems.length} รายการ)
              </span>
              {scope === "selected" && (
                <button
                  className="adjustment-add-items"
                  disabled={!warehouseId}
                  onClick={() => setPickerOpen(true)}
                  type="button"
                >
                  <Search size={16} />
                  เลือกสินค้าตรวจนับ
                </button>
              )}
            </div>

            <div className="document-table-scroll">
              <table className="document-entry-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th>หน่วย</th>
                    <th className="text-right">จำนวนคงเหลือ</th>
                    <th className="text-center">Lot</th>
                    {scope === "selected" && <th className="text-center">จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {(scope === "all" ? options.items : selectedItems).map(
                    (item, index) => {
                      return (
                        <tr key={item.id}>
                          <td className="text-center">{index + 1}</td>
                          <td className="font-bold">{item.code}</td>
                          <td>
                            <span className="document-product adjustment-two-lines" title={item.name}>
                              {item.name}
                            </span>
                          </td>
                          <td className="text-center">{item.unitName}</td>
                          <td className="text-right font-medium">
                            {item.onHandQty.toLocaleString("th-TH", { maximumFractionDigits: 4 })}
                          </td>
                          <td className="text-center">
                            {Math.max(1, item.lotCount)}
                          </td>
                          {scope === "selected" && (
                            <td className="text-center">
                              <button
                                aria-label={`นำ ${item.code} ออก`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggle(item.id);
                                }}
                                type="button"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    },
                  )}
                  {!options.items.length && (
                    <tr>
                      <td
                        colSpan={scope === "selected" ? 7 : 6}
                        className="h-24 text-center text-secondary"
                      >
                        เลือกคลังสินค้าเพื่อแสดงรายการ
                      </td>
                    </tr>
                  )}
                  {scope === "selected" &&
                    options.items.length > 0 &&
                    selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="h-24 text-center text-secondary">
                          กด “เลือกสินค้าตรวจนับ” เพื่อเพิ่มรายการ
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </section>
        </fieldset>

        <footer className="document-form-footer">
          <span className="summary">
            เลือกแล้ว {scope === "all" ? options.items.length : selectedItems.length} สินค้า · {lotCount} จุดนับ
          </span>
          <button
            disabled={pending}
            onClick={handleCancel}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            disabled={pending}
            onClick={() => save()}
            type="button"
          >
            บันทึกร่าง
          </button>
          <button
            className="primary"
            disabled={pending}
            onClick={() => save(true)}
            type="button"
          >
            <Check size={17} />
            {pending ? "กำลังสร้าง..." : "เริ่มตรวจนับ"}
          </button>
        </footer>
      </section>

      {pickerOpen && (
        <ItemPicker<StockCountOption>
          columns={[
            {
              key: "balance",
              label: "คงเหลือ",
              className: "text-right",
              render: (item) => item.value.onHandQty.toLocaleString("th-TH", { maximumFractionDigits: 4 }),
            },
            {
              key: "lots",
              label: "Lot",
              className: "text-center",
              render: (item) => Math.max(1, item.value.lotCount),
            },
          ]}
          context={`รอบตรวจนับ · ${options.warehouses.find((row) => row.id === warehouseId)?.name ?? "คลังสินค้า"}`}
          initialSelectedIds={[...selected].map(String)}
          items={options.items.map((item) => ({
            id: String(item.id),
            code: item.code,
            name: item.name,
            unit: item.unitName,
            value: item,
          }))}
          onClose={() => setPickerOpen(false)}
          onConfirm={(items) => setSelected(new Set(items.map((item) => item.id)))}
          title="เลือกสินค้าสำหรับตรวจนับ"
        />
      )}
    </div>
  );
}

export { StockCountCreatePage as StockCountCreateModal };
