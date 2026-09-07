"use client";

import { Edit2, Eye, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { CustomerRecord } from "@/app/actions/customers";
import { StatusBadge, statusTone } from "@/components/status-badge";

type CustomerTableProps = {
  customers: CustomerRecord[];
  onDelete: (customer: CustomerRecord) => void;
  onEdit: (customer: CustomerRecord) => void;
  onView: (customer: CustomerRecord) => void;
};

export function CustomerTable({
  customers,
  onDelete,
  onEdit,
  onView,
}: CustomerTableProps) {
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
                "ชื่อลูกค้า",
                "ประเภทลูกค้า",
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
            {customers.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-secondary" colSpan={8}>
                  ยังไม่มีข้อมูลลูกหนี้ / ลูกค้า
                </td>
              </tr>
            ) : (
              customers.map((customer, index) => (
                <tr
                  key={customer.id}
                  className="bg-surface-container-lowest transition-colors hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 text-secondary">{index + 1}</td>
                  <td className="px-4 py-3 font-bold text-primary">{customer.customer_code}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      className="whitespace-nowrap text-left font-semibold text-on-surface hover:text-primary"
                      onClick={() => onView(customer)}
                      type="button"
                    >
                      {customer.customer_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{customer.customer_type?.name ?? "-"}</td>
                  <td className="px-4 py-3">{customer.tax_no}</td>
                  <td className="px-4 py-3">{customer.branch || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone(customer.status)}>
                      {customer.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconButton label="ดูรายละเอียด" onClick={() => onView(customer)}>
                        <Eye size={16} />
                      </IconButton>
                      <IconButton label="แก้ไข" onClick={() => onEdit(customer)}>
                        <Edit2 size={16} />
                      </IconButton>
                      <IconButton danger label="ลบ" onClick={() => onDelete(customer)}>
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
  children: ReactNode;
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
