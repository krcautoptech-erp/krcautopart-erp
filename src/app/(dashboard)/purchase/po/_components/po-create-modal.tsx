"use client";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/use-body-scroll-lock";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
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
  getLatestPurchasePricesAction,
  searchPurchaseOrderSourceItemsAction,
  updatePurchaseOrderAction,
} from "@/app/actions/purchase-orders";
import type {
  PurchaseOrderEditData,
  PurchasePriceReference,
  PurchaseOrderSourceItem,
  PurchaseOrderVendor,
} from "@/lib/purchase-orders";
import { applyLatestPurchasePrices } from "@/lib/purchase-orders";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { focusKeyboardTarget, runEnterAction } from "@/components/keyboard-workflow";
import { CompanyFormLogo } from "@/components/company-logo";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges, useUnsavedChangesContext } from "@/components/unsaved-changes";

type EditableLine = PurchaseOrderSourceItem & {
  deliveryDate: string;
  discountAmount: string;
  quantity: string;
  remarks: string;
  taxRate: string;
  unitPrice: string;
  priceReference?: PurchasePriceReference | null;
};

type PurchaseRequisitionGroup = {
  items: PurchaseOrderSourceItem[];
  neededByDate: string;
  prNumber: string;
  requisitionId: number;
};

import { DocumentMobileItemToolbar, DocumentMobileWorkspace, DocumentEntryTable, DocumentFormFooter, DocumentProductName, type SavedDocument } from "@/components/document-form";

type PoCreateModalProps = {
  onPrint: (id: number) => Promise<void>;
  onNext: () => void;
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
  onPrint,
  onNext,
  vendors,
  readOnly: initialReadOnly = false,
}: PoCreateModalProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const saveLock = useRef(false);
  const readOnly = initialReadOnly || Boolean(saved);
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
  const [mobileSelectedOpen, setMobileSelectedOpen] = useState(true);
  const [error, setError] = useState("");
  const [reservedPoNumber, setReservedPoNumber] = useState(
    initialData?.poNumber ?? "",
  );

  const vendorById = useMemo(
    () => new Map(vendors.map((item) => [item.id, item])),
    [vendors],
  );
  const vendor = vendorById.get(vendorId) ?? vendors[0];
  const [loadingDraft, setLoadingDraft] = useState(false);
  const draftValue = {
    vendorId, deliveryDate, deliveryAddress, supplierNote,
    lines: lines.map(({ requisitionItemId, prNumber, deliveryDate, discountAmount, quantity, remarks, taxRate, unitPrice }) =>
      ({ requisitionItemId, prNumber, deliveryDate, discountAmount, quantity, remarks, taxRate, unitPrice })),
  };
  const [initialDraftValue] = useState(() => draftValue);
  const draftKey = `purchase-po:${initialData?.id ?? "new"}`;
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: draftKey,
    value: draftValue,
    initialValue: initialDraftValue,
    revision: JSON.stringify(initialData ?? null),
    enabled: !readOnly,
    onRestore: async (draft) => {
      if (!vendorById.has(draft.vendorId)) throw new Error("ผู้ขายในข้อมูลที่กู้คืนไม่สามารถเลือกได้แล้ว");
      if (new Set(draft.lines.map((line) => line?.requisitionItemId)).size !== draft.lines.length || draft.lines.some((line) =>
        !line || !Number.isSafeInteger(line.requisitionItemId) || line.requisitionItemId <= 0 ||
        [line.prNumber, line.deliveryDate, line.discountAmount, line.quantity, line.remarks, line.taxRate, line.unitPrice].some((value) => typeof value !== "string"))) {
        throw new Error("รายการในฉบับร่างไม่สมบูรณ์ ไม่สามารถกู้คืนได้");
      }
      setLoadingDraft(true);
      try {
        const results = await Promise.all([...new Set(draft.lines.map((line) => line.prNumber))].map((number) => searchPurchaseOrderSourceItemsAction(number)));
        const failure = results.find((result) => !result.success);
        if (failure) throw new Error(failure.error);
        const sourceById = new Map([...results.flatMap((result) => result.items), ...(initialData?.lines ?? [])].map((line) => [line.requisitionItemId, line]));
        const restored = draft.lines.map(({ requisitionItemId, deliveryDate, discountAmount, quantity, remarks, taxRate, unitPrice }) => {
          const source = sourceById.get(requisitionItemId);
          if (!source) throw new Error("มีรายการ PR ที่ไม่สามารถเลือกได้แล้ว กรุณาตรวจสอบข้อมูลก่อนกู้คืน");
          return { ...source, deliveryDate, discountAmount, quantity, remarks, taxRate, unitPrice };
        });
        setVendorId(draft.vendorId);
        setDeliveryDate(draft.deliveryDate);
        setDeliveryAddress(draft.deliveryAddress);
        setSupplierNote(draft.supplierNote);
        setLines(restored);
        setError(restored.some((line) => Number(line.quantity) > line.availableQuantity)
          ? "จำนวนในข้อมูลที่กู้คืนเกินจำนวน PR ที่ค้างสั่งซื้อ กรุณาตรวจสอบก่อนบันทึก" : "");
      } finally { setLoadingDraft(false); }
    },
  });
  useUnsavedChanges(draftKey, hasChanges && !readOnly);
  const { requestNavigation } = useUnsavedChangesContext();
  const closeForm = () => { if (!loadingDraft) requestNavigation(onClose); };
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
  const selectedPickerGroups = useMemo(
    () =>
      groupPurchaseRequisitions(
        pickerItems.filter((item) => selectedIds.has(item.requisitionItemId)),
      ),
    [pickerItems, selectedIds],
  );

  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
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
      setMobileSelectedOpen(true);
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
        deliveryDate,
        discountAmount: "0",
        quantity: String(item.availableQuantity),
        remarks: "",
        taxRate: String(taxRate),
        unitPrice: "",
      }));
    startTransition(async () => {
      const result = await getLatestPurchasePricesAction(
        vendorId,
        selected.map((item) => item.requisitionItemId),
      );
      const priced = applyLatestPurchasePrices(
        selected,
        result.success ? result.prices : [],
      );
      if (!result.success) setError(result.error);
      setLines((current) => [...current, ...priced]);
      setPickerOpen(false);
      if (selected[0]) focusKeyboardTarget(`po-quantity-${selected[0].requisitionItemId}`);
    });
  };

  const changeVendor = (nextVendorId: number) => {
    setVendorId(nextVendorId);
    if (lines.length === 0) return;
    startTransition(async () => {
      const result = await getLatestPurchasePricesAction(
        nextVendorId,
        lines.map((line) => line.requisitionItemId),
      );
      if (!result.success) setError(result.error);
      const nextTaxRate = vendorById.get(nextVendorId)?.taxRate ?? 0;
      setLines((current) =>
        applyLatestPurchasePrices(current, result.success ? result.prices : []).map(
          (line) => ({ ...line, taxRate: String(nextTaxRate) }),
        ),
      );
    });
  };

  const updateLine = (
    requisitionItemId: number,
    key: "deliveryDate" | "discountAmount" | "quantity" | "remarks" | "unitPrice",
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

  const togglePickerItem = (requisitionItemId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(requisitionItemId)) next.delete(requisitionItemId);
      else next.add(requisitionItemId);
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
    if (saveLock.current || saved || readOnly || isPending || loadingDraft) return;
    setError("");
    if (!reservedPoNumber) {
      setError("ระบบยังไม่สามารถสร้างเลขใบสั่งซื้อได้");
      return;
    }

    saveLock.current = true;
    startTransition(async () => {
      try {
      const submission = {
        deliveryAddress,
        deliveryDate,
        documentDate: initialData?.documentDate ?? documentDate,
        items: lines.map((line) => ({
          deliveryDate: line.deliveryDate,
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
      clearDraft();
      setSaved({ id: result.poId, number: result.poNumber });
      setReservedPoNumber(result.poNumber);
      onSaved(
        initialData
          ? `บันทึกการแก้ไข ${result.poNumber} เรียบร้อยแล้ว`
          : status === "draft"
          ? `บันทึกร่าง ${result.poNumber} เรียบร้อยแล้ว`
          : `สร้าง ${result.poNumber} และส่งอนุมัติเรียบร้อยแล้ว`,
      );
      } catch { setError("ไม่สามารถยืนยันผลการบันทึก กรุณาตรวจสอบรายการก่อนลองอีกครั้ง"); }
      finally { saveLock.current = false; }
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:p-3">
      <section
        aria-label={readOnly ? "รายละเอียดใบสั่งซื้อ" : initialData ? "แก้ไขใบสั่งซื้อ" : "สร้างใบสั่งซื้อ"}
        className="document-form document-po-form flex h-[100dvh] w-full max-w-[1088px] flex-col overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-2xl sm:h-[calc(100dvh-24px)] sm:max-h-[843px] sm:w-[calc(100vw-24px)] sm:rounded-[2px]"
      >
        <header className="document-form-header flex h-[44px] shrink-0 items-center justify-between border-b border-outline-variant px-3.5">
          <div className="flex items-center gap-3.5">
            <CompanyFormLogo className="document-brand" />
            <span className="h-7 w-px bg-outline-variant" />
            <h2 className="text-[16px] font-bold text-on-surface">
              {readOnly ? "รายละเอียดใบสั่งซื้อ (PO)" : initialData ? "แก้ไขใบสั่งซื้อ (PO)" : "สร้างใบสั่งซื้อ (PO)"}
            </h2>
            {!saved && !initialData && <span className="document-po-unsaved">ยังไม่บันทึก</span>}
          </div>
          <button
            aria-label="ปิด"
            className="grid h-8 w-8 place-items-center text-on-surface hover:text-primary"
            onClick={closeForm}
            disabled={isPending}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        {draftPrompt}
        <DocumentMobileWorkspace><div className="min-h-0 flex-1 overflow-y-auto">
          <fieldset disabled={isPending || loadingDraft || Boolean(saved)} className="document-form-locked document-form-body">
          <section className="document-metadata-section border-b border-outline-variant px-3.5 py-2">

            <div className="document-fields document-fields-po">
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
              <Field label="วันที่เอกสาร *">
                <input
                  className="po-input"
                  disabled
                  type="date"
                  value={initialData?.documentDate ?? documentDate}
                />
              </Field>
              <Field className="vendor" label="ผู้ขาย *">
                <select
                  className="po-input"
                  onChange={(event) => changeVendor(Number(event.target.value))}
                  value={vendorId}
                  disabled={readOnly || isPending}
                >
                  {vendors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.vendorName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field hint="ระบบกำหนดจากผู้ใช้งาน" label="ผู้จัดซื้อ *">
                <input className="po-input po-input-disabled" disabled value={buyerName} />
              </Field>
              <Field className="delivery" label="วันที่ส่งมอบหลัก *">
                <input
                  className="po-input"
                  min={initialData?.documentDate ?? documentDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setLines((current) =>
                      current.map((line) =>
                        line.deliveryDate === deliveryDate
                          ? { ...line, deliveryDate: nextDate }
                          : line,
                      ),
                    );
                    setDeliveryDate(nextDate);
                  }}
                  type="date"
                  value={deliveryDate}
                  disabled={readOnly}
                />
              </Field>
              <Field className="tax" label="ประเภทภาษี *">
                <select className="po-input po-input-disabled" disabled value={vendor?.taxTypeName ?? "-"}>
                  <option>{vendor?.taxTypeName ?? "-"}</option>
                </select>
              </Field>
              <Field label="เครดิตเทอม *">
                <select
                  className="po-input po-input-disabled"
                  disabled
                  value={vendor?.creditTermName ?? "-"}
                >
                  <option>{vendor?.creditTermName ?? "-"}</option>
                </select>
              </Field>
              <Field label="วิธีชำระเงิน *">
                <select
                  className="po-input po-input-disabled"
                  disabled
                  value={vendor?.paymentMethodName ?? "-"}
                >
                  <option>{vendor?.paymentMethodName ?? "-"}</option>
                </select>
              </Field>
              <Field className="address" label="สถานที่ส่งของ">
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

          <section className="document-items-section min-h-0 px-3.5 py-2">
            <DocumentMobileItemToolbar onAdd={() => loadSourceItems()} disabled={readOnly || isPending} search={<input aria-label="ค้นหา PR หรือรายการ" placeholder="ค้นหา PR หรือรายการ" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} onKeyDown={(event) => runEnterAction(event, () => loadSourceItems())} />} />
            <div className="document-toolbar document-desktop-toolbar">
              <div className="document-po-section-heading">
                <SectionTitle number="02" title="รายการสั่งซื้อจาก PR" />
                <p className="mt-0.5 text-[10px] text-secondary">
                  เลือกเฉพาะรายการจาก PR ที่อนุมัติแล้ว
                </p>
              </div>
              {!readOnly && (
                <div className="po-item-toolbar flex items-center gap-2">
                  <label className="relative w-[202px]">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                      size={14}
                    />
                    <input
                      className="h-[32px] w-full rounded-[2px] border border-outline-variant bg-background pl-9 pr-3 text-[10px] outline-none focus:border-primary"
                      onChange={(event) => setPickerQuery(event.target.value)}
                      onKeyDown={(event) => {
                        runEnterAction(event, () => loadSourceItems());
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
                </div>
              )}
            </div>
            <p className="document-po-delivery-hint">วันที่ส่งมอบหลักจะใช้กับรายการใหม่ และสามารถแก้รายบรรทัดได้</p>

            <div className="document-table-scroll mt-2 rounded-[2px] border border-outline-variant">
              <DocumentEntryTable className="document-po-table w-full table-fixed border-collapse">
                <thead className="bg-[#f2f2f2] font-bold text-black dark:bg-white/[0.07] dark:text-white">
                  <tr className="h-[28px]">
                    <th className="w-[4%] px-1">ลำดับ</th>
                    <th className="w-[10%] px-1 text-left">อ้างอิง PR</th>
                    <th className="w-[8%] px-1 text-left">รหัส</th>
                    <th className="w-[20%] px-1 text-left">สินค้า / รายการ</th>
                    <th className="w-[9%] px-1">จำนวนสั่งซื้อ</th>
                    <th className="w-[6%] px-1">หน่วย</th>
                    <th className="w-[12%] px-1">กำหนดส่ง</th>
                    <th className="w-[9%] px-1">ราคา/หน่วย</th>
                    <th className="w-[7%] px-1">ส่วนลด</th>
                    <th className="w-[11%] px-1 text-right">จำนวนเงิน</th>
                    <th className="w-[4%] px-1"><span className="sr-only">ลบรายการ</span></th>
                  </tr>
                </thead>
                <tbody className="text-black dark:text-white">
                  {lines.map((line, index) => {
                    const priceDifference = line.priceReference
                      ? (Number(line.unitPrice) || 0) - line.priceReference.unitPrice
                      : 0;
                    const lineAmount = Math.max(
                      (Number(line.quantity) || 0) *
                        (Number(line.unitPrice) || 0) -
                        (Number(line.discountAmount) || 0),
                      0,
                    );
                    return (
                      <tr
                        className="min-h-[44px] border-t border-outline-variant"
                        key={line.requisitionItemId}
                      >
                        <td className="px-1 text-center">{index + 1}</td>
                        <td className="px-1 font-semibold">
                          {line.prNumber}
                        </td>
                        <td className="px-1 font-bold text-primary">
                          {line.itemCode}
                        </td>
                        <td className="px-1 py-1 leading-[18px]" title={line.itemName}>
                          <DocumentProductName name={line.itemName} />
                        </td>
                        <td className="px-1">
                          <input
                            aria-label={`จำนวนสั่งซื้อ ${line.itemCode}`}
                            className="po-table-input text-right"
                            data-keyboard-target={`po-quantity-${line.requisitionItemId}`}
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
                        <td className="px-1 text-center"><span className="document-unit-value">{line.unitName}</span></td>
                        <td className="px-1">
                          <input
                            aria-label={`กำหนดส่ง ${line.itemCode}`}
                            className="po-table-input"
                            min={initialData?.documentDate ?? documentDate}
                            onChange={(event) =>
                              updateLine(
                                line.requisitionItemId,
                                "deliveryDate",
                                event.target.value,
                              )
                            }
                            type="date"
                            value={line.deliveryDate}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="px-1">
                          <input
                            aria-label={`ราคาต่อหน่วย ${line.itemCode}`}
                            className="po-table-input text-right"
                            min="0.01"
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
                          {line.priceReference ? (
                            <small className="mt-0.5 block truncate text-[8px] leading-3 text-secondary" title={`ราคาล่าสุดจาก ${line.priceReference.poNumber} วันที่ ${formatDisplayDate(line.priceReference.documentDate)}`}>
                              {Math.abs(priceDifference) < 0.0001
                                ? `ล่าสุด ${line.priceReference.poNumber} · ${formatDisplayDate(line.priceReference.documentDate)}`
                                : `ต่างจาก ${line.priceReference.poNumber} ${priceDifference > 0 ? "+" : ""}${formatAmount(priceDifference)}`}
                            </small>
                          ) : !readOnly ? (
                            <small className="mt-0.5 block text-[8px] leading-3 text-secondary">ไม่พบราคาเดิม</small>
                          ) : null}
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

                </tbody>
              </DocumentEntryTable>
              <div className="document-po-table-summary flex h-[26px] items-center justify-end border-t border-outline-variant px-3 text-[10px] font-semibold">
                รวม {lines.length} รายการ
                <span className="mx-3 text-secondary">|</span>
                รวมจำนวน{" "}
                <strong className="mx-1 text-[13px] text-primary">
                  {totals.quantity.toLocaleString("th-TH")}
                </strong>{" "}
                หน่วย
              </div>
            </div>
            {!readOnly && (
              <button className="document-po-add-item" onClick={() => loadSourceItems()} type="button">
                <Plus aria-hidden="true" size={16} /> เพิ่มรายการ
              </button>
            )}
          </section>

          <section className="document-items-section document-po-bottom grid gap-6 border-t border-outline-variant lg:grid-cols-[1.6fr_1fr]">
            <div className="p-2.5">
              <label className="document-po-note">
                <span>หมายเหตุถึงผู้ขาย</span>
                <textarea
                  className="po-textarea"
                  maxLength={1000}
                  onChange={(event) => setSupplierNote(event.target.value)}
                  placeholder={readOnly ? "" : "ระบุหมายเหตุที่ต้องการแสดงในใบสั่งซื้อ"}
                  value={supplierNote}
                  disabled={readOnly}
                />
              </label>
              <p className="document-po-note-count">{1000 - supplierNote.length} ตัวอักษรที่เหลือ</p>
            </div>
            <div className="document-totals px-3 py-2">
              <SummaryRow label="มูลค่าสินค้า" value={totals.subtotal} />
              <SummaryRow label="ส่วนลดรวม" value={totals.discount} />
              <SummaryRow label="มูลค่าก่อนภาษี" value={totals.grandTotal - totals.tax} />
              <SummaryRow
                label={`ภาษีมูลค่าเพิ่ม (${vendor?.taxRate ?? 0}%)`}
                value={totals.tax}
              />
              <div className="mt-1 flex items-center justify-between border-t border-outline-variant pt-2">
                <span className="text-[15px] font-bold text-primary">
                  ยอดรวมทั้งสิ้น
                </span>
                <strong className="text-[20px] text-primary">
                  {formatAmount(totals.grandTotal)}
                </strong>
              </div>
            </div>
          </section>
          </fieldset>
        </div></DocumentMobileWorkspace>

        {error ? (
          <p className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <DocumentFormFooter saved={saved} pending={isPending || loadingDraft} summary={<>{lines.length} รายการ · {formatAmount(totals.grandTotal)} บาท</>} onClose={closeForm} onPrint={onPrint} onNext={onNext}>
          {!readOnly && <><button type="button" disabled={isPending} onClick={() => save("draft")}><Save size={15} className="inline mr-2" />{initialData ? "บันทึกการแก้ไข" : "บันทึกร่าง"}</button><button className="primary" type="button" disabled={isPending} onClick={() => save("pending_approval")}><Send size={15} className="inline mr-2" />{isPending ? "กำลังบันทึก..." : "ส่งอนุมัติ"}</button></>}
        </DocumentFormFooter>
      </section>

      {pickerOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-0 sm:p-4">
          <section
            aria-labelledby="po-pr-picker-title"
            aria-modal="true"
            className="po-pr-picker"
            role="dialog"
          >
            <header className="po-pr-picker-header">
              <div>
                <h3 id="po-pr-picker-title">เลือกรายการจาก PR</h3>
                <p>
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
            <nav aria-label="ขั้นตอนเลือกรายการ" className="po-pr-picker-steps">
              <span className="active"><b>1</b>เลือกรายการ</span>
              <span><b>2</b>ตรวจสอบ</span>
            </nav>
            <div className="po-pr-picker-body">
              <main className="po-pr-picker-main">
                <div className="po-pr-picker-search">
                  <label>
                    <Search aria-hidden="true" size={19} />
                    <input
                      autoFocus
                      onChange={(event) => setPickerQuery(event.target.value)}
                      onKeyDown={(event) => runEnterAction(event, () => loadSourceItems())}
                      placeholder="ค้นหาเลขที่ PR รหัส หรือชื่อสินค้า"
                      value={pickerQuery}
                    />
                  </label>
                  <button onClick={() => loadSourceItems()} type="button">ค้นหา</button>
                </div>
                <div className="po-pr-results">
                  {pickerItems.length === 0 ? (
                    <p className="po-pr-empty">ไม่พบรายการ PR ที่พร้อมนำไปสร้าง PO</p>
                  ) : (
                    pickerGroups.map((group) => {
                      const selectableItems = group.items.filter(
                        (item) => !existingLineIds.has(item.requisitionItemId),
                      );
                      const selectedCount = selectableItems.filter((item) =>
                        selectedIds.has(item.requisitionItemId),
                      ).length;
                      const allSelected = selectableItems.length > 0 && selectedCount === selectableItems.length;
                      const partiallySelected = selectedCount > 0 && !allSelected;
                      const expanded = expandedPrIds.has(group.requisitionId);
                      const availableQuantity = group.items.reduce(
                        (sum, item) => sum + item.availableQuantity,
                        0,
                      );

                      return (
                        <section className="po-pr-document" key={group.requisitionId}>
                          <div className="po-pr-group">
                            <button
                              aria-label={`เลือกทุกรายการใน ${group.prNumber}`}
                              className={`po-pr-check ${allSelected || partiallySelected ? "checked" : ""}`}
                              disabled={selectableItems.length === 0}
                              onClick={() => togglePrSelection(group)}
                              type="button"
                            >
                              {allSelected ? <Check size={14} /> : partiallySelected ? <Minus size={14} /> : null}
                            </button>
                            <div className="po-pr-group-title">
                              <strong>{group.prNumber}</strong>
                              <span>
                                {selectableItems.length === 0
                                  ? "เพิ่มรายการจากเอกสารนี้แล้ว"
                                  : `พร้อมสั่งซื้อ ${selectableItems.length} รายการ`}
                              </span>
                            </div>
                            <span className="po-pr-date">ต้องการใช้ <strong>{formatDisplayDate(group.neededByDate)}</strong></span>
                            <span className="po-pr-available">รวมที่ยังสั่งได้ <strong>{availableQuantity.toLocaleString("th-TH")}</strong></span>
                            <button
                              aria-expanded={expanded}
                              aria-label={expanded ? `ซ่อนรายการ ${group.prNumber}` : `ดูรายการ ${group.prNumber}`}
                              className="po-pr-expand"
                              onClick={() => togglePrExpanded(group.requisitionId)}
                              type="button"
                            >
                              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>
                          </div>

                          {expanded ? (
                            <div className="po-pr-lines">
                              <div aria-hidden="true" className="po-pr-line po-pr-line-head">
                                <span />
                                <span>รหัสสินค้า</span>
                                <span>ชื่อสินค้า</span>
                                <span>จำนวนที่ยังสั่งได้</span>
                                <span>หน่วย</span>
                                <span>ต้องการใช้</span>
                              </div>
                              {group.items.map((item) => {
                                const checked = selectedIds.has(item.requisitionItemId);
                                const alreadyAdded = existingLineIds.has(item.requisitionItemId);
                                return (
                                  <button
                                    className={`po-pr-line po-pr-item ${checked ? "selected" : ""}`}
                                    disabled={alreadyAdded}
                                    key={item.requisitionItemId}
                                    onClick={() => togglePickerItem(item.requisitionItemId)}
                                    type="button"
                                  >
                                    <span className={`po-pr-check ${checked ? "checked" : ""}`}>{checked ? <Check size={14} /> : null}</span>
                                    <strong>{item.itemCode}</strong>
                                    <span className="po-pr-item-name">{item.itemName}</span>
                                    <span className="po-pr-item-quantity" data-label="จำนวนที่ยังสั่งได้">{item.availableQuantity.toLocaleString("th-TH")}</span>
                                    <span className="po-pr-item-unit">{item.unitName}</span>
                                    <span className="po-pr-item-date">{formatDisplayDate(item.neededByDate || group.neededByDate)}</span>
                                    {checked ? <X aria-hidden="true" className="po-pr-mobile-remove" size={17} /> : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      );
                    })
                  )}
                </div>
              </main>

              <aside aria-label="รายการที่เลือก" className={`po-pr-selected ${selectedIds.size > 0 ? "has-items" : ""} ${mobileSelectedOpen ? "" : "mobile-collapsed"}`}>
                <button
                  aria-expanded={mobileSelectedOpen}
                  aria-label={mobileSelectedOpen ? "ยุบรายการที่เลือก" : "ขยายรายการที่เลือก"}
                  className="po-pr-selected-handle"
                  onClick={() => setMobileSelectedOpen((current) => !current)}
                  type="button"
                />
                <header>
                  <button
                    aria-expanded={mobileSelectedOpen}
                    className="po-pr-selected-toggle"
                    onClick={() => setMobileSelectedOpen((current) => !current)}
                    type="button"
                  >
                    <strong>รายการที่เลือก ({selectedIds.size})</strong>
                    {mobileSelectedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} type="button">ล้างทั้งหมด</button>
                </header>
                <div className="po-pr-selected-list">
                  {selectedPickerGroups.map((group) => (
                    <section key={group.requisitionId}>
                      <div className="po-pr-selected-group">
                        <strong>{group.prNumber}</strong>
                        <span>{group.items.length} รายการ</span>
                        <ChevronDown aria-hidden="true" size={16} />
                      </div>
                      {group.items.map((item) => (
                        <div className="po-pr-selected-item" key={item.requisitionItemId}>
                          <strong>{item.itemCode}</strong>
                          <button aria-label={`นำ ${item.itemCode} ออกจากรายการที่เลือก`} onClick={() => togglePickerItem(item.requisitionItemId)} type="button"><X size={16} /></button>
                          <span>{item.itemName}</span>
                          <small>จำนวน {item.availableQuantity.toLocaleString("th-TH")} {item.unitName} <i /> ต้องการใช้ {formatDisplayDate(item.neededByDate || group.neededByDate)}</small>
                        </div>
                      ))}
                    </section>
                  ))}
                  {selectedIds.size === 0 ? <p>เลือกรายการจาก PR เพื่อเพิ่มเข้าใบสั่งซื้อ</p> : null}
                </div>
              </aside>
            </div>
            <footer className="po-pr-picker-footer">
              <strong>เลือกแล้ว {selectedIds.size} รายการ</strong>
              <div>
                <button className="secondary" onClick={() => setPickerOpen(false)} type="button">ยกเลิก</button>
                <button className="primary" disabled={selectedIds.size === 0 || isPending} onClick={addSelectedItems} type="button">
                  {isPending ? "กำลังตรวจสอบราคา..." : `เพิ่ม ${selectedIds.size} รายการ`}
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
        .po-pr-picker {
          position: relative;
          display: flex;
          height: min(860px, calc(100dvh - 32px));
          width: min(1120px, calc(100vw - 32px));
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--outline-variant-color);
          border-radius: 5px;
          background: var(--surface-container-lowest-color);
          color: var(--on-surface-color);
          box-shadow: 0 18px 60px #0005;
        }
        .po-pr-picker-header {
          display: flex;
          min-height: 82px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--outline-variant-color);
          padding: 13px 22px;
        }
        .po-pr-picker-header h3 { font-size: 25px; font-weight: 750; line-height: 1.2; }
        .po-pr-picker-header p { margin-top: 3px; color: var(--secondary-color); font-size: 13px; }
        .po-pr-picker-header > button { display: grid; height: 38px; width: 38px; place-items: center; }
        .po-pr-picker-steps {
          display: flex;
          min-height: 50px;
          align-items: stretch;
          gap: 38px;
          border-bottom: 1px solid var(--outline-variant-color);
          padding-inline: 22px;
        }
        .po-pr-picker-steps span {
          display: flex;
          min-width: 196px;
          align-items: center;
          gap: 12px;
          border-bottom: 3px solid transparent;
          color: var(--secondary-color);
          font-size: 14px;
          font-weight: 650;
        }
        .po-pr-picker-steps span.active { border-bottom-color: var(--primary-color); color: var(--primary-color); }
        .po-pr-picker-steps b {
          display: grid;
          height: 28px;
          width: 28px;
          place-items: center;
          border-radius: 50%;
          background: var(--outline-variant-color);
          color: var(--surface-container-lowest-color);
          font-size: 14px;
        }
        .po-pr-picker-steps .active b { background: var(--primary-color); color: white; }
        .po-pr-picker-body { display: grid; min-height: 0; flex: 1; grid-template-columns: minmax(0, 1fr) 318px; }
        .po-pr-picker-main { display: flex; min-width: 0; flex-direction: column; overflow: hidden; }
        .po-pr-picker-search {
          display: grid;
          min-height: 70px;
          grid-template-columns: minmax(0, 1fr) 84px;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--outline-variant-color);
          padding: 10px 20px;
        }
        .po-pr-picker-search label {
          display: flex;
          height: 42px;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--primary-color);
          border-radius: 3px;
          padding: 0 13px;
        }
        .po-pr-picker-search input { min-width: 0; flex: 1; background: transparent; outline: 0; font-size: 14px; }
        .po-pr-picker-search > button {
          height: 42px;
          border: 1px solid var(--primary-color);
          border-radius: 3px;
          color: var(--primary-color);
          font-size: 14px;
          font-weight: 700;
        }
        .po-pr-results { min-height: 0; flex: 1; overflow-y: auto; }
        .po-pr-empty { padding: 48px 16px; text-align: center; color: var(--secondary-color); font-size: 14px; }
        .po-pr-document { border-bottom: 1px solid var(--outline-variant-color); }
        .po-pr-group {
          display: grid;
          min-height: 60px;
          grid-template-columns: 34px minmax(180px, 1fr) 155px 155px 34px;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
        }
        .po-pr-check {
          display: grid;
          height: 22px;
          width: 22px;
          flex: 0 0 auto;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--outline-variant-color));
          border-radius: 3px;
          background: var(--surface-container-lowest-color);
        }
        .po-pr-check.checked { border-color: var(--primary-color); background: var(--primary-color); color: white; }
        .po-pr-check:disabled { cursor: not-allowed; opacity: .38; }
        .po-pr-group-title { min-width: 0; }
        .po-pr-group-title strong { display: block; font-size: 15px; }
        .po-pr-group-title span { display: block; color: var(--secondary-color); font-size: 12px; }
        .po-pr-date,.po-pr-available { color: var(--secondary-color); font-size: 12px; }
        .po-pr-date strong,.po-pr-available strong { color: var(--on-surface-color); font-size: 13px; }
        .po-pr-available { text-align: right; }
        .po-pr-expand { display: grid; height: 32px; width: 32px; place-items: center; border-radius: 3px; }
        .po-pr-expand:hover { background: var(--surface-container-low-color); }
        .po-pr-lines { padding: 0 18px 12px 42px; }
        .po-pr-line {
          display: grid;
          width: 100%;
          grid-template-columns: 34px 98px minmax(190px, 1fr) 130px 70px 120px;
          align-items: center;
          border-bottom: 1px solid var(--outline-variant-color);
          text-align: left;
        }
        .po-pr-line > span,.po-pr-line > strong { padding: 9px 8px; }
        .po-pr-line-head {
          min-height: 38px;
          background: var(--surface-container-low-color);
          color: var(--secondary-color);
          font-size: 12px;
          font-weight: 700;
        }
        .po-pr-item { min-height: 44px; font-size: 13px; }
        .po-pr-item:hover { background: var(--surface-container-low-color); }
        .po-pr-item.selected { background: color-mix(in srgb, var(--primary-color) 7%, var(--surface-container-lowest-color)); }
        .po-pr-item:disabled { cursor: not-allowed; opacity: .42; }
        .po-pr-item > .po-pr-check { margin: 0 8px; padding: 0; }
        .po-pr-item-name { line-height: 1.35; overflow-wrap: anywhere; }
        .po-pr-mobile-remove { display: none; }
        .po-pr-selected {
          min-width: 0;
          overflow: hidden;
          border-left: 1px solid var(--outline-variant-color);
          background: var(--surface-container-lowest-color);
        }
        .po-pr-selected > header {
          display: flex;
          min-height: 70px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--outline-variant-color);
          padding: 12px 20px;
        }
        .po-pr-selected > header strong { font-size: 17px; }
        .po-pr-selected > header button { color: var(--primary-color); font-size: 13px; font-weight: 650; }
        .po-pr-selected-toggle { display: flex; align-items: center; gap: 6px; color: var(--on-surface-color) !important; }
        .po-pr-selected-toggle svg { display: none; }
        .po-pr-selected-list { height: calc(100% - 70px); overflow-y: auto; padding: 0 18px 18px; }
        .po-pr-selected-list > p { padding-top: 38px; text-align: center; color: var(--secondary-color); font-size: 13px; }
        .po-pr-selected-list > section { border-bottom: 1px solid var(--outline-variant-color); padding: 13px 0; }
        .po-pr-selected-group { display: grid; grid-template-columns: 1fr auto 18px; align-items: center; gap: 5px; }
        .po-pr-selected-group strong { font-size: 14px; }
        .po-pr-selected-group span { color: var(--secondary-color); font-size: 11px; }
        .po-pr-selected-item { display: grid; grid-template-columns: 1fr 24px; padding: 10px 0 0; }
        .po-pr-selected-item > strong { font-size: 13px; }
        .po-pr-selected-item > button { display: grid; place-items: center; }
        .po-pr-selected-item > span,.po-pr-selected-item > small { grid-column: 1 / -1; }
        .po-pr-selected-item > span { padding-top: 1px; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
        .po-pr-selected-item > small { padding-top: 3px; color: var(--secondary-color); font-size: 11px; }
        .po-pr-selected-item i { display: inline-block; height: 12px; margin: 0 7px; border-left: 1px solid var(--outline-variant-color); vertical-align: middle; }
        .po-pr-selected-handle { display: none; }
        .po-pr-picker-footer {
          display: flex;
          min-height: 68px;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--outline-variant-color);
          padding: 9px 20px;
          font-size: 14px;
        }
        .po-pr-picker-footer > div { display: flex; gap: 12px; }
        .po-pr-picker-footer button { min-width: 116px; height: 44px; border-radius: 3px; padding: 0 18px; font-weight: 700; }
        .po-pr-picker-footer .secondary { border: 1px solid var(--outline-variant-color); }
        .po-pr-picker-footer .primary { min-width: 150px; background: var(--primary-color); color: white; }
        .po-pr-picker-footer .primary:disabled { opacity: .45; }
        @media (max-width: 700px) {
          .po-item-toolbar {
            display: grid !important;
            width: 100%;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .po-item-toolbar > label {
            grid-column: 1 / -1;
            width: 100% !important;
          }
          .po-item-toolbar > button {
            height: 40px !important;
            min-width: 0;
            padding-inline: 8px !important;
          }
          .po-pr-picker { height: 100dvh; width: 100%; border: 0; border-radius: 0; }
          .po-pr-picker-header { min-height: 78px; padding: 12px 16px; }
          .po-pr-picker-header h3 { font-size: 21px; }
          .po-pr-picker-header p { max-width: 280px; font-size: 11px; }
          .po-pr-picker-steps { min-height: 50px; gap: 24px; padding-inline: 16px; }
          .po-pr-picker-steps span { min-width: 130px; font-size: 13px; }
          .po-pr-picker-steps b { height: 26px; width: 26px; }
          .po-pr-picker-body { position: relative; display: block; min-height: 0; overflow: hidden; }
          .po-pr-picker-main { height: 100%; }
          .po-pr-picker-search { min-height: 64px; grid-template-columns: minmax(0, 1fr) 64px; padding: 10px 12px; }
          .po-pr-picker-search label,.po-pr-picker-search > button { height: 40px; }
          .po-pr-picker-search label { padding-inline: 11px; }
          .po-pr-picker-search input { font-size: 12px; }
          .po-pr-picker-search > button { padding: 0; font-size: 12px; }
          .po-pr-results { padding-bottom: 0; }
          .po-pr-picker-body:has(.po-pr-selected.has-items) .po-pr-results { padding-bottom: 214px; }
          .po-pr-picker-body:has(.po-pr-selected.mobile-collapsed) .po-pr-results { padding-bottom: 54px; }
          .po-pr-group {
            min-height: 58px;
            grid-template-columns: 28px minmax(0, 1fr) auto 26px;
            grid-template-areas: "check title date toggle" ". title available toggle";
            gap: 2px 8px;
            padding: 6px 12px;
          }
          .po-pr-group > .po-pr-check { grid-area: check; }
          .po-pr-group-title { grid-area: title; }
          .po-pr-group-title strong { font-size: 14px; }
          .po-pr-group-title span { font-size: 11px; }
          .po-pr-date { grid-area: date; align-self: end; white-space: nowrap; font-size: 10px; }
          .po-pr-available { grid-area: available; align-self: start; white-space: nowrap; font-size: 10px; }
          .po-pr-date strong,.po-pr-available strong { font-size: 11px; }
          .po-pr-expand { grid-area: toggle; align-self: center; }
          .po-pr-lines { padding: 0; }
          .po-pr-line-head { display: none; }
          .po-pr-item {
            position: relative;
            display: grid;
            min-height: 76px;
            grid-template-columns: 30px auto auto minmax(0, 1fr) 20px;
            grid-template-areas: "check code code code remove" ". name name name remove" ". quantity unit date date";
            gap: 0 5px;
            padding: 7px 12px;
          }
          .po-pr-item > span,.po-pr-item > strong { padding: 0; }
          .po-pr-item > .po-pr-check { grid-area: check; margin: 1px 0 0; padding: 0; }
          .po-pr-item > strong { grid-area: code; padding: 0; font-size: 13px; }
          .po-pr-item-name { grid-area: name; padding: 0; font-size: 11.5px; line-height: 1.25; }
          .po-pr-item-quantity { grid-area: quantity; padding: 1px 0 0; white-space: nowrap; color: var(--secondary-color); font-size: 10px; }
          .po-pr-item-quantity::before { content: "สั่งได้ "; }
          .po-pr-item-unit { grid-area: unit; padding: 1px 0 0; color: var(--secondary-color); font-size: 10px; }
          .po-pr-item-date { grid-area: date; padding: 1px 0 0; white-space: nowrap; color: var(--secondary-color); font-size: 10px; }
          .po-pr-item-date::before { content: " | ต้องการใช้ "; }
          .po-pr-mobile-remove { display: block; grid-area: remove; align-self: start; color: var(--on-surface-color); }
          .po-pr-selected { display: none; }
          .po-pr-selected.has-items {
            position: absolute;
            z-index: 4;
            right: 0;
            bottom: 0;
            left: 0;
            display: block;
            max-height: 214px;
            border: 0;
            border-top: 1px solid var(--outline-variant-color);
            box-shadow: 0 -8px 24px #0002;
          }
          .po-pr-selected.mobile-collapsed { max-height: 54px; }
          .po-pr-selected-handle { display: block; width: 42px; height: 14px; margin: 0 auto; border-top: 4px solid var(--outline-variant-color); border-radius: 4px; transform: translateY(7px); }
          .po-pr-selected > header { min-height: 42px; padding: 4px 14px 7px; }
          .po-pr-selected > header strong { font-size: 14px; }
          .po-pr-selected > header button { font-size: 11px; }
          .po-pr-selected-toggle svg { display: block; }
          .po-pr-selected-list { max-height: 158px; padding: 0 14px 8px; }
          .po-pr-selected.mobile-collapsed .po-pr-selected-list { display: none; }
          .po-pr-selected-list > section { padding: 8px 0; }
          .po-pr-selected-group strong { font-size: 12px; }
          .po-pr-selected-item { grid-template-columns: 50px minmax(0, 1fr) 22px; align-items: center; padding: 5px 0 0; }
          .po-pr-selected-item > strong { font-size: 11px; }
          .po-pr-selected-item > span { grid-column: 2; grid-row: 1; padding: 0 4px; overflow-wrap: anywhere; font-size: 10px; }
          .po-pr-selected-item > button { grid-column: 3; grid-row: 1; }
          .po-pr-selected-item > small { display: none; }
          .po-pr-picker-footer { min-height: 64px; padding: 8px 14px; font-size: 12px; }
          .po-pr-picker-footer > div { flex: 1; justify-content: flex-end; }
          .po-pr-picker-footer .secondary { display: none; }
          .po-pr-picker-footer .primary { min-width: 146px; height: 44px; }
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
    <label className={`document-field ${className}`}>
      <span className="block text-[10px] font-bold text-on-surface">
        {label.endsWith("*") ? <>{label.slice(0, -1)}<em className="document-po-required">*</em></> : label}
      </span>
      {children}
      {hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="document-section-number">{number}</span>
      <h3 className="text-[13px] font-bold text-on-surface">{title}</h3>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant py-1.5">
      <span>{label}</span>
      <span className="font-semibold">{formatAmount(value)}</span>
    </div>
  );
}
