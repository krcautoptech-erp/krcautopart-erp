"use client";

import React from "react";
import { Pagination } from "@/components/pagination";
import type { ProductRecord } from "./product-catalog";

interface ProductTableProps {
  paginatedProducts: ProductRecord[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onViewDetails: (product: ProductRecord) => void;
  onEditProduct: (product: ProductRecord) => void;
  onDeleteProduct: (product: ProductRecord) => void;
  onPreviewImage: (imageUrl: string) => void;
}

export function ProductTable({
  paginatedProducts,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onViewDetails,
  onEditProduct,
  onDeleteProduct,
  onPreviewImage
}: ProductTableProps) {

  // Helper to determine Material badge styling matches design
  const getMaterialBadgeClass = (material: string) => {
    const mat = (material || "").toUpperCase();
    if (mat.includes("SPCC")) {
      return "bg-primary-fixed text-on-primary-fixed-variant";
    } else if (mat.includes("SS400") || mat.includes("SUS")) {
      return "bg-secondary-container text-on-secondary-fixed-variant";
    } else if (mat.includes("GALVANIZED") || mat.includes("GALV")) {
      return "bg-tertiary-container text-on-tertiary";
    }
    return "bg-surface-container-high text-on-secondary-container";
  };

  return (
    <div className="relative rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-t-xl">
        <table className="erp-data-table product-data-table min-w-[1000px]">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead className="bg-surface-container-high border-b border-outline-variant">
            <tr>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant text-center w-16">
                ลำดับ
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant">
                รหัสสินค้า (ERP Code)
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant">
                หมายเลขชิ้นส่วน (Part Number)
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant">
                ชื่อชิ้นงาน
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant text-center">
                เกรดวัสดุ
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant text-center">
                หน่วยนับ
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface border-r border-outline-variant text-center">
                รูปเขียนแบบ
              </th>
              <th style={{ fontWeight: 700 }} className="py-[10px] px-md font-label-md text-label-md text-on-surface text-center">
                การจัดการ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {paginatedProducts.map((product, index) => (
              <tr key={product.id} className="hover:bg-surface-container-low transition-colors group">
                <td style={{ fontWeight: 500 }} className="px-md py-0 text-[13px] text-on-surface border-r border-outline-variant text-center">
                  {(currentPage - 1) * itemsPerPage + index + 1}
                </td>
                <td style={{ fontWeight: 500 }} className="px-md py-0 text-[13px] text-on-surface border-r border-outline-variant text-secondary">
                  {product.erp_code || "-"}
                </td>
                <td style={{ fontWeight: 500 }} className="px-md py-0 text-[13px] text-on-surface border-r border-outline-variant">
                  {product.part_number || "-"}
                </td>
                <td style={{ fontWeight: 500 }} className="px-md py-0 text-[13px] text-on-surface border-r border-outline-variant">
                  {product.part_name || "-"}
                </td>
                <td className="px-md py-0 border-r border-outline-variant text-center">
                  {product.material ? (
                    <span
                      style={{ fontWeight: 500 }}
                      className={`${getMaterialBadgeClass(
                        product.material
                      )} px-2 py-1 rounded text-[11px]`}
                    >
                      {product.material}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td style={{ fontWeight: 500 }} className="px-md py-0 text-[13px] text-on-surface border-r border-outline-variant text-center">
                  {product.unit || "ชิ้น"}
                </td>
                <td className="px-md py-0 text-center border-r border-outline-variant">
                  {product.primary_image ? (
                    <img
                      alt={product.part_name || "รูปสินค้า"}
                      className="w-10 h-10 object-contain mx-auto cursor-zoom-in hover:scale-110 transition-transform dark:invert"
                      onClick={() => onPreviewImage(product.primary_image!)}
                      src={product.primary_image}
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center mx-auto text-secondary">
                      <span className="material-symbols-outlined text-outline">image</span>
                    </div>
                  )}
                </td>
                <td className="px-md py-0 text-center">
                  <div className="flex items-center justify-center gap-xs">
                    {/* View Details Button */}
                    <button
                      onClick={() => onViewDetails(product)}
                      className="text-primary hover:bg-primary/10 p-2 rounded-full transition-all active:scale-95 cursor-pointer flex items-center justify-center border-none bg-transparent"
                      type="button"
                      title="ดูรายละเอียด"
                    >
                      <span className="material-symbols-outlined text-[20px] text-primary">visibility</span>
                    </button>
                    
                    {/* Edit Button */}
                    <button
                      onClick={() => onEditProduct(product)}
                      className="text-secondary hover:bg-surface-container-high p-2 rounded-full transition-all active:scale-95 cursor-pointer flex items-center justify-center border-none bg-transparent"
                      type="button"
                      title="แก้ไขข้อมูล"
                    >
                      <span className="material-symbols-outlined text-[20px] text-secondary dark:text-secondary-fixed-dim">edit</span>
                    </button>
 
                    {/* Delete Button */}
                    <button
                      onClick={() => onDeleteProduct(product)}
                      className="text-error hover:bg-error/10 p-2 rounded-full transition-all active:scale-95 cursor-pointer flex items-center justify-center border-none bg-transparent"
                      type="button"
                      title="ลบชิ้นงาน"
                    >
                      <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {paginatedProducts.length === 0 && (
              <tr>
                <td className="py-12 text-center text-secondary font-body-md" colSpan={9}>
                  ไม่พบข้อมูลสินค้าที่ต้องการค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={currentPage} onPageChange={onPageChange} pageSize={itemsPerPage} totalItems={totalItems} totalPages={totalPages} />
    </div>
  );
}
