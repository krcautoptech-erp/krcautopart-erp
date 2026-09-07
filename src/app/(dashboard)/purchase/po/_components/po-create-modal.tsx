"use client";

import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Minus,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";
import {
  createPurchaseOrderAction,
  searchPurchaseOrderSourceItemsAction,
  updatePurchaseOrderAction,
} from "@/app/actions/purchase-orders";
import type {
  PurchaseOrderEditData,
  PurchaseOrderSourceItem,
  PurchaseOrderVendor,
} from "@/lib/purchase-orders";
import { ItemTypeBadge } from "@/components/item-type-badge";

type EditableLine = PurchaseOrderSourceItem & {
  discountAmount: string;
  quantity: string;
  remarks: string;
  taxRate: string;
  unitPrice: string;
};

type PurchaseRequisitionGroup = {
  items: PurchaseOrderSourceItem[];
  neededByDate: string;
  prNumber: string;
  requisitionId: number;
};

type PoCreateModalProps = {
  buyerName: string;
  defaultDeliveryAddress: string;
  documentDate: string;
  initialData?: PurchaseOrderEditData;
  onClose: () => void;
  onSaved: (message: string) => void;
  vendors: PurchaseOrderVendor[];
  readOnly?: boolean;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatAmount(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function groupPurchaseRequisitions(
  items: PurchaseOrderSourceItem[],
): PurchaseRequisitionGroup[] {
  const groups = new Map<number, PurchaseRequisitionGroup>();

  for (const item of items) {
    const group = groups.get(item.requisitionId);
    if (group) {
      group.items.push(item);
      if (!group.neededByDate && item.neededByDate) {
        group.neededByDate = item.neededByDate;
      }
    } else {
      groups.set(item.requisitionId, {
        neededByDate: item.neededByDate,
        prNumber: item.prNumber,
        requisitionId: item.requisitionId,
        items: [item],
      });
    }
  }

  return Array.from(groups.values());
}

export function PoCreateModal({
  buyerName,
  defaultDeliveryAddress,
  documentDate,
  initialData,
  onClose,
  onSaved,
  vendors,
  readOnly = false,
}: PoCreateModalProps) {
  const [isPending, startTransition] = useTransition();
  const [vendorId, setVendorId] = useState(
    initialData?.vendorId ?? vendors[0]?.id ?? 0,
  );
  const [deliveryDate, setDeliveryDate] = useState(
    initialData?.deliveryDate ?? addDays(documentDate, 14),
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialData?.deliveryAddress ?? defaultDeliveryAddress,
  );
  const [supplierNote, setSupplierNote] = useState(
    initialData?.supplierNote ??
      "ขอความกรุณาจัดส่งตามวันที่กำหนด และแนบใบรับรองคุณภาพ (MILL CERTIFICATE) ทุกครั้ง",
  );
  const [lines, setLines] = useState<EditableLine[]>(
    initialData?.lines ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItems, setPickerItems] = useState<PurchaseOrderSourceItem[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedPrIds, setExpandedPrIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [reservedPoNumber, setReservedPoNumber] = useState(
    initialData?.poNumber ?? "",
  );
  const importInputRef = useRef<HTMLInputElement>(null);

  const vendorById = useMemo(
    () => new Map(vendors.map((item) => [item.id, item])),
    [vendors],
  );
  const vendor = vendorById.get(vendorId) ?? vendors[0];
  const existingLineIds = useMemo(
    () => new Set(lines.map((line) => line.requisitionItemId)),
    [lines],
  );
  const pickerItemById = useMemo(
    () => new Map(pickerItems.map((item) => [item.requisitionItemId, item])),
    [pickerItems],
  );
  const pickerGroups = useMemo(
    () => groupPurchaseRequisitions(pickerItems),
    [pickerItems],
  );

  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
    };
  }, []);

  useEffect(() => {
    if (initialData) return;

    let isActive = true;

    void reserveBusinessNumberAction("PO", documentDate).then((result) => {
      if (!isActive) return;

      if (result.success) {
        setReservedPoNumber(result.number);
        return;
      }

      setError(result.error);
    });

    return () => {
      isActive = false;
    };
  }, [documentDate, initialData]);

  const loadSourceItems = (search = pickerQuery) => {
    setError("");
    startTransition(async () => {
      const result = await searchPurchaseOrderSourceItemsAction(search);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPickerItems(result.items);
      setSelectedIds(new Set());
      setExpandedPrIds(new Set());
      setPickerOpen(true);
    });
  };

  const addSelectedItems = () => {
    const taxRate = vendor?.taxRate ?? 0;
    const selected = Array.from(selectedIds)
      .map((id) => pickerItemById.get(id))
      .filter(
        (item): item is PurchaseOrderSourceItem => {
          if (!item) return false;
          return !existingLineIds.has(item.requisitionItemId);
        },
      )
      .map<EditableLine>((item) => ({
        ...item,
        discountAmount: "0",
        quantity: String(item.availableQuantity),
        remarks: "",
        taxRate: String(taxRate),
        unitPrice: "0",
      }));
    setLines((current) => [...current, ...selected]);
    setPickerOpen(false);
  };

  const updateLine = (
    requisitionItemId: number,
    key: "discountAmount" | "quantity" | "remarks" | "unitPrice",
    value: string,
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.requisitionItemId === requisitionItemId
          ? { ...line, [key]: value }
          : line,
      ),
    );
  };

  const togglePrSelection = (group: PurchaseRequisitionGroup) => {
    const selectableIds = group.items
      .map((item) => item.requisitionItemId)
      .filter((id) => !existingLineIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected =
        selectableIds.length > 0 && selectableIds.every((id) => next.has(id));

      for (const id of selectableIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const togglePrExpanded = (requisitionId: number) => {
    setExpandedPrIds((current) => {
      const next = new Set(current);
      if (next.has(requisitionId)) {
        next.delete(requisitionId);
      } else {
        next.add(requisitionId);
      }
      return next;
    });
  };

  const totals = useMemo(
    () =>
      lines.reduce(
        (summary, line) => {
          const quantity = Number(line.quantity) || 0;
          const unitPrice = Number(line.unitPrice) || 0;
          const discount = Number(line.discountAmount) || 0;
          const subtotal = quantity * unitPrice;
          const taxable = Math.max(subtotal - discount, 0);
          const tax = taxable * ((Number(line.taxRate) || 0) / 100);
          return {
            discount: summary.discount + discount,
            grandTotal: summary.grandTotal + taxable + tax,
            quantity: summary.quantity + quantity,
            subtotal: summary.subtotal + subtotal,
            tax: summary.tax + tax,
          };
        },
        { discount: 0, grandTotal: 0, quantity: 0, subtotal: 0, tax: 0 },
      ),
    [lines],
  );

  const save = (status: "draft" | "pending_approval") => {
    setError("");
    if (!reservedPoNumber) {
      setError("ระบบยังไม่สามารถสร้างเลขใบสั่งซื้อได้");
      return;
    }

    startTransition(async () => {
      const submission = {
        deliveryAddress,
        deliveryDate,
        documentDate: initialData?.documentDate ?? documentDate,
        items: lines.map((line) => ({
          deliveryDate,
          discountAmount: Number(line.discountAmount),
          quantity: Number(line.quantity),
          remarks: line.remarks,
          requisitionItemId: line.requisitionItemId,
          taxRate: Number(line.taxRate),
          unitPrice: Number(line.unitPrice),
        })),
        status,
        supplierNote,
        termsAndConditions: initialData?.termsAndConditions ?? "",
        vendorId,
      };
      const result = initialData
        ? await updatePurchaseOrderAction(initialData.id, submission)
        : await createPurchaseOrderAction(submission);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(
        initialData
          ? `บันทึกการแก้ไข ${result.poNumber} เรียบร้อยแล้ว`
          : status === "draft"
          ? `บันทึกร่าง ${result.poNumber} เรียบร้อยแล้ว`
          : `สร้าง ${result.poNumber} และส่งอนุมัติเรียบร้อยแล้ว`,
      );
    });
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("การนำเข้ารายการ PO รองรับไฟล์ CSV เท่านั้น");
      return;
    }
    const content = await file.text();
    const firstPrNumber =
      content.match(/PR(?:\d{8,}|-\d{6,8}-\d{3,6})/i)?.[0] ??
      content.split(/[\r\n,;\t]/).find((value) => value.trim())?.trim() ??
      "";
    setPickerQuery(firstPrNumber);
    loadSourceItems(firstPrNumber);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:p-3">
      <section
        aria-label={readOnly ? "รายละเอียดใบสั่งซื้อ" : initialData ? "แก้ไขใบสั่งซื้อ" : "สร้างใบสั่งซื้อ"}
        className="flex h-[100dvh] w-full max-w-[1088px] flex-col overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-2xl sm:h-[calc(100dvh-24px)] sm:max-h-[843px] sm:w-[calc(100vw-24px)] sm:rounded-[2px]"
      >
        <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-outline-variant px-3.5">
          <div className="flex items-center gap-3.5">
            <span className="rounded-[2px] bg-primary px-3 py-1 text-[13px] font-bold tracking-wide text-white">
              KRC ERP
            </span>
            <span className="h-7 w-px bg-outline-variant" />
            <h2 className="text-[16px] font-bold text-on-surface">
              {readOnly ? "รายละเอียดใบสั่งซื้อ (PO)" : initialData ? "แก้ไขใบสั่งซื้อ (PO)" : "สร้างใบสั่งซื้อ (PO)"}
            </h2>
          </div>
          <button
            aria-label="ปิด"
            className="grid h-8 w-8 place-items-center text-on-surface hover:text-primary"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_auto] overflow-y-auto lg:min-h-[749px] lg:grid-rows-[184px_415px_150px] lg:overflow-hidden">
          <section className="border-b border-outline-variant px-3.5 py-2">
            <SectionTitle number="01" title="ข้อมูลเอกสารและผู้ขาย" />
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <Field
                hint="ระบบสร้างให้อัตโนมัติ"
                label="เลขที่ PO"
              >
                <input
                  className="po-input po-input-disabled"
                  disabled
                  value={reservedPoNumber || "กำลังสร้างเลข..."}
                />
              </Field>
              <Field label="วันที่เอกสาร">
                <input
                  className="po-input"
                  disabled
                  type="date"
                  value={initialData?.documentDate ?? documentDate}
                />
              </Field>
              <Field
                hint="ระบบกำหนดจากผู้ใช้งาน"
                label="ผู้จัดซื้อ"
              >
                <input
                  className="po-input po-input-disabled"
                  disabled
                  value={buyerName}
                />
              </Field>
              <Field className="col-span-2" label="ผู้ขาย *">
                <select
                  className="po-input"
                  onChange={(event) => setVendorId(Number(event.target.value))}
                  value={vendorId}
                  disabled={readOnly}
                >
                  {vendors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.vendorName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="เครดิตเทอม">
                <select
                  className="po-input po-input-disabled"
                  disabled
                  value={vendor?.creditTermName ?? "-"}
                >
                  <option>{vendor?.creditTermName ?? "-"}</option>
                </select>
              </Field>
              <Field label="วิธีชำระเงิน">
                <select
                  className="po-input po-input-disabled"
                  disabled
                  value={vendor?.paymentMethodName ?? "-"}
                >
                  <option>{vendor?.paymentMethodName ?? "-"}</option>
                </select>
              </Field>
              <Field label="ประเภทภาษี">
                <select
                  className="po-input po-input-disabled"
                  disabled
                  value={vendor?.taxTypeName ?? "-"}
                >
                  <option>{vendor?.taxTypeName ?? "-"}</option>
                </select>
              </Field>
              <Field label="วันที่ส่งมอบ *">
                <input
                  className="po-input"
                  min={initialData?.documentDate ?? documentDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                  type="date"
                  value={deliveryDate}
                  disabled={readOnly}
                />
              </Field>
              <Field label="สถานที่ส่งของ">
                <input
                  className="po-input"
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder={readOnly ? "" : "ชื่อบริษัทและที่อยู่สำหรับจัดส่ง"}
                  type="text"
                  value={deliveryAddress}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          <section className="min-h-0 px-3.5 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionTitle number="02" title="รายการสั่งซื้อจาก PR" />
                <p className="mt-0.5 text-[10px] text-secondary">
                  เลือกเฉพาะรายการจาก PR ที่อนุมัติแล้ว
                </p>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <label className="relative w-[202px]">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                      size={14}
                    />
                    <input
                      className="h-[32px] w-full rounded-[2px] border border-outline-variant bg-background pl-9 pr-3 text-[10px] outline-none focus:border-primary"
                      onChange={(event) => setPickerQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadSourceItems();
                      }}
                      placeholder="ค้นหาเลขที่ PR หรือรายการ..."
                      value={pickerQuery}
                    />
                  </label>
                  <button
                    className="h-[32px] rounded-[2px] border border-primary px-4 text-[11px] font-bold text-primary"
                    onClick={() => loadSourceItems()}
                    type="button"
                  >
                    เลือกรายการจาก PR
                  </button>
                  <input
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      void handleImport(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    ref={importInputRef}
                    type="file"
                  />
                  <button
                    className="inline-flex h-[32px] items-center gap-2 rounded-[2px] border border-outline-variant px-3 text-[11px] font-bold"
                    onClick={() => importInputRef.current?.click()}
                    type="button"
                  >
                    <Image
                      alt=""
                      height={15}
                      src="/icon/icon-excel.svg"
                      width={15}
                    />
                    นำเข้าจาก Excel
                  </button>
                </div>
              )}
            </div>

            <div className="mt-2 overflow-hidden rounded-[2px] border border-outline-variant">
              <table className="w-full table-fixed border-collapse text-[9.5px]">
                <thead className="bg-[#f2f2f2] font-bold text-black dark:bg-white/[0.07] dark:text-white">
                  <tr className="h-[28px]">
                    <th className="w-[4%] px-1">ลำดับ</th>
                    <th className="w-[12%] px-1 text-left">อ้างอิง PR</th>
                    <th className="w-[9%] px-1 text-left">รหัส</th>
                    <th className="w-[26%] px-1 text-left">สินค้า</th>
                    <th className="w-[9%] px-1">จำนวนสั่งซื้อ</th>
                    <th className="w-[7%] px-1">หน่วย</th>
                    <th className="w-[11%] px-1">ราคาต่อหน่วย</th>
                    <th className="w-[8%] px-1">ส่วนลด</th>
                    <th className="w-[10%] px-1 text-right">จำนวนเงิน</th>
                    <th className="w-[4%] px-1">ลบ</th>
                  </tr>
                </thead>
                <tbody className="text-black dark:text-white">
                  {lines.map((line, index) => {
                    const lineAmount = Math.max(
                      (Number(line.quantity) || 0) *
                        (Number(line.unitPrice) || 0) -
                        (Number(line.discountAmount) || 0),
                      0,
                    );
                    return (
                      <tr
                        className="h-[35px] border-t border-outline-variant"
                        key={line.requisitionItemId}
                      >
                        <td className="px-1 text-center">{index + 1}</td>
                        <td className="truncate px-1 font-semibold">
                          {line.prNumber}
                        </td>
                        <td className="truncate px-1 font-bold text-primary">
                          {line.itemCode}
                        </td>
                        <td className="px-1 leading-[13px]" title={line.itemName}>
                          <span className="[overflow-wrap:anywhere]">{line.itemName}</span>
                        </td>
                        <td className="px-1">
                          <input
                            aria-label={`จำนวนสั่งซื้อ ${line.itemCode}`}
                            className="po-table-input text-right"
                            max={line.availableQuantity}
                            min="0"
                            onChange={(event) =>
                              updateLine(
                                line.requisitionItemId,
                                "quantity",
                                event.target.value,
                              )
                            }
                            step="any"
                            type="number"
                            value={line.quantity}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-1 text-center">{line.unitName}</td>
                        <td className="px-1">
                          <input
                            aria-label={`ราคาต่อหน่วย ${line.itemCode}`}
                            className="po-table-input text-right"
                            min="0"
                            onChange={(event) =>
                              updateLine(
                                line.requisitionItemId,
                                "unitPrice",
                                event.target.value,
                              )
                            }
                            step="0.01"
                            type="number"
                            value={line.unitPrice}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-1">
                          <input
                            aria-label={`ส่วนลด ${line.itemCode}`}
                            className="po-table-input text-right"
                            min="0"
                            onChange={(event) =>
                              updateLine(
                                line.requisitionItemId,
                                "discountAmount",
                                event.target.value,
                              )
                            }
                            step="0.01"
                            type="number"
                            value={line.discountAmount}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-1 text-right font-semibold">
                          {formatAmount(lineAmount)}
                        </td>
                        <td className="px-1 text-center">
                          <button
                            aria-label={`ลบ ${line.itemCode}`}
                            className="text-primary disabled:opacity-30"
                            onClick={() =>
                              setLines((current) =>
                                current.filter(
                                  (item) =>
                                    item.requisitionItemId !==
                                    line.requisitionItemId,
                                ),
                              )
                            }
                            disabled={readOnly}
                            type="button"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 8 - lines.length) }).map(
                    (_, index) => (
                      <tr
                        aria-hidden="true"
                        className="h-[35px] border-t border-outline-variant"
                        key={`empty-${index}`}
                      >
                        <td colSpan={10} />
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              <div className="flex h-[26px] items-center justify-end border-t border-outline-variant px-3 text-[10px] font-semibold">
                รวม {lines.length} รายการ
                <span className="mx-3 text-secondary">|</span>
                รวมจำนวน{" "}
                <strong className="mx-1 text-[13px] text-primary">
                  {totals.quantity.toLocaleString("th-TH")}
                </strong>{" "}
                หน่วย
              </div>
            </div>
          </section>

          <section className="grid border-t border-outline-variant lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-2.5">
              <Field label="หมายเหตุถึงผู้ขาย">
                <textarea
                  className="po-textarea"
                  onChange={(event) => setSupplierNote(event.target.value)}
                  placeholder={readOnly ? "" : "ระบุหมายเหตุที่ต้องการแสดงในใบสั่งซื้อ"}
                  value={supplierNote}
                  disabled={readOnly}
                />
              </Field>
              <p className="mt-2 text-[10px] text-on-surface-variant">
                เงื่อนไขเพิ่มเติมจะถูกดึงจากแม่แบบเริ่มต้นและบันทึกกับใบ PO โดยอัตโนมัติ
              </p>
            </div>
            <div className="border-l border-outline-variant bg-surface-container-low/25 px-3 py-2 text-[10.5px]">
              <SummaryRow label="รวมก่อนส่วนลด" value={totals.subtotal} />
              <SummaryRow label="ส่วนลด" value={totals.discount} />
              <SummaryRow
                label={`ภาษีมูลค่าเพิ่ม ${vendor?.taxRate ?? 0}%`}
                value={totals.tax}
              />
              <div className="mt-1 flex items-center justify-between border-t border-outline-variant pt-2">
                <span className="text-[15px] font-bold text-primary">
                  ยอดสุทธิ
                </span>
                <strong className="text-[20px] text-primary">
                  {formatAmount(totals.grandTotal)} บาท
                </strong>
              </div>
            </div>
          </section>
          </div>
        </div>

        {error ? (
          <p className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <footer className="flex min-h-[50px] shrink-0 flex-wrap items-center justify-between gap-2 border-t border-outline-variant px-3.5 py-2">
          {readOnly ? (
            <div />
          ) : (
            <button
              className="inline-flex h-[34px] items-center gap-2 rounded-[2px] border border-primary px-4 text-[12px] font-bold text-primary disabled:opacity-50"
              disabled={isPending}
              onClick={() => save("draft")}
              type="button"
            >
              <Save size={15} />
              {initialData ? "บันทึกการแก้ไข" : "บันทึกร่าง"}
            </button>
          )}
          <div className="flex gap-3">
            <button
              className="h-[34px] rounded-[2px] border border-outline-variant px-6 text-[12px] font-bold text-on-surface hover:bg-surface-container-high transition-colors"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              {readOnly ? "ปิด" : "ยกเลิก"}
            </button>
            {!readOnly && (
              <button
                className="inline-flex h-[34px] items-center gap-2 rounded-[2px] bg-primary px-7 text-[12px] font-bold text-white disabled:opacity-50"
                disabled={isPending}
                onClick={() => save("pending_approval")}
                type="button"
              >
                <Send size={15} />
                {isPending
                  ? "กำลังบันทึก..."
                  : initialData
                    ? "บันทึกและส่งอนุมัติ"
                    : "ส่งอนุมัติ"}
              </button>
            )}
          </div>
        </footer>
      </section>

      {pickerOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-0 sm:p-4">
          <section className="flex h-[100dvh] w-full max-w-[900px] flex-col overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[76vh] sm:rounded-[3px]">
            <header className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
              <div>
                <h3 className="text-[16px] font-bold">เลือกรายการจาก PR</h3>
                <p className="text-[10px] text-secondary">
                  แสดงเฉพาะ PR ที่อนุมัติแล้วและยังนำไปสั่งซื้อได้
                </p>
              </div>
              <button
                aria-label="ปิด"
                onClick={() => setPickerOpen(false)}
                type="button"
              >
                <X size={19} />
              </button>
            </header>
            <div className="flex gap-2 border-b border-outline-variant p-3">
              <label className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                  size={15}
                />
                <input
                  className="h-[34px] w-full rounded-[2px] border border-outline-variant bg-background pl-9 pr-3 text-[12px] outline-none focus:border-primary"
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder="ค้นหาเลขที่ PR, รหัส หรือชื่อรายการ"
                  value={pickerQuery}
                />
              </label>
              <button
                className="h-[34px] rounded-[2px] border border-primary px-4 text-[11px] font-bold text-primary"
                onClick={() => loadSourceItems()}
                type="button"
              >
                ค้นหา
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pickerItems.length === 0 ? (
                <p className="p-10 text-center text-[12px] text-secondary">
                  ไม่พบรายการ PR ที่พร้อมนำไปสร้าง PO
                </p>
              ) : (
                pickerGroups.map((group) => {
                  const selectableItems = group.items.filter(
                    (item) => !existingLineIds.has(item.requisitionItemId),
                  );
                  const selectedCount = selectableItems.filter((item) =>
                    selectedIds.has(item.requisitionItemId),
                  ).length;
                  const allSelected =
                    selectableItems.length > 0 &&
                    selectedCount === selectableItems.length;
                  const partiallySelected =
                    selectedCount > 0 && !allSelected;
                  const expanded = expandedPrIds.has(group.requisitionId);
                  const availableQuantity = group.items.reduce(
                    (sum, item) => sum + item.availableQuantity,
                    0,
                  );

                  return (
                    <div
                      className="border-b border-outline-variant"
                      key={group.requisitionId}
                    >
                      <div className="grid min-h-[48px] grid-cols-[38px_1fr_120px_120px_42px] items-center gap-2 bg-surface-container-lowest px-3 text-[11px]">
                        <button
                          aria-label={`เลือกทุกรายการใน ${group.prNumber}`}
                          className={`grid h-5 w-5 place-items-center rounded-[2px] border disabled:cursor-not-allowed disabled:opacity-40 ${
                            allSelected || partiallySelected
                              ? "border-primary bg-primary text-white"
                              : "border-outline-variant bg-surface-container-lowest"
                          }`}
                          disabled={selectableItems.length === 0}
                          onClick={() => togglePrSelection(group)}
                          type="button"
                        >
                          {allSelected ? (
                            <Check size={13} />
                          ) : partiallySelected ? (
                            <Minus size={13} />
                          ) : null}
                        </button>
                        <div className="min-w-0">
                          <strong className="block truncate text-[12px] text-on-surface">
                            {group.prNumber}
                          </strong>
                          <span className="text-[10px] text-secondary">
                            {selectableItems.length === 0
                              ? "เพิ่มรายการจากเอกสารนี้แล้ว"
                              : `พร้อมสั่งซื้อ ${selectableItems.length} จาก ${group.items.length} รายการ`}
                          </span>
                        </div>
                        <span className="text-secondary">
                          ต้องการใช้{" "}
                          <strong className="text-on-surface">
                            {group.neededByDate || "-"}
                          </strong>
                        </span>
                        <span className="text-right text-secondary">
                          คงเหลือรวม{" "}
                          <strong className="text-on-surface">
                            {availableQuantity.toLocaleString("th-TH")}
                          </strong>
                        </span>
                        <button
                          aria-expanded={expanded}
                          aria-label={
                            expanded
                              ? `ซ่อนรายการ ${group.prNumber}`
                              : `ดูรายการ ${group.prNumber}`
                          }
                          className="grid h-8 w-8 place-items-center rounded-[2px] text-on-surface hover:bg-surface-container-lowest"
                          onClick={() => togglePrExpanded(group.requisitionId)}
                          type="button"
                        >
                          {expanded ? (
                            <ChevronDown size={17} />
                          ) : (
                            <ChevronRight size={17} />
                          )}
                        </button>
                      </div>

                      {expanded ? (
                        <div className="bg-surface-container-lowest">
                          {group.items.map((item) => {
                            const checked = selectedIds.has(
                              item.requisitionItemId,
                            );
                            const alreadyAdded = existingLineIds.has(
                              item.requisitionItemId,
                            );
                            return (
                              <button
                                className="grid w-full grid-cols-[38px_95px_70px_1fr_90px] items-center border-t border-outline-variant/70 px-3 py-2 text-left text-[11px] hover:bg-surface-container-low disabled:opacity-45"
                                disabled={alreadyAdded}
                                key={item.requisitionItemId}
                                onClick={() =>
                                  setSelectedIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(item.requisitionItemId)) {
                                      next.delete(item.requisitionItemId);
                                    } else {
                                      next.add(item.requisitionItemId);
                                    }
                                    return next;
                                  })
                                }
                                type="button"
                              >
                                <span
                                  className={`grid h-5 w-5 place-items-center rounded-[2px] border ${
                                    checked
                                      ? "border-primary bg-primary text-white"
                                      : "border-outline-variant"
                                  }`}
                                >
                                  {checked ? <Check size={13} /> : null}
                                </span>
                                <strong className="text-primary">
                                  {item.itemCode}
                                </strong>
                                <span className="justify-self-start">
                                  <ItemTypeBadge code={item.itemTypeCode} />
                                </span>
                                <span className="pr-3 leading-5 [overflow-wrap:anywhere]">
                                  {item.itemName}
                                </span>
                                <span className="text-right">
                                  {item.availableQuantity.toLocaleString(
                                    "th-TH",
                                  )}{" "}
                                  {item.unitName}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-outline-variant px-4 py-3 text-[11px]">
              <span>เลือกแล้ว {selectedIds.size} รายการ</span>
              <div className="flex gap-2">
                <button
                  className="h-[32px] rounded-[2px] border border-outline-variant px-4 font-bold"
                  onClick={() => setPickerOpen(false)}
                  type="button"
                >
                  ยกเลิก
                </button>
                <button
                  className="h-[32px] rounded-[2px] bg-primary px-4 font-bold text-white disabled:opacity-50"
                  disabled={selectedIds.size === 0}
                  onClick={addSelectedItems}
                  type="button"
                >
                  เพิ่มรายการ
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .po-input {
          height: 32px;
          width: 100%;
          border: 1px solid var(--outline-variant-color);
          border-radius: 2px;
          background: var(--surface-container-lowest-color);
          padding: 0 9px;
          color: var(--on-surface-color);
          font-size: 11px;
          font-weight: 500;
          outline: none;
        }
        .po-input-disabled {
          background: var(--surface-container-low-color);
          color: var(--secondary-color);
          opacity: 1;
        }
        .po-input:focus,
        .po-table-input:focus,
        .po-textarea:focus {
          border-color: var(--primary-color);
        }
        .po-table-input {
          height: 24px;
          width: 100%;
          border: 1px solid var(--outline-variant-color);
          border-radius: 2px;
          background: var(--surface-container-lowest-color);
          padding: 0 5px;
          color: var(--on-surface-color);
          font-size: 9.5px;
          outline: none;
        }
        .po-textarea {
          height: 43px;
          width: 100%;
          resize: none;
          border: 1px solid var(--outline-variant-color);
          border-radius: 2px;
          background: var(--surface-container-lowest-color);
          padding: 5px 8px;
          color: var(--on-surface-color);
          font-size: 9.5px;
          line-height: 1.35;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function Field({
  children,
  className = "",
  hint,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  hint?: string;
  label: string;
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="block text-[10px] font-bold text-on-surface">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[9px] leading-none text-secondary">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-bold text-primary">{number}</span>
      <h3 className="text-[13px] font-bold text-on-surface">{title}</h3>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant py-1.5">
      <span>{label}</span>
      <span className="font-semibold">{formatAmount(value)} บาท</span>
    </div>
  );
}
