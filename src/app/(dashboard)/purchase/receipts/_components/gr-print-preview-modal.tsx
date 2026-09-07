"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { formatDisplayDate } from "@/lib/purchase-requisitions";

type GrPrintItem = {
  id: number;
  line_no: number;
  expiry_date?: string | null;
  is_stocked?: boolean;
  item_code: string;
  item_name: string;
  mfg_date?: string | null;
  quantity_ordered: number;
  quantity_received: number;
  serial_numbers?: string[];
  tracking_method?: "none" | "lot" | "serial";
  unit_name: string;
  vendor_lot_no?: string | null;
  remarks?: string;
};

type GrPrintDetail = {
  id: number;
  gr_number: string;
  document_date: string;
  po_number: string;
  vendor_code: string;
  vendor_name: string;
  vendor_address?: string;
  delivery_note_no: string;
  remarks: string;
  created_at: string;
  items: GrPrintItem[];
};

type GrPrintPreviewModalProps = {
  detail: GrPrintDetail;
  documentContext: CompanyDocumentContext;
  onClose: () => void;
};

function paginateItems<T>(items: readonly T[], itemsPerPage: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += itemsPerPage) {
    pages.push(items.slice(i, i + itemsPerPage));
  }
  return pages;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatPrintedAt(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export function GrPrintPreviewModal({
  detail,
  documentContext,
  onClose,
}: GrPrintPreviewModalProps) {
  const [printedAt] = useState(() => new Date());
  const [pageSize, setPageSize] = useState<"A4" | "A5">("A5");

  const itemsPerPage = pageSize === "A4" ? 20 : 10;
  const pages = paginateItems(detail.items, itemsPerPage);

  const footerText =
    [
      documentContext.documentSettings.footerTextTh,
      documentContext.documentSettings.footerTextEn,
    ]
      .filter(Boolean)
      .join(" / ") || "เอกสารตรวจรับสินค้า KRC ERP";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("printing-goods-receipt");
      document.getElementById("gr-active-print-page-size")?.remove();
    };
  }, [onClose]);

  const handlePrint = () => {
    const printPageStyle = document.createElement("style");
    printPageStyle.id = "gr-active-print-page-size";
    printPageStyle.textContent = `@page { size: ${
      pageSize === "A4" ? "210mm 297mm" : "210mm 148mm"
    }; margin: 0; }`;

    document.getElementById(printPageStyle.id)?.remove();
    document.head.appendChild(printPageStyle);

    const clearPrintMode = () => {
      document.body.classList.remove("printing-goods-receipt");
      printPageStyle.remove();
      window.removeEventListener("afterprint", clearPrintMode);
    };

    document.body.classList.add("printing-goods-receipt");
    window.addEventListener("afterprint", clearPrintMode);
    requestAnimationFrame(() => window.print());
  };

  return (
    <div
      aria-label={`ตัวอย่างใบรับสินค้า ${detail.gr_number}`}
      aria-modal="true"
      className="gr-preview-overlay"
      role="dialog"
    >
      {/* Toolbar */}
      <div className="gr-preview-toolbar">
        <div>
          <strong>ตัวอย่างก่อนพิมพ์ใบรับสินค้า</strong>
          <span>
            {pageSize === "A4" ? "A4 แนวตั้ง" : "A5 แนวนอน"} · {detail.items.length} รายการ · {pages.length} หน้า
          </span>
        </div>
        <div className="gr-preview-actions">
          <div className="flex items-center gap-1.5 mr-3">
            <span className="text-[11px] font-bold text-slate-500">โหมดกระดาษ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as "A4" | "A5")}
              className="h-[30px] rounded-[3px] border border-outline-variant bg-background px-2 text-[11px] font-bold text-on-surface outline-none cursor-pointer"
            >
              <option value="A4">A4 (แนวตั้ง)</option>
              <option value="A5">A5 (แนวนอน)</option>
            </select>
          </div>
          <button onClick={onClose} type="button" className="gr-btn-secondary">
            <X size={17} />
            ปิด
          </button>
          <button onClick={handlePrint} type="button" className="gr-btn-primary">
            <Printer size={17} />
            พิมพ์ใบ GR ({pageSize})
          </button>
        </div>
      </div>

      {/* A4/A5 Paper Container */}
      <div className="gr-preview-scroll">
        <div className="gr-print-root">
          {pages.map((pageItems, pageIndex) => {
            const isLastPage = pageIndex === pages.length - 1;
            const filledRows = Array.from(
              { length: itemsPerPage },
              (_, idx) => pageItems[idx]
            );

            return (
              <article className={`gr-print-page gr-size-${pageSize}`} key={pageIndex}>
                <CompanyDocumentHeader
                  context={documentContext}
                  documentTitleEn="GOODS RECEIPT"
                  documentTitleTh="ใบรับสินค้า (GR)"
                  meta={[
                    { label: "เลขที่ GR", value: detail.gr_number },
                    {
                      label: "วันที่",
                      value: formatDisplayDate(detail.document_date),
                    },
                  ]}
                  priority={pageIndex === 0}
                />

                {/* Parties info */}
                <section className="gr-parties">
                  <div className="gr-party-box">
                    <h2>ผู้ขาย / คู่ค้า (SUPPLIER)</h2>
                    <strong>{detail.vendor_name}</strong>
                    {detail.vendor_address ? (
                      <p className="gr-vendor-address">{detail.vendor_address}</p>
                    ) : (
                      <p className="gr-vendor-address-empty">ไม่ระบุที่อยู่คู่ค้า</p>
                    )}
                  </div>

                  <div className="gr-party-box gr-ref-info">
                    <h2>เอกสารอ้างอิง (REFERENCES)</h2>
                    <table className="gr-ref-table">
                      <tbody>
                        <tr>
                          <td>เลขที่ใบสั่งซื้อ (PO#):</td>
                          <td><strong>{detail.po_number}</strong></td>
                        </tr>
                        <tr>
                          <td>เลขที่ใบส่งของคู่ค้า:</td>
                          <td><strong>{detail.delivery_note_no || "-"}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Items Table */}
                <div className="gr-table-container">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th className="gr-th-center w-[5%] whitespace-nowrap">#</th>
                        <th className="gr-th-left w-[15%] whitespace-nowrap">รหัสรายการ</th>
                        <th className="gr-th-left w-[50%] whitespace-nowrap">สินค้า/บริการ / รายละเอียด</th>
                        <th className="gr-th-right w-[12%] whitespace-nowrap">จำนวนสั่งซื้อ</th>
                        <th className="gr-th-right w-[12%] whitespace-nowrap">จำนวนที่รับจริง</th>
                        <th className="gr-th-center w-[6%] whitespace-nowrap">หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filledRows.map((item, rowIndex) => {
                        const lineNo = pageIndex * itemsPerPage + rowIndex + 1;
                        if (!item) {
                          // empty padding row to keep layout height stable
                          return (
                            <tr key={`empty-${rowIndex}`}>
                              <td className="gr-cell gr-cell-center">&nbsp;</td>
                              <td className="gr-cell">&nbsp;</td>
                              <td className="gr-cell">&nbsp;</td>
                              <td className="gr-cell gr-cell-number">&nbsp;</td>
                              <td className="gr-cell gr-cell-number">&nbsp;</td>
                              <td className="gr-cell gr-cell-center">&nbsp;</td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={item.id}>
                            <td className="gr-cell gr-cell-center">{lineNo}</td>
                            <td className="gr-cell font-bold">{item.item_code}</td>
                            <td className="gr-cell gr-cell-normal-wrap">
                              <div className="gr-name-clamp">
                                {item.item_name}
                              </div>
                              <div className="gr-line-meta">
                                {item.is_stocked === false ? "Non-stock / งานบริการ" : item.tracking_method ? `Tracking: ${item.tracking_method.toUpperCase()}` : null}
                                {item.vendor_lot_no ? ` • Supplier Lot: ${item.vendor_lot_no}` : ""}
                                {item.expiry_date ? ` • Exp: ${formatDisplayDate(item.expiry_date)}` : ""}
                                {item.serial_numbers?.length ? ` • Serial: ${item.serial_numbers.join(", ")}` : ""}
                              </div>
                            </td>
                            <td className="gr-cell gr-cell-number font-medium">
                              {formatQuantity(item.quantity_ordered)}
                            </td>
                            <td className="gr-cell gr-cell-number font-bold text-primary-dark">
                              {formatQuantity(item.quantity_received)}
                            </td>
                            <td className="gr-cell gr-cell-center">{item.unit_name}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Remarks & Signatures */}
                <section className="gr-bottom">
                  {isLastPage ? (
                    <>
                      <div className="gr-notes">
                        <h2>หมายเหตุเอกสาร (Remarks)</h2>
                        <p>{detail.remarks || "-"}</p>
                      </div>

                      {/* Signatures */}
                      <div className="gr-signatures">
                        <div className="gr-signature-box">
                          <span className="sig-title">ผู้ส่งสินค้า / Supplier Representative</span>
                          <div className="sig-space" />
                          <span className="sig-line">ลงชื่อ...................................................</span>
                          <span className="sig-date">วันที่ ......../......../........</span>
                        </div>

                        <div className="gr-signature-box">
                          <span className="sig-title">ผู้รับ / ตรวจรับของ (Warehouse Inspector)</span>
                          <div className="sig-space" />
                          <span className="sig-line">ลงชื่อ...................................................</span>
                          <span className="sig-date">วันที่ ......../......../........</span>
                        </div>

                        <div className="gr-signature-box">
                          <span className="sig-title">ผู้อนุมัติรับเข้า (Warehouse Manager)</span>
                          <div className="sig-space" />
                          <span className="sig-line">ลงชื่อ...................................................</span>
                          <span className="sig-date">วันที่ ......../......../........</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="gr-continued">มีรายการต่อหน้าถัดไป</div>
                  )}
                </section>

                {/* Footer */}
                <footer className="gr-document-footer">
                  <span>{footerText}</span>
                  <span>
                    หน้า {pageIndex + 1} / {pages.length}
                  </span>
                  <span>พิมพ์เมื่อ {formatPrintedAt(printedAt)}</span>
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {/* Styled JSX Styles */}
      <style jsx global>{`
        .gr-preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 150;
          display: flex;
          flex-direction: column;
          background: rgba(20, 20, 20, 0.78);
          backdrop-filter: blur(5px);
        }

        .gr-preview-toolbar {
          display: flex;
          min-height: 58px;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e3c7c7;
          background: #fff;
          padding: 8px 18px;
          color: #171717;
        }

        .gr-preview-toolbar > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .gr-preview-toolbar strong {
          font-size: 15px;
          font-weight: 700;
        }

        .gr-preview-toolbar span {
          color: #696969;
          font-size: 11px;
          font-weight: 500;
        }

        .gr-preview-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gr-preview-actions button {
          display: inline-flex;
          height: 36px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 700;
          transition: all 150ms ease-in-out;
          cursor: pointer;
        }

        .gr-btn-secondary {
          border: 1px solid #d1d5db;
          background: #fff;
          color: #374151;
          padding: 0 16px;
        }

        .gr-btn-secondary:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .gr-btn-primary {
          border: 1px solid #af101a;
          background: #af101a;
          color: #fff;
          padding: 0 18px;
        }

        .gr-btn-primary:hover {
          background: #900d14;
        }

        .gr-preview-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 18px;
        }

        .gr-print-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          zoom: 0.73;
        }

        /* Screen Preview page layout - FLEXBOX based matching PO dimensions */
        .gr-print-page {
          box-sizing: border-box;
          position: relative;
          display: flex;
          flex-direction: column;
          background: #fff;
          color: #000;
          font-family: var(--font-inter), "Sarabun", "Noto Sans Thai", sans-serif;
        }

        .gr-print-page.gr-size-A4 {
          width: 210mm;
          height: 297mm;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
          padding: 5mm 6mm 15mm 6mm; /* Bottom padding 15mm prevents signatures overlapping footer */
        }

        .gr-print-page.gr-size-A5 {
          width: 210mm;
          height: 148mm;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
          padding: 3mm 3mm 2mm;
        }

        /* A5 landscape follows the compact 10-row goods-receipt blueprint. */
        .gr-size-A5 [class*="company-document-header_header__"] {
          height: 18mm !important;
          column-gap: 2mm !important;
          border-bottom-width: 0.5mm !important;
          padding-bottom: 1.5mm !important;
          margin-bottom: 0 !important;
        }
        .gr-size-A5 [class*="company-document-header_logo__"] {
          max-height: 15.5mm !important;
        }
        .gr-size-A5 [class*="company-document-header_identity__"] strong {
          font-size: 9pt !important;
          line-height: 1.2 !important;
        }
        .gr-size-A5 [class*="company-document-header_identity__"] span {
          font-size: 6.4pt !important;
          line-height: 1.15 !important;
        }
        .gr-size-A5 [class*="company-document-header_summary__"] {
          padding-left: 3mm !important;
        }
        .gr-size-A5 [class*="company-document-header_summary__"] [class*="company-document-header_title__"] b {
          font-size: 8pt !important;
        }
        .gr-size-A5 [class*="company-document-header_summary__"] [class*="company-document-header_title__"] span {
          font-size: 7.4pt !important;
        }
        .gr-size-A5 [class*="company-document-header_meta__"] dt,
        .gr-size-A5 [class*="company-document-header_meta__"] dd {
          font-size: 6.8pt !important;
          line-height: 1.1 !important;
        }

        .gr-size-A5 .gr-parties {
          grid-template-columns: 1.15fr 1fr;
          gap: 2mm;
          margin-top: 1.5mm;
        }
        .gr-size-A5 .gr-party-box {
          height: 19mm;
          min-height: 19mm;
          padding: 1.2mm 2mm;
        }
        .gr-size-A5 .gr-party-box h2 {
          margin-bottom: 1mm;
          padding-bottom: 0.7mm;
          font-size: 7.2pt;
          letter-spacing: 0;
        }
        .gr-size-A5 .gr-party-box strong {
          font-size: 7.4pt;
        }
        .gr-size-A5 .gr-vendor-address {
          margin-top: 0.5mm;
          font-size: 6.6pt;
          line-height: 1.2;
          -webkit-line-clamp: 2;
        }
        .gr-size-A5 .gr-vendor-address-empty {
          margin-top: 0.5mm;
          font-size: 6.6pt;
        }
        .gr-size-A5 .gr-ref-table {
          font-size: 6.6pt;
        }
        .gr-size-A5 .gr-ref-table td {
          padding: 0.35mm 0;
        }
        .gr-size-A5 .gr-ref-table td:first-child,
        .gr-size-A5 .gr-ref-table td strong {
          color: #000;
          font-weight: 700;
        }
        .gr-size-A5 .gr-table-container {
          flex: 0 0 auto;
          margin-top: 1.5mm;
        }
        .gr-size-A5 .gr-table {
          table-layout: fixed;
          font-size: 6.8pt;
        }
        .gr-size-A5 .gr-table th {
          height: 5mm;
          padding: 0.6mm 1mm;
          background: #fff;
          border-color: #777;
          font-size: 6.8pt;
        }
        .gr-size-A5 .gr-bottom {
          margin-top: 1.5mm;
          gap: 1.2mm;
        }
        .gr-size-A5 .gr-notes {
          display: grid;
          height: 4mm;
          min-height: 4mm;
          grid-template-columns: max-content minmax(0, 1fr);
          column-gap: 2mm;
          align-items: center;
          padding: 0.3mm 2mm;
          font-size: 6.8pt;
        }
        .gr-size-A5 .gr-notes h2 {
          margin: 0;
          font-size: 6.8pt;
          white-space: nowrap;
        }
        .gr-size-A5 .gr-notes p {
          overflow: hidden;
          font-size: 6.8pt;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gr-size-A5 .gr-signatures {
          height: 15mm;
          margin: 0 0 1mm;
          gap: 2mm;
        }
        .gr-size-A5 .gr-signature-box {
          justify-content: flex-start;
          min-height: 0;
          box-sizing: border-box;
          padding: 1.4mm 1mm 1mm;
          background: #fff;
        }
        .gr-size-A5 .sig-title {
          font-size: 7pt;
        }
        .gr-size-A5 .sig-line,
        .gr-size-A5 .sig-date {
          font-size: 6.5pt;
        }
        .gr-size-A5 .sig-space {
          height: 2mm;
        }

        .gr-parties {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 12px;
          margin-top: 8px;
          flex-shrink: 0;
        }

        .gr-party-box {
          border: 1px solid #dcdcdc;
          border-radius: 2px;
          padding: 6px 10px;
          min-height: 75px;
        }

        .gr-party-box h2 {
          border-bottom: 1.5px solid #af101a;
          padding-bottom: 3px;
          margin: 0 0 8px 0;
          color: #af101a;
          font-size: 8.8pt;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .gr-party-box strong {
          display: block;
          font-size: 9.6pt;
          color: #111;
        }

        .gr-vendor-address {
          margin: 6px 0 0 0;
          font-size: 8.4pt;
          color: #555;
          line-height: 1.4;
          font-weight: 500;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .gr-vendor-address-empty {
          margin: 6px 0 0 0;
          font-size: 8.4pt;
          color: #999;
          font-style: italic;
        }

        .gr-ref-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.4pt;
        }

        .gr-ref-table td {
          padding: 2px 0;
          vertical-align: top;
        }

        .gr-ref-table td:first-child {
          color: #555;
          width: 55%;
          font-weight: 600;
        }

        .gr-table-container {
          flex: 1;
          min-height: 0;
          margin-top: 8px;
        }

        .gr-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.0pt;
        }

        .gr-table th {
          border: 1px solid #999;
          background: #fafafa;
          padding: 6px 8px;
          font-size: 8.0pt;
          font-weight: 700;
          color: #000;
          text-transform: uppercase;
        }

        .gr-th-left { text-align: left; }
        .gr-th-center { text-align: center; }
        .gr-th-right { text-align: right; }

        .gr-cell {
          border: 1px solid #cbcbcb;
          padding: 4px 8px;
          height: 26px; /* Fixed height row */
          box-sizing: border-box;
          vertical-align: middle;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 7.7pt;
          font-weight: 600;
        }

        .gr-cell-normal-wrap {
          border: 1px solid #cbcbcb;
          padding: 4px 8px;
          box-sizing: border-box;
          vertical-align: middle;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          font-size: 7.7pt;
          font-weight: 600;
        }

        .gr-name-clamp {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.25;
          max-height: 2.5em;
          font-size: 7.7pt;
          font-weight: 600;
        }

        .gr-line-meta {
          margin-top: 1px;
          color: #6b7280;
          font-size: 6.6pt;
          font-weight: 500;
          line-height: 1.15;
        }

        .gr-size-A5 .gr-cell {
          height: 6.1mm !important;
          padding: 0.5mm 1mm !important;
          border-color: #888;
          font-size: 6.8pt !important;
        }

        .gr-size-A5 .gr-cell-normal-wrap {
          height: 6.1mm !important;
          padding: 0.45mm 1.2mm !important;
          border-color: #888;
        }

        .gr-size-A5 .gr-name-clamp {
          line-height: 1.05;
          max-height: 2.1em;
          font-size: 6.6pt !important;
        }

        .gr-size-A5 .gr-line-meta {
          font-size: 5.8pt !important;
          line-height: 1;
        }

        .gr-cell-center { text-align: center; }
        .gr-cell-number { text-align: right; }

        .text-primary-dark {
          color: #af101a;
        }

        .gr-bottom {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-shrink: 0;
        }

        .gr-notes {
          display: grid;
          grid-template-columns: max-content minmax(0, 1fr);
          column-gap: 8px;
          align-items: center;
          border: 1px solid #dcdcdc;
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 8.0pt;
        }

        .gr-notes h2 {
          margin: 0;
          font-size: 7.2pt;
          font-weight: 700;
          color: #555;
          white-space: nowrap;
        }

        .gr-notes p {
          margin: 0;
          color: #111;
          font-weight: 600;
          line-height: 1.3;
          font-size: 8.0pt;
        }

        .gr-continued {
          text-align: center;
          font-size: 8.0pt;
          font-weight: 700;
          color: #af101a;
          border: 1px dashed #af101a;
          padding: 4px;
          border-radius: 2px;
        }

        .gr-signatures {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 4px;
        }

        .gr-signature-box {
          border: 1px solid #dcdcdc;
          border-radius: 2px;
          padding: 6px 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #fafafa;
        }

        .sig-title {
          font-size: 8.8pt;
          font-weight: 700;
          color: #333;
          text-align: center;
        }

        .sig-space {
          height: 20px;
        }

        .sig-line, .sig-date {
          font-size: 8.8pt;
          color: #555;
          margin-top: 2px;
        }

        .gr-document-footer {
          position: absolute;
          bottom: 5mm;
          left: 6mm;
          right: 6mm;
          border-top: 0.75mm solid #af101a;
          padding-top: 2mm;
          display: flex;
          justify-content: space-between;
          font-size: 7.2pt;
          color: #000;
          font-weight: 600;
        }

        .gr-size-A5 .gr-document-footer {
          position: static;
          inset: auto;
          flex: 0 0 4.5mm;
          align-items: flex-end;
          box-sizing: border-box;
          margin-top: auto;
          border-top-width: 0.5mm;
          padding-top: 0.8mm;
          font-size: 6.2pt;
        }

        /* PRINT STYLING TARGETING WINDOW PRINT */
        @page {
          size: ${pageSize === "A4" ? "210mm 297mm" : "210mm 148mm"};
          margin: 0;
        }

        @page grReceiptA4 {
          size: 210mm 297mm;
          margin: 0;
        }

        @page grReceiptA5 {
          size: 210mm 148mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }

          body.printing-goods-receipt
            *:not(.gr-print-root):not(.gr-print-root *):not(
              :has(.gr-print-root)
            ) {
            display: none !important;
          }

          body.printing-goods-receipt *:has(.gr-print-root) {
            box-sizing: border-box !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            transform: none !important;
          }

          body.printing-goods-receipt .gr-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            zoom: 1 !important;
          }

          body.printing-goods-receipt .gr-print-page {
            width: 210mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            flex: none !important;
            break-inside: avoid-page;
            page-break-inside: avoid;
            break-after: page;
            page-break-after: always;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            display: flex !important;
            flex-direction: column !important;
          }

          body.printing-goods-receipt .gr-print-page.gr-size-A4 {
            page: grReceiptA4;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            flex-basis: 297mm !important;
            padding: 5mm 6mm 15mm !important;
          }

          body.printing-goods-receipt .gr-print-page.gr-size-A5 {
            page: grReceiptA5;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: 148mm !important;
            min-height: 148mm !important;
            max-height: 148mm !important;
            flex-basis: 148mm !important;
            padding: 3mm 3mm 2mm !important;
          }

          body.printing-goods-receipt .gr-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }

        @media (max-width: 760px) {
          .gr-preview-scroll {
            padding: 10px;
          }

          .gr-print-root {
            zoom: 0.46;
          }
        }
      `}</style>
    </div>
  );
}
