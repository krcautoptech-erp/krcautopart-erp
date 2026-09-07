"use client";

import { ChevronDown, History, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import {
  getPurchaseRequisitionHistoryLabel,
  paginatePurchaseRequisitionItems,
  PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE,
  type PurchaseRequisitionPrintDetail,
  type PurchaseRequisitionPrintItem,
} from "@/lib/purchase-requisition-print";
import {
  formatDisplayDate,
  getPurchaseRequisitionStatusLabel,
} from "@/lib/purchase-requisitions";

type PrPrintPreviewModalProps = {
  canDecide: boolean;
  detail: PurchaseRequisitionPrintDetail;
  documentContext: CompanyDocumentContext;
  onDecision: (
    decision: "approved" | "rejected",
    note: string,
  ) => Promise<{ error?: string; success: boolean }>;
  onClose: () => void;
};

function formatQuantity(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrintedAt(value: Date) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getApproval(detail: PurchaseRequisitionPrintDetail) {
  return [...detail.approvals]
    .reverse()
    .find((approval) => approval.action === "approved");
}

function PrintRow({
  item,
}: {
  item?: PurchaseRequisitionPrintItem;
}) {
  return (
    <tr>
      <td className="pr-cell pr-cell-center">{item?.lineNo ?? ""}</td>
      <td className="pr-cell pr-cell-center pr-cell-code">{item?.code ?? ""}</td>
      <td className="pr-cell pr-cell-description">
        <div className="pr-description-text">
          <div className="pr-item-name">{item?.name ?? ""}</div>
          {item?.description ? (
            <div className="pr-item-detail">{item.description}</div>
          ) : null}
        </div>
      </td>
      <td className="pr-cell pr-cell-center pr-cell-quantity-val">
        {item ? formatQuantity(item.quantity) : ""}
      </td>
      <td className="pr-cell pr-cell-center">{item?.unitName ?? ""}</td>
      <td className="pr-cell pr-cell-note">{item?.remarks ?? ""}</td>
    </tr>
  );
}

function Signature({
  date,
  label,
  name,
  isDottedDate = true,
}: {
  date?: string;
  label: string;
  name?: string;
  isDottedDate?: boolean;
}) {
  return (
    <div className="pr-signature">
      <strong className="pr-signature-label">{label}</strong>
      <div className="pr-signature-line-wrap">
        <div className="pr-signature-line" />
      </div>
      <div className="pr-signature-name">
        ( {name ? name : "                                     "} )
      </div>
      <div className="pr-signature-date">
        วันที่ {date ? formatDisplayDate(date) : (isDottedDate ? "...../...../....." : "____/____/______")}
      </div>
    </div>
  );
}

export function PrPrintPreviewModal({
  canDecide,
  detail,
  documentContext,
  onDecision,
  onClose,
}: PrPrintPreviewModalProps) {
  const [printedAt] = useState(() => new Date());
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [isDeciding, setIsDeciding] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const pages = paginatePurchaseRequisitionItems(detail.items);
  const approval = getApproval(detail);
  const { documentSettings } = documentContext;
  const footerText =
    [documentSettings.footerTextTh, documentSettings.footerTextEn]
      .filter(Boolean)
      .join(" / ") || "เอกสารจากระบบ KRC ERP";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (decision) {
          if (!isDeciding) {
            setDecision(null);
            setDecisionError(null);
            setDecisionNote("");
          }
          return;
        }

        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("printing-purchase-requisition");
    };
  }, [decision, isDeciding, onClose]);

  const handlePrint = () => {
    const clearPrintMode = () => {
      document.body.classList.remove("printing-purchase-requisition");
      window.removeEventListener("afterprint", clearPrintMode);
    };

    document.body.classList.add("printing-purchase-requisition");
    window.addEventListener("afterprint", clearPrintMode);
    window.print();
  };

  const openDecision = (nextDecision: "approved" | "rejected") => {
    setDecision(nextDecision);
    setDecisionError(null);
    setDecisionNote("");
  };

  const closeDecision = () => {
    if (isDeciding) return;
    setDecision(null);
    setDecisionError(null);
    setDecisionNote("");
  };

  const handleDecision = async () => {
    if (!decision) return;

    if (decision === "rejected" && !decisionNote.trim()) {
      setDecisionError("กรุณาระบุเหตุผลที่ปฏิเสธใบขอซื้อ");
      return;
    }

    setDecisionError(null);
    setIsDeciding(true);
    const result = await onDecision(decision, decisionNote);
    setIsDeciding(false);

    if (!result.success) {
      setDecisionError(result.error ?? "ไม่สามารถบันทึกผลการอนุมัติได้");
    }
  };

  return (
    <div
      aria-label={`ตัวอย่างใบขอซื้อ ${detail.prNumber}`}
      aria-modal="true"
      className="pr-preview-overlay"
      role="dialog"
    >
      <div className="pr-preview-toolbar">
        <div>
          <strong>ตัวอย่างก่อนพิมพ์</strong>
          <span>
            A4 แนวตั้ง · {detail.items.length} รายการ · {pages.length} หน้า
          </span>
        </div>
        <div className="pr-preview-actions">
          <button onClick={onClose} type="button">
            ปิด
          </button>
          <button className="pr-preview-print-button" onClick={handlePrint} type="button">
            <Printer aria-hidden="true" size={17} />
            พิมพ์ใบ PR
          </button>
          {canDecide && detail.status === "pending_approval" ? (
            <>
              <span aria-hidden="true" className="pr-preview-action-divider" />
              <button
                className="pr-preview-reject-button"
                onClick={() => openDecision("rejected")}
                type="button"
              >
                ปฏิเสธ
              </button>
              <button
                className="pr-preview-change-button"
                disabled
                title="ระบบขอแก้ไขเอกสารจะเปิดใช้งานใน workflow ขั้นถัดไป"
                type="button"
              >
                ขอแก้ไข
              </button>
              <button
                className="pr-preview-approve-button"
                onClick={() => openDecision("approved")}
                type="button"
              >
                อนุมัติ
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="pr-preview-scroll">
        <div className="pr-approval-context">
          <span className={`pr-approval-status pr-approval-status-${detail.status}`}>
            {getPurchaseRequisitionStatusLabel(detail.status)}
          </span>
          <span>
            {detail.status === "pending_approval"
              ? "รอผู้มีสิทธิ์อนุมัติพิจารณาเอกสาร"
              : "เอกสารผ่านขั้นตอนการพิจารณาแล้ว"}
          </span>
          <button
            aria-expanded={isHistoryOpen}
            onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
            type="button"
          >
            <History aria-hidden="true" size={14} />
            ดูประวัติการอนุมัติ
            <ChevronDown
              aria-hidden="true"
              className={isHistoryOpen ? "rotate-180" : undefined}
              size={14}
            />
          </button>
          {isHistoryOpen ? (
            <div className="pr-approval-history">
              <strong>ประวัติการอนุมัติ</strong>
              {detail.approvals.length > 0 ? (
                detail.approvals.map((item, index) => (
                  <div key={`${item.action}-${item.createdAt}-${index}`}>
                    <span className={`pr-history-action-${item.action}`}>
                      {getPurchaseRequisitionHistoryLabel(item.action)}
                    </span>
                    <b>{item.actorName}</b>
                    <time>{formatPrintedAt(new Date(item.createdAt))}</time>
                  </div>
                ))
              ) : (
                <p>ยังไม่มีประวัติการพิจารณา</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="pr-print-root">
          {pages.map((items, pageIndex) => {
            const rows = Array.from(
              { length: PURCHASE_REQUISITION_PRINT_ROWS_PER_PAGE },
              (_, rowIndex) => items[rowIndex],
            );
            return (
              <article className="pr-print-page" key={pageIndex}>
                <CompanyDocumentHeader
                  context={documentContext}
                  priority={pageIndex === 0}
                />

                <section className="pr-document-heading">
                  <div aria-hidden="true" />
                  <h1>PURCHASE REQUISITION / ใบขอซื้อ (PR)</h1>
                  <dl>
                    <div>
                      <dt>เลขที่ PR :</dt>
                      <dd>{detail.prNumber}</dd>
                    </div>
                    <div>
                      <dt>วันที่ :</dt>
                      <dd>{formatDisplayDate(detail.documentDate)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="pr-document-info">
                  <div className="pr-info-left">
                    <div className="pr-info-row">
                      <span className="pr-info-label">ผู้ขอเอกสาร :</span>
                      <span className="pr-info-value">{detail.requesterName}</span>
                    </div>
                    <div className="pr-info-row">
                      <span className="pr-info-label">แผนก :</span>
                      <span className="pr-info-value">{detail.departmentName}</span>
                    </div>
                  </div>
                  <div className="pr-info-right">
                    <div className="pr-info-row">
                      <span className="pr-info-label">วันที่ต้องการใช้ :</span>
                      <span className="pr-info-value">{formatDisplayDate(detail.neededByDate)}</span>
                    </div>
                  </div>
                </section>

                <div className="pr-table-wrap">
                  <table className="pr-document-table">
                    <colgroup>
                      <col className="pr-col-index" />
                      <col className="pr-col-code" />
                      <col className="pr-col-description" />
                      <col className="pr-col-quantity" />
                      <col className="pr-col-unit" />
                      <col className="pr-col-note" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>รหัส</th>
                        <th>สินค้า/บริการ / รายละเอียด</th>
                        <th>จำนวน</th>
                        <th>หน่วย</th>
                        <th>หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, rowIndex) => (
                        <PrintRow
                          item={item}
                          key={item?.lineNo ?? `blank-${rowIndex}`}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pr-purpose-remarks">
                  <div className="pr-purpose-row">
                    <strong>วัตถุประสงค์ :</strong>
                    <span>{detail.remarks || "-"}</span>
                  </div>
                </div>

                <section className="pr-signatures">
                  <Signature
                    date={detail.documentDate}
                    label="ผู้ขอเอกสาร"
                    name={detail.requesterName}
                  />
                  <Signature
                    label="หัวหน้าแผนก"
                    name={detail.departmentManagerName || undefined}
                  />
                  <Signature
                    date={approval?.createdAt}
                    label="ผู้จัดการฝ่ายจัดซื้อ"
                    name={approval?.actorName || undefined}
                  />
                </section>

                <div aria-hidden="true" className="pr-signature-spacer" />

                <footer className="pr-document-footer">
                  <span>พิมพ์โดย : {detail.requesterName}</span>
                  <span className="pr-footer-center">พิมพ์วันที่ : {formatPrintedAt(printedAt)}</span>
                  <span className="pr-footer-right">
                    หน้า {pageIndex + 1} / {pages.length}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {decision ? (
        <div
          aria-label={
            decision === "approved"
              ? "ยืนยันการอนุมัติใบขอซื้อ"
              : "ยืนยันการปฏิเสธใบขอซื้อ"
          }
          aria-modal="true"
          className="pr-decision-overlay"
          role="dialog"
        >
          <section className="pr-decision-dialog">
            <header className="flex h-13 items-center justify-between border-b border-outline-variant px-5">
              <div>
                <h2 className="text-[17px] font-bold">
                  {decision === "approved"
                    ? "ยืนยันการอนุมัติ PR"
                    : "ยืนยันการปฏิเสธ PR"}
                </h2>
                <p className="text-[12px] font-medium text-secondary">
                  {detail.prNumber}
                </p>
              </div>
              <button
                aria-label="ปิดหน้าต่างยืนยัน"
                className="rounded-[3px] p-1 text-secondary hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
                disabled={isDeciding}
                onClick={closeDecision}
                type="button"
              >
                <X size={19} />
              </button>
            </header>

            <div className="space-y-3 p-5">
              <p className="text-[13px] font-medium leading-5 text-secondary">
                {decision === "approved"
                  ? "ตรวจสอบรายการเรียบร้อยแล้วและต้องการอนุมัติใบขอซื้อนี้ใช่หรือไม่"
                  : "ระบุเหตุผลเพื่อแจ้งกลับไปยังผู้สร้างใบขอซื้อ"}
              </p>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-bold">
                  {decision === "approved"
                    ? "หมายเหตุ (ถ้ามี)"
                    : "เหตุผลที่ปฏิเสธ *"}
                </span>
                <textarea
                  autoFocus
                  className="h-24 w-full resize-none rounded-[4px] border border-outline-variant bg-background px-3 py-2 text-[13px] font-medium text-on-surface outline-none placeholder:text-secondary/65 focus:border-primary"
                  maxLength={500}
                  onChange={(event) => {
                    setDecisionNote(event.target.value);
                    setDecisionError(null);
                  }}
                  placeholder={
                    decision === "approved"
                      ? "ระบุหมายเหตุเพิ่มเติม"
                      : "ระบุเหตุผลที่ปฏิเสธใบขอซื้อ"
                  }
                  value={decisionNote}
                />
                <span className="mt-1 block text-right text-[11px] text-secondary">
                  {decisionNote.length} / 500
                </span>
              </label>
              {decisionError ? (
                <p
                  className="border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  role="alert"
                >
                  {decisionError}
                </p>
              ) : null}
            </div>

            <footer className="flex justify-end gap-2 border-t border-outline-variant px-5 py-3">
              <button
                className="h-9 rounded-[4px] border border-outline-variant px-5 text-[13px] font-bold hover:bg-surface-container-low disabled:opacity-50"
                disabled={isDeciding}
                onClick={closeDecision}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className={`h-9 min-w-28 rounded-[4px] px-5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === "approved"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-primary hover:bg-primary/90"
                }`}
                disabled={isDeciding}
                onClick={handleDecision}
                type="button"
              >
                {isDeciding
                  ? "กำลังบันทึก..."
                  : decision === "approved"
                    ? "ยืนยันอนุมัติ"
                    : "ยืนยันปฏิเสธ"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .pr-preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 130;
          display: flex;
          flex-direction: column;
          background: rgba(20, 20, 20, 0.78);
          backdrop-filter: blur(5px);
        }

        .pr-preview-toolbar {
          display: flex;
          min-height: 60px;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #e3c7c7;
          background: #ffffff;
          padding: 8px 20px;
          color: #171717;
        }

        .pr-preview-toolbar > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .pr-preview-toolbar strong {
          font-size: 16px;
          font-weight: 700;
        }

        .pr-preview-toolbar span {
          color: #696969;
          font-size: 12px;
          font-weight: 500;
        }

        .pr-preview-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pr-preview-actions button {
          display: inline-flex;
          height: 38px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #e4b8b8;
          border-radius: 4px;
          background: #ffffff;
          padding: 0 18px;
          color: #171717;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .pr-preview-actions .pr-preview-print-button {
          border-color: #a9a9a9;
          background: #ffffff;
          color: #171717;
        }

        .pr-preview-actions .pr-preview-reject-button {
          border-color: #bd0d1a;
          color: #bd0d1a;
        }

        .pr-preview-actions .pr-preview-approve-button {
          border-color: #bd0d1a;
          background: #bd0d1a;
          color: #ffffff;
        }

        .pr-preview-actions .pr-preview-change-button {
          border-color: #9a9a9a;
          color: #333333;
        }

        .pr-preview-actions .pr-preview-change-button:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }

        .pr-preview-action-divider {
          width: 1px;
          height: 30px;
          margin: 0 8px;
          background: #dddddd;
        }

        .pr-decision-overlay {
          position: fixed;
          inset: 0;
          z-index: 150;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(18, 18, 18, 0.58);
          padding: 20px;
          backdrop-filter: blur(2px);
        }

        .pr-decision-dialog {
          width: min(100%, 420px);
          overflow: hidden;
          border: 1px solid #e2bcbc;
          border-radius: 6px;
          background: var(--background-color, #ffffff);
          color: var(--on-surface-color, #171717);
          box-shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
        }

        .pr-preview-scroll {
          flex: 1;
          overflow: auto;
          padding: 14px 20px 28px;
        }

        .pr-approval-context {
          position: relative;
          display: flex;
          width: max-content;
          min-height: 30px;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 0 auto 10px;
          color: #f5f5f5;
          font-size: 12px;
          font-weight: 600;
        }

        .pr-approval-context button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          background: transparent;
          color: #f5f5f5;
          font: inherit;
          cursor: pointer;
        }

        .pr-approval-status {
          border: 1px solid rgba(255, 255, 255, 0.58);
          border-radius: 3px;
          background: #ffffff;
          padding: 3px 7px;
          color: #bd0d1a;
          font-size: 11px;
          line-height: 1;
        }

        .pr-approval-status-approved {
          color: #047857;
        }

        .pr-approval-status-rejected,
        .pr-approval-status-cancelled {
          color: #bd0d1a;
        }

        .pr-approval-history {
          position: absolute;
          z-index: 4;
          top: calc(100% + 5px);
          right: 0;
          display: grid;
          width: 310px;
          gap: 8px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          background: #ffffff;
          padding: 12px;
          color: #171717;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
        }

        .pr-approval-history > strong {
          font-size: 13px;
        }

        .pr-approval-history > div {
          display: grid;
          grid-template-columns: 86px 1fr;
          gap: 3px 8px;
          border-top: 1px solid #eeeeee;
          padding-top: 7px;
          font-size: 11px;
        }

        .pr-approval-history > div span {
          grid-row: 1 / span 2;
          align-self: center;
          color: #555555;
          font-weight: 700;
        }

        .pr-approval-history > div span.pr-history-action-approved {
          color: #008d61;
        }

        .pr-approval-history > div span.pr-history-action-rejected {
          color: #bd0d1a;
        }

        .pr-approval-history > div b {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pr-approval-history > div time,
        .pr-approval-history > p {
          margin: 0;
          color: #686868;
          font-size: 10px;
          font-weight: 500;
        }

        .pr-print-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          zoom: 0.67;
        }

        .pr-print-page {
          box-sizing: border-box;
          display: grid;
          width: 210mm;
          height: 297mm;
          grid-template-rows: 30mm 16mm 15mm 163mm 14mm 37mm 8mm 8mm;
          overflow: hidden;
          border: 0.25mm solid #000000;
          background: #ffffff;
          padding: 3mm 7.5mm;
          color: #000000;
          font-family: var(--font-inter), "Sarabun", "Noto Sans Thai", sans-serif;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
        }

        .pr-print-page header {
          border-bottom: 0.75mm solid #d31220 !important;
        }

        .pr-document-heading {
          display: grid;
          grid-template-columns: 1fr 2fr 1fr;
          align-items: center;
          color: #000000;
        }

        .pr-document-heading h1 {
          margin: 0;
          font-size: 15pt;
          font-weight: 700;
          line-height: 1.2;
          text-align: center;
          white-space: nowrap;
        }

        .pr-document-heading dl {
          display: grid;
          gap: 1.5mm;
          margin: 0;
          justify-content: end;
          font-size: 9.8pt;
        }

        .pr-document-heading dl > div {
          display: flex;
          align-items: center;
          gap: 1.5mm;
        }

        .pr-document-heading dt {
          font-weight: 500;
          color: #000000;
        }

        .pr-document-heading dd {
          font-weight: 700;
          color: #000000;
        }

        .pr-document-info {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          width: 100%;
          border: 0;
          padding: 2mm 0;
        }

        .pr-info-left,
        .pr-info-right {
          display: flex;
          flex-direction: column;
          gap: 1.5mm;
        }

        .pr-info-row {
          display: flex;
          align-items: center;
          gap: 2mm;
          font-size: 9.8pt;
          line-height: 1.2;
        }

        .pr-info-label {
          color: #000000;
          font-weight: 500;
        }

        .pr-info-value {
          color: #000000;
          font-weight: 700;
        }

        .pr-purpose-remarks {
          display: flex;
          flex-direction: column;
          gap: 1.5mm;
          padding-top: 3.5mm;
          font-size: 9.5pt;
          line-height: 1.3;
          color: #000000;
        }

        .pr-purpose-row {
          display: flex;
          align-items: center;
          gap: 1.5mm;
        }

        .pr-purpose-row strong {
          font-weight: 500;
          color: #000000;
        }

        .pr-purpose-row span {
          font-weight: 600;
        }

        .pr-table-wrap {
          box-sizing: border-box;
          min-height: 0;
          padding-top: 3mm;
        }

        .pr-document-table {
          height: 161mm;
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 0.25mm solid #000000;
        }

        .pr-document-table th {
          height: 8mm;
          border: 0.2mm solid #000000;
          background: transparent;
          padding: 0 1.2mm;
          font-size: 9.5pt;
          font-weight: 700;
          line-height: 1.1;
          text-align: center;
          color: #000000;
        }

        .pr-document-table tbody tr {
          height: 10.2mm;
        }

        .pr-cell {
          overflow: hidden;
          border: 0.2mm solid #000000;
          padding: 0.5mm 1.2mm;
          color: #000000;
          font-size: 8.8pt;
          font-weight: 500;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pr-cell-center {
          text-align: center;
        }

         .pr-cell-code {
          color: #000000;
        }

        .pr-cell-description {
          white-space: normal;
        }

        .pr-description-text {
          display: -webkit-box;
          overflow: hidden;
          line-height: 1.2;
          overflow-wrap: anywhere;
          white-space: normal;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .pr-item-name {
          font-weight: 700;
        }

        .pr-item-detail {
          font-size: 9px;
        }

        .pr-cell-quantity-val {
        }

        .pr-cell-note {
          white-space: normal;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pr-col-index {
          width: 7%;
        }

        .pr-col-code {
          width: 9%;
        }

        .pr-col-description {
          width: 40%;
        }

        .pr-col-quantity {
          width: 9%;
        }

        .pr-col-unit {
          width: 8%;
        }

        .pr-col-note {
          width: 27%;
        }

        .pr-signatures {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin-top: 1.5mm;
          border: 0.25mm solid #000000;
        }

        .pr-signature {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          border-right: 0.25mm solid #000000;
          color: #000000;
          font-size: 9.5pt;
          line-height: 1.4;
          padding: 2.5mm 4mm;
        }

        .pr-signature:last-child {
          border-right: 0;
        }

        .pr-signature-label {
          color: #000000;
          font-size: 9.8pt;
          font-weight: 700;
          margin-bottom: 7mm;
        }

        .pr-signature-line-wrap {
          width: 80%;
          display: flex;
          justify-content: center;
          margin-bottom: 2.5mm;
        }

        .pr-signature-line {
          width: 100%;
          border-bottom: 0.25mm solid #000000;
        }

        .pr-signature-name {
          font-size: 8.8pt;
          font-weight: 500;
          margin-bottom: 1.5mm;
          text-align: center;
          white-space: pre;
        }

        .pr-signature-date {
          font-size: 8.8pt;
          font-weight: 500;
          text-align: center;
        }

        .pr-document-footer {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          align-items: center;
          color: #000000;
          font-size: 7.2pt;
          font-weight: 600;
          border-top: 0.75mm solid #d31220;
          padding-top: 2mm;
        }

        .pr-footer-center {
          text-align: center;
        }

        .pr-footer-right {
          text-align: right;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 210mm !important;
            min-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body.printing-purchase-requisition * {
            visibility: hidden !important;
          }

          body.printing-purchase-requisition .pr-print-root,
          body.printing-purchase-requisition .pr-print-root * {
            visibility: visible !important;
          }

          body.printing-purchase-requisition .pr-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            width: 210mm !important;
            zoom: 1 !important;
          }

          body.printing-purchase-requisition .pr-print-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          body.printing-purchase-requisition .pr-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }

        @media (max-width: 760px) {
          .pr-preview-toolbar {
            align-items: flex-start;
            padding: 9px 10px;
          }

          .pr-preview-toolbar > div:first-child span {
            display: none;
          }

          .pr-preview-actions button {
            width: 38px;
            padding: 0;
            font-size: 0;
          }

          .pr-preview-action-divider {
            display: none;
          }

          .pr-preview-actions .pr-preview-change-button {
            display: none;
          }

          .pr-approval-context {
            width: 100%;
            justify-content: flex-start;
            overflow: hidden;
            white-space: nowrap;
          }

          .pr-approval-context > span:nth-child(2) {
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .pr-approval-context button {
            display: none;
          }

          .pr-preview-scroll {
            padding: 10px;
          }

          .pr-print-root {
            zoom: 0.46;
          }

          .pr-decision-overlay {
            align-items: flex-end;
            padding: 12px;
          }

          .pr-decision-dialog {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
