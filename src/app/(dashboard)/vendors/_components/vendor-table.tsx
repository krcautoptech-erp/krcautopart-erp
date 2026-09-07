"use client";

import { Edit2, Eye, Trash2 } from "lucide-react";
import type { VendorRecord } from "@/app/actions/vendors";
import { StatusBadge, statusTone } from "@/components/status-badge";

type VendorTableProps = {
  onDelete: (vendor: VendorRecord) => void;
  onEdit: (vendor: VendorRecord) => void;
  onView: (vendor: VendorRecord) => void;
  vendors: VendorRecord[];
};

export function VendorTable({ onDelete, onEdit, onView, vendors }: VendorTableProps) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="overflow-x-auto">
        <table
          className="erp-data-table"
          style={{ minWidth: "100%", tableLayout: "auto", width: "max-content" }}
        >
          <thead className="bg-surface-container-low text-[12px] uppercase tracking-[0.14em] text-secondary">
            <tr>
              {[
                "ลำดับ",
                "รหัส",
                "ชื่อผู้ขาย",
                "กลุ่มผู้ขาย",
                "เลขภาษี",
                "สาขา",
                "สถานะ",
                "จัดการ",
              ].map((header) => (
                <th key={header} className="border-b border-outline-variant px-4 py-3 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant text-[14px] font-medium text-on-surface">
            {vendors.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-secondary" colSpan={8}>
                  ยังไม่มีข้อมูลผู้ขาย
                </td>
              </tr>
            ) : (
              vendors.map((vendor, index) => (
                <tr
                  key={vendor.id}
                  className="bg-surface-container-lowest transition-colors hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 text-secondary">{index + 1}</td>
                  <td className="px-4 py-3 font-bold text-primary">{vendor.vendor_code}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      className="whitespace-nowrap text-left font-semibold text-on-surface hover:text-primary"
                      onClick={() => onView(vendor)}
                      type="button"
                    >
                      {vendor.vendor_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{vendor.vendor_group?.name ?? "-"}</td>
                  <td className="px-4 py-3">{vendor.tax_no}</td>
                  <td className="px-4 py-3">{vendor.branch || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone(vendor.status)}>
                      {vendor.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconButton label="ดูรายละเอียด" onClick={() => onView(vendor)}>
                        <Eye size={16} />
                      </IconButton>
                      <IconButton label="แก้ไข" onClick={() => onEdit(vendor)}>
                        <Edit2 size={16} />
                      </IconButton>
                      <IconButton label="ลบ" onClick={() => onDelete(vendor)} danger>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconButton({
  children,
  danger = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-[6px] border transition-colors ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
          : "border-outline-variant text-secondary hover:bg-surface-container"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
