import type { CustomerRecord } from "@/app/actions/customers";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";


function addressText(customer: CustomerRecord) {
  return customer.customer_addresses
    .map((address, index) => {
      const label = address.address_name || `ที่อยู่ ${index + 1}`;
      return `${label}: ${address.address_line}`;
    })
    .join(" | ");
}

export function exportCustomersToExcel(customers: CustomerRecord[]) {
  const headers = [
    "รหัสลูกค้า",
    "ชื่อลูกค้า",
    "ประเภทลูกค้า",
    "เลขผู้เสียภาษี",
    "สาขา",
    "ชื่อผู้ติดต่อ",
    "เบอร์โทร",
    "อีเมล",
    "เครดิตเทอม",
    "ประเภทภาษี",
    "สถานะ",
    "หมายเหตุ",
    "ที่อยู่",
  ];

  const rows = customers.map((customer) => [
    customer.customer_code,
    customer.customer_name,
    customer.customer_type?.name ?? "",
    customer.tax_no,
    customer.branch ?? "",
    customer.contact_name ?? "",
    customer.phone ?? "",
    customer.email ?? "",
    customer.credit_term?.name ?? "",
    customer.tax_type?.name ?? "",
    customer.status,
    customer.remark ?? "",
    addressText(customer),
  ]);

  void exportExcelFile([headers, ...rows], `customers-${new Date().toISOString().slice(0, 10)}.xlsx`, "ลูกหนี้");
}
