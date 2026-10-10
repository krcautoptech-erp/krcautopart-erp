import type { CSSProperties } from "react";
import { CompanyLogo } from "@/components/company-logo";
import {
  getDocumentBranding,
  normalizeCompanyHeaderFieldOrder,
  type CompanyDocumentContext,
  type CompanyHeaderField,
} from "@/lib/company-settings";
import styles from "./company-document-header.module.css";

export type CompanyDocumentHeaderMeta = {
  label: string;
  value: string;
};

type CompanyDocumentHeaderProps = {
  context: CompanyDocumentContext;
  documentTitleEn?: string;
  documentTitleTh?: string;
  meta?: CompanyDocumentHeaderMeta[];
  priority?: boolean;
};

export function CompanyDocumentHeader({
  context,
  documentTitleEn = "",
  documentTitleTh = "",
  meta = [],
  priority = false,
}: CompanyDocumentHeaderProps) {
  const { branding, company, documentSettings } = context;
  const branchLabel =
    company.branchType === "head_office"
      ? "สำนักงานใหญ่"
      : `สาขา ${company.branchCode}`;
  const hasDocumentSummary = Boolean(
    documentTitleEn || documentTitleTh || meta.length,
  );
  const fieldValues: Record<CompanyHeaderField, string> = {
    address:
      documentSettings.showAddress && company.address ? company.address : "",
    email:
      documentSettings.showEmail && company.email
        ? `อีเมล: ${company.email}`
        : "",
    phone:
      documentSettings.showPhone && company.phone
        ? `โทรศัพท์: ${company.phone}`
        : "",
    taxId:
      documentSettings.showTaxId && company.taxId
        ? `เลขประจำตัวผู้เสียภาษี: ${company.taxId}`
        : "",
    website:
      documentSettings.showWebsite && company.website
        ? `เว็บไซต์: ${company.website}`
        : "",
  };
  const companyLines = normalizeCompanyHeaderFieldOrder(
    documentSettings.headerFieldOrder,
  )
    .map((field) => ({ field, value: fieldValues[field] }))
    .filter((line) => Boolean(line.value));

  return (
    <header
      className={`${styles.header} ${
        documentSettings.headerStyle === "compact"
          ? styles.compact
          : styles.standard
      } ${hasDocumentSummary ? "" : styles.companyOnly}`}
      style={
        {
          "--document-logo-width": `${documentSettings.logoWidthMm}mm`,
        } as CSSProperties
      }
    >
      <div className={styles.brand}>
        <CompanyLogo
          alt={branding.legalNameTh}
          branding={getDocumentBranding(context)}
          className={styles.logo}
          mode="light"
          priority={priority}
          size="document"
        />
      </div>

      <div className={styles.identity}>
        <strong>
          {branding.legalNameTh} ({branchLabel})
        </strong>
        {companyLines.map((line) => (
          <span key={line.field}>{line.value}</span>
        ))}
      </div>

      {hasDocumentSummary ? (
        <div className={styles.summary}>
          <div className={styles.title}>
            <b>{documentTitleEn}</b>
            <span>{documentTitleTh}</span>
          </div>
          <dl className={styles.meta}>
            {meta.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </header>
  );
}
