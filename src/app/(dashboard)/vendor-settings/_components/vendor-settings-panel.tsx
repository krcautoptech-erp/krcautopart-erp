"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { PlusCircle } from "lucide-react";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ActiveStatusBadge } from "@/components/status-badge";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import {
  createVendorSettingAction,
  deleteVendorSettingAction,
  reserveVendorSettingCodeAction,
  toggleVendorSettingStatusAction,
  updateVendorSettingAction,
  type VendorSettingCategory,
  type VendorSettingInput,
  type VendorSettingRecord,
  type VendorSettingStatus,
} from "@/app/actions/vendor-settings";

type VendorSettingsData = Record<VendorSettingCategory, VendorSettingRecord[]>;

type CategoryConfig = {
  addLabel: string;
  autoCodePrefix?: string;
  codeLabel: string;
  description: string;
  emptyText: string;
  extraField?: {
    key: "credit_days" | "tax_rate";
    label: string;
    suffix: string;
  };
  nameLabel: string;
  title: string;
};

type Draft = {
  code: string;
  credit_days: string;
  description: string;
  name: string;
  status: VendorSettingStatus;
  tax_rate: string;
};

const STATUS_ACTIVE: VendorSettingStatus = "ใช้งาน";
const STATUS_INACTIVE: VendorSettingStatus = "ระงับการใช้งาน";

const CATEGORY_CONFIG: Record<VendorSettingCategory, CategoryConfig> = {
  "vendor-groups": {
    addLabel: "เพิ่มกลุ่มผู้ขาย",
    autoCodePrefix: "VG",
    codeLabel: "รหัสกลุ่ม",
    description: "จัดหมวดผู้ขายสำหรับฝ่ายจัดซื้อ เช่น วัตถุดิบ งานบริการ หรือขนส่ง",
    emptyText: "ยังไม่มีกลุ่มผู้ขาย",
    nameLabel: "ชื่อกลุ่มผู้ขาย",
    title: "กลุ่มผู้ขาย",
  },
  "customer-types": {
    addLabel: "เพิ่มประเภทลูกค้า",
    autoCodePrefix: "CT",
    codeLabel: "รหัสประเภทลูกค้า",
    description: "กำหนดประเภทลูกค้าเพื่อใช้แยกกลุ่มลูกหนี้และเอกสารขาย เช่น บริษัท บุคคลธรรมดา หรือลูกค้าโครงการ",
    emptyText: "ยังไม่มีประเภทลูกค้า",
    nameLabel: "ชื่อประเภทลูกค้า",
    title: "ประเภทลูกค้า",
  },
  "credit-terms": {
    addLabel: "เพิ่มเครดิตเทอม",
    codeLabel: "รหัสเครดิตเทอม",
    description: "กำหนดจำนวนวันเครดิตเพื่อใช้เป็นค่าเริ่มต้นในเอกสารซื้อและเอกสารขายของคู่ค้า",
    emptyText: "ยังไม่มีเครดิตเทอม",
    extraField: {
      key: "credit_days",
      label: "จำนวนวันเครดิต",
      suffix: "วัน",
    },
    nameLabel: "ชื่อเครดิตเทอม",
    title: "เครดิตเทอม",
  },
  "payment-methods": {
    addLabel: "เพิ่มวิธีชำระเงิน",
    codeLabel: "รหัสวิธีชำระเงิน",
    description: "กำหนดช่องทางรับชำระหรือจ่ายชำระของคู่ค้า เช่น โอนเงิน เงินสด หรือเช็ค",
    emptyText: "ยังไม่มีวิธีชำระเงิน",
    nameLabel: "ชื่อวิธีชำระเงิน",
    title: "วิธีชำระเงิน",
  },
  "tax-types": {
    addLabel: "เพิ่มประเภทภาษี",
    codeLabel: "รหัสภาษี",
    description: "กำหนดรูปแบบ VAT สำหรับข้อมูลคู่ค้าและเอกสารซื้อขาย",
    emptyText: "ยังไม่มีประเภทภาษี",
    extraField: {
      key: "tax_rate",
      label: "อัตราภาษี",
      suffix: "%",
    },
    nameLabel: "ชื่อประเภทภาษี",
    title: "ประเภทภาษี",
  },
};

const CATEGORY_ORDER: VendorSettingCategory[] = [
  "vendor-groups",
  "customer-types",
  "credit-terms",
  "payment-methods",
  "tax-types",
];

const EMPTY_DATA: VendorSettingsData = {
  "credit-terms": [],
  "customer-types": [],
  "payment-methods": [],
  "tax-types": [],
  "vendor-groups": [],
};

const EMPTY_DRAFT: Draft = {
  code: "",
  credit_days: "0",
  description: "",
  name: "",
  status: STATUS_ACTIVE,
  tax_rate: "0",
};

function buildDraftFromRecord(record: VendorSettingRecord): Draft {
  return {
    code: record.code,
    credit_days: String(record.credit_days ?? 0),
    description: record.description ?? "",
    name: record.name,
    status: record.status,
    tax_rate: String(record.tax_rate ?? 0),
  };
}

function buildInputFromDraft(draft: Draft): VendorSettingInput {
  return {
    code: draft.code,
    credit_days: Number(draft.credit_days || 0),
    description: draft.description.trim() || null,
    name: draft.name,
    status: draft.status,
    tax_rate: Number(draft.tax_rate || 0),
  };
}

function shouldAutoGenerateCode(config: CategoryConfig) {
  return Boolean(config.autoCodePrefix);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildExcelWorksheet(
  config: CategoryConfig,
  records: VendorSettingRecord[],
) {
  const headers = [
    config.codeLabel,
    config.nameLabel,
    ...(config.extraField ? [config.extraField.label] : []),
    "คำอธิบาย",
    "สถานะ",
    "วันที่แก้ไขล่าสุด",
  ];

  const headerRow = headers
    .map(
      (header) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = records
    .map((record) => {
      const values: Array<string | number> = [
        record.code,
        record.name,
        ...(config.extraField
          ? [
              config.extraField.key === "credit_days"
                ? record.credit_days ?? 0
                : record.tax_rate ?? 0,
            ]
          : []),
        record.description || "",
        record.status,
        formatDate(record.updated_at),
      ];

      return `<Row>${values
        .map((value) => {
          const type = typeof value === "number" ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${escapeSpreadsheetXml(value)}</Data></Cell>`;
        })
        .join("")}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${escapeSpreadsheetXml(config.title)}">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function VendorSettingsActionButton({
  disabled = false,
  icon,
  iconShellClassName,
  label,
  onClick,
  variant,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  iconShellClassName?: string;
  label: string;
  onClick: () => void;
  variant: "ghost" | "primary";
}) {
  const classes =
    variant === "primary"
      ? "border border-primary bg-primary text-on-primary shadow-[0_12px_30px_-18px_rgba(170,17,25,0.7)] hover:brightness-110 dark:border-primary"
      : "border border-outline-variant bg-white text-on-surface shadow-[0_10px_25px_-20px_rgba(15,23,42,0.45)] hover:bg-surface-container-low dark:border-white/10 dark:bg-surface-container-lowest dark:text-on-surface dark:hover:bg-surface-container-high";

  return (
    <button
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[15px] font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
      disabled={disabled}
      type="button"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${
          iconShellClassName ?? "bg-black/5 text-current"
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function VendorSettingsPanel({
  initialData,
  initialError,
}: {
  initialData: VendorSettingsData | null;
  initialError: string | null;
}) {
  useListScroll();
  const [activeCategory, setActiveCategory] =
    useListState<VendorSettingCategory>("activeCategory", "vendor-groups");
  const [data, setData] = useState<VendorSettingsData>(initialData ?? EMPTY_DATA);
  const [searchQuery, setSearchQuery] = useListState("searchQuery", "");
  const [statusFilter, setStatusFilter] = useListState<"ทั้งหมด" | VendorSettingStatus>("statusFilter", 
    "ทั้งหมด",
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingRecord, setEditingRecord] = useState<VendorSettingRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<VendorSettingRecord | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialError) {
      toast.error("ไม่สามารถโหลดข้อมูลได้", initialError);
    }
  }, [initialError]);

  const config = CATEGORY_CONFIG[activeCategory];
  const records = data[activeCategory];

  const filteredRecords = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch = keyword
        ? [record.code, record.name, record.description ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const matchesStatus =
        statusFilter === "ทั้งหมด" ? true : record.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [records, searchQuery, statusFilter]);

  const activeCount = records.filter((record) => record.status === STATUS_ACTIVE).length;

  const updateCategoryRecords = (
    category: VendorSettingCategory,
    updater: (current: VendorSettingRecord[]) => VendorSettingRecord[],
  ) => {
    setData((current) => ({
      ...current,
      [category]: updater(current[category] ?? []).sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    }));
  };

  const openAddModal = () => {
    setDraft(EMPTY_DRAFT);
    setEditingRecord(null);
    setIsEditorOpen(true);

    if (!shouldAutoGenerateCode(config)) {
      return;
    }

    const category = activeCategory;
    startTransition(async () => {
      const result = await reserveVendorSettingCodeAction(category);

      if ("error" in result) {
        toast.error("สร้างรหัสอัตโนมัติไม่สำเร็จ", result.error);
        return;
      }

      setDraft((current) => ({ ...current, code: result.code }));
    });
  };

  const openEditModal = (record: VendorSettingRecord) => {
    setDraft(buildDraftFromRecord(record));
    setEditingRecord(record);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setDraft(EMPTY_DRAFT);
    setEditingRecord(null);
    setIsEditorOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = buildInputFromDraft(draft);
    const autoGenerateCode = shouldAutoGenerateCode(config);

    if (!input.code.trim() || !input.name.trim()) {
      toast.error(
        "ข้อมูลไม่ครบถ้วน",
        autoGenerateCode
          ? "ไม่สามารถสร้างรหัสอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง"
          : "กรุณากรอกรหัสและชื่อรายการให้ครบถ้วน",
      );
      return;
    }

    startTransition(async () => {
      const result = editingRecord
        ? await updateVendorSettingAction(activeCategory, editingRecord.id, input)
        : await createVendorSettingAction(activeCategory, input);

      if ("error" in result) {
        toast.error("บันทึกไม่สำเร็จ", result.error);
        return;
      }

      updateCategoryRecords(activeCategory, (current) => {
        if (editingRecord) {
          return current.map((record) =>
            record.id === editingRecord.id ? result.data : record,
          );
        }

        return [...current, result.data];
      });
      toast.success(
        editingRecord ? "แก้ไขข้อมูลเรียบร้อยแล้ว" : "เพิ่มข้อมูลเรียบร้อยแล้ว",
        input.name,
      );
      closeEditor();
    });
  };

  const handleToggleStatus = (record: VendorSettingRecord) => {
    startTransition(async () => {
      const result = await toggleVendorSettingStatusAction(
        activeCategory,
        record.id,
        record.status,
      );

      if ("error" in result) {
        toast.error("เปลี่ยนสถานะไม่สำเร็จ", result.error);
        return;
      }

      updateCategoryRecords(activeCategory, (current) =>
        current.map((item) => (item.id === record.id ? result.data : item)),
      );
      const newStatus = record.status === STATUS_ACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;
      toast.success(`เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อยแล้ว`, record.name);
    });
  };

  const handleDelete = () => {
    if (!deleteRecord) {
      return;
    }

    startTransition(async () => {
      const result = await deleteVendorSettingAction(activeCategory, deleteRecord.id);

      if ("error" in result) {
        toast.error("ลบข้อมูลไม่สำเร็จ", result.error);
        return;
      }

      updateCategoryRecords(activeCategory, (current) =>
        current.filter((record) => record.id !== deleteRecord.id),
      );
      toast.success("ลบข้อมูลเรียบร้อยแล้ว", `${deleteRecord.code} - ${deleteRecord.name}`);
      setDeleteRecord(null);
    });
  };

  const handleExportExcel = () => {
    const workbookXml = buildExcelWorksheet(config, filteredRecords);
    const blob = new Blob(["\uFEFF", workbookXml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `krc-partner-settings-${activeCategory}-${date}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-lg">
      {initialError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-md text-sm font-medium text-error">
          {initialError}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-md border-b border-outline-variant bg-surface-bright px-md py-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex overflow-x-auto">
            {CATEGORY_ORDER.map((category) => {
              const tabConfig = CATEGORY_CONFIG[category];
              const active = activeCategory === category;

              return (
                <button
                  key={category}
                  className={`relative min-h-12 shrink-0 px-md text-[14px] font-bold transition-colors ${
                    active
                      ? "text-primary"
                      : "text-secondary hover:text-on-surface"
                  }`}
                  onClick={() => {
                    setActiveCategory(category);
                    setSearchQuery("");
                    setStatusFilter("ทั้งหมด");
                    closeEditor();
                  }}
                  type="button"
                >
                  {tabConfig.title}
                  {active ? (
                    <span className="absolute inset-x-md bottom-0 h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-col gap-sm sm:w-auto sm:flex-row">
            <ExcelExportButton onClick={handleExportExcel} />
            <VendorSettingsActionButton
              icon={<PlusCircle className="h-4 w-4" />}
              iconShellClassName="bg-white/15 text-on-primary"
              label={config.addLabel}
              onClick={openAddModal}
              variant="primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-md border-b border-outline-variant p-lg xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <h2 className="text-[20px] font-bold text-on-surface">{config.title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-secondary">{config.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-sm sm:flex sm:items-center">
            <div className="rounded-md border border-outline-variant bg-surface-container-low px-md py-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                ทั้งหมด
              </p>
              <p className="text-[18px] font-bold text-on-surface">{records.length}</p>
            </div>
            <div className="rounded-md border border-outline-variant bg-surface-container-low px-md py-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                ใช้งาน
              </p>
              <p className="text-[18px] font-bold text-primary">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-lg md:hidden">
          <MobileListFilters
            activeCount={statusFilter === "ทั้งหมด" ? 0 : 1}
            onClear={() => setStatusFilter("ทั้งหมด")}
            search={<ListSearchField onChange={setSearchQuery} placeholder={`ค้นหา${config.title}`} value={searchQuery} />}
          >
            <ListFilterSelect label="สถานะ" onChange={(value) => setStatusFilter(value as "ทั้งหมด" | VendorSettingStatus)} value={statusFilter}><option value="ทั้งหมด">แสดงทั้งหมด</option><option value={STATUS_ACTIVE}>ใช้งาน</option><option value={STATUS_INACTIVE}>ระงับ</option></ListFilterSelect>
          </MobileListFilters>
        </div>
        <div className="hidden flex-col gap-md bg-surface-container-lowest p-lg md:flex md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-secondary">
              search
            </span>
            <input
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest py-2 pl-10 pr-4 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={`ค้นหา${config.title}`}
              type="text"
              value={searchQuery}
            />
          </div>

          <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
            <select
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-md py-2 text-sm font-medium text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              onChange={(event) =>
                setStatusFilter(event.target.value as "ทั้งหมด" | VendorSettingStatus)
              }
              value={statusFilter}
            >
              <option value="ทั้งหมด">แสดงทั้งหมด</option>
              <option value={STATUS_ACTIVE}>สถานะ: ใช้งาน</option>
              <option value={STATUS_INACTIVE}>สถานะ: ระงับ</option>
            </select>
            <p className="text-sm text-secondary">
              แสดง <span className="font-bold text-on-surface">{filteredRecords.length}</span>{" "}
              จาก {records.length} รายการ
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="erp-data-table min-w-[840px]">
            <thead>
              <tr className="border-y border-outline-variant bg-surface-container">
                <TableHeader>{config.codeLabel}</TableHeader>
                <TableHeader>{config.nameLabel}</TableHeader>
                {config.extraField ? <TableHeader>{config.extraField.label}</TableHeader> : null}
                <TableHeader>คำอธิบาย</TableHeader>
                <TableHeader align="center">สถานะ</TableHeader>
                <TableHeader>แก้ไขล่าสุด</TableHeader>
                <TableHeader align="right">จัดการ</TableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filteredRecords.map((record) => (
                <tr
                  key={record.id}
                  className={`transition-colors hover:bg-surface-container-low ${
                    record.status === STATUS_INACTIVE ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-lg py-3 text-sm font-bold text-primary">{record.code}</td>
                  <td className="px-lg py-3 text-sm font-semibold text-on-surface">
                    {record.name}
                  </td>
                  {config.extraField ? (
                    <td className="px-lg py-3 text-sm font-medium text-on-surface">
                      {config.extraField.key === "credit_days"
                        ? record.credit_days ?? 0
                        : record.tax_rate ?? 0}{" "}
                      <span className="text-secondary">{config.extraField.suffix}</span>
                    </td>
                  ) : null}
                  <td className="max-w-[360px] truncate px-lg py-3 text-sm text-secondary">
                    {record.description || "-"}
                  </td>
                  <td className="px-lg py-3 text-center">
                    <StatusToggle
                      disabled={isPending}
                      status={record.status}
                      onToggle={() => handleToggleStatus(record)}
                    />
                  </td>
                  <td className="px-lg py-3 text-sm text-secondary">
                    {formatDate(record.updated_at)}
                  </td>
                  <td className="px-lg py-3 text-right">
                    <div className="flex justify-end gap-xs">
                      <IconButton
                        label={`แก้ไข${config.title}`}
                        icon="edit"
                        onClick={() => openEditModal(record)}
                      />
                      <IconButton
                        label={`ลบ${config.title}`}
                        icon="delete"
                        tone="error"
                        onClick={() => setDeleteRecord(record)}
                      />
                    </div>
                  </td>
                </tr>
              ))}

              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    className="px-lg py-12 text-center text-sm font-medium text-secondary"
                    colSpan={config.extraField ? 7 : 6}
                  >
                    {config.emptyText}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant bg-surface-bright px-lg py-3">
          <p className="text-sm text-secondary">
            ใช้ข้อมูลนี้เป็นตัวเลือกในหน้าคู่ค้า และเอกสารซื้อขายของระบบ
          </p>
          <button
            className="rounded-md border border-primary bg-primary px-md py-2 text-sm font-bold text-on-primary transition-all hover:brightness-110 active:scale-[0.98]"
            onClick={openAddModal}
            type="button"
          >
            {config.addLabel}
          </button>
        </div>
      </section>

      {isEditorOpen ? (
        <EditorModal
          config={config}
          draft={draft}
          isPending={isPending}
          mode={editingRecord ? "edit" : "add"}
          onClose={closeEditor}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : null}

      <ConfirmModal
        confirmText="ลบรายการ"
        description={`คุณต้องการลบ "${deleteRecord?.name}" (${deleteRecord?.code}) ออกจากระบบใช่หรือไม่? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้`}
        isOpen={Boolean(deleteRecord)}
        itemName={deleteRecord?.name}
        onClose={() => setDeleteRecord(null)}
        onConfirm={handleDelete}
        title={`ยืนยันการลบ${config.title}`}
        variant="danger"
      />
    </div>
  );
}

function TableHeader({
  align = "left",
  children,
}: {
  align?: "center" | "left" | "right";
  children: React.ReactNode;
}) {
  const alignClass =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  return (
    <th
      className={`px-lg py-3 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant ${alignClass}`}
    >
      {children}
    </th>
  );
}

function StatusToggle({
  disabled,
  onToggle,
  status,
}: {
  disabled: boolean;
  onToggle: () => void;
  status: VendorSettingStatus;
}) {
  const active = status === STATUS_ACTIVE;

  return (
    <button
      aria-label={active ? "ปิดใช้งานรายการนี้" : "เปิดใช้งานรายการนี้"}
      className="inline-flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onToggle}
      title={active ? "คลิกเพื่อระงับการใช้งาน" : "คลิกเพื่อเปิดใช้งาน"}
      type="button"
    >
      <ActiveStatusBadge
        active={active}
        activeLabel="ใช้งาน"
        inactiveLabel="ระงับ"
      />
    </button>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: "default" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "text-error hover:bg-error/10"
      : "text-secondary hover:bg-surface-container-high";

  return (
    <button
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md border-none bg-transparent transition-colors ${toneClass}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

function EditorModal({
  config,
  draft,
  isPending,
  mode,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  config: CategoryConfig;
  draft: Draft;
  isPending: boolean;
  mode: "add" | "edit";
  onClose: () => void;
  onDraftChange: (draft: Draft) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const autoGenerateCode = shouldAutoGenerateCode(config);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-md backdrop-blur-sm">
      <form
        className="w-full max-w-[520px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onSubmit={onSubmit}
      >
        <div className="flex items-center justify-between border-b border-outline-variant bg-primary px-lg py-md text-on-primary">
          <div>
            <h3 className="text-[18px] font-bold">
              {mode === "add" ? config.addLabel : `แก้ไข${config.title}`}
            </h3>
            <p className="text-xs font-medium opacity-80">ข้อมูลนี้จะใช้เป็น Dropdown ในหน้าคู่ค้าและเอกสารของระบบ</p>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border-none bg-white/10 text-white transition-colors hover:bg-white/20"
            onClick={onClose}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-md p-lg">
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            {autoGenerateCode ? (
              <Field label={config.codeLabel}>
                <div className="space-y-2">
                  <input
                    className="w-full rounded-md border border-outline-variant bg-surface-container px-md py-2 text-sm font-bold uppercase text-secondary outline-none"
                    disabled
                    type="text"
                    value={draft.code || "กำลังสร้างรหัส..."}
                  />
                  <p className="text-xs text-secondary">
                    {draft.code
                      ? "ระบบจองรหัสนี้ไว้และจะใช้เลขเดียวกันเมื่อบันทึกข้อมูล"
                      : "ระบบกำลังจองรหัสถัดไป"}
                  </p>
                </div>
              </Field>
            ) : (
              <Field label={config.codeLabel} required>
                <input
                  className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-md py-2 text-sm font-bold uppercase text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  onChange={(event) => onDraftChange({ ...draft, code: event.target.value })}
                  required
                  type="text"
                  value={draft.code}
                />
              </Field>
            )}
            <Field label={config.nameLabel} required>
              <input
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-md py-2 text-sm font-medium text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                required
                type="text"
                value={draft.name}
              />
            </Field>
          </div>

          {config.extraField ? (
            <Field label={config.extraField.label} required>
              <div className="flex overflow-hidden rounded-md border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <input
                  className="min-w-0 flex-1 border-none bg-surface-container-lowest px-md py-2 text-sm font-medium text-on-surface outline-none"
                  min="0"
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      [config.extraField!.key]: event.target.value,
                    })
                  }
                  required
                  step={config.extraField.key === "tax_rate" ? "0.01" : "1"}
                  type="number"
                  value={draft[config.extraField.key]}
                />
                <span className="flex items-center border-l border-outline-variant bg-surface-container-low px-md text-sm font-bold text-secondary">
                  {config.extraField.suffix}
                </span>
              </div>
            </Field>
          ) : null}

          <Field label="คำอธิบาย">
            <textarea
              className="min-h-[92px] w-full rounded-md border border-outline-variant bg-surface-container-lowest px-md py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              onChange={(event) =>
                onDraftChange({ ...draft, description: event.target.value })
              }
              value={draft.description}
            />
          </Field>

          <div className="flex items-center justify-between rounded-md border border-outline-variant bg-surface-container-low p-md">
            <div>
              <p className="text-sm font-bold text-on-surface">สถานะเปิดใช้งาน</p>
              <p className="text-xs text-secondary">รายการที่ปิดจะไม่ถูกนำไปเลือกในเอกสารใหม่</p>
            </div>
            <ToggleSwitch checked={draft.status === STATUS_ACTIVE} onChange={(checked) => onDraftChange({ ...draft, status: checked ? STATUS_ACTIVE : STATUS_INACTIVE })} />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-sm border-t border-outline-variant px-lg py-md sm:flex-row sm:justify-end">
          <button
            className="rounded-md border border-outline-variant bg-transparent px-lg py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-low"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="rounded-md border border-primary bg-primary px-lg py-2 text-sm font-bold text-on-primary transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-xs">
      <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label} {required ? <span className="text-error">*</span> : null}
      </span>
      {children}
    </label>
  );
}
