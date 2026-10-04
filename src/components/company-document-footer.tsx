import type { ReactNode } from "react";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import styles from "./company-document-footer.module.css";

export type CompanyDocumentFooterProps = {
  context?: CompanyDocumentContext;
  currentPage?: number;
  totalPages?: number;
  printedAt?: string;
  printedBy?: string;
  documentNumber?: string;
  customNote?: string;
  leftText?: ReactNode;
  centerText?: ReactNode;
  rightText?: ReactNode;
  showSystemStamp?: boolean;
  showPageNumber?: boolean;
  placement?: "flow" | "page" | "report";
  variant?: "standard" | "report" | "accent";
  className?: string;
};

export function CompanyDocumentFooter({
  currentPage,
  totalPages,
  printedAt,
  printedBy,
  customNote,
  leftText,
  centerText,
  rightText,
  showSystemStamp = true,
  showPageNumber = true,
  placement = "flow",
  variant = "standard",
  className = "",
}: CompanyDocumentFooterProps) {
  const defaultPrintedAt =
    printedAt ||
    new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date());

  const variantClass =
    variant === "report"
      ? styles.variantReport
      : variant === "accent"
        ? styles.variantAccent
        : styles.variantStandard;
  const placementClass = placement === "page"
    ? styles.placementPage
    : placement === "report"
      ? styles.placementReport
      : "";

  return (
    <footer
      className={`${styles.footer} ${variantClass} ${placementClass} ${className}`}
      data-keep-together="true"
    >
      <div className={styles.left}>
        {leftText !== undefined ? (
          leftText
        ) : (
          <>
            {showSystemStamp ? (
              <span className={styles.systemStamp}>
                เอกสารสร้างโดยระบบอัตโนมัติ (KRC ERP)
              </span>
            ) : null}
            <span className={styles.printMeta}>
              พิมพ์เมื่อ: {defaultPrintedAt}
              {printedBy ? ` • ผู้พิมพ์: ${printedBy}` : ""}
            </span>
          </>
        )}
      </div>

      <div className={styles.center}>
        {centerText !== undefined ? (
          centerText
        ) : customNote ? (
          <span>{customNote}</span>
        ) : null}
      </div>

      <div className={styles.right}>
        {rightText !== undefined ? (
          rightText
        ) : showPageNumber && currentPage !== undefined && totalPages !== undefined ? (
          <span className={styles.pageNumber}>
            หน้า {currentPage} / {totalPages}
          </span>
        ) : showPageNumber ? (
          <span className={styles.pageNumber}>หน้า 1 / 1</span>
        ) : null}
      </div>
    </footer>
  );
}
