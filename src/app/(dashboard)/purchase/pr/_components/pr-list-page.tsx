"use client";

import {
  Ban,
  CalendarDays,
  Filter,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { StatusBadge, statusTone } from "@/components/status-badge";
import type {
  PurchaseRequisitionStatus,
  PurchaseRequisitionSummary,
} from "@/lib/purchase-requisitions";
import type {
  PurchaseRequisitionEditableRow,
  PurchaseRequisitionMaterial,
} from "@/lib/purchase-requisition-form";
import type { PurchaseRequisitionPrintDetail } from "@/lib/purchase-requisition-print";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import {
  formatDisplayDate,
  getPurchaseRequisitionStatusLabel,
} from "@/lib/purchase-requisitions";
import { PrCreateModal } from "./pr-create-modal";
import { exportPurchaseRequisitionsToExcel } from "./pr-export";
import { PrPrintPreviewModal } from "./pr-print-preview-modal";
import {
  cancelPurchaseRequisitionAction,
  decidePurchaseRequisitionAction,
  deletePurchaseRequisitionAction,
  getPurchaseRequisitionItemsAction,
  getPurchaseRequisitionPrintDetailAction,
} from "@/app/actions/purchase-requisitions";
import { DocumentCancelModal } from "../../_components/document-cancel-modal";
import { toast } from "@/components/toast";
import { ConfirmModal } from "@/components/confirm-modal";

type PrListPageProps = {
  canDecide: boolean;
  documentContext: CompanyDocumentContext;
  initialDepartments: string[];
  initialDocumentDate: string;
  initialEndDate: string;
  initialMaterials: PurchaseRequisitionMaterial[];
  initialOpenRequisitionId: number | null;
  initialRequisitions: PurchaseRequisitionSummary[];
  initialRequester: { departmentName: string; name: string };
  initialStartDate: string;
};

const ITEMS_PER_PAGE = 15;

const TABLE_HEADERS = [
  { key: "index", label: "ลำดับ", width: "w-[6%]" },
  { key: "pr", label: "เลขที่ PR", width: "w-[15%]" },
  { key: "date", label: "วันที่", width: "w-[10%]" },
  { key: "requester", label: "ผู้ขอซื้อ", width: "w-[19%]" },
  { key: "department", label: "แผนก", width: "w-[10%]" },
  { key: "needed", label: "วันที่ต้องการใช้", width: "w-[11%]" },
  { key: "items", label: "จำนวนรายการ", width: "w-[9%]" },
  { key: "status", label: "สถานะ", width: "w-[10%]" },
  { key: "actions", label: "จัดการ", width: "w-[10%]" },
] as const;

export function PrListPage({
  canDecide,
  documentContext,
  initialDepartments,
  initialDocumentDate,
  initialEndDate,
  initialMaterials,
  initialOpenRequisitionId,
  initialRequisitions,
  initialRequester,
  initialStartDate,
}: PrListPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const openedNotificationPrRef = useRef<number | null>(null);
  const [printPreview, setPrintPreview] =
    useState<PurchaseRequisitionPrintDetail | null>(null);
  const [editPrData, setEditPrData] = useState<{
    id: number;
    items: PurchaseRequisitionEditableRow[];
    neededByDate: string;
    remarks: string;
    status?: string;
  } | null>(null);
  const [deleteConfirmPr, setDeleteConfirmPr] = useState<PurchaseRequisitionSummary | null>(null);
  const [cancelRequisition, setCancelRequisition] =
    useState<PurchaseRequisitionSummary | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (type === "error") {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseRequisitionStatus>(
    "all",
  );
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const handlePreviewClick = async (row: PurchaseRequisitionSummary) => {
    setIsPreviewLoading(true);
    const result = await getPurchaseRequisitionPrintDetailAction(row.id);
    setIsPreviewLoading(false);

    if (result.success && result.detail) {
      setPrintPreview(result.detail);
      return;
    }

    showToast(
      result.error || "ไม่สามารถเปิดตัวอย่างใบขอซื้อได้",
      "error",
    );
  };

  useEffect(() => {
    if (
      !initialOpenRequisitionId ||
      openedNotificationPrRef.current === initialOpenRequisitionId
    ) {
      return;
    }

    openedNotificationPrRef.current = initialOpenRequisitionId;
    startTransition(async () => {
      const result = await getPurchaseRequisitionPrintDetailAction(
        initialOpenRequisitionId,
      );
      if (result.success && result.detail) {
        setPrintPreview(result.detail);
        return;
      }
      showToast(
        result.error || "ไม่สามารถเปิดรายละเอียดใบขอซื้อจากการแจ้งเตือนได้",
        "error",
      );
    });
  }, [initialOpenRequisitionId]);

  const handleDecision = async (
    decision: "approved" | "rejected",
    note: string,
  ) => {
    if (!printPreview) {
      return { error: "ไม่พบใบขอซื้อที่ต้องการดำเนินการ", success: false };
    }

    const result = await decidePurchaseRequisitionAction({
      decision,
      note,
      requisitionId: printPreview.id,
    });

    if (!result.success) {
      return result;
    }

    setPrintPreview(null);
    showToast(
      decision === "approved"
        ? `อนุมัติใบขอซื้อ ${result.prNumber} เรียบร้อยแล้ว`
        : `ปฏิเสธใบขอซื้อ ${result.prNumber} เรียบร้อยแล้ว`,
    );
    startTransition(() => router.refresh());
    return result;
  };

  const handleEditClick = async (row: PurchaseRequisitionSummary) => {
    setIsEditLoading(true);
    const res = await getPurchaseRequisitionItemsAction(row.id);
    setIsEditLoading(false);

    if (res.success && res.items) {
      setEditPrData({
        id: row.id,
        neededByDate: row.needed_by_date || "",
        remarks: row.remarks || "",
        items: res.items,
        status: row.status,
      });
    } else {
      showToast(res.error || "ไม่สามารถดึงข้อมูลรายการสินค้าได้", "error");
    }
  };

  const handleDelete = (row: PurchaseRequisitionSummary) => {
    if (row.status !== "draft") {
      showToast("ลบได้เฉพาะใบขอซื้อสถานะร่าง กรุณาใช้การยกเลิกสำหรับเอกสารที่ส่งอนุมัติแล้ว", "error");
      return;
    }
    setDeleteConfirmPr(row);
  };

  const confirmDelete = async (row: PurchaseRequisitionSummary) => {
    startTransition(async () => {
      const res = await deletePurchaseRequisitionAction(row.id);
      if (res.success) {
        showToast(`ลบใบขอซื้อเลขที่ ${row.pr_number} สำเร็จแล้ว`, "success");
        setDeleteConfirmPr(null);
        router.refresh();
      } else {
        showToast(res.error || "เกิดข้อผิดพลาดในการลบ", "error");
      }
    });
  };

  const deferredQuery = useDeferredValue(query);

  const filteredRequisitions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const startValue = startDate ? new Date(startDate) : null;
    const endValue = endDate ? new Date(endDate) : null;

    return initialRequisitions.filter((requisition) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          requisition.pr_number,
          requisition.requester_name,
          requisition.department_name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" || requisition.status === statusFilter;

      const matchesDepartment =
        departmentFilter === "all" ||
        requisition.department_name === departmentFilter;

      const documentDate = new Date(requisition.document_date);
      const matchesStart = !startValue || documentDate >= startValue;
      const matchesEnd = !endValue || documentDate <= endValue;

      return (
        matchesQuery &&
        matchesStatus &&
        matchesDepartment &&
        matchesStart &&
        matchesEnd
      );
    });
  }, [
    deferredQuery,
    departmentFilter,
    endDate,
    initialRequisitions,
    startDate,
    statusFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRequisitions.length / ITEMS_PER_PAGE),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const currentPageRows = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredRequisitions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRequisitions, safeCurrentPage]);

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
    setCurrentPage(1);
  };

  const rowsStart = filteredRequisitions.length
    ? (safeCurrentPage - 1) * ITEMS_PER_PAGE + 1
    : 0;

  return (
    <section className="min-w-0 space-y-2">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <h1 className="text-[24px] font-bold leading-none text-on-surface">
              ใบขอซื้อ (PR)
            </h1>
            <p className="text-[13px] font-medium leading-none text-secondary">
              รายการใบขอซื้อทั้งหมด
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton onClick={() => exportPurchaseRequisitionsToExcel(filteredRequisitions)} />
            <ActionButton
              icon={<Plus size={17} />}
              label="เปิด PR ใหม่"
              onClick={() => setIsCreateModalOpen(true)}
              tone="primary"
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[1.22fr_0.88fr_0.88fr_1.18fr_auto]">
          <label className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
              size={18}
            />
            <input
              className="h-[38px] w-full rounded-[5px] border border-outline-variant bg-background px-11 text-[14px] font-medium text-on-surface outline-none focus:border-primary"
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาเลขที่ PR, ผู้ขอซื้อ..."
              value={query}
            />
          </label>

          <select
            className="h-[38px] rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
            onChange={(event) => {
              setStatusFilter(
                event.target.value === "all"
                  ? "all"
                  : (event.target.value as PurchaseRequisitionStatus),
              );
              setCurrentPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            <option value="draft">สถานะ: ร่าง</option>
            <option value="pending_approval">สถานะ: รออนุมัติ</option>
            <option value="approved">สถานะ: อนุมัติแล้ว</option>
            <option value="rejected">สถานะ: ปฏิเสธ</option>
            <option value="cancelled">สถานะ: ยกเลิก</option>
          </select>

          <select
            className="h-[38px] rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
            onChange={(event) => {
              setDepartmentFilter(event.target.value);
              setCurrentPage(1);
            }}
            value={departmentFilter}
          >
            <option value="all">แผนก: ทั้งหมด</option>
            {initialDepartments.map((department) => (
              <option key={department} value={department}>
                แผนก: {department}
              </option>
            ))}
          </select>

          <div className="flex h-[38px] items-center gap-3 rounded-[5px] border border-outline-variant bg-background px-4">
            <CalendarDays className="shrink-0 text-secondary" size={18} />
            <input
              className="w-full bg-transparent text-[14px] font-medium text-on-surface outline-none"
              onChange={(event) => {
                setStartDate(event.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={startDate}
            />
            <span className="text-secondary">-</span>
            <input
              className="w-full bg-transparent text-[14px] font-medium text-on-surface outline-none"
              onChange={(event) => {
                setEndDate(event.target.value);
                setCurrentPage(1);
              }}
              type="date"
              value={endDate}
            />
          </div>

          <button
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
            onClick={resetFilters}
            type="button"
          >
            <Filter size={17} />
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <DataTable className="min-w-[900px]">
            <thead className="bg-gray-50 text-[11px] font-bold text-black dark:bg-white/5 dark:text-white">
              <tr className="h-[34px]">
                {TABLE_HEADERS.map((header) => (
                  <th
                    key={header.key}
                    className={`border-b border-outline-variant px-[14px] align-middle whitespace-nowrap ${header.width}`}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-outline-variant text-[13px] font-semibold text-black dark:text-white">
              {currentPageRows.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-secondary" colSpan={9}>
                    ไม่พบรายการใบขอซื้อที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                currentPageRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="h-[36px] bg-surface-container-lowest transition-colors hover:bg-surface-container-low/50"
                  >
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {rowsStart + index}
                    </td>
                    <td className="px-[14px] align-middle font-bold text-primary whitespace-nowrap">
                      {row.pr_number}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {formatDisplayDate(row.document_date)}
                    </td>
                    <td
                      className="truncate px-[14px] align-middle"
                      title={row.requester_name}
                    >
                      {row.requester_name}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {row.department_name}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {formatDisplayDate(row.needed_by_date)}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {row.requested_item_count}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      <StatusBadge tone={statusTone(row.status)}>
                        {getPurchaseRequisitionStatusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-[14px] align-middle">
                      <div className="flex items-center justify-start gap-[10px] pr-[6px]">
                        <IconButton
                          label="พิมพ์ใบขอซื้อ"
                          tone="view"
                          onClick={() => handlePreviewClick(row)}
                          disabled={isPending || isPreviewLoading}
                        >
                          <Printer size={17} strokeWidth={2.1} />
                        </IconButton>
                        <IconButton
                          label={row.status === "draft" ? "แก้ไข" : "ดูรายละเอียด"}
                          tone={row.status === "draft" ? "edit" : "view"}
                          onClick={() => handleEditClick(row)}
                          disabled={isPending || isEditLoading}
                        >
                          <Pencil size={17} strokeWidth={2.1} />
                        </IconButton>
                        <IconButton
                          label="ยกเลิกใบขอซื้อ"
                          tone="delete"
                          onClick={() => setCancelRequisition(row)}
                          disabled={
                            isPending ||
                            !["pending_approval", "approved"].includes(row.status)
                          }
                        >
                          <Ban size={17} strokeWidth={2.1} />
                        </IconButton>
                        <IconButton
                          label="ลบ"
                          tone="delete"
                          onClick={() => handleDelete(row)}
                          disabled={isPending || isEditLoading || row.status !== "draft"}
                        >
                          <Trash2 size={17} strokeWidth={2.1} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>

        <Pagination currentPage={safeCurrentPage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredRequisitions.length} totalPages={totalPages} />
      </div>

      {isCreateModalOpen ? (
        <PrCreateModal
          documentDate={initialDocumentDate}
          materials={initialMaterials}
          onClose={() => setIsCreateModalOpen(false)}
          requester={initialRequester}
        />
      ) : null}

      {editPrData ? (
        <PrCreateModal
          documentDate={initialDocumentDate}
          materials={initialMaterials}
          onClose={() => setEditPrData(null)}
          requester={initialRequester}
          editPrId={editPrData.id}
          initialData={editPrData}
        />
      ) : null}

      {printPreview ? (
        <PrPrintPreviewModal
          canDecide={canDecide}
          detail={printPreview}
          documentContext={documentContext}
          onDecision={handleDecision}
          onClose={() => setPrintPreview(null)}
        />
      ) : null}

      {cancelRequisition ? (
        <DocumentCancelModal
          documentNumber={cancelRequisition.pr_number}
          documentType="ใบขอซื้อ"
          isPending={isPending}
          onClose={() => setCancelRequisition(null)}
          onConfirm={async (reason) => {
            const result = await cancelPurchaseRequisitionAction({
              reason,
              requisitionId: cancelRequisition.id,
            });
            if (!result.success) {
              showToast(result.error, "error");
              return;
            }

            const number = cancelRequisition.pr_number;
            setCancelRequisition(null);
            showToast(`ยกเลิก ${number} เรียบร้อยแล้ว`);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmPr)}
        onClose={() => setDeleteConfirmPr(null)}
        onConfirm={async () => {
          if (deleteConfirmPr) {
            await confirmDelete(deleteConfirmPr);
          }
        }}
        title="ยืนยันการลบใบขอซื้อ"
        itemName={deleteConfirmPr?.pr_number}
        description="คุณแน่ใจหรือไม่ว่าต้องการลบใบขอซื้อนี้? การดำเนินการนี้ไม่สามารถเรียกคืนข้อมูลกลับมาได้"
        confirmText="ยืนยันการลบ"
        tone="danger"
        isPending={isPending}
      />
    </section>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: "neutral" | "primary";
}) {
  const className =
    tone === "primary"
      ? "border-primary bg-primary text-white hover:bg-primary/95"
      : "border-outline-variant bg-white text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low";

  return (
    <button
      className={`inline-flex h-[38px] items-center gap-[8px] rounded-[5px] border px-[14px] text-[14px] font-bold shadow-sm transition-colors ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
  tone,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: "delete" | "edit" | "view";
  disabled?: boolean;
}) {
  const className =
    tone === "delete"
      ? "text-primary hover:text-primary/80"
      : "text-on-surface hover:text-primary";

  return (
    <button
      aria-label={label}
      className={`grid h-[22px] w-[22px] place-items-center bg-transparent transition-colors ${className} disabled:opacity-30 disabled:cursor-not-allowed`}
      onClick={onClick}
      title={label}
      type="button"
      disabled={disabled}
    >
      {children}
    </button>
  );
}
