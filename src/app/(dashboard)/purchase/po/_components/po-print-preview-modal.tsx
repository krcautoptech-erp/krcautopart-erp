"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { DocumentPreviewShell } from "@/components/document-preview-shell";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { exportElementPdf, printElement } from "@/lib/document-print";
import {
  formatThaiBahtText,
  paginatePurchaseOrderItems,
  PURCHASE_ORDER_PRINT_ROWS_PER_PAGE,
  type PurchaseOrderPrintDetail,
  type PurchaseOrderPrintItem,
} from "@/lib/purchase-order-print";
import {
  formatPurchaseOrderAmount,
  PURCHASE_ORDER_STATUS_META,
} from "@/lib/purchase-orders";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { getMfaErrorMessage, isTotpCodeComplete, normalizeTotpCode } from "@/lib/mfa";
import { createClient } from "@/utils/supabase/client";

type PoPrintPreviewModalProps = {
  detail: PurchaseOrderPrintDetail;
  documentContext: CompanyDocumentContext;
  onClose: () => void;
  canApprove?: boolean;
  canReject?: boolean;
  onDecision?: (
    decision: "approved" | "rejected",
    note: string,
  ) => Promise<{ success: boolean; error?: string; requiresMfa?: boolean }>;
};

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

function hasPrintableValue(value: string) {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 && normalizedValue !== "-";
}

function PrintInfoRow({ label, value }: { label: string; value: string }) {
  if (!hasPrintableValue(value)) return null;

  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PrintRow({ item }: { item?: PurchaseOrderPrintItem }) {
  return (
    <tr>
      <td className="po-cell po-cell-center">{item?.lineNo ?? ""}</td>
      <td className="po-cell po-cell-code">{item?.itemCode ?? ""}</td>
      <td className="po-cell po-cell-description">
        <div className="po-description-text">
          {item?.itemDescription ?? ""}
        </div>
      </td>
      <td className="po-cell po-cell-number">
        {item ? formatQuantity(item.quantity) : ""}
      </td>
      <td className="po-cell po-cell-center">{item?.unitName ?? ""}</td>
      <td className="po-cell po-cell-center">
        {item ? formatDisplayDate(item.deliveryDate) : ""}
      </td>
      <td className="po-cell po-cell-number">
        {item ? formatPurchaseOrderAmount(item.unitPrice) : ""}
      </td>
      <td className="po-cell po-cell-number">
        {item ? formatPurchaseOrderAmount(item.discountAmount) : ""}
      </td>
      <td className="po-cell po-cell-number">
        {item ? formatPurchaseOrderAmount(item.lineTotal) : ""}
      </td>
    </tr>
  );
}

export function PoPrintPreviewModal({
  detail,
  documentContext,
  onClose,
  canApprove = false,
  canReject = false,
  onDecision,
}: PoPrintPreviewModalProps) {
  const [printedAt] = useState(() => new Date());
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isDeciding, setIsDeciding] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const openDecision = (nextDecision: "approved" | "rejected") => {
    setDecision(nextDecision);
    setDecisionError(null);
    setDecisionNote("");
    setMfaRequired(false);
    setTotpCode("");
  };

  const closeDecision = () => {
    if (isDeciding) return;
    setDecision(null);
    setDecisionError(null);
    setDecisionNote("");
    setMfaRequired(false);
    setTotpCode("");
  };

  const handleDecision = async () => {
    if (!decision || !onDecision) return;

    if (decision === "rejected" && !decisionNote.trim()) {
      setDecisionError("กรุณาระบุเหตุผลที่ปฏิเสธใบสั่งซื้อ");
      return;
    }

    setDecisionError(null);
    setIsDeciding(true);

    if (mfaRequired) {
      if (!isTotpCodeComplete(totpCode)) {
        setDecisionError("กรุณากรอกรหัส Authenticator 6 หลัก");
        setIsDeciding(false);
        return;
      }
      const supabase = createClient();
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((item) => item.status === "verified");
      if (factors.error || !factor) {
        setDecisionError("ยังไม่ได้เชื่อมต่อ Authenticator กรุณาตั้งค่าในหน้าลายเซ็นและการอนุมัติ");
        setIsDeciding(false);
        return;
      }
      const verified = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totpCode,
      });
      if (verified.error) {
        setDecisionError(getMfaErrorMessage(verified.error));
        setIsDeciding(false);
        return;
      }
    }

    const result = await onDecision(decision, decisionNote);
    setIsDeciding(false);

    if (!result.success) {
      setDecisionError(result.error ?? "ไม่สามารถบันทึกผลการอนุมัติได้");
      if (result.requiresMfa) setMfaRequired(true);
    }
  };
  const pages = paginatePurchaseOrderItems(detail.items);

  const printRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handlePrint = async () => {
    if (printRootRef.current) {
      await printElement(printRootRef.current, {
        title: detail.poNumber || "purchase-order",
        paperSize: "A4",
        orientation: "portrait",
        bodyClass: "printing-purchase-order",
      });
      return;
    }
  };

  const handleExportPdf = async () => {
    if (printRootRef.current) {
      await exportElementPdf(printRootRef.current, {
        filename: detail.poNumber || "purchase-order",
        paperSize: "A4",
        orientation: "portrait",
        bodyClass: "printing-purchase-order",
      });
      return;
    }
  };

  const statusLabel = PURCHASE_ORDER_STATUS_META[detail.status]?.label ?? detail.status;
  const statusDescription = detail.status === "pending_approval"
    ? "รอผู้มีสิทธิ์อนุมัติพิจารณาเอกสาร"
    : "เอกสารผ่านขั้นตอนการพิจารณาแล้ว";

  return (
    <>
    <DocumentPreviewShell
      ariaLabel={`ตัวอย่างใบสั่งซื้อ ${detail.poNumber}`}
      documentNumber={detail.poNumber}
      extraActions={(canApprove || canReject) && onDecision && detail.status === "pending_approval" ? (
        <>
          <span className="text-[12px] font-semibold text-secondary">{statusDescription}</span>
          {canReject ? <button className="h-8 border border-primary px-4 text-[12px] font-bold text-primary" onClick={() => openDecision("rejected")} type="button">ปฏิเสธ</button> : null}
          {canApprove ? <button className="h-8 bg-emerald-700 px-4 text-[12px] font-bold text-white" onClick={() => openDecision("approved")} type="button">อนุมัติ</button> : null}
        </>
      ) : undefined}
      isBusy={isDeciding}
      onClose={onClose}
      onExportPdf={handleExportPdf}
      onPrint={handlePrint}
      paperHeightMm={297}
      paperLabel="A4 (แนวตั้ง)"
      paperWidthMm={210}
      statusDate={formatDisplayDate(detail.approvedAt ?? detail.documentDate)}
      statusDescription={statusDescription}
      statusLabel={statusLabel}
      title="ตัวอย่างก่อนพิมพ์ใบสั่งซื้อ"
      totalPages={pages.length}
    >
        <div className="po-print-root" ref={printRootRef}>
          {pages.map((items, pageIndex) => {
            const isLastPage = pageIndex === pages.length - 1;
            const rows = Array.from(
              { length: PURCHASE_ORDER_PRINT_ROWS_PER_PAGE },
              (_, rowIndex) => items[rowIndex],
            );

            return (
              <article className="po-print-page" key={pageIndex}>
                <CompanyDocumentHeader
                  context={documentContext}
                  documentTitleEn="PURCHASE ORDER"
                  documentTitleTh="ใบสั่งซื้อ (PO)"
                  meta={[
                    { label: "เลขที่ PO", value: detail.poNumber },
                    {
                      label: "วันที่",
                      value: formatDisplayDate(detail.documentDate),
                    },
                  ]}
                  priority={pageIndex === 0}
                />

                <section className="po-parties">
                  <div className="po-party-box">
                    <h2>ข้อมูลผู้ขาย (SUPPLIER)</h2>
                    <strong>{detail.vendor.name}</strong>
                    {hasPrintableValue(detail.vendor.address) ? (
                      <p>{detail.vendor.address}</p>
                    ) : null}
                    <dl>
                      <PrintInfoRow
                        label="เลขผู้เสียภาษี"
                        value={detail.vendor.taxId}
                      />
                      <PrintInfoRow
                        label="สาขา"
                        value={detail.vendor.branch}
                      />
                      <PrintInfoRow
                        label="ผู้ติดต่อ"
                        value={detail.vendor.contactName}
                      />
                      <PrintInfoRow
                        label="โทรศัพท์"
                        value={detail.vendor.phone}
                      />
                      <PrintInfoRow
                        label="อีเมล"
                        value={detail.vendor.email}
                      />
                    </dl>
                  </div>

                  <div className="po-party-box po-order-info">
                    <dl>
                      <PrintInfoRow
                        label="อ้างอิง PR"
                        value={detail.prReferences.join(", ")}
                      />
                      <PrintInfoRow
                        label="เงื่อนไขชำระ"
                        value={detail.creditTermName}
                      />
                      <PrintInfoRow
                        label="วิธีชำระเงิน"
                        value={detail.paymentMethodName}
                      />
                      <PrintInfoRow
                        label="วันที่ส่งมอบ"
                        value={formatDisplayDate(detail.deliveryDate)}
                      />
                    </dl>
                    <h2>สถานที่จัดส่ง (SHIP TO)</h2>
                    {hasPrintableValue(detail.deliveryAddress) ? (
                      <p>{detail.deliveryAddress}</p>
                    ) : null}
                  </div>
                </section>

                <div className="po-table-wrap">
                  <table className="po-document-table">
                    <colgroup>
                      <col className="po-col-index" />
                      <col className="po-col-code" />
                      <col className="po-col-description" />
                      <col className="po-col-quantity" />
                      <col className="po-col-unit" />
                      <col className="po-col-delivery" />
                      <col className="po-col-price" />
                      <col className="po-col-discount" />
                      <col className="po-col-total" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>ลำดับ</th>
                        <th>รหัส</th>
                        <th>รายการสินค้า / รายละเอียด</th>
                        <th>จำนวน</th>
                        <th>หน่วย</th>
                        <th>กำหนดส่ง</th>
                        <th>ราคาต่อหน่วย</th>
                        <th>ส่วนลด</th>
                        <th>จำนวนเงิน</th>
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

                <section className="po-bottom">
                  {isLastPage ? (
                    <>
                      <div className="po-notes">
                        <div>
                          <h2>หมายเหตุถึงผู้ขาย</h2>
                          <p>{detail.supplierNote || "-"}</p>
                        </div>
                        <div>
                          <h2>เงื่อนไขเพิ่มเติม</h2>
                          <p>{detail.termsAndConditions || "-"}</p>
                        </div>
                      </div>
                      <dl className="po-summary">
                        <div>
                          <dt>รวมมูลค่าสินค้า (ก่อน VAT)</dt>
                          <dd>{formatPurchaseOrderAmount(detail.subtotal)}</dd>
                        </div>
                        <div>
                          <dt>ส่วนลดการค้า</dt>
                          <dd>
                            {formatPurchaseOrderAmount(detail.discountAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt>รวมมูลค่าสินค้า (หลังส่วนลด)</dt>
                          <dd>
                            {formatPurchaseOrderAmount(
                              detail.subtotal - detail.discountAmount,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>ภาษีมูลค่าเพิ่ม</dt>
                          <dd>{formatPurchaseOrderAmount(detail.taxAmount)}</dd>
                        </div>
                        <div className="po-grand-total">
                          <dt>รวมทั้งสิ้น (รวม VAT)</dt>
                          <dd>{formatPurchaseOrderAmount(detail.grandTotal)}</dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <div className="po-continued">มีรายการต่อหน้าถัดไป</div>
                  )}
                </section>

                <div className="po-amount-words">
                  {isLastPage
                    ? `จำนวนเงิน (${formatThaiBahtText(detail.grandTotal)})`
                    : ""}
                </div>

                <section className="po-approval-signature">
                  {isLastPage ? (
                    <>
                      <h2>ผู้มีอำนาจอนุมัติ</h2>
                      <div className="po-signature-space">
                        {detail.approverSignatureUrl ? (
                          <Image
                            alt="ลายเซ็นผู้อนุมัติ"
                            height={80}
                            src={detail.approverSignatureUrl}
                            unoptimized
                            width={240}
                          />
                        ) : null}
                      </div>
                      <div aria-hidden="true" className="po-signature-line" />
                      <strong>
                        {detail.approverName
                          ? `(${detail.approverName})`
                          : "(................................................)"}
                      </strong>
                      <span>
                        วันที่อนุมัติ{" "}
                        {detail.approvedAt
                          ? formatDisplayDate(detail.approvedAt)
                          : "____/____/________"}
                      </span>
                    </>
                  ) : null}
                </section>

                <CompanyDocumentFooter
                  context={documentContext}
                  currentPage={pageIndex + 1}
                  printedAt={formatPrintedAt(printedAt)}
                  printedBy={detail.buyerName}
                  placement="page"
                  totalPages={pages.length}
                  variant="standard"
                />
              </article>
            );
          })}
        </div>
    </DocumentPreviewShell>

      {decision ? (
        <div
          aria-label={
            decision === "approved"
              ? "ยืนยันการอนุมัติใบสั่งซื้อ"
              : "ยืนยันการปฏิเสธใบสั่งซื้อ"
          }
          aria-modal="true"
          className="fixed inset-0 z-[160] grid place-items-center bg-black/45 p-4"
          role="dialog"
        >
          <section className="w-full max-w-[470px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-2xl">
            <header className="flex min-h-14 items-center justify-between border-b border-outline-variant px-5 py-2">
              <div>
                <h2 className="text-[17px] font-bold">
                  {decision === "approved"
                    ? "ยืนยันการอนุมัติ PO"
                    : "ยืนยันการปฏิเสธ PO"}
                </h2>
                <p className="text-[12px] font-medium text-secondary">
                  {detail.poNumber}
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
                  ? "ตรวจสอบผู้ขาย รายการ ราคา และเงื่อนไขเรียบร้อยแล้ว ต้องการอนุมัติใบสั่งซื้อนี้ใช่หรือไม่"
                  : "ระบุเหตุผลเพื่อแจ้งกลับไปยังผู้สร้างใบสั่งซื้อ"}
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
                      : "ระบุเหตุผลที่ปฏิเสธใบสั่งซื้อ"
                  }
                  value={decisionNote}
                />
                <span className="mt-1 block text-right text-[11px] text-secondary">
                  {decisionNote.length} / 500
                </span>
              </label>
              {decision === "approved" && mfaRequired ? (
                <label className="block border-l-4 border-primary bg-surface-container-low px-3 py-3">
                  <span className="block text-[13px] font-bold">ยืนยันด้วย Authenticator</span>
                  <span className="mt-0.5 block text-[11px] text-secondary">กรอกรหัสล่าสุด 6 หลักเพื่อยืนยันตัวตนก่อนลงลายเซ็นอนุมัติ</span>
                  <input
                    autoComplete="one-time-code"
                    className="mt-2 h-11 w-full border border-outline-variant bg-surface-container-lowest px-3 text-center font-mono text-[20px] font-bold tracking-[0.35em] outline-none focus:border-primary"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => { setTotpCode(normalizeTotpCode(event.target.value)); setDecisionError(null); }}
                    pattern="[0-9]*"
                    placeholder="000000"
                    value={totpCode}
                  />
                </label>
              ) : null}
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
        .po-preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 150;
          display: flex;
          flex-direction: column;
          background: rgba(20, 20, 20, 0.78);
          backdrop-filter: blur(5px);
        }

        .po-preview-toolbar {
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

        .po-preview-toolbar > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .po-preview-toolbar strong {
          font-size: 15px;
          font-weight: 700;
        }

        .po-preview-toolbar span {
          color: #696969;
          font-size: 11px;
          font-weight: 500;
        }

        .po-preview-actions {
          display: flex;
          gap: 8px;
        }

        .po-preview-actions button {
          display: inline-flex;
          height: 36px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #e4b8b8;
          border-radius: 3px;
          background: #fff;
          padding: 0 15px;
          color: #171717;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .po-preview-actions .po-preview-print-button {
          border-color: #bd0d1a;
          background: #bd0d1a;
          color: #fff;
        }

        .po-preview-actions .po-preview-export-button {
          border-color: #bd0d1a;
          background: #ffffff;
          color: #bd0d1a;
        }

        .po-preview-actions .po-preview-export-button:hover {
          background: #fdf2f2;
        }

        .po-preview-actions .po-preview-reject-button {
          border-color: #bd0d1a;
          color: #bd0d1a;
        }

        .po-preview-actions .po-preview-approve-button {
          border-color: #bd0d1a;
          background: #bd0d1a;
          color: #ffffff;
        }

        .po-preview-action-divider {
          width: 1px;
          height: 30px;
          margin: 0 8px;
          background: #dddddd;
        }

        .po-approval-context {
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

        .po-approval-status {
          border: 1px solid rgba(255, 255, 255, 0.58);
          border-radius: 3px;
          background: #ffffff;
          padding: 3px 7px;
          color: #bd0d1a;
          font-size: 11px;
          line-height: 1;
        }

        .po-approval-status-approved {
          color: #047857;
        }

        .po-approval-status-rejected,
        .po-approval-status-cancelled {
          color: #bd0d1a;
        }

        .po-preview-scroll {
          flex: 1;
          overflow: auto;
          padding: 18px;
        }

        .po-print-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
        }

        .po-print-page {
          box-sizing: border-box;
          position: relative;
          display: grid;
          --document-footer-bottom: 3mm;
          --document-page-padding-inline: 6mm;
          width: 210mm;
          height: 297mm;
          grid-template-rows: 30mm 40mm 128mm 46mm 7mm 30mm 6mm;
          overflow: hidden;
          background: #fff;
          padding: 5mm 6mm;
          color: #111;
          font-family: var(--font-inter), "Sarabun", "Noto Sans Thai", sans-serif;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
        }

        .po-parties {
          display: grid;
          grid-template-columns: 0.96fr 1.04fr;
          gap: 2mm;
          padding-top: 2mm;
        }

        .po-party-box {
          min-width: 0;
          overflow: hidden;
          border: 0.25mm solid #888;
          border-radius: 1mm;
          padding: 2mm 2.5mm;
          font-size: 9.0pt;
          font-weight: 500;
          line-height: 1.25;
        }

        .po-party-box h2 {
          margin: 0 0 0.6mm;
          font-size: 9.5pt;
          font-weight: 700;
        }

        .po-party-box strong {
          display: block;
          overflow: hidden;
          font-size: 9.5pt;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .po-party-box p {
          display: -webkit-box;
          min-height: 6mm;
          margin: 0.5mm 0;
          overflow: hidden;
          white-space: normal;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .po-party-box dl {
          display: grid;
          gap: 0.25mm;
          margin: 0;
        }

        .po-party-box dl > div {
          display: grid;
          grid-template-columns: 21mm 1fr;
          gap: 1mm;
          min-width: 0;
        }

        .po-party-box dt,
        .po-party-box dd {
          overflow: hidden;
          margin: 0;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .po-party-box dt {
          font-weight: 700;
        }

        .po-party-box dd {
          font-weight: 600;
        }

        .po-order-info dl {
          margin-bottom: 1.2mm;
        }

        .po-table-wrap {
          min-height: 0;
          padding-top: 2mm;
        }

        .po-document-table {
          width: 100%;
          height: 124mm;
          border-collapse: collapse;
          table-layout: fixed;
          border-top: 0.75mm solid #d31220;
        }

        .po-document-table th {
          height: 7.5mm;
          border: 0.2mm solid #8f8f8f;
          background: transparent;
          padding: 0 0.7mm;
          color: #000;
          font-size: 8.5pt;
          font-weight: 700;
          line-height: 1.1;
          text-align: center;
        }

        .po-document-table tbody tr {
          height: 7.9mm;
        }

        .po-cell {
          overflow: hidden;
          border: 0.2mm solid #9a9a9a;
          padding: 0.45mm 0.8mm;
          color: #000;
          font-size: 8.2pt;
          font-weight: 500;
          line-height: 1.16;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .po-cell-center {
          text-align: center;
        }

        .po-cell-code {
          font-weight: 700;
        }

        .po-cell-description {
          white-space: normal;
        }

        .po-description-text {
          display: -webkit-box;
          overflow: hidden;
          line-height: 1.16;
          overflow-wrap: anywhere;
          white-space: normal;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .po-cell-number {
          padding-right: 1.2mm;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .po-col-index {
          width: 5%;
        }

        .po-col-code {
          width: 9%;
        }

        .po-col-description {
          width: 27%;
        }

        .po-col-quantity {
          width: 8%;
        }

        .po-col-unit {
          width: 7%;
        }

        .po-col-delivery {
          width: 12%;
        }

        .po-col-price {
          width: 10%;
        }

        .po-col-discount {
          width: 9%;
        }

        .po-col-total {
          width: 13%;
        }

        .po-bottom {
          display: grid;
          grid-template-columns: 1fr 0.82fr;
          min-height: 0;
          border: 0.25mm solid #888;
          border-top: 0;
        }

        .po-notes {
          display: grid;
          grid-template-rows: 1fr 1.2fr;
          border-right: 0.25mm solid #888;
        }

        .po-notes > div {
          overflow: hidden;
          border-bottom: 0.25mm solid #aaa;
          padding: 1.2mm 2mm;
        }

        .po-notes > div:last-child {
          border-bottom: 0;
        }

        .po-notes h2 {
          margin: 0 0 0.5mm;
          font-size: 8pt;
          font-weight: 700;
        }

        .po-notes p {
          display: -webkit-box;
          margin: 0;
          overflow: hidden;
          color: #000;
          font-size: 7.5pt;
          font-weight: 500;
          line-height: 1.22;
          white-space: pre-line;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 4;
        }

        .po-summary {
          display: grid;
          margin: 0;
        }

        .po-summary > div {
          display: grid;
          grid-template-columns: 1fr 30mm;
          align-items: center;
          border-bottom: 0.2mm solid #aaa;
          padding: 0 2mm;
          color: #000;
          font-size: 8pt;
          font-weight: 700;
        }

        .po-summary > div:last-child {
          border-bottom: 0;
        }

        .po-summary dt,
        .po-summary dd {
          margin: 0;
        }

        .po-summary dd {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .po-summary .po-grand-total {
          background: #c8101e;
          color: #fff;
          font-size: 10pt;
          font-weight: 700;
        }

        .po-continued {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 3mm;
          font-size: 7pt;
          font-weight: 700;
        }

        .po-amount-words {
          display: flex;
          align-items: center;
          border: 0.25mm solid #888;
          border-top: 0;
          padding: 0 2mm;
          color: #000;
          font-size: 7.7pt;
          font-weight: 700;
        }

        .po-approval-signature {
          display: grid;
          width: 88mm;
          min-width: 0;
          justify-self: end;
          grid-template-rows: auto 1fr auto auto auto;
          align-items: end;
          border-right: 0.25mm solid #888;
          border-bottom: 0.25mm solid #888;
          border-left: 0.25mm solid #888;
          padding: 1.5mm 5mm 2mm;
          color: #000;
          text-align: center;
        }

        .po-approval-signature h2 {
          margin: 0;
          font-size: 9.0pt;
          font-weight: 700;
        }

        .po-signature-space {
          min-height: 11mm;
          display: grid;
          place-items: end center;
        }

        .po-signature-space img {
          width: auto;
          height: auto;
          max-width: 42mm;
          max-height: 11mm;
          object-fit: contain;
        }

        .po-signature-line {
          min-height: 4mm;
          border-bottom: 0.25mm dotted #555;
          font-size: 8pt;
          font-weight: 600;
        }

        .po-approval-signature strong,
        .po-approval-signature span {
          display: block;
          font-size: 8.8pt;
          font-weight: 600;
          line-height: 1.25;
        }

        .po-document-footer {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: end;
          border-top: 0.75mm solid #d31220;
          color: #000;
          font-size: 7.2pt;
          font-weight: 600;
        }

        .po-document-footer span:nth-child(2) {
          padding: 0 3mm;
          text-align: center;
        }

        .po-document-footer span:last-child {
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
            max-width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }

          body.printing-purchase-order
            *:not(.po-print-root):not(.po-print-root *):not(
              :has(.po-print-root)
            ) {
            display: none !important;
          }

          body.printing-purchase-order *:has(.po-print-root) {
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

          body.printing-purchase-order .po-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            zoom: 1 !important;
          }

          body.printing-purchase-order .po-print-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          body.printing-purchase-order .po-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }

        @media (max-width: 760px) {
          .po-preview-toolbar {
            align-items: flex-start;
            padding: 9px 10px;
          }

          .po-preview-toolbar > div:first-child span {
            display: none;
          }

          .po-preview-actions button:not(.pdf-export-button) {
            width: 38px;
            padding: 0;
            font-size: 0;
          }

          .po-preview-action-divider {
            display: none;
          }

          .po-preview-scroll {
            padding: 10px;
          }

        }
      `}</style>
    </>
  );
}
