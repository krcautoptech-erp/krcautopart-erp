"use client";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/use-body-scroll-lock";

import {
  AlertCircle,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Plus,
  Save,
  Search,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";
import {
  savePurchaseRequisitionDraftAction,
  submitPurchaseRequisitionAction,
} from "@/app/actions/purchase-requisitions";
import type {
  PurchaseRequisitionEditableRow,
  PurchaseRequisitionMaterial,
} from "@/lib/purchase-requisition-form";
import {
  getPurchaseRequisitionItemKey,
  normalizePurchaseRequisitionRows,
  parsePurchaseRequisitionItemKey,
  validatePurchaseRequisitionSubmission,
} from "@/lib/purchase-requisition-form";
import {
  formatDisplayDate,
  getPurchaseRequisitionStatusLabel,
  type PurchaseRequisitionStatus,
} from "@/lib/purchase-requisitions";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { toast } from "@/components/toast";
import { focusKeyboardTarget, runEnterAction } from "@/components/keyboard-workflow";
import { ItemPicker } from "@/components/item-picker";
import { CompanyFormLogo } from "@/components/company-logo";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges, useUnsavedChangesContext } from "@/components/unsaved-changes";
import { downloadCsvTemplate, readSpreadsheet } from "@/lib/spreadsheet-import";

import { DocumentFormPurpose, DocumentMobileItemToolbar, DocumentMobileWorkspace, DocumentEntryTable, DocumentFormFooter, DocumentProductName, type SavedDocument } from "@/components/document-form";

type PrCreateModalProps = {
  onPrint: (id: number) => Promise<void>;
  onNext: () => void;
  documentDate: string;
  materials: PurchaseRequisitionMaterial[];
  onClose: () => void;
  requester: { departmentName: string; name: string };
  editPrId?: number;
  initialData?: {
    items: PurchaseRequisitionEditableRow[];
    neededByDate: string;
    remarks: string;
    status?: string;
  };
};

type PrLineItemInput = {
  id: number;
  itemKey: string;
  quantity: string;
  note: string;
  neededByDate: string;
};

function MaterialSelectorRow({
  selectedMaterial,
  onOpenSearch,
  disabled,
}: {
  selectedMaterial?: PurchaseRequisitionMaterial;
  onOpenSearch: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpenSearch}
      className="flex h-[28px] w-full items-center justify-between rounded-[5px] border border-red-100 bg-white px-2 text-left text-[12px] font-medium outline-none hover:border-primary focus:border-primary disabled:opacity-50 dark:border-red-500/20 dark:bg-[#171313] text-on-surface cursor-pointer"
    >
      <span className="min-w-0 truncate whitespace-nowrap">
        {selectedMaterial ? selectedMaterial.code : "เลือกสินค้า/บริการ..."}
      </span>
      <Search size={12} className="text-secondary/60 shrink-0 ml-1" />
    </button>
  );
}

type MaterialSearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  materials: PurchaseRequisitionMaterial[];
  onSelect: (selected: PurchaseRequisitionMaterial[]) => void;
  singleSelectMode?: boolean;
  alreadySelectedIds?: string[];
};

function MaterialSearchModal({
  isOpen,
  onClose,
  materials,
  onSelect,
  singleSelectMode = false,
  alreadySelectedIds = [],
}: MaterialSearchModalProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const alreadySelectedSet = useMemo(() => new Set(alreadySelectedIds), [alreadySelectedIds]);

  const itemTypes = useMemo(() => {
    return Array.from(new Map(materials.map((item) => [item.typeCode, item.typeName])).entries())
      .sort(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode, "th"));
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      const matchesSearch =
        !q ||
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.typeCode.toLowerCase().includes(q) ||
        m.typeName.toLowerCase().includes(q);
      return matchesSearch && (typeFilter === "all" || m.typeCode === typeFilter);
    });
  }, [materials, search, typeFilter]);

  if (!isOpen) return null;

  return <ItemPicker
    columns={[{ key: "balance", label: "คงเหลือ", className: "item-picker-balance", render: (item) => item.value.onHandQty == null ? "—" : item.value.onHandQty.toLocaleString("en-US", { maximumFractionDigits: 4 }) }]}
    context="ใบขอซื้อ (PR)"
    initialSelectedIds={[]}
    items={filtered.map((material) => {
      const id = getPurchaseRequisitionItemKey(material);
      return { id, code: material.code, name: material.name, unit: material.unitSymbol, meta: material.description !== material.name ? material.description : undefined, searchText: `${material.description} ${material.typeCode} ${material.typeName}`, group: `${material.typeCode} — ${material.typeName}`, disabled: alreadySelectedSet.has(id), value: material };
    })}
    onClose={onClose}
    onConfirm={onSelect}
    single={singleSelectMode}
  />;

  /* Legacy markup remains below only until all callers finish the shared-picker rollout. */

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleRowClick = (m: PurchaseRequisitionMaterial) => {
    if (singleSelectMode) {
      onSelect([m]);
      onClose();
    } else {
      toggleSelect(getPurchaseRequisitionItemKey(m));
    }
  };

  const handleConfirm = () => {
    const selected = materials.filter((m) => selectedIds.has(getPurchaseRequisitionItemKey(m)));
    onSelect(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-[840px] flex-col overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-3.5 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Search className="text-primary" size={18} />
            <h3 className="text-[15px] font-bold text-on-surface">
              {singleSelectMode ? "เลือกสินค้า/บริการที่ซื้อได้" : "เลือกสินค้า/บริการที่ซื้อได้ (เลือกได้หลายรายการ)"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-[6px] text-secondary hover:bg-surface-container hover:text-on-surface border-none bg-transparent cursor-pointer"
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-outline-variant/20 p-4 sm:flex-row bg-surface-container-lowest">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary/60" size={14} />
            <input
              type="text"
              placeholder="พิมพ์รหัส ชื่อ รายละเอียด หรือประเภท..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(event) => runEnterAction(event, () => {
                const first = filtered.find((item) => !alreadySelectedSet.has(getPurchaseRequisitionItemKey(item)));
                if (first) { onSelect([first]); onClose(); }
              })}
              className="h-[32px] w-full rounded-[6px] border border-outline-variant bg-background pl-9 pr-3 text-[12px] font-medium outline-none focus:border-primary"
              autoFocus
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-[32px] w-full rounded-[6px] border border-outline-variant bg-background px-2.5 text-[12px] font-medium outline-none focus:border-primary"
            >
              <option value="all">ประเภททั้งหมด</option>
              {itemTypes.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
          <div className="overflow-hidden rounded-[6px] border border-outline-variant bg-background">
            <table className="w-full table-fixed border-collapse text-left text-[12px]">
              <thead className="bg-surface-container-low text-[11px] font-bold text-on-surface border-b border-outline-variant/30">
                <tr className="h-[32px]">
                  {!singleSelectMode && <th className="w-[6%] px-2 text-center">เลือก</th>}
                  <th className="w-[18%] px-2">รหัส</th>
                  <th className="w-[14%] px-2">ประเภท</th>
                  <th className="w-[48%] px-2">ชื่อสินค้า/บริการ</th>
                  <th className="w-[14%] px-2 text-center">หน่วย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-medium">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={singleSelectMode ? 4 : 5} className="h-20 text-center text-secondary/60 font-bold">
                      ไม่พบสินค้า/บริการที่ซื้อได้
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const itemKey = getPurchaseRequisitionItemKey(m);
                    const isSelected = selectedIds.has(itemKey);
                    const isAlreadyAdded = alreadySelectedSet.has(itemKey);

                    return (
                      <tr
                        key={itemKey}
                        onDoubleClick={() => !isAlreadyAdded && handleRowClick(m)}
                        onClick={() => !isAlreadyAdded && handleRowClick(m)}
                        className={`h-[36px] hover:bg-primary/5 transition-colors cursor-pointer ${
                          isSelected ? "bg-primary/5 text-primary" : ""
                        } ${isAlreadyAdded ? "opacity-40 cursor-not-allowed bg-surface-container-low" : ""}`}
                      >
                        {!singleSelectMode && (
                          <td className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isAlreadyAdded}
                              onChange={() => toggleSelect(itemKey)}
                              className="h-3.5 w-3.5 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-2 font-bold text-primary">{m.code}</td>
                        <td className="px-2 whitespace-nowrap">
                          <ItemTypeBadge code={m.typeCode} name={m.typeName} />
                        </td>
                        <td className="px-2 py-2 leading-5 [overflow-wrap:anywhere]" title={m.name}>
                          <div className="font-bold text-on-surface">{m.name}</div>
                          {m.description && m.description !== m.name ? (
                            <div className="whitespace-normal text-[12px] font-medium text-secondary" title={m.description}>
                              {m.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 text-center text-secondary">{m.unitSymbol}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 px-5 py-3 bg-surface-container-low">
          <div className="text-[12px] font-bold text-secondary">
            {!singleSelectMode && (
              <span>
                เลือกแล้ว <strong className="text-primary">{selectedIds.size}</strong> รายการ
              </span>
            )}
            {singleSelectMode && <span>ดับเบิ้ลคลิกแถวเพื่อเลือกทันที</span>}
            <span className="ml-3 hidden sm:inline">
              แสดง {filtered.length.toLocaleString("th-TH")} / {materials.length.toLocaleString("th-TH")} รายการ
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="inline-flex h-[32px] items-center justify-center rounded-[6px] border border-outline-variant bg-background px-4 text-[12px] font-bold text-on-surface hover:bg-surface-container cursor-pointer"
              type="button"
            >
              ยกเลิก
            </button>
            {!singleSelectMode && (
              <button
                onClick={handleConfirm}
                disabled={selectedIds.size === 0}
                className="inline-flex h-[32px] items-center justify-center rounded-[6px] bg-primary px-4 text-[12px] font-bold text-white hover:bg-primary/95 disabled:opacity-50 cursor-pointer border-none"
                type="button"
              >
                ยืนยันการเลือก
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrCreateModal({
  documentDate,
  materials,
  onClose,
  requester,
  onPrint,
  onNext,
  editPrId,
  initialData,
}: PrCreateModalProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const saveLock = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const isReadOnly = Boolean(saved) || (initialData?.status ? !["draft", "rejected"].includes(initialData.status) : false);
  const [objective, setObjective] = useState(initialData?.remarks ?? "");
  const [neededByDate, setNeededByDate] = useState(initialData?.neededByDate ?? documentDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(
    null,
  );
  const [reservedPrNumber, setReservedPrNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  useEffect(() => {
    if (editPrId) return;

    let isActive = true;

    void reserveBusinessNumberAction("PR", documentDate).then((result) => {
      if (!isActive) return;

      if (result.success) {
        setReservedPrNumber(result.number);
        return;
      }

      setFeedback({ tone: "error", message: result.error });
    });

    return () => {
      isActive = false;
    };
  }, [documentDate, editPrId]);

  const [items, setItems] = useState<PrLineItemInput[]>(() =>
    normalizePurchaseRequisitionRows(
      initialData?.items ?? [
        {
          itemKey: "",
          quantity: "1",
          note: "",
          neededByDate: documentDate,
        },
      ],
      initialData?.neededByDate || documentDate,
    ),
  );

  const [searchModal, setSearchModal] = useState<{
    isOpen: boolean;
    targetRowId: number | null;
  }>({
    isOpen: false,
    targetRowId: null,
  });

  useEffect(() => {
    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, []);

  const itemByKey = useMemo(
    () => new Map(materials.map((item) => [getPurchaseRequisitionItemKey(item), item])),
    [materials],
  );

  const draftValue = {
    objective, neededByDate,
    items: items.map(({ itemKey, quantity, note, neededByDate }) => ({ itemKey, quantity, note, neededByDate })),
  };
  const [initialDraftValue] = useState(() => draftValue);
  const draftKey = `purchase-pr:${editPrId ?? "new"}`;
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: draftKey,
    value: draftValue,
    initialValue: initialDraftValue,
    revision: JSON.stringify(initialData ?? null),
    enabled: !isReadOnly,
    onRestore: (draft) => {
      if (draft.items.some((item) => item.itemKey && !itemByKey.has(item.itemKey))) {
        setFeedback({ tone: "error", message: "มีสินค้าในข้อมูลที่กู้คืนซึ่งไม่สามารถเลือกได้แล้ว กรุณาตรวจสอบรายการสินค้า" });
        throw new Error("สินค้าในข้อมูลที่กู้คืนไม่สามารถเลือกได้แล้ว");
      }
      setObjective(draft.objective);
      setNeededByDate(draft.neededByDate);
      setItems(normalizePurchaseRequisitionRows(draft.items, draft.neededByDate));
    },
  });
  useUnsavedChanges(draftKey, hasChanges && !isReadOnly);
  const { requestNavigation } = useUnsavedChangesContext();
  const closeForm = () => requestNavigation(onClose);

  const alreadySelectedIds = useMemo(() => {
    return items
      .map((item) => item.itemKey)
      .filter(Boolean);
  }, [items]);

  const openSearchModal = (targetRowId: number | null = null) => {
    setSearchModal({
      isOpen: true,
      targetRowId,
    });
  };

  const closeSearchModal = () => {
    setSearchModal({
      isOpen: false,
      targetRowId: null,
    });
  };

  const handleSearchModalSelect = (selectedMaterials: PurchaseRequisitionMaterial[]) => {
    const quantityTargetId = searchModal.targetRowId ?? items.find((item) => !item.itemKey)?.id ?? (items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1);
    if (searchModal.targetRowId !== null) {
      if (selectedMaterials[0]) {
        handleMaterialChange(searchModal.targetRowId, selectedMaterials[0]);
      }
    } else {
      handleBulkAddMaterials(selectedMaterials);
    }
    if (selectedMaterials.length > 0) focusKeyboardTarget(`pr-quantity-${quantityTargetId}`);
  };

  const handleBulkAddMaterials = (selectedMaterials: PurchaseRequisitionMaterial[]) => {
    setItems((current) => {
      const updated = [...current];
      const emptyRowIndices = updated
        .map((item, index) => (item.itemKey === "" ? index : -1))
        .filter((index) => index !== -1);

      selectedMaterials.forEach((material) => {
        const itemKey = getPurchaseRequisitionItemKey(material);
        if (updated.some((item) => item.itemKey === itemKey)) {
          return;
        }

        if (emptyRowIndices.length > 0) {
          const indexToFill = emptyRowIndices.shift()!;
          updated[indexToFill] = {
            ...updated[indexToFill],
            itemKey,
            quantity: updated[indexToFill].quantity || "1",
          };
        } else {
          const nextId = updated.length > 0 ? Math.max(...updated.map((item) => item.id)) + 1 : 1;
          updated.push({
            id: nextId,
            itemKey,
            quantity: "1",
            note: "",
            neededByDate: neededByDate,
          });
        }
      });
      return updated;
    });
  };

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      if (!item.itemKey) return false;
      const material = itemByKey.get(item.itemKey);
      if (!material) return false;
      return (
        material.code.toLowerCase().includes(normalizedQuery) ||
        material.name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [itemByKey, items, searchQuery]);

  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => {
      const val = parseFloat(item.quantity);
      return Number.isFinite(val) && val > 0 ? sum + val : sum;
    }, 0);
  }, [items]);

  const updateItem = <Key extends keyof PrLineItemInput>(
    id: number,
    key: Key,
    value: PrLineItemInput[Key],
  ) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  };

  const handleMaterialChange = (id: number, material: PurchaseRequisitionMaterial) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              itemKey: getPurchaseRequisitionItemKey(material),
              quantity: item.quantity || "1",
            }
          : item,
      ),
    );
  };

  const handleAddItem = () => {
    const nextId = items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1;

    setItems((current) => [
      ...current,
      {
        id: nextId,
        itemKey: "",
        quantity: "1",
        note: "",
        neededByDate: neededByDate,
      },
    ]);
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const { headers, rows } = await readSpreadsheet(file);
      const normalized = headers.map((header) => header.trim().toLowerCase().replace(/[\s._-]/g, ""));
      const column = (...names: string[]) => normalized.findIndex((header) => names.includes(header));
      const codeColumn = column("รหัสสินค้า", "รหัส", "itemcode", "code");
      const quantityColumn = column("จำนวน", "qty", "quantity");
      const noteColumn = column("หมายเหตุ", "note", "remark", "remarks");
      const dateColumn = column("วันที่ต้องการ", "neededbydate", "requireddate");
      if (codeColumn < 0 || quantityColumn < 0) throw new Error("ต้องมีคอลัมน์ รหัสสินค้า และ จำนวน");

      const materialByCode = new Map(materials.map((material) => [material.code.trim().toLowerCase(), material]));
      const unknown: string[] = [];
      const imported = rows.flatMap((row) => {
        const code = row[codeColumn]?.trim();
        const material = materialByCode.get(code?.toLowerCase());
        const quantity = Number((row[quantityColumn] ?? "").replace(/,/g, ""));
        if (!material || !Number.isFinite(quantity) || quantity <= 0) {
          unknown.push(code || "(ไม่มีรหัส)");
          return [];
        }
        return [{ material, quantity: String(quantity), note: row[noteColumn] ?? "", neededByDate: row[dateColumn] || neededByDate }];
      });
      if (!imported.length) throw new Error("ไม่พบรายการที่นำเข้าได้");

      setItems((current) => imported.reduce((next, entry) => {
        const itemKey = getPurchaseRequisitionItemKey(entry.material);
        const existing = next.find((item) => item.itemKey === itemKey);
        if (existing) return next.map((item) => item.id === existing.id ? { ...item, quantity: entry.quantity, note: entry.note, neededByDate: entry.neededByDate } : item);
        const empty = next.find((item) => !item.itemKey);
        if (empty) return next.map((item) => item.id === empty.id ? { ...item, itemKey, quantity: entry.quantity, note: entry.note, neededByDate: entry.neededByDate } : item);
        return [...next, { id: Math.max(0, ...next.map((item) => item.id)) + 1, itemKey, quantity: entry.quantity, note: entry.note, neededByDate: entry.neededByDate }];
      }, [...current]));
      toast.success(`นำเข้า ${imported.length} รายการแล้ว`, unknown.length ? `ข้าม ${unknown.length} รายการที่ไม่พบรหัสหรือจำนวนไม่ถูกต้อง` : "ตรวจสอบรายการก่อนบันทึก");
    } catch (error) {
      toast.error("นำเข้าไม่สำเร็จ", error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์ได้");
    }
  };

  const handleRemoveItem = (id: number) => {
    if (items.length === 1) {
      // Keep at least one row, just reset it
      setItems([
        {
          id: 1,
          itemKey: "",
          quantity: "1",
          note: "",
          neededByDate: neededByDate,
        },
      ]);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const handleSave = (status: "draft" | "pending_approval") => {
    if (saveLock.current || saved || isReadOnly) return;
    setFeedback(null);

    if (!editPrId && !reservedPrNumber) {
      setFeedback({ tone: "error", message: "ระบบยังไม่สามารถสร้างเลขใบขอซื้อได้" });
      return;
    }

    const submissionItems = items
      .filter((item) => item.itemKey !== "")
      .map((item) => ({
        ...parsePurchaseRequisitionItemKey(item.itemKey)!,
        quantity: parseFloat(item.quantity) || 0,
        remarks: item.note,
        neededByDate: item.neededByDate,
      }));

    const payload = {
      documentDate,
      items: submissionItems,
      neededByDate,
      remarks: objective,
    };

    if (status === "pending_approval") {
      const validationResult = validatePurchaseRequisitionSubmission(
        payload,
        materials,
      );
      if (!validationResult.success) {
        setFeedback({ tone: "error", message: validationResult.error });
        return;
      }
    }

    saveLock.current = true;
    startTransition(async () => {
      try {
      const res =
        status === "draft"
          ? await savePurchaseRequisitionDraftAction(payload, editPrId)
          : await submitPurchaseRequisitionAction(payload, editPrId);
        
      if (!res.success) {
        setFeedback({ tone: "error", message: res.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
        toast.error("บันทึกไม่สำเร็จ", res.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      } else {
        const prNumber = String(res.prNumber || "");
        const successMsg =
          status === "draft"
            ? `บันทึกร่างใบขอซื้อ ${prNumber} เรียบร้อยแล้ว`
            : `ส่งใบขอซื้อ ${prNumber} ให้ฝ่ายจัดซื้อตรวจสอบเรียบร้อยแล้ว`;
        setFeedback({
          tone: "success",
          message: successMsg,
        });
        toast.success(status === "draft" ? "บันทึกร่างสำเร็จ" : "ส่งให้ฝ่ายจัดซื้อตรวจสอบสำเร็จ", prNumber);
        clearDraft();
        setSaved({ id: res.requisitionId, number: prNumber });
        setReservedPrNumber(prNumber);
        router.refresh();
      }
      } catch { setFeedback({ tone: "error", message: "ไม่สามารถยืนยันผลการบันทึก กรุณาตรวจสอบรายการก่อนลองอีกครั้ง" }); }
      finally { saveLock.current = false; }
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-0 backdrop-blur-sm sm:p-2.5">
      <div className="document-form flex h-[100dvh] w-full max-w-[1120px] flex-col overflow-hidden border border-red-200 bg-white shadow-2xl dark:border-red-500/25 dark:bg-[#171313] sm:h-auto sm:max-h-[90dvh] sm:rounded-[8px]">
        {/* Modal Header */}
        <div className="document-form-header flex items-center justify-between border-b border-red-100 px-3 py-2.5 dark:border-red-500/20 sm:px-4">
          <div className="flex items-center gap-3">
            <CompanyFormLogo className="document-brand" />
            <h2 className="text-[16px] font-bold text-on-surface">
              {editPrId ? "แก้ไขใบขอซื้อ (PR)" : "สร้างใบขอซื้อ (PR)"}
            </h2>
          </div>

          <button
            className="grid h-7 w-7 place-items-center rounded-[6px] text-on-surface transition-colors hover:bg-surface-container"
            aria-label="ปิด"
            onClick={closeForm}
            type="button"
            disabled={isPending}
          >
            <X size={20} />
          </button>
        </div>

        {draftPrompt}
        {/* Modal Body */}
        <DocumentMobileWorkspace><div className="flex-1 overflow-y-auto">
          <fieldset disabled={isPending || Boolean(saved)} className="document-form-locked document-form-body">
            {isReadOnly && !saved && (
              <div className="px-4 pt-3">
                <div className="flex items-center gap-2 p-3 rounded-[6px] text-[13px] font-bold bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
                  <AlertCircle size={16} className="text-amber-800 dark:text-amber-400 shrink-0" />
                  <span>เอกสารนี้ไม่สามารถแก้ไขได้แล้ว เนื่องจากอยู่ในสถานะ &quot;{getPurchaseRequisitionStatusLabel((initialData?.status ?? "draft") as PurchaseRequisitionStatus)}&quot;</span>
                </div>
              </div>
            )}

            {/* Feedback Alert */}
            {feedback && (
              <div className="px-4 pt-3">
                <div
                  className={`p-3 rounded-[6px] text-[13px] font-bold ${
                    feedback.tone === "success"
                      ? "bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300"
                      : "bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300"
                  }`}
                >
                  {feedback.message}
                </div>
              </div>
            )}

            {/* Document Info Section */}
            <section className="document-metadata-section border-b border-red-100 px-3 py-2.5 dark:border-red-500/20 sm:px-4">
              <div className="document-fields">
                <ReadOnlyField
                  description="ระบบสร้างให้อัตโนมัติเมื่อกดบันทึก"
                  label="เลขที่ PR"
                  value={saved?.number || (editPrId ? "เลขเอกสารเดิม" : reservedPrNumber || "กำลังสร้างเลข...")}
                />
                <ReadOnlyField
                  description="ระบบกำหนดให้อัตโนมัติ"
                  label="วันที่เอกสาร"
                  value={formatDisplayDate(documentDate)}
                />

                <ReadOnlyField
                  description="ผู้ขอซื้อดึงจากบัญชีผู้ใช้งาน"
                  label="ผู้ขอซื้อ"
                  value={requester.name}
                />
                <ReadOnlyField
                  description="แผนกดึงจากบัญชีผู้ใช้งาน"
                  label="แผนก"
                  value={requester.departmentName}
                />
                <IconField
                  icon={<CalendarDays size={16} />}
                  label="วันที่ต้องการใช้ *"
                  type="date"
                  min={todayStr}
                  onValueChange={(val) => {
                    setNeededByDate(val);
                    setItems((current) =>
                      current.map((item) => ({
                        ...item,
                        neededByDate: val,
                      })),
                    );
                  }}
                  value={neededByDate}
                  disabled={isPending || isReadOnly}
                />
              </div>
            </section>

            {/* Line Items Section */}
            <section className="document-items-section px-3 py-2.5 sm:px-4">
              <DocumentMobileItemToolbar onAdd={() => openSearchModal(null)} disabled={isPending || isReadOnly} search={<input aria-label="ค้นหาในรายการสินค้า" placeholder="ค้นหารหัสหรือชื่อสินค้า" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />}>
                {!isReadOnly && <><button type="button" disabled={isPending} onClick={handleAddItem}><Plus size={16} />เพิ่มแถวเปล่า</button><button type="button" disabled={isPending} onClick={() => importInputRef.current?.click()}><FileSpreadsheet size={16} />นำเข้าจาก Excel</button><button type="button" onClick={() => downloadCsvTemplate("pr-item-import-template.csv", [["รหัสสินค้า", "จำนวน", "วันที่ต้องการ", "หมายเหตุ"], ["RM001", "10", neededByDate, ""]])}><Download size={16} />แม่แบบ</button></>}
              </DocumentMobileItemToolbar>
              <div className="document-toolbar document-desktop-toolbar">
                <SectionHeading number="02" title="รายการสินค้า" />

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="relative min-w-0 flex-[1_1_100%] sm:min-w-[280px] xl:flex-none">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                      size={16}
                    />
                    <input
                      className="h-[32px] w-full rounded-[6px] border border-red-200 bg-white px-8 text-[12px] font-medium text-on-surface outline-none transition-colors placeholder:text-secondary focus:border-primary dark:border-red-500/25 dark:bg-[#171313]"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="ค้นหารหัส/ชื่อสินค้าในรายการด้านล่าง..."
                      value={searchQuery}
                      disabled={isPending}
                    />
                  </label>

                  {!isReadOnly && (
                    <>
                      <input
                        accept=".xlsx,.csv,.xls,.xml"
                        className="hidden"
                        onChange={(event) => { void handleImport(event.target.files?.[0]); event.target.value = ""; }}
                        ref={importInputRef}
                        type="file"
                      />
                      <button
                        className="inline-flex h-[32px] items-center gap-1.5 rounded-[6px] bg-primary px-3.5 text-[12px] font-bold text-white transition-colors hover:bg-primary/95 disabled:opacity-50 border-none cursor-pointer"
                        onClick={() => openSearchModal(null)}
                        type="button"
                        disabled={isPending}
                      >
                        <Search size={14} />
                        ค้นหาสินค้า/บริการ
                      </button>

                      <button
                        className="inline-flex h-[32px] items-center gap-1.5 rounded-[6px] border border-outline-variant bg-white px-3.5 text-[12px] font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50 dark:border-red-500/25 dark:bg-[#171313] cursor-pointer"
                        onClick={handleAddItem}
                        type="button"
                        disabled={isPending}
                      >
                        <Plus size={14} />
                        เพิ่มแถวเปล่า
                      </button>

                      <button
                        className="inline-flex h-[32px] items-center gap-1.5 rounded-[6px] border border-red-200 bg-white px-3.5 text-[12px] font-bold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50 dark:border-red-500/25 dark:bg-[#171313]"
                        onClick={() => importInputRef.current?.click()}
                        type="button"
                        disabled={isPending}
                      >
                        <FileSpreadsheet size={15} />
                        นำเข้าจาก Excel
                      </button>
                      <button
                        className="inline-flex h-[32px] items-center gap-1.5 rounded-[6px] border border-outline-variant bg-white px-3 text-[12px] font-bold text-on-surface hover:bg-surface-container-low dark:bg-[#171313]"
                        onClick={() => downloadCsvTemplate("pr-item-import-template.csv", [["รหัสสินค้า", "จำนวน", "วันที่ต้องการ", "หมายเหตุ"], ["RM001", "10", neededByDate, ""]])}
                        type="button"
                        disabled={isPending}
                      >
                        <Download size={14} />
                        แม่แบบ
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="document-entry-container mt-2.5 overflow-hidden rounded-[7px] border border-red-100 dark:border-red-500/20">
                <div className="overflow-x-auto">
                  <DocumentEntryTable className="document-pr-table w-full border-collapse text-left table-fixed">
                    <thead className="bg-gray-50 text-[10px] font-bold text-on-surface dark:bg-white/5">
                      <tr className="h-[32px]">
                        <th className="w-[6%] border-b border-r border-red-100 px-3 dark:border-red-500/20">
                          ลำดับ
                        </th>
                        <th className="w-[15%] border-b border-r border-red-100 px-3 dark:border-red-500/20">
                          รหัสสินค้า *
                        </th>
                        <th className="w-[12%] border-b border-r border-red-100 px-3 dark:border-red-500/20">
                          ประเภท
                        </th>
                        <th className="w-[34%] border-b border-r border-red-100 px-3 dark:border-red-500/20">
                          รายละเอียดสินค้า/บริการ
                        </th>
                        <th className="w-[10%] border-b border-r border-red-100 px-3 dark:border-red-500/20 text-right">
                          จำนวน *
                        </th>
                        <th className="w-[8%] border-b border-r border-red-100 px-3 dark:border-red-500/20 text-center">
                          หน่วย
                        </th>
                        <th className="w-[22%] border-b border-r border-red-100 px-3 dark:border-red-500/20">
                          หมายเหตุ
                        </th>
                        <th className="w-[6%] border-b px-3 dark:border-red-500/20 text-center">
                          ลบ
                        </th>
                      </tr>
                    </thead>

                    <tbody className="text-[12px] font-medium text-on-surface divide-y divide-red-100 dark:divide-red-500/15">
                      {filteredItems.map((item, index) => {
                        const selectedMat = itemByKey.get(item.itemKey);

                        return (
                          <tr
                            key={item.id}
                            className="h-[44px] bg-white dark:bg-transparent hover:bg-surface-container-lowest"
                          >
                            <td className="border-r border-red-100 px-3 text-center font-semibold dark:border-red-500/15">
                              {index + 1}
                            </td>
                            <td className="border-r border-red-100 px-2 dark:border-red-500/15">
                              <div className="document-line-identity">
                              <MaterialSelectorRow
                                selectedMaterial={selectedMat}
                                onOpenSearch={() => openSearchModal(item.id)}
                                disabled={isPending || isReadOnly}
                              />
                              {selectedMat && <span className="document-mobile-badge"><ItemTypeBadge code={selectedMat.typeCode} name={selectedMat.typeName} /></span>}
                              </div>
                            </td>
                            <td className="border-r border-red-100 px-2 text-center dark:border-red-500/15">
                              {selectedMat ? (
                                <ItemTypeBadge code={selectedMat.typeCode} name={selectedMat.typeName} />
                              ) : (
                                <span className="text-secondary/50">-</span>
                              )}
                            </td>
                            <td className="border-r border-red-100 px-3 py-1.5 text-[11px] text-secondary dark:border-red-500/15" title={selectedMat?.name ?? ""}>
                              {selectedMat ? (
                                <div>
                                  <DocumentProductName name={selectedMat.name} />
                                  {selectedMat.description && selectedMat.description !== selectedMat.name ? (
                                    <div className="whitespace-normal text-[12px] font-medium text-secondary" title={selectedMat.description}>
                                      {selectedMat.description}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-secondary/60 italic">กรุณาเลือกสินค้า/บริการ</span>
                              )}
                            </td>
                            <td className="border-r border-red-100 px-2 dark:border-red-500/15">
                              <input
                                data-keyboard-target={`pr-quantity-${item.id}`}
                                aria-label={`จำนวน ${selectedMat?.code ?? index + 1}`}
                                type="number"
                                step={selectedMat?.allowsDecimal ? "any" : "1"}
                                min="0.001"
                                placeholder="0"
                                className="h-[28px] w-full rounded-[5px] border border-red-100 bg-white px-2 text-right text-[12px] font-semibold outline-none focus:border-primary disabled:opacity-50 dark:border-red-500/20 dark:bg-[#171313] text-on-surface"
                                onChange={(event) =>
                                  updateItem(item.id, "quantity", event.target.value)
                                }
                                value={item.quantity}
                                disabled={isPending || isReadOnly}
                              />
                            </td>
                            <td className="border-r border-red-100 px-3 text-center font-semibold text-secondary dark:border-red-500/15">
                              <span className="document-unit-value">{selectedMat ? selectedMat.unitName : "-"}</span>
                            </td>
                            <td className="border-r border-red-100 px-2 dark:border-red-500/15">
                              <input
                                className="h-[28px] w-full rounded-[5px] border border-red-100 bg-white px-2 text-[12px] font-medium outline-none placeholder:text-secondary focus:border-primary disabled:opacity-50 dark:border-red-500/20 dark:bg-[#171313] text-on-surface"
                                aria-label={`หมายเหตุ ${selectedMat?.code ?? index + 1}`}
                                onChange={(event) =>
                                  updateItem(item.id, "note", event.target.value)
                                }
                                placeholder="ระบุหมายเหตุ (ถ้ามี)"
                                value={item.note}
                                disabled={isPending || isReadOnly}
                              />
                            </td>
                            <td className="px-2 text-center">
                              <button
                                aria-label="ลบรายการ"
                                className="mx-auto grid h-[24px] w-[24px] place-items-center text-primary transition-colors hover:text-primary/80 disabled:opacity-30"
                                onClick={() => handleRemoveItem(item.id)}
                                type="button"
                                disabled={isPending || isReadOnly}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DocumentEntryTable>
                </div>

                {/* Table Summary Footer */}
                <div className="document-entry-summary flex items-center justify-end gap-2.5 border-t border-red-100 px-4 py-2.5 text-[12px] font-semibold text-on-surface dark:border-red-500/20 bg-gray-50 dark:bg-white/5">
                  <span>
                    รวม <strong className="text-[14px] text-primary">{items.length}</strong>{" "}
                    รายการ
                  </span>
                  <span className="text-secondary">|</span>
                  <span>
                    รวมจำนวน{" "}
                    <strong className="text-[14px] text-primary">
                      {new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(totalQuantity)}
                    </strong>{" "}
                    หน่วย
                  </span>
                </div>
              </div>

              {/* Remarks Box */}
              <DocumentFormPurpose>
                <TextAreaField
                  label="วัตถุประสงค์ในการขอซื้อ"
                  maxLength={300}
                  onChange={setObjective}
                  rows={2}
                  value={objective}
                  disabled={isPending || isReadOnly}
                />
              </DocumentFormPurpose>
            </section>
          </fieldset>
        </div></DocumentMobileWorkspace>

        {/* Modal Footer Controls */}
        <DocumentFormFooter saved={saved} pending={isPending} summary={<><strong className="document-count">{items.filter(item => item.itemKey).length}</strong> รายการ</>} onClose={closeForm} onPrint={onPrint} onNext={onNext}>
          {!isReadOnly && <><button type="button" disabled={isPending} onClick={() => handleSave("draft")}><Save size={15} className="inline mr-2" />บันทึกร่าง</button><button className="primary" type="button" disabled={isPending} onClick={() => handleSave("pending_approval")}><SendHorizontal size={15} className="inline mr-2" />{isPending ? "กำลังบันทึก..." : "ส่งตรวจสอบ"}</button></>}
        </DocumentFormFooter>
      </div>

      {searchModal.isOpen ? (
        <MaterialSearchModal
          isOpen
          onClose={closeSearchModal}
          materials={materials}
          onSelect={handleSearchModalSelect}
          singleSelectMode={searchModal.targetRowId !== null}
          alreadySelectedIds={alreadySelectedIds}
        />
      ) : null}
    </div>
  );
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="document-section-number">{number}</span>
      <h3 className="text-[16px] font-bold text-on-surface">{title}</h3>
    </div>
  );
}

function ReadOnlyField({
  description,
  label,
  value,
}: {
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="document-field">
      <span className="mb-1.5 block text-[12px] font-bold text-on-surface">{label}</span>
      <div className="flex h-[36px] items-center rounded-[6px] border border-red-100 bg-gray-50 px-3 text-[13px] font-semibold text-secondary dark:border-red-500/20 dark:bg-white/5">
        {value}
      </div>
      {description ? <small>{description}</small> : null}
    </div>
  );
}

function IconField({
  actionIcon,
  description,
  icon,
  label,
  onValueChange,
  value,
  type = "text",
  disabled,
  min,
}: {
  actionIcon?: React.ReactNode;
  description?: string;
  icon: React.ReactNode;
  label: string;
  onValueChange?: (value: string) => void;
  value: string;
  type?: string;
  disabled?: boolean;
  min?: string;
}) {
  const editable = typeof onValueChange === "function" && !disabled;

  return (
    <div className="document-field">
      <span className="mb-1.5 block text-[12px] font-bold text-on-surface">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary">
          {icon}
        </span>
        <input
          type={type}
          disabled={disabled}
          min={min}
          className="h-[36px] w-full rounded-[6px] border border-red-100 bg-white pl-10 pr-9 text-[13px] font-medium text-on-surface outline-none transition-colors focus:border-primary disabled:opacity-50 dark:border-red-500/20 dark:bg-[#171313]"
          onChange={(event) => onValueChange?.(event.target.value)}
          readOnly={!editable}
          value={value}
        />
        {actionIcon ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">
            {actionIcon}
          </span>
        ) : null}
      </div>
      {description ? <small>{description}</small> : null}
    </div>
  );
}

function TextAreaField({
  label,
  maxLength,
  onChange,
  rows,
  value,
  disabled,
}: {
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  rows: number;
  value: string;
  disabled?: boolean;
}) {
  return (
    <div className="document-note">
      <span className="mb-1.5 block text-[12px] font-bold text-on-surface">{label}</span>
      <div className="relative">
        <textarea
          disabled={disabled}
          className="w-full resize-none rounded-[6px] border border-red-100 bg-white px-3 py-2.5 pr-16 text-[13px] font-medium text-on-surface outline-none transition-colors focus:border-primary disabled:opacity-50 dark:border-red-500/20 dark:bg-[#171313]"
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          value={value}
        />
        <span className="absolute bottom-2.5 right-3 text-[10px] font-medium text-secondary/70">
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
