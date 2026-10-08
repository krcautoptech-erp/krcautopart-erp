"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  createRawMaterialSettingAction,
  deleteRawMaterialSettingAction,
  toggleRawMaterialSettingStatusAction,
  updateRawMaterialSettingAction,
  type RawMaterialSettingRecord,
} from "@/app/actions/raw-material-settings";
import type {
  RawMaterialSettingInput,
  RawMaterialSettingKind,
} from "@/lib/raw-material-settings";
import { ActiveStatusBadge } from "@/components/status-badge";
import { MobileEntityList } from "@/components/mobile-entity-list";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Pagination } from "@/components/pagination";
import { CompanyFormLogo } from "@/components/company-logo";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";

type RawMaterialSettingsData = {
  grades: RawMaterialSettingRecord[];
  groups: RawMaterialSettingRecord[];
  units: RawMaterialSettingRecord[];
};

type SettingDraft = {
  allows_decimal: boolean;
  code: string;
  name: string;
  sort_order: string;
  status: "active" | "inactive";
  symbol: string;
};

const ITEMS_PER_PAGE = 10;

const TAB_CONFIG: Array<{
  emptyText: string;
  key: RawMaterialSettingKind;
  label: string;
  pluralKey: keyof RawMaterialSettingsData;
}> = [
  {
    emptyText: "ไม่พบข้อมูลกลุ่มวัตถุดิบ",
    key: "group",
    label: "กลุ่มวัตถุดิบ",
    pluralKey: "groups",
  },
  {
    emptyText: "ไม่พบข้อมูลเกรดวัสดุ",
    key: "grade",
    label: "เกรดวัสดุ",
    pluralKey: "grades",
  },
  {
    emptyText: "ไม่พบข้อมูลหน่วยนับ",
    key: "unit",
    label: "หน่วยนับ",
    pluralKey: "units",
  },
];

const emptyDraft: SettingDraft = {
  allows_decimal: false,
  code: "",
  name: "",
  sort_order: "0",
  status: "active",
  symbol: "",
};

export function RawMaterialSettings({ initialData }: { initialData: RawMaterialSettingsData }) {
  useListScroll();
  const [activeTab, setActiveTab] = useListState<RawMaterialSettingKind>("activeTab", "group");
  const [records, setRecords] = useState(initialData);
  const [searchQuery, setSearchQuery] = useListState("searchQuery", "");
  const [statusFilter, setStatusFilter] = useListState("statusFilter", "all");
  const [currentPage, setCurrentPage] = useListState("currentPage", 1);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SettingDraft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<RawMaterialSettingRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);

  const activeConfig = TAB_CONFIG.find((tab) => tab.key === activeTab) ?? TAB_CONFIG[0];
  const activeItems = records[activeConfig.pluralKey];
  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return activeItems.filter((item) => {
      const matchesSearch =
        !keyword ||
        [item.code, item.name, item.symbol].join(" ").toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [activeItems, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = filteredItems.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const switchTab = (tab: RawMaterialSettingKind) => {
    setActiveTab(tab);
    setSearchQuery("");
    setStatusFilter("all");
    setCurrentPage(1);
    setFeedback(null);
  };

  const openCreateModal = () => {
    setDraft(emptyDraft);
    setEditingId(null);
    setFeedback(null);
    setFormMode("create");
  };

  const openEditModal = (item: RawMaterialSettingRecord) => {
    setDraft({
      allows_decimal: item.allows_decimal,
      code: item.code,
      name: item.name,
      sort_order: String(item.sort_order),
      status: item.status,
      symbol: item.symbol,
    });
    setEditingId(item.id);
    setFeedback(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const updateActiveRecords = (
    updater: (current: RawMaterialSettingRecord[]) => RawMaterialSettingRecord[],
  ) => {
    setRecords((current) => ({
      ...current,
      [activeConfig.pluralKey]: updater(current[activeConfig.pluralKey]),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: RawMaterialSettingInput = {
      allows_decimal: draft.allows_decimal,
      code: draft.code,
      name: draft.name,
      sort_order: Number(draft.sort_order),
      status: draft.status,
      symbol: draft.symbol,
    };

    setIsSaving(true);
    const result =
      formMode === "edit" && editingId !== null
        ? await updateRawMaterialSettingAction(activeTab, editingId, input)
        : await createRawMaterialSettingAction(activeTab, input);
    setIsSaving(false);

    if ("error" in result) {
      setFeedback({ message: result.error ?? "ไม่สามารถบันทึกข้อมูลได้", tone: "error" });
      return;
    }

    updateActiveRecords((current) =>
      formMode === "edit"
        ? current.map((item) => (item.id === result.data.id ? result.data : item))
        : [...current, result.data],
    );
    closeModal();
    setFeedback({ message: "บันทึกข้อมูลเรียบร้อยแล้ว", tone: "success" });
  };

  const handleToggleStatus = async (item: RawMaterialSettingRecord) => {
    setIsSaving(true);
    const result = await toggleRawMaterialSettingStatusAction(activeTab, item.id, item.status);
    setIsSaving(false);

    if ("error" in result) {
      setFeedback({ message: result.error ?? "ไม่สามารถเปลี่ยนสถานะได้", tone: "error" });
      return;
    }

    updateActiveRecords((current) =>
      current.map((record) => (record.id === item.id ? result.data : record)),
    );
    setFeedback({ message: "อัปเดตสถานะเรียบร้อยแล้ว", tone: "success" });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    const result = await deleteRawMaterialSettingAction(activeTab, deleteTarget.id);
    setIsSaving(false);

    if ("error" in result) {
      setDeleteTarget(null);
      setFeedback({ message: result.error ?? "ไม่สามารถลบข้อมูลได้", tone: "error" });
      return;
    }

    updateActiveRecords((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setFeedback({ message: "ลบข้อมูลเรียบร้อยแล้ว", tone: "success" });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.025em] text-on-surface">
            ตั้งค่าวัตถุดิบ
          </h1>
          <p className="mt-1 text-[14px] font-medium text-secondary">
            จัดการข้อมูลกลางสำหรับใช้ในหน้าวัตถุดิบและเอกสารที่เกี่ยวข้อง
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-primary px-4 text-[14px] font-bold text-white transition-colors hover:bg-primary/95"
          onClick={openCreateModal}
          type="button"
        >
          <Plus size={16} />
          เพิ่ม{activeConfig.label}
        </button>
      </header>

      <nav
        aria-label="ประเภทข้อมูลตั้งค่าวัตถุดิบ"
        className="flex min-h-12 items-end gap-8 overflow-x-auto border border-outline-variant bg-surface-container-lowest px-6"
      >
        {TAB_CONFIG.map((tab) => (
          <button
            aria-current={activeTab === tab.key ? "page" : undefined}
            className={`relative h-12 whitespace-nowrap px-1 text-[15px] font-bold transition-colors ${
              activeTab === tab.key ? "text-primary" : "text-on-surface hover:text-primary"
            }`}
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            type="button"
          >
            {tab.label}
            {activeTab === tab.key ? (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
            ) : null}
          </button>
        ))}
      </nav>

      {feedback ? (
        <div
          className={`border px-4 py-2.5 text-[14px] font-bold ${
            feedback.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="space-y-3">
        <MobileListFilters
          activeCount={statusFilter === "all" ? 0 : 1}
          onClear={() => { setStatusFilter("all"); setCurrentPage(1); }}
          search={<ListSearchField onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }} placeholder={`ค้นหารหัสหรือชื่อ${activeConfig.label}`} value={searchQuery} />}
        >
          <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }} value={statusFilter}><option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></ListFilterSelect>
        </MobileListFilters>
        <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full sm:max-w-[380px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={17} />
            <input
              className="h-9 w-full rounded-[6px] border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder={`ค้นหารหัสหรือชื่อ${activeConfig.label}`}
              value={searchQuery}
            />
          </label>
          <div className="flex items-center gap-3">
            <select
              className="h-9 rounded-[6px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-bold text-on-surface outline-none focus:border-primary"
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
            <span className="whitespace-nowrap text-[14px] font-medium text-secondary">
              {filteredItems.length} รายการ
            </span>
          </div>
        </div>

        <div className="overflow-hidden border border-outline-variant bg-surface-container-lowest">
          <div className="sm:hidden">
            <MobileEntityList
              actionLabel={(item) => `แก้ไข ${item.name}`}
              disabled={isSaving}
              emptyText={activeConfig.emptyText}
              getKey={(item) => item.id}
              items={paginatedItems}
              meta={(item) => <>{activeTab === "unit" ? `สัญลักษณ์ ${item.symbol || "-"} · ` : ""}ลำดับแสดง ${item.sort_order}</>}
              onAction={(item) => openEditModal(item)}
              onOpen={openEditModal}
              primary={(item) => item.code}
              secondary={(item) => item.name}
              status={(item) => <ActiveStatusBadge active={item.status === "active"} />}
            />
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="erp-data-table min-w-[760px]">
              <thead className="bg-surface-container-low">
                <tr className="border-b border-outline-variant">
                  <TableHeader className="w-16 text-center">ลำดับ</TableHeader>
                  <TableHeader className="w-40">รหัส</TableHeader>
                  <TableHeader>ชื่อ{activeConfig.label}</TableHeader>
                  {activeTab === "unit" ? (
                    <>
                      <TableHeader className="w-36">สัญลักษณ์</TableHeader>
                      <TableHeader className="w-36 text-center">ใช้ทศนิยม</TableHeader>
                    </>
                  ) : null}
                  <TableHeader className="w-28 text-center">ลำดับแสดง</TableHeader>
                  <TableHeader className="w-40 text-center">สถานะ</TableHeader>
                  <TableHeader className="w-28 text-center">จัดการ</TableHeader>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => (
                  <tr
                    className="h-12 border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low/60"
                    key={item.id}
                  >
                    <TableCell className="text-center">
                      {(safePage - 1) * ITEMS_PER_PAGE + index + 1}
                    </TableCell>
                    <TableCell className="font-bold text-primary">{item.code}</TableCell>
                    <TableCell className="font-semibold text-on-surface">{item.name}</TableCell>
                    {activeTab === "unit" ? (
                      <>
                        <TableCell>{item.symbol}</TableCell>
                        <TableCell className="text-center">
                          {item.allows_decimal ? "ได้" : "ไม่ได้"}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className="text-center">{item.sort_order}</TableCell>
                    <TableCell className="text-center">
                      <StatusToggle
                        disabled={isSaving}
                        item={item}
                        onToggle={handleToggleStatus}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          aria-label={`แก้ไข ${item.name}`}
                          className="text-on-surface transition-colors hover:text-primary"
                          onClick={() => openEditModal(item)}
                          type="button"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          aria-label={`ลบ ${item.name}`}
                          className="text-primary transition-opacity hover:opacity-70"
                          onClick={() => setDeleteTarget(item)}
                          type="button"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </TableCell>
                  </tr>
                ))}
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td
                      className="h-28 text-center text-[14px] font-medium text-secondary"
                      colSpan={activeTab === "unit" ? 8 : 6}
                    >
                      {activeConfig.emptyText}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination currentPage={safePage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredItems.length} totalPages={totalPages} />
        </div>
      </section>

      {formMode ? (
        <SettingModal
          activeTab={activeTab}
          draft={draft}
          isSaving={isSaving}
          mode={formMode}
          onChange={setDraft}
          onClose={closeModal}
          onSubmit={handleSubmit}
          title={activeConfig.label}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteModal
          isSaving={isSaving}
          item={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}
    </div>
  );
}

function SettingModal({
  activeTab,
  draft,
  isSaving,
  mode,
  onChange,
  onClose,
  onSubmit,
  title,
}: {
  activeTab: RawMaterialSettingKind;
  draft: SettingDraft;
  isSaving: boolean;
  mode: "create" | "edit";
  onChange: (draft: SettingDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-[560px] overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-2xl"
        onSubmit={onSubmit}
      >
        <header className="flex h-14 items-center justify-between border-b border-outline-variant px-5">
          <div className="flex items-center gap-3">
            <CompanyFormLogo />
            <h2 className="text-[20px] font-bold text-on-surface">
              {mode === "create" ? "เพิ่ม" : "แก้ไข"}{title}
            </h2>
          </div>
          <button aria-label="ปิด" onClick={onClose} type="button">
            <X size={21} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <FormField label="รหัส" required>
            <input
              autoFocus
              className={inputClassName}
              maxLength={30}
              onChange={(event) => onChange({ ...draft, code: event.target.value })}
              placeholder={activeTab === "unit" ? "เช่น KG" : "เช่น SPCC"}
              value={draft.code}
            />
          </FormField>
          <FormField label={`ชื่อ${title}`} required>
            <input
              className={inputClassName}
              maxLength={100}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder={activeTab === "unit" ? "เช่น กิโลกรัม" : `ระบุชื่อ${title}`}
              value={draft.name}
            />
          </FormField>

          {activeTab === "unit" ? (
            <FormField label="สัญลักษณ์" required>
              <input
                className={inputClassName}
                maxLength={20}
                onChange={(event) => onChange({ ...draft, symbol: event.target.value })}
                placeholder="เช่น กก."
                value={draft.symbol}
              />
            </FormField>
          ) : null}

          <FormField label="ลำดับการแสดง" required>
            <input
              className={inputClassName}
              min={0}
              onChange={(event) => onChange({ ...draft, sort_order: event.target.value })}
              type="number"
              value={draft.sort_order}
            />
          </FormField>

          {activeTab === "unit" ? (
            <label className="flex h-10 items-center justify-between border border-outline-variant px-3 text-[13px] font-bold text-on-surface sm:col-span-2">
              อนุญาตให้กรอกจำนวนทศนิยม
              <input
                checked={draft.allows_decimal}
                className="h-4 w-4 accent-primary"
                onChange={(event) =>
                  onChange({ ...draft, allows_decimal: event.target.checked })
                }
                type="checkbox"
              />
            </label>
          ) : null}

          <div className="sm:col-span-2"><ToggleSwitch checked={draft.status === "active"} label="สถานะใช้งาน" onChange={(checked) => onChange({ ...draft, status: checked ? "active" : "inactive" })} /></div>
        </div>

        <footer className="flex h-16 items-center justify-end gap-3 border-t border-outline-variant px-5">
          <button
            className="h-9 rounded-[6px] border border-outline-variant px-6 text-[14px] font-bold text-on-surface"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 rounded-[6px] bg-primary px-6 text-[14px] font-bold text-white disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ConfirmDeleteModal({
  isSaving,
  item,
  onCancel,
  onConfirm,
}: {
  isSaving: boolean;
  item: RawMaterialSettingRecord;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[380px] rounded-[8px] border border-outline-variant bg-surface-container-lowest p-5 text-center shadow-2xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Trash2 size={21} />
        </div>
        <h2 className="mt-3 text-[19px] font-bold text-on-surface">ยืนยันการลบข้อมูล</h2>
        <p className="mt-1 text-[14px] font-medium text-secondary">
          ต้องการลบ <span className="font-bold text-on-surface">{item.name}</span> ใช่หรือไม่
        </p>
        <div className="mt-5 flex gap-3">
          <button
            className="h-9 flex-1 rounded-[6px] border border-outline-variant text-[14px] font-bold text-on-surface"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-9 flex-1 rounded-[6px] bg-primary text-[14px] font-bold text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? "กำลังลบ..." : "ลบข้อมูล"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusToggle({
  disabled,
  item,
  onToggle,
}: {
  disabled: boolean;
  item: RawMaterialSettingRecord;
  onToggle: (item: RawMaterialSettingRecord) => Promise<void>;
}) {
  const isActive = item.status === "active";

  return (
    <button
      aria-label={`${isActive ? "ระงับ" : "เปิด"}การใช้งาน ${item.name}`}
      className="inline-flex"
      disabled={disabled}
      onClick={() => onToggle(item)}
      type="button"
    >
      <ActiveStatusBadge active={isActive} />
    </button>
  );
}

function FormField({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[12px] font-bold text-on-surface">
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
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
    <th className={`h-10 px-3 text-left text-[13px] font-extrabold text-on-surface ${className}`}>
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
  return <td className={`px-3 text-[14px] font-medium text-on-surface ${className}`}>{children}</td>;
}

const inputClassName =
  "h-10 w-full rounded-[6px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary";
