"use client";

import {
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import {
  useDeferredValue,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  createDepartmentAction,
  deleteDepartmentAction,
  setDepartmentStatusAction,
  updateDepartmentAction,
  type DepartmentRecord,
  type DepartmentSettingsData,
} from "@/app/actions/departments";
import { ActiveStatusBadge } from "@/components/status-badge";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import {
  normalizeDepartmentInput,
  validateDepartmentInput,
  type DepartmentInput,
} from "@/lib/departments";
import {
  DepartmentModal,
  type DepartmentFormMode,
} from "./department-modal";
import { exportDepartmentsToExcel } from "./department-export";

const ITEMS_PER_PAGE = 10;

const emptyDraft: DepartmentInput = {
  code: "",
  managerUserId: null,
  name: "",
  remarks: "",
  status: "active",
};

type Feedback = {
  message: string;
  tone: "error" | "success";
};

export function DepartmentManagement({
  initialData,
}: {
  initialData: DepartmentSettingsData;
}) {
  const [departments, setDepartments] = useState(initialData.departments);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [formMode, setFormMode] = useState<DepartmentFormMode | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DepartmentInput>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const keyword = deferredSearchQuery.trim().toLocaleLowerCase("th");
  const filteredDepartments = departments.filter((department) => {
    const matchesSearch =
      !keyword ||
      [
        department.code,
        department.name,
        department.managerName ?? "",
        department.remarks,
      ]
        .join(" ")
        .toLocaleLowerCase("th")
        .includes(keyword);
    const matchesStatus =
      statusFilter === "all" || department.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDepartments.length / ITEMS_PER_PAGE),
  );
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filteredDepartments.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const openCreateModal = () => {
    setDraft(emptyDraft);
    setEditingId(null);
    setFormError(null);
    setFeedback(null);
    setFormMode("create");
  };

  const openEditModal = (department: DepartmentRecord) => {
    setDraft({
      code: department.code,
      managerUserId: department.managerUserId,
      name: department.name,
      remarks: department.remarks,
      status: department.status,
    });
    setEditingId(department.id);
    setFormError(null);
    setFeedback(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    if (isPending) return;
    setFormMode(null);
    setEditingId(null);
    setFormError(null);
    setDraft(emptyDraft);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeDepartmentInput(draft);
    const validationError = validateDepartmentInput(normalized);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    startTransition(async () => {
      const result =
        formMode === "edit" && editingId !== null
          ? await updateDepartmentAction(editingId, normalized)
          : await createDepartmentAction(normalized);

      if ("error" in result) {
        setFormError(result.error ?? "ไม่สามารถบันทึกข้อมูลแผนกได้");
        return;
      }

      setDepartments((current) =>
        formMode === "edit"
          ? current.map((department) =>
              department.id === result.data.id ? result.data : department,
            )
          : [...current, result.data],
      );
      setFormMode(null);
      setEditingId(null);
      setDraft(emptyDraft);
      setFormError(null);
      setFeedback({
        message:
          formMode === "edit"
            ? "แก้ไขข้อมูลแผนกเรียบร้อยแล้ว"
            : "เพิ่มแผนกเรียบร้อยแล้ว",
        tone: "success",
      });
    });
  };

  const handleToggleStatus = (department: DepartmentRecord) => {
    const nextStatus =
      department.status === "active" ? "inactive" : "active";

    startTransition(async () => {
      const result = await setDepartmentStatusAction(
        department.id,
        nextStatus,
      );
      if ("error" in result) {
        setFeedback({
          message: result.error ?? "ไม่สามารถเปลี่ยนสถานะแผนกได้",
          tone: "error",
        });
        return;
      }

      setDepartments((current) =>
        current.map((item) =>
          item.id === department.id
            ? { ...item, status: nextStatus }
            : item,
        ),
      );
      setFeedback({
        message: "อัปเดตสถานะแผนกเรียบร้อยแล้ว",
        tone: "success",
      });
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteDepartmentAction(deleteTarget.id);
      if ("error" in result) {
        setDeleteTarget(null);
        setFeedback({
          message: result.error ?? "ไม่สามารถลบแผนกได้",
          tone: "error",
        });
        return;
      }

      setDepartments((current) =>
        current.filter((department) => department.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      setFeedback({ message: "ลบแผนกเรียบร้อยแล้ว", tone: "success" });
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.025em] text-on-surface">
            ตั้งค่าแผนก
          </h1>
          <p className="mt-1 text-[14px] font-medium text-secondary">
            จัดการข้อมูลแผนกสำหรับผู้ใช้งานและเอกสารในระบบ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton onClick={() => exportDepartmentsToExcel(filteredDepartments)} />
          {initialData.canManage ? (
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-primary px-4 text-[14px] font-bold text-white transition-colors hover:bg-primary/95"
              onClick={openCreateModal}
              type="button"
            >
              <Plus size={17} />
              เพิ่มแผนก
            </button>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <div
          className={`border px-4 py-2.5 text-[14px] font-bold ${
            feedback.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="space-y-3">
        <MobileListFilters
          activeCount={statusFilter === "all" ? 0 : 1}
          onClear={() => { setStatusFilter("all"); setCurrentPage(1); }}
          search={<ListSearchField onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }} placeholder="ค้นหารหัสแผนก ชื่อแผนก หรือหัวหน้า..." value={searchQuery} />}
        >
          <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }} value={statusFilter}><option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></ListFilterSelect>
        </MobileListFilters>
        <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center">
          <label className="relative block w-full sm:max-w-[520px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
              size={17}
            />
            <input
              className="h-10 w-full rounded-[5px] border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหารหัสแผนก, ชื่อแผนก, หัวหน้าแผนก..."
              value={searchQuery}
            />
          </label>
          <select
            className="h-10 w-full rounded-[5px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-bold text-on-surface outline-none focus:border-primary sm:w-[230px] dark:[color-scheme:dark]"
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            <option value="active">ใช้งาน</option>
            <option value="inactive">ระงับ</option>
          </select>
          <span className="ml-auto whitespace-nowrap text-[13px] font-semibold text-secondary">
            {filteredDepartments.length} รายการ
          </span>
        </div>

        <div className="overflow-hidden rounded-[5px] border border-outline-variant bg-surface-container-lowest">
          <div className="sm:hidden">
            <MobileEntityList
              actionLabel={(department) => `แก้ไข ${department.name}`}
              disabled={isPending}
              emptyText="ไม่พบข้อมูลแผนกตามเงื่อนไขที่ค้นหา"
              getKey={(department) => department.id}
              items={pageItems}
              meta={(department) => <>หัวหน้า: {department.managerName ?? "ยังไม่กำหนด"} · {department.userCount} ผู้ใช้งาน</>}
              onAction={initialData.canManage ? (department) => openEditModal(department) : undefined}
              onOpen={initialData.canManage ? openEditModal : undefined}
              primary={(department) => department.code}
              secondary={(department) => department.name}
              status={(department) => <ActiveStatusBadge active={department.status === "active"} />}
            />
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="erp-data-table min-w-[900px]">
              <thead className="bg-surface-container-low">
                <tr className="h-10 border-b border-outline-variant">
                  <TableHeader className="w-[7%] text-center">ลำดับ</TableHeader>
                  <TableHeader className="w-[14%]">รหัสแผนก</TableHeader>
                  <TableHeader className="w-[20%]">ชื่อแผนก</TableHeader>
                  <TableHeader className="w-[24%]">หัวหน้าแผนก</TableHeader>
                  <TableHeader className="w-[13%] text-center">
                    จำนวนผู้ใช้งาน
                  </TableHeader>
                  <TableHeader className="w-[12%] text-center">สถานะ</TableHeader>
                  <TableHeader className="w-[10%] text-center">จัดการ</TableHeader>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((department, index) => (
                  <tr
                    className="h-12 border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low/55"
                    key={department.id}
                  >
                    <TableCell className="text-center">
                      {(safePage - 1) * ITEMS_PER_PAGE + index + 1}
                    </TableCell>
                    <TableCell className="font-bold text-primary">
                      {department.code}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {department.name}
                    </TableCell>
                    <TableCell>
                      {department.managerName ?? (
                        <span className="text-secondary">ยังไม่กำหนด</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {department.userCount}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        aria-label={`เปลี่ยนสถานะ ${department.name}`}
                        className="inline-flex"
                        disabled={!initialData.canManage || isPending}
                        onClick={() => handleToggleStatus(department)}
                        type="button"
                      >
                        <ActiveStatusBadge active={department.status === "active"} />
                      </button>
                    </TableCell>
                    <TableCell>
                      {initialData.canManage ? (
                        <div className="flex items-center justify-center gap-4">
                          <button
                            aria-label={`แก้ไข ${department.name}`}
                            className="text-on-surface transition-colors hover:text-primary"
                            disabled={isPending}
                            onClick={() => openEditModal(department)}
                            type="button"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            aria-label={`ลบ ${department.name}`}
                            className="text-primary transition-opacity hover:opacity-70"
                            disabled={isPending}
                            onClick={() => setDeleteTarget(department)}
                            type="button"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-center text-secondary">—</span>
                      )}
                    </TableCell>
                  </tr>
                ))}
                {pageItems.length === 0 ? (
                  <tr>
                    <td
                      className="h-28 text-center text-[14px] font-medium text-secondary"
                      colSpan={7}
                    >
                      ไม่พบข้อมูลแผนกตามเงื่อนไขที่ค้นหา
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination currentPage={safePage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredDepartments.length} totalPages={totalPages} />
        </div>
      </section>

      {formMode ? (
        <DepartmentModal
          draft={draft}
          error={formError}
          isSaving={isPending}
          managerCandidates={initialData.managerCandidates}
          mode={formMode}
          onChange={setDraft}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteDepartmentModal
          department={deleteTarget}
          isSaving={isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}
    </div>
  );
}

function DeleteDepartmentModal({
  department,
  isSaving,
  onCancel,
  onConfirm,
}: {
  department: DepartmentRecord;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[390px] rounded-[6px] border border-outline-variant bg-surface-container-lowest p-5 text-center shadow-2xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Trash2 size={21} />
        </div>
        <h2 className="mt-3 text-[19px] font-bold text-on-surface">
          ยืนยันการลบแผนก
        </h2>
        <p className="mt-1 text-[14px] font-medium leading-6 text-secondary">
          ต้องการลบ{" "}
          <span className="font-bold text-on-surface">{department.name}</span>{" "}
          ใช่หรือไม่
        </p>
        {department.userCount > 0 ? (
          <p className="mt-2 text-[12px] font-bold text-primary">
            แผนกนี้มีผู้ใช้งานอยู่ {department.userCount} คน จึงไม่สามารถลบได้
          </p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            className="h-9 flex-1 rounded-[5px] border border-outline-variant text-[14px] font-bold text-on-surface"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 flex-1 rounded-[5px] bg-primary text-[14px] font-bold text-white disabled:opacity-50"
            disabled={isSaving || department.userCount > 0}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? "กำลังลบ..." : "ลบแผนก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TableHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 text-left text-[13px] font-extrabold text-on-surface ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 text-[14px] font-medium text-on-surface ${className}`}>
      {children}
    </td>
  );
}
