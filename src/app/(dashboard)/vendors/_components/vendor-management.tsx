"use client";

import { Download, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createVendorAction,
  deleteVendorAction,
  updateVendorAction,
  type VendorInput,
  type VendorLookup,
  type VendorRecord,
} from "@/app/actions/vendors";
import { VendorDetailModal } from "./vendor-detail-modal";
import { exportVendorsToExcel } from "./vendor-export";
import { VendorFormModal } from "./vendor-form-modal";
import { VendorTable } from "./vendor-table";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";

type Lookups = {
  creditTerms: VendorLookup[];
  groups: VendorLookup[];
  paymentMethods: VendorLookup[];
  taxTypes: VendorLookup[];
};

type VendorManagementProps = {
  initialError: string | null;
  initialVendors: VendorRecord[];
  lookups: Lookups;
};

export function VendorManagement({
  initialError,
  initialVendors,
  lookups,
}: VendorManagementProps) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initialVendors);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorRecord | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRecord | null>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialVendors, setPrevInitialVendors] = useState(initialVendors);
  if (initialVendors !== prevInitialVendors) {
    setPrevInitialVendors(initialVendors);
    setVendors(initialVendors);
  }

  useEffect(() => {
    if (initialError) {
      toast.error("ข้อผิดพลาด", initialError);
    }
  }, [initialError]);

  const filteredVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return vendors.filter((vendor) => {
      const matchesGroup =
        groupFilter === "all" || String(vendor.vendor_group_id) === groupFilter;
      const searchText = [
        vendor.vendor_code,
        vendor.vendor_name,
        vendor.tax_no,
        vendor.branch ?? "",
        vendor.vendor_group?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return matchesGroup && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [groupFilter, query, vendors]);

  const handleCreate = async (input: VendorInput) => {
    const result = await createVendorAction(input);
    if ("error" in result) {
      toast.error("ไม่สามารถเพิ่มผู้ขายได้", result.error);
      return;
    }

    toast.success("เพิ่มผู้ขายเรียบร้อยแล้ว", input.vendor_name);
    setFormMode(null);
    setSelectedVendor(null);
    startTransition(() => router.refresh());
  };

  const handleUpdate = async (input: VendorInput) => {
    if (!selectedVendor) {
      return;
    }

    const result = await updateVendorAction(selectedVendor.id, input);
    if ("error" in result) {
      toast.error("ไม่สามารถแก้ไขข้อมูลผู้ขายได้", result.error);
      return;
    }

    toast.success("บันทึกข้อมูลผู้ขายเรียบร้อยแล้ว", input.vendor_name);
    setFormMode(null);
    setSelectedVendor(null);
    startTransition(() => router.refresh());
  };

  const handleDelete = (vendor: VendorRecord) => {
    setDeleteTarget(vendor);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const result = await deleteVendorAction(deleteTarget.id);
    if ("error" in result) {
      toast.error("ไม่สามารถลบข้อมูลผู้ขายได้", result.error);
      return;
    }

    setVendors((current) => current.filter((item) => item.id !== deleteTarget.id));
    toast.success("ลบข้อมูลผู้ขายเรียบร้อยแล้ว", `${deleteTarget.vendor_name} (${deleteTarget.vendor_code})`);
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  };

  const openCreate = () => {
    setSelectedVendor(null);
    setFormMode("create");
  };

  const openEdit = (vendor: VendorRecord) => {
    setSelectedVendor(vendor);
    setFormMode("edit");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[10px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">
            Vendor Master
          </p>
          <h1 className="mt-1 text-[28px] font-bold text-on-surface">
            ผู้ขาย / เจ้าหนี้
          </h1>
          <p className="mt-1 text-[14px] font-medium text-secondary">
            จัดการข้อมูลผู้ขายสำหรับฝ่ายจัดซื้อ ใบ PR/PO และการรับสินค้า
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            icon={<Download size={17} />}
            label="นำเข้า"
            onClick={() => toast.info("ฟังก์ชันนำเข้าจะเปิดให้ใช้งานในรุ่นถัดไป")}
            tone="neutral"
          />
          <ExcelExportButton onClick={() => exportVendorsToExcel(filteredVendors)} />
          <ActionButton
            icon={<Plus size={18} />}
            label="เพิ่มผู้ขาย"
            onClick={openCreate}
            tone="primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center">
        <label className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
            size={18}
          />
          <input
            className="h-10 w-full rounded-[6px] border border-outline-variant bg-surface-container-low px-10 text-[14px] font-medium text-on-surface outline-none focus:border-primary"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหารหัสผู้ขาย ชื่อผู้ขาย เลขภาษี หรือสาขา"
            value={query}
          />
        </label>
        <select
          className="h-10 rounded-[6px] border border-outline-variant bg-surface-container-low px-3 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
          onChange={(event) => setGroupFilter(event.target.value)}
          value={groupFilter}
        >
          <option value="all">ทุกกลุ่มผู้ขาย</option>
          {lookups.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <VendorTable
        onDelete={handleDelete}
        onEdit={openEdit}
        onView={setDetailVendor}
        vendors={filteredVendors}
      />

      {isPending ? (
        <p className="text-[12px] font-medium text-secondary">กำลังอัปเดตข้อมูล...</p>
      ) : null}

      {formMode ? (
        <VendorFormModal
          lookups={lookups}
          mode={formMode}
          onClose={() => {
            setFormMode(null);
            setSelectedVendor(null);
          }}
          onSubmit={formMode === "create" ? handleCreate : handleUpdate}
          vendor={selectedVendor}
        />
      ) : null}

      {detailVendor ? (
        <VendorDetailModal
          onClose={() => setDetailVendor(null)}
          vendor={detailVendor}
        />
      ) : null}

      <ConfirmModal
        confirmText="ลบผู้ขาย"
        description={`คุณต้องการลบข้อมูลผู้ขาย "${deleteTarget?.vendor_name}" (${deleteTarget?.vendor_code}) ใช่หรือไม่? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้`}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ยืนยันการลบผู้ขาย / เจ้าหนี้"
        variant="danger"
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone: "neutral" | "primary";
}) {
  const className =
    tone === "primary"
      ? "border-primary bg-primary text-white hover:bg-primary/95"
      : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low";

  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-[6px] border px-4 text-[14px] font-bold shadow-sm transition-colors ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
