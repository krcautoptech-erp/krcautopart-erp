"use client";

import "./stock-count.css";
import "./stock-count-mobile.css";
import "./stock-count-visual.css";
import { useEffect, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createStockCountAction,
  getStockCountCreateOptionsAction,
  startStockCountAction,
  type StockCountCreateOptions,
  type StockCountOption,
} from "@/app/actions/stock-counts";
import { ItemPicker } from "@/components/item-picker";
import { toast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { validateStockCountCreate } from "@/lib/stock-counts";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
export function StockCountCreatePage({
  initialOptions,
}: {
  initialOptions?: StockCountCreateOptions;
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
  useUnsavedChanges(
    "stock-count-create",
    Boolean(warehouseId || assignedTo || notes || selected.size),
  );
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
  return (
    <section className="stock-count-document stock-count-create">
      <header className="stock-count-document-header">
        <div>
          <h1>สร้างรอบตรวจนับ</h1>
        </div>
      </header>
      <section className="stock-count-form-section">
        <h2>ข้อมูลรอบตรวจนับ</h2>
        <div className="stock-count-form-grid">
          <label>
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
          <label>
            <span>วันที่เอกสาร *</span>
            <input
              max={today()}
              type="date"
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
            />
          </label>
          <label>
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
          <fieldset className="stock-count-scope">
            <legend>ขอบเขตรายการ *</legend>
            <label>
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
            <label>
              <input
                checked={scope === "selected"}
                name="scope"
                onChange={() => setScope("selected")}
                type="radio"
              />
              เลือกเฉพาะสินค้า
            </label>
          </fieldset>
          <label className="wide">
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
      <section className="stock-count-picker">
        <header>
          <div>
            <h2>รายการสินค้า ({selectedItems.length} รายการ)</h2>
          </div>
          {scope === "selected" && (
            <button
              className="stock-count-secondary"
              disabled={!warehouseId}
              onClick={() => setPickerOpen(true)}
              type="button"
            >
              <Plus size={16} />
              เลือกสินค้า
            </button>
          )}
        </header>
        <div className={scope === "selected" ? "stock-count-picker-table stock-count-selected-list" : "stock-count-picker-table"}>
          <table className="erp-data-table min-w-[760px]">
            <thead>
              <tr>
                <th>#</th>
                <th>รหัสสินค้า</th>
                <th>รายการ</th>
                <th>หน่วย</th>
                <th>จำนวน</th>
                <th>Lot</th>
                {scope === "selected" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(scope === "all" ? options.items : selectedItems).map(
                (item, index) => {
                  return (
                    <tr
                      className={scope === "selected" ? "selected" : ""}
                      key={item.id}
                    >
                      <td>{index + 1}</td>
                      <td className="font-bold">{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.unitName}</td>
                      <td className="text-center">-</td>
                      <td className="text-center">
                        {Math.max(1, item.lotCount)}
                      </td>
                      {scope === "selected" && (
                        <td>
                          <button
                            aria-label={`นำ ${item.code} ออก`}
                            className="stock-count-remove"
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
                      กด “เลือกสินค้า” เพื่อเพิ่มรายการตรวจนับ
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="stock-count-form-footer">
        <span>
          เลือกแล้ว {selectedItems.length} สินค้า · {lotCount} จุดนับ
        </span>
        <div>
          <Link
            className="stock-count-secondary"
            href="/inventory/stock-counts"
          >
            ยกเลิก
          </Link>
          <button
            className="stock-count-secondary"
            disabled={pending}
            onClick={() => save()}
            type="button"
          >
            บันทึกร่าง
          </button>
          <button
            className="stock-count-primary"
            disabled={pending}
            onClick={() => save(true)}
          >
            <Check size={17} />
            {pending ? "กำลังสร้าง..." : "เริ่มตรวจนับ"}
          </button>
        </div>
      </footer>
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
    </section>
  );
}
