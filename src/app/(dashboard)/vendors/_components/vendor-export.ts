import type { VendorRecord } from "@/app/actions/vendors";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";


function addressText(vendor: VendorRecord) {
  return vendor.vendor_addresses
    .map((address, index) => {
      const label = address.address_name || `ที่อยู่ ${index + 1}`;
      return `${label}: ${address.address_line}`;
    })
    .join(" | ");
}

export function exportVendorsToExcel(vendors: VendorRecord[]) {
  const headers = [
    "รหัสผู้ขาย",
    "ชื่อผู้ขาย",
    "กลุ่มผู้ขาย",
    "เลขผู้เสียภาษี",
    "สาขา",
    "ชื่อผู้ติดต่อ",
    "เบอร์โทร",
    "อีเมล",
    "เครดิตเทอม",
    "วิธีชำระเงิน",
    "ประเภทภาษี",
    "สถานะ",
    "หมายเหตุ",
    "ที่อยู่",
  ];

  const rows = vendors.map((vendor) => [
    vendor.vendor_code,
    vendor.vendor_name,
    vendor.vendor_group?.name ?? "",
    vendor.tax_no,
    vendor.branch ?? "",
    vendor.contact_name ?? "",
    vendor.phone ?? "",
    vendor.email ?? "",
    vendor.credit_term?.name ?? "",
    vendor.payment_method?.name ?? "",
    vendor.tax_type?.name ?? "",
    vendor.status,
    vendor.remark ?? "",
    addressText(vendor),
  ]);

  void exportExcelFile([headers, ...rows], `vendors-${new Date().toISOString().slice(0, 10)}.xlsx`, "ผู้ขาย");
}
