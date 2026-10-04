"use client";

import {
  Ban,
  Eye,
  Filter,
  Pencil,
  Plus,
  Printer,
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
import { MobileDocumentList } from "@/components/mobile-document-list";
import { MobileDocumentDetail } from "@/components/mobile-document-detail";
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
  reviewPurchaseRequisitionAction,
  deletePurchaseRequisitionAction,
  getPurchaseRequisitionItemsAction,
  getPurchaseRequisitionPrintDetailAction,
} from "@/app/actions/purchase-requisitions";
import { DocumentCancelModal } from "../../_components/document-cancel-modal";
import { toast } from "@/components/toast";
import { ConfirmModal } from "@/components/confirm-modal";
import { useHasPermission } from "@/components/permission-context";
import {
  ListDateRangeFilter,
  ListFilterButton,
  ListFilterSelect,
  ListFilterToolbar,
  ListSearchField,
  MobileListFilters,
} from "@/components/list-filters";
import { RowActionMenu } from "@/components/row-action-menu";

type PrListPageProps = {
  canReview: boolean;
  canReturn: boolean;
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
  { key: "actions", label: "จัดการ", width: "w-[6%]" },
] as const;

export function PrListPage({
  canReview,
  canReturn,
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
  const canCreate = useHasPermission("pr.create");
  const canEdit = useHasPermission("pr.edit");
  const canDelete = useHasPermission("pr.delete");
  const canCancel = useHasPermission("pr.cancel");
  const [isPending, startTransition] = useTransition();
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const openedNotificationPrRef = useRef<number | null>(null);
  const [printPreview, setPrintPreview] =
    useState<PurchaseRequisitionPrintDetail | null>(null);
  const [mobileDetail, setMobileDetail] = useState<PurchaseRequisitionPrintDetail | null>(null);
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
  const [createVersion, setCreateVersion] = useState(0);
  const createNext = () => { setEditPrData(null); setCreateVersion(value => value + 1); setIsCreateModalOpen(true); };
  const handlePreviewClick = async (row: { id: number }) => {
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

  const handleMobileDetailClick = async (row: { id: number }) => {
    setIsPreviewLoading(true);
    const result = await getPurchaseRequisitionPrintDetailAction(row.id);
    setIsPreviewLoading(false);
    if (result.success && result.detail) { setMobileDetail(result.detail); return; }
    showToast(result.error || "ไม่สามารถเปิดรายละเอียดใบขอซื้อได้", "error");
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
    decision: "ready_for_po" | "returned",
    note: string,
  ) => {
    if (!printPreview) {
      return { error: "ไม่พบใบขอซื้อที่ต้องการดำเนินการ", success: false };
    }

    const result = await reviewPurchaseRequisitionAction({
      decision,
      note,
      requisitionId: printPreview.id,
    });

    if (!result.success) {
      return result;
    }

    setPrintPreview(null);
    showToast(
      decision === "ready_for_po"
        ? `ตรวจสอบใบขอซื้อ ${result.prNumber} พร้อมออก PO แล้ว`
        : `ส่งใบขอซื้อ ${result.prNumber} กลับแก้ไขแล้ว`,
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
      showToast("ลบได้เฉพาะใบขอซื้อสถานะร่าง กรุณาใช้การยกเลิกสำหรับเอกสารที่ส่งตรวจสอบแล้ว", "error");
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

  const mobileRows = currentPageRows.map((row) => ({
    details: [
      { label: "ผู้ขอซื้อ", value: row.requester_name },
      { label: "แผนก", value: row.department_name },
      { label: "วันที่เอกสาร", value: formatDisplayDate(row.document_date) },
      { label: "วันที่ต้องการใช้", value: formatDisplayDate(row.needed_by_date) },
      { label: "จำนวน", value: `${row.requested_item_count} รายการ` },
    ],
    id: row.id,
    meta: `${formatDisplayDate(row.document_date)} · ${row.requested_item_count} รายการ`,
    status: <StatusBadge tone={statusTone(row.status)}>{getPurchaseRequisitionStatusLabel(row.status, row.po_status)}</StatusBadge>,
    subtitle: row.requester_name,
    title: row.pr_number,
  }));

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
            {canCreate ? (
              <ActionButton
                icon={<Plus size={17} />}
                label="เปิด PR ใหม่"
                onClick={() => setIsCreateModalOpen(true)}
                tone="primary"
              />
            ) : null}
          </div>
        </div>

        <MobileListFilters activeCount={[statusFilter !== "all", departmentFilter !== "all", startDate, endDate].filter(Boolean).length} onClear={resetFilters} resultLabel={`แสดง ${filteredRequisitions.length.toLocaleString("th-TH")} รายการ`} search={<ListSearchField onChange={(value) => { setQuery(value); setCurrentPage(1); }} placeholder="ค้นหาเลขที่ PR, ผู้ขอซื้อ..." value={query} />}>
          <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value === "all" ? "all" : value as PurchaseRequisitionStatus); setCurrentPage(1); }} value={statusFilter}><option value="all">ทั้งหมด</option><option value="draft">ร่าง</option><option value="pending_approval">รอตรวจสอบ</option><option value="approved">พร้อมออก PO</option><option value="rejected">ส่งกลับแก้ไข</option><option value="cancelled">ยกเลิก</option></ListFilterSelect>
          <ListFilterSelect label="แผนก" onChange={(value) => { setDepartmentFilter(value); setCurrentPage(1); }} value={departmentFilter}><option value="all">ทั้งหมด</option>{initialDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</ListFilterSelect>
          <ListDateRangeFilter
            endValue={endDate}
            minEnd={startDate || undefined}
            onEndChange={(value) => { setEndDate(value); setCurrentPage(1); }}
            onStartChange={(value) => { setStartDate(value); setCurrentPage(1); }}
            startValue={startDate}
          />
        </MobileListFilters>

        <ListFilterToolbar className="hidden min-w-0 md:grid md:grid-cols-2 xl:grid-cols-[1.22fr_0.88fr_0.88fr_1.18fr_auto]">
          <ListSearchField
              onChange={(value) => {
                setQuery(value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาเลขที่ PR, ผู้ขอซื้อ..."
              value={query}
          />

          <ListFilterSelect
            label="สถานะ"
            onChange={(value) => {
              setStatusFilter(
                value === "all"
                  ? "all"
                  : (value as PurchaseRequisitionStatus),
              );
              setCurrentPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">ทั้งหมด</option>
            <option value="draft">ร่าง</option>
            <option value="pending_approval">รอตรวจสอบ</option>
            <option value="approved">พร้อมออก PO</option>
            <option value="rejected">ส่งกลับแก้ไข</option>
            <option value="cancelled">ยกเลิก</option>
          </ListFilterSelect>

          <ListFilterSelect
            label="แผนก"
            onChange={(value) => {
              setDepartmentFilter(value);
              setCurrentPage(1);
            }}
            value={departmentFilter}
          >
            <option value="all">ทั้งหมด</option>
            {initialDepartments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </ListFilterSelect>

          <ListDateRangeFilter
            endValue={endDate}
            minEnd={startDate || undefined}
            onEndChange={(value) => { setEndDate(value); setCurrentPage(1); }}
            onStartChange={(value) => { setStartDate(value); setCurrentPage(1); }}
            startValue={startDate}
          />

          <ListFilterButton
            icon={<Filter size={17} />}
            onClick={resetFilters}
          >
            ล้างตัวกรอง
          </ListFilterButton>
        </ListFilterToolbar>
      </div>

      {!mobileDetail ? <MobileDocumentList
        actions={(mobileRow, close) => {
          const row = currentPageRows.find((item) => item.id === mobileRow.id);
          if (!row) return null;
          return <>
            <button className="mobile-sheet-primary" onClick={() => { close(); void handleMobileDetailClick(row); }} type="button"><Eye size={18} />เปิดเอกสาร</button>
            <button className="mobile-sheet-secondary" onClick={() => { close(); void handlePreviewClick(row); }} type="button"><Printer size={18} />พิมพ์</button>
            {canEdit && ["draft", "rejected"].includes(row.status) ? <button className="mobile-sheet-quiet" onClick={() => { close(); void handleEditClick(row); }} type="button"><Pencil size={18} />แก้ไข</button> : null}
          </>;
        }}
        emptyText="ไม่พบรายการใบขอซื้อที่ตรงกับตัวกรอง"
        rows={mobileRows}
      /> : null}

      <div className="erp-desktop-table overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-sm">
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
                    data-row-actions={`pr-${row.id}`}
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
                        {getPurchaseRequisitionStatusLabel(row.status, row.po_status)}
                      </StatusBadge>
                    </td>
                    <td className="px-[14px] align-middle">
                      <RowActionMenu
                        actions={[
                          { disabled: isPending || isPreviewLoading, icon: <Printer size={16} />, label: "ดูและพิมพ์เอกสาร", onSelect: () => void handlePreviewClick(row) },
                          ...(canEdit && ["draft", "rejected"].includes(row.status) ? [{ disabled: isPending || isEditLoading, icon: <Pencil size={16} />, label: "แก้ไข", onSelect: () => void handleEditClick(row) }] : []),
                          ...(canCancel ? [{ danger: true, disabled: isPending || !["pending_approval", "approved"].includes(row.status), icon: <Ban size={16} />, label: "ยกเลิกเอกสาร", onSelect: () => setCancelRequisition(row) }] : []),
                          ...(canDelete ? [{ danger: true, disabled: isPending || isEditLoading || row.status !== "draft", icon: <Trash2 size={16} />, label: "ลบเอกสาร", onSelect: () => handleDelete(row) }] : []),
                        ]}
                        contextId={`pr-${row.id}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>

        <Pagination currentPage={safeCurrentPage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredRequisitions.length} totalPages={totalPages} />
      </div>

      <div className="md:hidden">
        <Pagination currentPage={safeCurrentPage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredRequisitions.length} totalPages={totalPages} />
      </div>

      {isCreateModalOpen ? (
        <PrCreateModal
          key={createVersion}
          onPrint={id => handlePreviewClick({ id })}
          onNext={createNext}
          documentDate={initialDocumentDate}
          materials={initialMaterials}
          onClose={() => setIsCreateModalOpen(false)}
          requester={initialRequester}
        />
      ) : null}

      {editPrData ? (
        <PrCreateModal
          key={createVersion}
          onPrint={id => handlePreviewClick({ id })}
          onNext={createNext}
          documentDate={initialDocumentDate}
          materials={initialMaterials}
          onClose={() => setEditPrData(null)}
          requester={initialRequester}
          editPrId={editPrData.id}
          initialData={editPrData}
        />
      ) : null}

      {mobileDetail ? <MobileDocumentDetail
        actions={<>
          {canEdit && ["draft", "rejected"].includes(mobileDetail.status) ? <button className="mobile-sheet-secondary flex-1" onClick={() => { const row = initialRequisitions.find((item) => item.id === mobileDetail.id); setMobileDetail(null); if (row) void handleEditClick(row); }} type="button"><Pencil size={18} />แก้ไข</button> : null}
          <button className="mobile-sheet-primary flex-1" onClick={() => { setPrintPreview(mobileDetail); setMobileDetail(null); }} type="button"><Printer size={18} />พิมพ์</button>
        </>}
        fields={[
          { label: "วันที่เอกสาร", value: formatDisplayDate(mobileDetail.documentDate) },
          { label: "ผู้ขอซื้อ", value: mobileDetail.requesterName },
          { label: "แผนก", value: mobileDetail.departmentName },
          { label: "วันที่ต้องการใช้", value: formatDisplayDate(mobileDetail.neededByDate) },
          { label: "หมายเหตุ", value: mobileDetail.remarks || "-" },
        ]}
        items={mobileDetail.items.map((item) => ({
          code: item.code,
          details: [
            { label: "จำนวน", value: `${item.quantity.toLocaleString("th-TH")} ${item.unitName}` },
            { label: "วันที่ต้องการ", value: formatDisplayDate(item.neededByDate) },
          ],
          id: item.lineNo,
          name: item.name || item.description,
        }))}
        onClose={() => setMobileDetail(null)}
        status={<StatusBadge tone={statusTone(mobileDetail.status)}>{getPurchaseRequisitionStatusLabel(mobileDetail.status, initialRequisitions.find((row) => row.id === mobileDetail.id)?.po_status)}</StatusBadge>}
        title={mobileDetail.prNumber}
      /> : null}

      {printPreview ? (
        <PrPrintPreviewModal
          canReview={canReview}
          canReturn={canReturn}
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
