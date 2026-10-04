"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Tag,
  X,
} from "lucide-react";
import {
  getPurchaseOrderItemsForReceiptAction,
  postGoodsReceiptAction,
} from "@/app/actions/inventory";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";
import { focusKeyboardTarget, runEnterAction } from "@/components/keyboard-workflow";
import { CompanyFormLogo } from "@/components/company-logo";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  SUPPLIER_DOCUMENT_TYPES,
  type SupplierDocumentType,
} from "@/lib/goods-receipts";

type PendingPO = {
  id: number;
  po_number: string;
  vendor_name: string;
  document_date: string;
  delivery_date: string;
  delivery_address: string;
  status: string;
  item_count: number;
  outstanding_label: string;
};

type Warehouse = { id: number; code: string; name: string; status: string };
type ReceiptLine = {
  purchaseOrderItemId: number;
  isStocked: boolean;
  itemCode: string;
  itemName: string;
  quantityOrdered: number;
  quantityRemaining: number;
  quantity: string;
  unitCost: number | null;
  trackingMethod: "none" | "lot" | "serial";
  unitName: string;
  warehouseId: number | "";
  vendorLotNo: string;
  mfgDate: string;
  expiryDate: string;
  serialNumbers: string;
};

import { DocumentFormFooter, DocumentProductName, type SavedDocument } from "@/components/document-form";

type Props = {
  onPrint: (id: number) => Promise<void>;
  onNext: () => void;
  pendingPOs: PendingPO[];
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

const fieldClass =
  "h-9 w-full rounded-[2px] border border-neutral-300 bg-white px-3 text-[12px] font-medium text-on-surface outline-none placeholder:text-secondary/70 focus:border-primary disabled:bg-white disabled:text-on-surface dark:border-neutral-700 dark:bg-surface-container-lowest dark:disabled:bg-surface-container-lowest";

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = ["เลือกใบ PO", "ตรวจรายการรับ"];
  return (
    <div className="grid min-h-[50px] shrink-0 grid-cols-2 border-b border-outline-variant px-2 sm:px-20">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = currentStep === number;
        const complete = currentStep > number;
        return (
          <div
            className={`relative flex items-center justify-center gap-2 text-[12px] font-semibold ${
              active
                ? "text-on-surface"
                : complete
                  ? "text-primary"
                  : "text-secondary"
            }`}
            key={label}
          >
            <span
              className={`grid size-7 place-items-center rounded-full border text-[11px] ${
                active || complete
                  ? "border-primary bg-primary font-bold text-white"
                  : "border-secondary"
              }`}
            >
              {String(number).padStart(2, "0")}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {active && (
              <span className="absolute inset-x-5 bottom-0 h-0.5 bg-primary" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Submodal for Serial Numbers entry
function SerialEntryModal({
  line,
  onClose,
  onSave,
}: {
  line: ReceiptLine;
  onClose: () => void;
  onSave: (serials: string) => void;
}) {
  const [text, setText] = useState(line.serialNumbers);
  const requiredQty = Math.floor(numberValue(line.quantity));

  const parsedSerials = useMemo(() => {
    return text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [text]);

  const hasDuplicates = useMemo(() => {
    return new Set(parsedSerials).size !== parsedSerials.length;
  }, [parsedSerials]);

  const isCountValid = parsedSerials.length === requiredQty;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="serial-title" className="document-serial flex w-full max-w-[480px] max-h-[90dvh] flex-col overflow-auto rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <header className="flex h-12 items-center justify-between border-b border-outline-variant px-4 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-primary" />
            <h3 id="serial-title" className="text-[18px] font-bold text-on-surface">
              ระบุ Serial Number
            </h3>
          </div>
          <button
            aria-label="ปิดหน้าระบุ Serial"
            onClick={onClose}
            className="p-1 text-secondary hover:text-on-surface"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div className="rounded-[3px] border border-outline-variant/60 bg-surface-container-low/40 p-3 text-[12px]">
            <p className="font-semibold text-primary">{line.itemCode}</p>
            <p className="font-medium text-on-surface">{line.itemName}</p>
            <div className="mt-2 flex items-center justify-between border-t border-outline-variant/40 pt-2 text-[11px]">
              <span>จำนวนที่รับ:</span>
              <strong className="text-[13px] text-primary">
                {requiredQty.toLocaleString("th-TH")} {line.unitName}
              </strong>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
              <label htmlFor="receipt-serials">Serial Number · 1 หมายเลขต่อบรรทัด</label>
              <span
                className={
                  isCountValid
                    ? "font-bold text-emerald-600 dark:text-emerald-400"
                    : "font-bold text-amber-600 dark:text-amber-400"
                }
              >
                ระบุแล้ว {parsedSerials.length} / {requiredQty}
              </span>
            </div>
            <textarea
              id="receipt-serials"
              className="h-32 w-full rounded-[4px] border border-outline-variant bg-white p-3 font-mono text-[15px] leading-6 outline-none focus:border-primary dark:bg-surface-container-lowest"
              onChange={(e) => setText(e.target.value)}
              placeholder="สแกนหรือพิมพ์ Serial Number ทีละบรรทัด&#10;SN-2026-0001&#10;SN-2026-0002"
              value={text}
              autoFocus
            />
            {hasDuplicates && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                <AlertCircle size={13} /> พบ Serial Number ซ้ำกันในรายการ
              </p>
            )}
          </div>
        </div>

        <footer className="flex h-14 items-center justify-between border-t border-outline-variant px-4 bg-surface-container-low">
          <button
            onClick={() => setText("")}
            className="text-[11.5px] font-semibold text-secondary hover:text-primary"
            type="button"
          >
            ล้างข้อมูล
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-[2px] border border-outline-variant px-4 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high"
              type="button"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => {
                onSave(text);
                onClose();
              }}
              disabled={hasDuplicates || !isCountValid}
              className="h-8 rounded-[2px] bg-primary px-5 text-[12px] font-bold text-white disabled:opacity-50"
              type="button"
            >
              บันทึก Serial
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Submodal for Lot and Expiration entry
function LotEntryModal({
  line,
  onClose,
  onSave,
}: {
  line: ReceiptLine;
  onClose: () => void;
  onSave: (data: {
    vendorLotNo: string;
    mfgDate: string;
    expiryDate: string;
  }) => void;
}) {
  const [vendorLotNo, setVendorLotNo] = useState(line.vendorLotNo);
  const [mfgDate, setMfgDate] = useState(line.mfgDate);
  const [expiryDate, setExpiryDate] = useState(line.expiryDate);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-[4px] border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <header className="flex h-12 items-center justify-between border-b border-outline-variant px-4 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            <h3 className="text-[14px] font-bold text-on-surface">
              ระบุ Lot ผู้ผลิต & วันหมดอายุ
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-on-surface"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-3.5 text-[12px]">
          <div className="rounded-[3px] border border-outline-variant/60 bg-surface-container-low/40 p-3 text-[12px]">
            <p className="font-semibold text-primary">{line.itemCode}</p>
            <p className="font-medium text-on-surface">{line.itemName}</p>
          </div>

          <div>
            <label className="text-[11px] font-semibold">
              Lot ผู้ผลิต (Supplier / Vendor Lot No)
            </label>
            <input
              className={`${fieldClass} mt-1`}
              onChange={(e) => setVendorLotNo(e.target.value)}
              placeholder="เช่น LOT-VND-2026-09"
              value={vendorLotNo}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold">
                วันที่ผลิต (MFG Date)
              </label>
              <input
                className={`${fieldClass} mt-1`}
                onChange={(e) => setMfgDate(e.target.value)}
                type="date"
                value={mfgDate}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold">
                วันหมดอายุ (EXP Date)
              </label>
              <input
                className={`${fieldClass} mt-1`}
                onChange={(e) => setExpiryDate(e.target.value)}
                type="date"
                value={expiryDate}
              />
            </div>
          </div>
        </div>

        <footer className="flex h-14 items-center justify-end gap-2 border-t border-outline-variant px-4 bg-surface-container-low">
          <button
            onClick={onClose}
            className="h-8 rounded-[2px] border border-outline-variant px-4 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high"
            type="button"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => {
              onSave({ expiryDate, mfgDate, vendorLotNo });
              onClose();
            }}
            className="h-8 rounded-[2px] bg-primary px-5 text-[12px] font-bold text-white"
            type="button"
          >
            บันทึกข้อมูล Lot
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ReceiptCreateModal({
  pendingPOs,
  warehouses,
  onClose,
  onSaved,
  onPrint,
  onNext,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const saveLock = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  const [selectedPoId, setSelectedPoId] = useState("");
  const [poId, setPoId] = useState("");
  const [po, setPo] = useState<{
    po_number: string;
    vendor_name: string;
    delivery_address?: string | null;
  } | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [numberReservation, setNumberReservation] = useState({
    date: "",
    error: "",
    number: "",
  });
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [supplierDocumentType, setSupplierDocumentType] =
    useState<SupplierDocumentType>("delivery_note");
  const [supplierDocumentDate, setSupplierDocumentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [canViewCost, setCanViewCost] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("receivable");
  const [activeSerialLineId, setActiveSerialLineId] = useState<number | null>(
    null,
  );
  const [activeLotLineId, setActiveLotLineId] = useState<number | null>(null);

  const initialStartDate = useMemo(
    () => pendingPOs.map((item) => item.document_date).sort()[0] ?? "",
    [pendingPOs],
  );
  const initialEndDate = useMemo(
    () =>
      pendingPOs
        .map((item) => item.delivery_date || item.document_date)
        .sort()
        .at(-1) ?? "",
    [pendingPOs],
  );
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  const selectedPO =
    pendingPOs.find((item) => String(item.id) === selectedPoId) ?? null;
  const grNumber =
    numberReservation.date === documentDate ? numberReservation.number : "";
  const numberError =
    numberReservation.date === documentDate ? numberReservation.error : "";
  const activeWarehouses = warehouses.filter((item) => item.status === "active");

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  const filteredPOs = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("th-TH");
    return pendingPOs.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.po_number.toLocaleLowerCase("th-TH").includes(keyword) ||
        item.vendor_name.toLocaleLowerCase("th-TH").includes(keyword);
      const matchesDate =
        (!startDate || item.document_date >= startDate) &&
        (!endDate || item.document_date <= endDate);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "receivable" &&
          ["approved", "sent", "partially_received"].includes(item.status)) ||
        item.status === statusFilter;
      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [endDate, pendingPOs, search, startDate, statusFilter]);

  useEffect(() => {
    if (step !== 2) return;
    let active = true;
    void reserveBusinessNumberAction("GR", documentDate).then((result) => {
      if (!active) return;
      setNumberReservation(
        result.success
          ? { date: documentDate, error: "", number: result.number }
          : { date: documentDate, error: result.error, number: "" },
      );
    });
    return () => {
      active = false;
    };
  }, [documentDate, step]);

  const loadPurchaseOrder = (value: string) => {
    setPoId(value);
    setStep(2);
    setLoading(true);
    setError("");
    void getPurchaseOrderItemsForReceiptAction(Number(value)).then((result) => {
      setLoading(false);
      if (!result.success || !result.data) {
        setError(result.error ?? "ไม่สามารถโหลดรายการจากใบสั่งซื้อได้");
        return;
      }
      setPo(result.data.po);
      setCanViewCost(result.data.canViewCost);

      // Auto-detect default warehouse
      const defaultWh =
        result.data.items.find(
          (item) => item.is_stocked && item.warehouse_id != null,
        )?.warehouse_id ??
        activeWarehouses[0]?.id ??
        "";

      setWarehouseId(defaultWh);

      const nextLines: ReceiptLine[] = result.data.items
        .filter((item) => item.quantity_remaining > 0)
        .map((item) => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          isStocked: item.is_stocked !== false,
          itemCode: item.item_code,
          itemName: item.item_name,
          quantityOrdered: item.quantity_ordered,
          quantityRemaining: item.quantity_remaining,
          quantity: String(item.quantity_remaining),
          unitCost: item.unit_cost,
          trackingMethod:
            item.tracking_method === "serial" || item.tracking_method === "lot"
              ? item.tracking_method
              : "none",
          unitName: item.unit_name,
          warehouseId: (item.is_stocked
            ? item.warehouse_id ?? defaultWh
            : "") as number | "",
          vendorLotNo: "",
          mfgDate: "",
          expiryDate: "",
          serialNumbers: "",
        }));
      setLines(nextLines);
    });
  };

  const handleMainWarehouseChange = (newWhId: number | "") => {
    setWarehouseId(newWhId);
    if (newWhId !== "") {
      setLines((current) =>
        current.map((line) =>
          line.isStocked ? { ...line, warehouseId: newWhId } : line,
        ),
      );
    }
  };

  const updateLineQuantity = (lineId: number, value: string) => {
    setLines((current) =>
      current.map((line) =>
        line.purchaseOrderItemId === lineId
          ? { ...line, quantity: value }
          : line,
      ),
    );
  };

  const updateLine = (lineId: number, patch: Partial<ReceiptLine>) => {
    setLines((current) =>
      current.map((line) =>
        line.purchaseOrderItemId === lineId ? { ...line, ...patch } : line,
      ),
    );
  };

  const validate = () => {
    if (!poId) throw new Error("กรุณาเลือกใบสั่งซื้อ");
    if (!grNumber) throw new Error(numberError || "ไม่สามารถสร้างเลขที่ GR ได้");
    if (!deliveryNoteNo.trim()) throw new Error("กรุณาระบุเลขที่เอกสารผู้ขาย");
    if (!supplierDocumentDate) throw new Error("กรุณาระบุวันที่เอกสารผู้ขาย");
    if (lines.length === 0) throw new Error("ไม่มีรายการค้างรับในใบสั่งซื้อนี้");
    lines.forEach((line, lineIndex) => {
      const quantity = numberValue(line.quantity);
      if (quantity <= 0 || quantity > line.quantityRemaining)
        throw new Error(`จำนวนรับรายการที่ ${lineIndex + 1} ไม่ถูกต้อง`);
      const effectiveWarehouseId = line.warehouseId || warehouseId;
      if (line.isStocked && !effectiveWarehouseId)
        throw new Error(`กรุณาเลือกคลังรับเข้ารายการที่ ${lineIndex + 1}`);
      if (line.trackingMethod === "serial") {
        if (!Number.isInteger(quantity))
          throw new Error(
            `สินค้าคุม Serial รายการที่ ${lineIndex + 1} ต้องรับเป็นจำนวนเต็ม`,
          );
        const serials = line.serialNumbers
          .split(/\r?\n|,/)
          .map((serial) => serial.trim())
          .filter(Boolean);
        if (new Set(serials).size !== serials.length)
          throw new Error(
            `Serial Number รายการที่ ${lineIndex + 1} ซ้ำกัน`,
          );
        if (serials.length !== quantity)
          throw new Error(
            `กรุณาระบุ Serial Number ให้ครบ ${quantity} รายการ สำหรับรายการที่ ${lineIndex + 1} (ปัจจุบันมี ${serials.length})`,
          );
      }
    });
  };

  const submit = (allowDuplicateSupplierDocument = false) => {
    if (saveLock.current || saved || isPending) return;
    try {
      validate();
      setError("");
      saveLock.current = true;
      startTransition(async () => {
        try {
        const result = await postGoodsReceiptAction({
          requestKey: requestKey.current,
          deliveryNoteNo,
          documentDate,
          supplierDocumentType,
          supplierDocumentDate,
          allowDuplicateSupplierDocument,
          items: lines.map((line) => ({
            expiryDate: line.expiryDate,
            mfgDate: line.mfgDate,
            purchaseOrderItemId: line.purchaseOrderItemId,
            quantityReceived: numberValue(line.quantity),
            remarks: "",
            serialNumbers: line.serialNumbers
              .split(/\r?\n|,/)
              .map((serial) => serial.trim())
              .filter(Boolean),
            vendorLotNo: line.vendorLotNo,
            warehouseId: line.isStocked
              ? Number(line.warehouseId || warehouseId)
              : null,
          })),
          purchaseOrderId: Number(poId),
          remarks,
        });
        if (!result.success) {
          setStep(2);
          setError(result.error ?? "ไม่สามารถบันทึกใบรับสินค้าได้");
          if ("duplicate" in result && result.duplicate) {
            setDuplicateWarning(result.error);
          }
          return;
        }
        const receipt = Array.isArray(result.data) ? result.data[0] : result.data;
        setSaved({ id: Number(receipt?.goods_receipt_id), number: String(receipt?.goods_receipt_number || grNumber) });
        onSaved("บันทึกใบรับสินค้าสำเร็จ");
        } catch { setError("ไม่สามารถยืนยันผลการบันทึก กรุณาตรวจสอบรายการก่อนลองอีกครั้ง"); }
        finally { saveLock.current = false; }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ข้อมูลไม่ถูกต้อง");
    }
  };

  const totals = useMemo(
    () => ({
      itemsCount: lines.length,
      quantity: lines.reduce(
        (sum, line) => sum + numberValue(line.quantity),
        0,
      ),
      inventoryValue: lines.reduce(
        (sum, line) => sum + (line.isStocked && line.unitCost !== null ? numberValue(line.quantity) * line.unitCost : 0),
        0,
      ),
    }),
    [lines],
  );

  const hasStockedItems = useMemo(
    () => lines.some((line) => line.isStocked),
    [lines],
  );

  const activeSerialLine = lines.find(
    (l) => l.purchaseOrderItemId === activeSerialLineId,
  );
  const activeLotLine = lines.find(
    (l) => l.purchaseOrderItemId === activeLotLineId,
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-0 backdrop-blur-[2px] sm:p-3">
      <div className="document-form flex h-[100dvh] w-full max-w-[1520px] flex-col overflow-hidden border border-neutral-300 bg-surface-container-lowest shadow-2xl dark:border-neutral-700 sm:h-auto sm:max-h-[92dvh] sm:rounded-[3px]">
        <header className="document-form-header flex h-[70px] shrink-0 items-center justify-between border-b border-outline-variant px-6">
          <div className="flex items-center gap-4">
            <CompanyFormLogo className="document-brand" />
            <div>
              <h2 className="text-[21px] font-bold leading-6 text-on-surface">
                สร้างใบรับสินค้า (GR)
              </h2>
              <p className="mt-1 text-[11px] font-medium text-secondary">
                เลือก PO › รับสินค้า
              </p>
            </div>
          </div>
          <button
            aria-label="ปิด"
            className="p-1 text-on-surface hover:text-primary"
            onClick={onClose}
            disabled={isPending}
            type="button"
          >
            <X size={26} />
          </button>
        </header>

        {step === 1 && <StepIndicator currentStep={step} />}
        {error && (
          <div className="mx-5 mt-2 border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:bg-red-950/30">
            {error}
          </div>
        )}

        {step === 1 ? (
          <>
            <div className="grid shrink-0 gap-4 px-5 py-4 lg:grid-cols-[1.15fr_1fr_0.8fr_auto]">
              <label className="relative self-end">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                  size={17}
                />
                <input
                  className={`${fieldClass} h-10 pl-10`}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหาเลขที่ PO หรือชื่อผู้ขาย"
                  value={search}
                />
              </label>
              <label className="text-[10px] font-semibold">
                ช่วงวันที่สั่งซื้อ
                <span className="mt-1 flex h-10 items-center gap-2 border border-outline-variant px-3">
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                  <span>-</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    value={endDate}
                  />
                </span>
              </label>
              <label className="text-[10px] font-semibold">
                สถานะใบสั่งซื้อ
                <select
                  className={`${fieldClass} mt-1 h-10`}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="receivable">อนุมัติแล้ว / รับบางส่วน</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="sent">ส่งผู้ขายแล้ว</option>
                  <option value="partially_received">รับบางส่วน</option>
                  <option value="all">ทั้งหมด</option>
                </select>
              </label>
              <button
                className="mt-auto inline-flex h-10 items-center gap-2 border border-primary px-4 text-[12px] font-bold text-primary"
                onClick={() => {
                  setSearch("");
                  setStartDate(initialStartDate);
                  setEndDate(initialEndDate);
                  setStatusFilter("receivable");
                }}
                type="button"
              >
                <RotateCcw size={15} /> ล้างตัวกรอง
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 px-5 pb-4 lg:grid-cols-[minmax(0,1fr)_270px]">
              <div className="document-table-scroll border border-outline-variant">
                <table className="document-entry-table document-gr-picker-table w-full table-fixed border-collapse">
                  <thead>
                    <tr className="h-10 border-b border-outline-variant bg-[#f2f2f2] font-bold text-black dark:bg-white/[0.07] dark:text-white">
                      <th className="w-[7%]">เลือก</th>
                      <th className="w-[15%] text-left">เลขที่ PO</th>
                      <th className="w-[12%] text-left">วันที่</th>
                      <th className="w-[30%] text-left">ผู้ขาย</th>
                      <th>จำนวนรายการ</th>
                      <th>ค้างรับ</th>
                      <th>วันที่ส่งมอบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map((item) => (
                      <tr
                        className={`h-[49px] cursor-pointer border-b border-outline-variant ${
                          selectedPoId === String(item.id)
                            ? "bg-primary/[0.04]"
                            : "hover:bg-surface-container-low"
                        }`}
                        key={item.id}
                        onClick={() => setSelectedPoId(String(item.id))}
                      >
                        <td>
                          <span
                            className={`mx-auto grid size-5 place-items-center rounded-full border ${
                              selectedPoId === String(item.id)
                                ? "border-primary"
                                : "border-on-surface"
                            }`}
                          >
                            {selectedPoId === String(item.id) && (
                              <span className="size-2.5 rounded-full bg-primary" />
                            )}
                          </span>
                        </td>
                        <td className="font-semibold">{item.po_number}</td>
                        <td>{formatDate(item.document_date)}</td>
                        <td className="pr-3 font-medium">{item.vendor_name}</td>
                        <td className="text-center">{item.item_count}</td>
                        <td className="text-center">
                          {item.outstanding_label}
                        </td>
                        <td className="text-center">
                          {formatDate(item.delivery_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="border border-outline-variant p-4 text-[12px]">
                <h3 className="border-b border-outline-variant pb-3 font-bold">
                  ข้อมูลใบสั่งซื้อที่เลือก
                </h3>
                {selectedPO ? (
                  <div className="space-y-4 pt-4">
                    <div>
                      <b>เลขที่ PO</b>
                      <p className="mt-1">{selectedPO.po_number}</p>
                    </div>
                    <div>
                      <b>ผู้ขาย</b>
                      <p className="mt-1 leading-5">{selectedPO.vendor_name}</p>
                    </div>
                    <div>
                      <b>ที่อยู่สำหรับจัดส่ง</b>
                      <p className="mt-1 whitespace-pre-line leading-5">
                        {selectedPO.delivery_address || "-"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="pt-4 text-secondary">เลือกใบสั่งซื้อจากตาราง</p>
                )}
              </aside>
            </div>
            <footer className="flex h-[66px] shrink-0 items-center justify-between border-t border-outline-variant px-5">
              <span className="text-[12px] font-semibold">
                เลือกแล้ว{" "}
                <b className="text-primary">{selectedPO ? 1 : 0}</b> ใบสั่งซื้อ
              </span>
              <div className="flex gap-3">
                <button
                  className="h-10 min-w-28 border border-outline-variant px-5 font-semibold"
                  onClick={onClose}
                  type="button"
                >
                  ยกเลิก
                </button>
                <button
                  className="h-10 min-w-44 bg-primary px-5 font-bold text-white disabled:opacity-50"
                  disabled={!selectedPO}
                  onClick={() => {
                    if (selectedPoId) loadPurchaseOrder(selectedPoId);
                  }}
                  type="button"
                >
                  ถัดไป: ตรวจรายการ
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto"><fieldset disabled={isPending || Boolean(saved)} className="document-form-locked document-form-body">
              <section className="border-b border-outline-variant px-5 py-3">
                <div className="document-fields">
                  <label className="document-field"><span>เลขที่ GR</span><input className={fieldClass} disabled value={saved?.number || grNumber || (numberError ? "ไม่สามารถสร้างเลขเอกสาร" : "กำลังสร้างเลขเอกสาร...")} /></label>
                  <label className="document-field"><span>เลขที่ PO</span><input className={fieldClass} disabled value={po?.po_number ?? ""} /></label>
                  <label className="document-field document-field-wide"><span>ผู้ขาย</span><input className={fieldClass} disabled value={po?.vendor_name ?? ""} /></label>
                  <label className="document-field"><span>ประเภทเอกสารผู้ขาย <b className="text-primary">*</b></span><select className={fieldClass} onChange={event => setSupplierDocumentType(event.target.value as SupplierDocumentType)} value={supplierDocumentType}>{SUPPLIER_DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="document-field"><span>เลขที่เอกสารผู้ขาย <b className="text-primary">*</b></span><input className={fieldClass} maxLength={100} onChange={event => setDeliveryNoteNo(event.target.value)} placeholder="เช่น DN-2569-001" value={deliveryNoteNo} /></label>
                  <label className="document-field"><span>วันที่เอกสารผู้ขาย <b className="text-primary">*</b></span><input className={fieldClass} onChange={event => setSupplierDocumentDate(event.target.value)} type="date" value={supplierDocumentDate} /></label>
                  <label className="document-field"><span>วันที่รับสินค้า <b className="text-primary">*</b></span><input className={fieldClass} onChange={event => setDocumentDate(event.target.value)} type="date" value={documentDate} /></label>
                  <label className="document-field document-field-wide"><span>คลังรับเข้า {hasStockedItems && <b className="text-primary">*</b>}</span><select className={fieldClass} disabled={!hasStockedItems} onChange={event => handleMainWarehouseChange(event.target.value === "" ? "" : Number(event.target.value))} value={hasStockedItems ? warehouseId : ""}><option value="">{hasStockedItems ? "-- เลือกคลังรับเข้า --" : "-- ไม่จำเป็นต้องระบุคลัง --"}</option>{activeWarehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
              </section>

              <section className="px-3 py-3 sm:px-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-bold">
                    <span className="mr-2 text-primary">02</span> ตรวจรายการรับสินค้า
                  </h3>
                  <span className="text-[11px] text-secondary">
                    * สินค้าคุม Serial หรือ Lot ให้กดปุ่มระบุข้อมูลในคอลัมน์ขวาสุด
                  </span>
                </div>

                {loading ? (
                  <div className="grid h-44 place-items-center">
                    <Loader2 className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="document-table-scroll rounded-[2px] border border-neutral-300 dark:border-neutral-700">
                    <table className={`document-entry-table document-gr-table w-full table-fixed border-collapse ${canViewCost ? "with-cost" : ""}`}>
                      <thead className="bg-[#f2f2f2] font-bold text-black dark:bg-white/[0.07] dark:text-white">
                        <tr className="h-[32px] border-b border-outline-variant">
                          <th className="w-[4%] px-1 text-center">ลำดับ</th>
                          <th className="w-[9%] px-2 text-left">รหัส</th>
                          <th className="w-[19%] px-2 text-left">สินค้า / รายการ</th>
                          <th className="w-[13%] px-2 text-left">คลังรับเข้า</th>
                          <th className="w-[6%] px-1 text-center">สั่งซื้อ</th>
                          <th className="w-[6%] px-1 text-center">ค้างรับ</th>
                          <th className="w-[7%] px-1 text-center">จำนวนรับ</th>
                          <th className="w-[5%] px-1 text-center">หน่วย</th>
                          {canViewCost && <th className="w-[9%] px-1 text-right">ราคา/หน่วยสุทธิ</th>}
                          {canViewCost && <th className="w-[10%] px-1 text-right">มูลค่ารับเข้า</th>}
                          <th className="w-[12%] px-2 text-center">
                            Lot / Serial
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant text-on-surface">
                        {lines.map((line, lineIndex) => {
                          const quantity = numberValue(line.quantity);
                          const reqSerialCount = Math.floor(quantity);
                          const currentSerialCount = line.serialNumbers
                            .split(/\r?\n|,/)
                            .map((s) => s.trim())
                            .filter(Boolean).length;
                          const isSerialComplete =
                            currentSerialCount === reqSerialCount &&
                            reqSerialCount > 0;
                          const hasLotData = Boolean(
                            line.vendorLotNo ||
                              line.mfgDate ||
                              line.expiryDate,
                          );

                          return (
                            <tr
                              className="h-[46px] hover:bg-surface-container-lowest"
                              key={line.purchaseOrderItemId}
                            >
                              <td className="px-1 text-center font-medium">
                                {lineIndex + 1}
                              </td>
                              <td className="break-all px-2 font-bold leading-4 text-primary">
                                {line.itemCode}
                              </td>
                              <td
                                className="whitespace-normal break-words px-2 py-2 font-medium leading-4"
                              >
                                <DocumentProductName name={line.itemName} />
                              </td>
                              <td className="px-2">
                                {line.isStocked ? (
                                  <select
                                    aria-label={`คลังรับเข้าสำหรับ ${line.itemCode}`}
                                    className="h-7 w-full rounded-[2px] border border-neutral-300 bg-white px-1.5 text-[11px] font-medium outline-none focus:border-primary dark:border-neutral-700 dark:bg-surface-container-lowest"
                                    onChange={(event) =>
                                      updateLine(line.purchaseOrderItemId, {
                                        warehouseId:
                                          event.target.value === ""
                                            ? ""
                                            : Number(event.target.value),
                                      })
                                    }
                                    value={
                                      line.warehouseId || warehouseId || ""
                                    }
                                  >
                                    <option value="">-- เลือกคลัง --</option>
                                    {activeWarehouses.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[11px] font-medium text-secondary/70">
                                    -
                                  </span>
                                )}
                              </td>
                              <td className="px-1 text-center font-medium">
                                {line.quantityOrdered.toLocaleString("th-TH")}
                              </td>
                              <td className="px-1 text-center font-semibold text-secondary">
                                {line.quantityRemaining.toLocaleString("th-TH")}
                              </td>
                              <td className="px-1 text-center">
                                <input
                                  aria-label={`จำนวนรับ ${line.itemCode}`}
                                  className="mx-auto h-7 w-20 rounded-[2px] border border-neutral-300 px-2 text-right text-[12px] font-semibold outline-none focus:border-primary dark:border-neutral-700 dark:bg-surface-container-lowest"
                                  data-keyboard-target={`receipt-quantity-${line.purchaseOrderItemId}`}
                                  max={line.quantityRemaining}
                                  min="0"
                                  onChange={(event) =>
                                    updateLineQuantity(
                                      line.purchaseOrderItemId,
                                      event.target.value,
                                    )
                                  }
                                  onKeyDown={(event) => runEnterAction(event, () => {
                                    if (line.trackingMethod === "lot") setActiveLotLineId(line.purchaseOrderItemId);
                                    else if (line.trackingMethod === "serial") setActiveSerialLineId(line.purchaseOrderItemId);
                                    else {
                                      const next = lines[lineIndex + 1];
                                      if (next) focusKeyboardTarget(`receipt-quantity-${next.purchaseOrderItemId}`);
                                    }
                                  })}
                                  step="any"
                                  type="number"
                                  value={line.quantity}
                                />
                              </td>
                              <td className="px-1 text-center font-medium">
                                {line.unitName}
                              </td>
                              {canViewCost && <td className="px-2 text-right font-medium tabular-nums">{line.unitCost === null ? "-" : formatMoney(line.unitCost)}</td>}
                              {canViewCost && <td className="px-2 text-right font-semibold tabular-nums">{line.unitCost === null || !line.isStocked ? "-" : formatMoney(quantity * line.unitCost)}</td>}
                              <td className="px-2 text-center">
                                {line.trackingMethod === "serial" ? (
                                  <button
                                    className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[2px] border px-2.5 text-[11px] font-bold transition-colors ${
                                      isSerialComplete
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                        : "border-primary/40 bg-red-50 text-primary hover:bg-red-100 dark:bg-red-950/30"
                                    }`}
                                    onClick={() =>
                                      setActiveSerialLineId(
                                        line.purchaseOrderItemId,
                                      )
                                    }
                                    type="button"
                                  >
                                    {isSerialComplete ? (
                                      <CheckCircle2 size={13} />
                                    ) : (
                                      <Tag size={13} />
                                    )}
                                    {isSerialComplete
                                      ? `Serial (${currentSerialCount}/${reqSerialCount})`
                                      : `ระบุ Serial (${currentSerialCount}/${reqSerialCount})`}
                                  </button>
                                ) : line.trackingMethod === "lot" ? (
                                  <button
                                    className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[2px] border px-2.5 text-[11px] font-bold transition-colors ${
                                      hasLotData
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                        : "border-outline-variant bg-surface-container-low hover:border-primary hover:text-primary"
                                    }`}
                                    onClick={() =>
                                      setActiveLotLineId(
                                        line.purchaseOrderItemId,
                                      )
                                    }
                                    type="button"
                                  >
                                    <Package size={13} />
                                    {hasLotData
                                      ? `Lot: ${line.vendorLotNo || "ระบุแล้ว"}`
                                      : "ระบุ Lot / วันหมดอายุ"}
                                  </button>
                                ) : !line.isStocked ? (
                                  <span className="inline-flex items-center rounded-[2px] border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                                    งานบริการ (Non-stock)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-[2px] border border-outline-variant bg-neutral-100 px-2 py-0.5 text-[10.5px] font-medium text-secondary dark:bg-white/5">
                                    ทั่วไป (ไม่คุม Lot)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <label className="document-field mt-4">
                  <span>หมายเหตุ</span>
                  <input
                    className={`${fieldClass} mt-1`}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
                    value={remarks}
                  />
                </label>
              </section>
            </fieldset></div>

            <DocumentFormFooter saved={saved} pending={isPending || loading} summary={<>{totals.itemsCount} รายการ{canViewCost && <> · {formatMoney(totals.inventoryValue)} บาท</>}</>} onClose={onClose} onPrint={onPrint} onNext={onNext}>
              <button type="button" disabled={isPending} onClick={() => { setStep(1); setError(""); }}>ย้อนกลับ</button>
              <button className="primary" type="button" disabled={isPending || loading} onClick={() => submit()}>{isPending ? "กำลังบันทึก..." : "บันทึกการรับสินค้า"}</button>
            </DocumentFormFooter>
          </>
        )}

        {/* Modal for Serial Number Entry */}
        {activeSerialLine && (
          <SerialEntryModal
            line={activeSerialLine}
            onClose={() => setActiveSerialLineId(null)}
            onSave={(serials) => {
              updateLine(activeSerialLine.purchaseOrderItemId, {
                serialNumbers: serials,
              });
            }}
          />
        )}

        {/* Modal for Lot and Exp Date Entry */}
        {activeLotLine && (
          <LotEntryModal
            line={activeLotLine}
            onClose={() => setActiveLotLineId(null)}
            onSave={(data) => {
              updateLine(activeLotLine.purchaseOrderItemId, {
                expiryDate: data.expiryDate,
                mfgDate: data.mfgDate,
                vendorLotNo: data.vendorLotNo,
              });
            }}
          />
        )}
        <ConfirmModal
          open={Boolean(duplicateWarning)}
          title="พบเลขที่เอกสารผู้ขายซ้ำ"
          description={`${duplicateWarning} กรุณาตรวจสอบก่อนยืนยันรับสินค้าซ้ำ`}
          confirmText="ยืนยันรับสินค้าซ้ำ"
          tone="warning"
          isPending={isPending}
          onClose={() => setDuplicateWarning("")}
          onConfirm={() => {
            setDuplicateWarning("");
            submit(true);
          }}
        />
      </div>
    </div>
  );
}
