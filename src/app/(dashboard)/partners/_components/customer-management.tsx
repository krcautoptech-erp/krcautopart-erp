"use client";

import { Download, Plus, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
  type CustomerInput,
  type CustomerLookup,
  type CustomerRecord,
} from "@/app/actions/customers";
import { CustomerDetailModal } from "./customer-detail-modal";
import { exportCustomersToExcel } from "./customer-export";
import { CustomerFormModal } from "./customer-form-modal";
import { CustomerTable } from "./customer-table";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";
import { downloadCsvTemplate, readSpreadsheet, spreadsheetRecords } from "@/lib/spreadsheet-import";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";

type Lookups = {
  creditTerms: CustomerLookup[];
  customerTypes: CustomerLookup[];
  taxTypes: CustomerLookup[];
};

type CustomerManagementProps = {
  initialCustomers: CustomerRecord[];
  initialError: string | null;
  lookups: Lookups;
};

export function CustomerManagement({
  initialCustomers,
  initialError,
  lookups,
}: CustomerManagementProps) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRecord | null>(null);
  const [pendingImport, setPendingImport] = useState<CustomerInput[] | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [prevInitialCustomers, setPrevInitialCustomers] = useState(initialCustomers);
  if (initialCustomers !== prevInitialCustomers) {
    setPrevInitialCustomers(initialCustomers);
    setCustomers(initialCustomers);
  }

  useEffect(() => {
    if (initialError) {
      toast.error("ข้อผิดพลาด", initialError);
    }
  }, [initialError]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesType =
        typeFilter === "all" || String(customer.customer_type_id) === typeFilter;
      const searchText = [
        customer.customer_code,
        customer.customer_name,
        customer.tax_no,
        customer.branch ?? "",
        customer.customer_type?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return matchesType && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [customers, query, typeFilter]);

  const handleCreate = async (input: CustomerInput) => {
    const result = await createCustomerAction(input);

    if ("error" in result) {
      toast.error("ไม่สามารถเพิ่มข้อมูลลูกหนี้ได้", result.error);
      return;
    }

    toast.success("เพิ่มข้อมูลลูกหนี้เรียบร้อยแล้ว", input.customer_name);
    setFormMode(null);
    setSelectedCustomer(null);
    startTransition(() => router.refresh());
  };

  const handleUpdate = async (input: CustomerInput) => {
    if (!selectedCustomer) {
      return;
    }

    const result = await updateCustomerAction(selectedCustomer.id, input);

    if ("error" in result) {
      toast.error("ไม่สามารถแก้ไขข้อมูลลูกหนี้ได้", result.error);
      return;
    }

    toast.success("บันทึกข้อมูลลูกหนี้เรียบร้อยแล้ว", input.customer_name);
    setFormMode(null);
    setSelectedCustomer(null);
    startTransition(() => router.refresh());
  };

  const handleDelete = (customer: CustomerRecord) => {
    setDeleteTarget(customer);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const result = await deleteCustomerAction(deleteTarget.id);
    if ("error" in result) {
      toast.error("ไม่สามารถลบข้อมูลลูกหนี้ได้", result.error);
      return;
    }

    setCustomers((current) => current.filter((item) => item.id !== deleteTarget.id));
    toast.success("ลบข้อมูลลูกหนี้เรียบร้อยแล้ว", `${deleteTarget.customer_name} (${deleteTarget.customer_code})`);
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  };

  const openCreate = () => {
    setSelectedCustomer(null);
    setFormMode("create");
  };

  const openEdit = (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setFormMode("edit");
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    try {
      const records = spreadsheetRecords(await readSpreadsheet(file));
      const findId = (items: CustomerLookup[], value: string) => items.find((item) => [item.code, item.name].some((candidate) => candidate.trim().toLowerCase() === value.trim().toLowerCase()))?.id;
      const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((key) => row[key]).find(Boolean) ?? "";
      const inputs = records.map((row, index): CustomerInput => {
        const customer_code = pick(row, "รหัสลูกค้า", "customercode", "code");
        const customer_name = pick(row, "ชื่อลูกค้า", "customername", "name");
        const customer_type_id = findId(lookups.customerTypes, pick(row, "ประเภทลูกค้า", "customertype"));
        const credit_term_id = findId(lookups.creditTerms, pick(row, "เครดิตเทอม", "creditterm"));
        const tax_type_id = findId(lookups.taxTypes, pick(row, "ประเภทภาษี", "taxtype"));
        if (!customer_code || !customer_name || !customer_type_id || !credit_term_id || !tax_type_id) throw new Error(`แถว ${index + 2}: รหัส ชื่อ ประเภทลูกค้า เครดิตเทอม หรือประเภทภาษีไม่ครบ/ไม่ตรงกับระบบ`);
        return { customer_code, customer_name, customer_type_id, credit_term_id, tax_type_id, tax_no: pick(row, "เลขประจำตัวผู้เสียภาษี", "taxno"), branch: pick(row, "สาขา", "branch"), contact_name: pick(row, "ผู้ติดต่อ", "contactname"), phone: pick(row, "โทรศัพท์", "phone"), email: pick(row, "อีเมล", "email"), remark: pick(row, "หมายเหตุ", "remark"), status: pick(row, "สถานะ", "status").toLowerCase() === "inactive" || pick(row, "สถานะ", "status") === "ระงับการใช้งาน" ? "ระงับการใช้งาน" : "ใช้งาน", customer_addresses: [] };
      });
      setPendingImport(inputs);
    } catch (error) { toast.error("ตรวจสอบไฟล์ไม่ผ่าน", error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์ได้"); }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    startTransition(async () => {
      let success = 0;
      const errors: string[] = [];
      for (const input of pendingImport) {
        const existing = customers.find((customer) => customer.customer_code.toLowerCase() === input.customer_code.toLowerCase());
        const result = existing ? await updateCustomerAction(existing.id, input) : await createCustomerAction(input);
        if ("error" in result) errors.push(`${input.customer_code}: ${result.error}`); else success += 1;
      }
      setPendingImport(null);
      if (errors.length) toast.error(`นำเข้าสำเร็จ ${success} รายการ`, `ผิดพลาด ${errors.length} รายการ: ${errors.slice(0, 3).join(" • ")}`);
      else toast.success(`นำเข้าสำเร็จ ${success} รายการ`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[10px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">
            Customer Master
          </p>
          <h1 className="mt-1 text-[28px] font-bold text-on-surface">
            ลูกหนี้ / ลูกค้า
          </h1>
          <p className="mt-1 text-[14px] font-medium text-secondary">
            จัดการข้อมูลลูกค้าสำหรับงานขาย ใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            icon={<Upload size={17} />}
            label="นำเข้า"
            onClick={() => importInputRef.current?.click()}
            tone="neutral"
          />
          <input accept=".xlsx,.csv,.xls,.xml" className="hidden" onChange={(event) => { void handleImportFile(event.target.files?.[0]); event.target.value = ""; }} ref={importInputRef} type="file" />
          <ActionButton icon={<Download size={17} />} label="แม่แบบ" onClick={() => downloadCsvTemplate("customer-import-template.csv", [["รหัสลูกค้า", "ชื่อลูกค้า", "ประเภทลูกค้า", "เครดิตเทอม", "ประเภทภาษี", "เลขประจำตัวผู้เสียภาษี", "สาขา", "ผู้ติดต่อ", "โทรศัพท์", "อีเมล", "สถานะ", "หมายเหตุ"]])} tone="neutral" />
          <ExcelExportButton onClick={() => exportCustomersToExcel(filteredCustomers)} />
          <ActionButton
            icon={<Plus size={18} />}
            label="เพิ่มลูกหนี้"
            onClick={openCreate}
            tone="primary"
          />
        </div>
      </div>

      <MobileListFilters
        activeCount={typeFilter === "all" ? 0 : 1}
        onClear={() => setTypeFilter("all")}
        search={<ListSearchField onChange={setQuery} placeholder="ค้นหารหัสลูกค้า ชื่อลูกค้า เลขภาษี หรือสาขา" value={query} />}
      >
        <ListFilterSelect label="ประเภทลูกค้า" onChange={setTypeFilter} value={typeFilter}><option value="all">ทุกประเภทลูกค้า</option>{lookups.customerTypes.map((customerType) => <option key={customerType.id} value={customerType.id}>{customerType.name}</option>)}</ListFilterSelect>
      </MobileListFilters>
      <div className="hidden flex-col gap-3 rounded-[10px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:flex md:flex-row md:items-center">
        <label className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
            size={18}
          />
          <input
            className="h-10 w-full rounded-[6px] border border-outline-variant bg-surface-container-low px-10 text-[14px] font-medium text-on-surface outline-none focus:border-primary"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหารหัสลูกค้า ชื่อลูกค้า เลขภาษี หรือสาขา"
            value={query}
          />
        </label>
        <select
          className="h-10 rounded-[6px] border border-outline-variant bg-surface-container-low px-3 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
          onChange={(event) => setTypeFilter(event.target.value)}
          value={typeFilter}
        >
          <option value="all">ทุกประเภทลูกค้า</option>
          {lookups.customerTypes.map((customerType) => (
            <option key={customerType.id} value={customerType.id}>
              {customerType.name}
            </option>
          ))}
        </select>
      </div>

      <CustomerTable
        customers={filteredCustomers}
        onDelete={handleDelete}
        onEdit={openEdit}
        onView={setDetailCustomer}
      />

      {isPending ? (
        <p className="text-[12px] font-medium text-secondary">กำลังอัปเดตข้อมูล...</p>
      ) : null}

      {formMode ? (
        <CustomerFormModal
          customer={selectedCustomer}
          lookups={lookups}
          mode={formMode}
          onClose={() => {
            setFormMode(null);
            setSelectedCustomer(null);
          }}
          onSubmit={formMode === "create" ? handleCreate : handleUpdate}
        />
      ) : null}

      {detailCustomer ? (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
        />
      ) : null}

      <ConfirmModal
        isOpen={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title="ยืนยันนำเข้าข้อมูลลูกค้า"
        description={`ตรวจสอบไฟล์แล้ว ${pendingImport?.length ?? 0} รายการ รหัสที่มีอยู่จะถูกอัปเดต และรหัสใหม่จะถูกเพิ่ม`}
        confirmText="ยืนยันนำเข้า"
        tone="primary"
        isPending={isPending}
      />
      <ConfirmModal
        confirmText="ลบลูกหนี้"
        description={`คุณต้องการลบข้อมูลลูกหนี้ / ลูกค้า "${deleteTarget?.customer_name}" (${deleteTarget?.customer_code}) ใช่หรือไม่? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้`}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ยืนยันการลบลูกหนี้ / ลูกค้า"
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
