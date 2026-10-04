/**
 * Core Document Print Foundation
 * Based on modern print architecture guidelines (ISO 32000-2, Physical Units, Vector-first).
 * Reference: docs/deep-research-report.md
 */

import { REPORT_CATALOG } from "./report-catalog.ts";

export type DocumentPaperSize = "A4" | "A5" | "letter";
export type DocumentOrientation = "portrait" | "landscape";

export interface DocumentPrintOptions {
  title: string;
  paperSize?: DocumentPaperSize;
  orientation?: DocumentOrientation;
  bodyClass?: string;
  styles?: string[];
  extraHeadHtml?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
}

/**
 * Standard physical dimensions in millimeters and PDF points (72 pt/in)
 */
export const DOCUMENT_DIMENSIONS = {
  A4: {
    portrait: { widthMm: 210, heightMm: 297, widthPt: 595.276, heightPt: 841.89 },
    landscape: { widthMm: 297, heightMm: 210, widthPt: 841.89, heightPt: 595.276 },
  },
  A5: {
    portrait: { widthMm: 148, heightMm: 210, widthPt: 419.528, heightPt: 595.276 },
    landscape: { widthMm: 210, heightMm: 148, widthPt: 595.276, heightPt: 419.528 },
  },
  letter: {
    portrait: { widthMm: 215.9, heightMm: 279.4, widthPt: 612, heightPt: 792 },
    landscape: { widthMm: 279.4, heightMm: 215.9, widthPt: 792, heightPt: 612 },
  },
} as const;

/**
 * Resolves standard paper configuration (paperSize and orientation) for reports.
 * Checks the central report catalog to automatically set "landscape" for wide reports
 * (such as Stock Movement or Purchase Analysis) to prevent column overflow.
 */
export function resolveReportPaperConfig(reportId: string): {
  paperSize: DocumentPaperSize;
  orientation: DocumentOrientation;
} {
  const item = REPORT_CATALOG.find((r) => r.id === reportId);
  return {
    paperSize: "A4",
    orientation: item?.orientation ?? "portrait",
  };
}

/**
 * Common Font Face declarations ensuring local Noto Sans Thai and Inter are embedded
 */
export function buildStandardFontFaceCss(): string {
  return `
    @font-face {
      font-family: "Sarabun";
      src: url("/fonts/Sarabun-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Sarabun";
      src: url("/fonts/Sarabun-Medium.ttf") format("truetype");
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Sarabun";
      src: url("/fonts/Sarabun-SemiBold.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Sarabun";
      src: url("/fonts/Sarabun-Bold.ttf") format("truetype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Noto Sans Thai";
      src: url("/fonts/NotoSansThai-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Noto Sans Thai";
      src: url("/fonts/NotoSansThai-Bold.ttf") format("truetype");
      font-weight: 600 900;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-Light.ttf") format("truetype");
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-Medium.ttf") format("truetype");
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-SemiBold.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-Bold.ttf") format("truetype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `;
}

/**
 * Builds base print stylesheet enforcing exact physical units, 100% scale,
 * and zero-margin page boundary.
 */
export function buildDocumentPrintCss(
  paperSize: DocumentPaperSize = "A4",
  orientation: DocumentOrientation = "portrait",
): string {
  const pageSizeRule = `${paperSize.toUpperCase()} ${orientation}`;
  return `
    ${buildStandardFontFaceCss()}

    @page {
      size: ${pageSizeRule};
      margin: 0;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    :root {
      --font-inter: "Inter", "Sarabun", "Noto Sans Thai", sans-serif;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: var(--font-inter), "Inter", "Sarabun", "Noto Sans Thai", system-ui, -apple-system, sans-serif;
      overflow: visible !important;
      height: auto !important;
      width: auto !important;
      font-synthesis: none !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    /* Printlogic: Table pagination and fragmentation protection */
    table {
      border-collapse: collapse !important;
    }

    thead {
      display: table-header-group !important;
    }

    tfoot {
      display: table-footer-group !important;
    }

    tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    /* Printlogic: Keep signature blocks and designated sections intact */
    .keep-together,
    .signature-block,
    .approval-signature,
    .print-avoid-break,
    [data-keep-together="true"] {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .break-before-page,
    .new-page {
      break-before: page !important;
      page-break-before: always !important;
    }

    .break-after-page {
      break-after: page !important;
      page-break-after: always !important;
    }

    /* Printlogic / Paginationlogic: Tabular figures for financial numbers */
    .numeric,
    [data-numeric="true"],
    .po-cell-number,
    .pr-cell-number,
    .gr-cell-number,
    .po-summary dd,
    .pr-summary dd,
    .gr-summary dd {
      font-variant-numeric: tabular-nums !important;
      font-feature-settings: "tnum" 1 !important;
      text-align: right !important;
    }

    /* Audit & Document Stamp */
    .document-stamp {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 0.6mm 2mm;
      border: 0.25mm solid currentColor;
      border-radius: 0.5mm;
      display: inline-block;
      line-height: 1;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-synthesis: none !important;
      }
    }
  `;
}

/**
 * Isolated Print Runner
 * Prints an HTML string through a clean, detached iframe without mutating document.body classes.
 * Ensures font loading, zero leaking to the dashboard, and proper teardown.
 */
export async function printHtmlDocument(
  bodyHtml: string,
  options: DocumentPrintOptions,
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const {
    title,
    paperSize = "A4",
    orientation = "portrait",
    styles = [],
    extraHeadHtml = "",
    onBeforePrint,
    onAfterPrint,
  } = options;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.title = title;
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";

    let hasPrinted = false;

    const cleanup = () => {
      onAfterPrint?.();
      window.setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {
          // Ignore removal errors
        }
        resolve();
      }, 500);
    };

    iframe.onload = async () => {
      if (hasPrinted) return;

      const frameWindow = iframe.contentWindow;
      const frameDocument = iframe.contentDocument;
      if (!frameWindow || !frameDocument) {
        cleanup();
        return;
      }

      hasPrinted = true;

      try {
        if (frameDocument.fonts) {
          await Promise.all(
            [400, 500, 600, 700].map((weight) =>
              frameDocument.fonts.load(
                `${weight} 10pt "Sarabun"`,
                "รายงานสรุปยอดซื้อ KRC 0123456789",
              ),
            ),
          );
          await frameDocument.fonts.ready;
        }

        const images = Array.from(frameDocument.querySelectorAll("img"));
        if (images.length > 0) {
          await Promise.all(
            images.map(
              (img) =>
                new Promise<void>((imgResolve) => {
                  if (img.complete) return imgResolve();
                  img.onload = () => imgResolve();
                  img.onerror = () => imgResolve();
                  window.setTimeout(imgResolve, 1500);
                }),
            ),
          );
        }
      } catch {
        // Fallback gracefully if fonts.ready or images error
      }

      onBeforePrint?.();

      const handleAfterPrint = () => {
        frameWindow.removeEventListener("afterprint", handleAfterPrint);
        cleanup();
      };

      frameWindow.addEventListener("afterprint", handleAfterPrint);
      frameWindow.focus();

      window.setTimeout(() => {
        try {
          frameWindow.print();
        } catch {
          cleanup();
        }
      }, 250);
    };

    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument;
    if (!frameDoc) {
      cleanup();
      return;
    }

    const fullHtml = buildFullHtmlDocument(bodyHtml, {
      ...options,
      paperSize,
      orientation,
      styles,
      extraHeadHtml,
      title,
    });

    frameDoc.open();
    frameDoc.write(fullHtml);
    frameDoc.close();
  });
}

/**
 * Builds a complete standalone HTML document string with bundled fonts and print CSS.
 */
export function buildFullHtmlDocument(
  bodyHtml: string,
  options: DocumentPrintOptions,
): string {
  const {
    title,
    paperSize = "A4",
    orientation = "portrait",
    styles = [],
    extraHeadHtml = "",
  } = options;

  const compiledCss = [
    buildDocumentPrintCss(paperSize, orientation),
    ...styles,
  ].join("\n");

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${extraHeadHtml}
    <style>
      ${compiledCss}
    </style>
  </head>
  <body class="${options.bodyClass || ""}">
    ${bodyHtml}
  </body>
</html>`;
}

/**
 * Prints an HTML element cleanly via an isolated iframe.
 * Preserves all document stylesheets, applies paper size rules, and resets zoom.
 */
export async function printElement(
  element: HTMLElement,
  options: DocumentPrintOptions,
): Promise<void> {
  if (typeof document === "undefined") return;

  const extractedStyles = extractAllDocumentStyles();

  const elementClone = element.cloneNode(true) as HTMLElement;
  // Reset preview zoom so it prints at 100% actual size
  elementClone.style.zoom = "1";
  elementClone.style.transform = "none";

  await printHtmlDocument(elementClone.outerHTML, {
    ...options,
    styles: [
      extractedStyles,
      `
        @page {
          size: ${(options.paperSize || "A4").toUpperCase()} ${options.orientation || "portrait"};
          margin: 0;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          width: auto !important;
          height: auto !important;
        }
        .po-print-root, .pr-print-root, .gr-print-root {
          position: static !important;
          display: block !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          gap: 0 !important;
          zoom: 1 !important;
          transform: none !important;
        }
        .po-print-page, .pr-print-page, .gr-print-page {
          margin: 0 !important;
          box-shadow: none !important;
          break-after: page !important;
          page-break-after: always !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .po-print-page:last-child, .pr-print-page:last-child, .gr-print-page:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }
        /* Printlogic: ensure signatures, notes and tables do not break in middle */
        .po-approval-signature, .pr-approval-signature, .gr-approval-signature,
        .po-notes, .po-summary, .po-amount-words, .keep-together, [data-keep-together="true"] {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        thead {
          display: table-header-group !important;
        }
        tfoot {
          display: table-footer-group !important;
        }
        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      `,
      ...(options.styles || []),
    ],
  });
}

export interface BatchPrintDocument {
  title: string;
  html: string;
  bodyClass?: string;
  paperSize?: DocumentPaperSize;
  orientation?: DocumentOrientation;
}

/**
 * Combines multiple document HTML payloads into a single spoolable multi-page document.
 * Follows the 2026 ERP standard from docs/Printlogic.md for unified batch printing.
 */
export function buildBatchDocumentHtml(
  documents: readonly BatchPrintDocument[],
): string {
  return documents
    .map((doc, index) => {
      const isLast = index === documents.length - 1;
      const breakStyle = isLast
        ? "break-after: auto !important; page-break-after: auto !important;"
        : "break-after: page !important; page-break-after: always !important;";
      return `
        <div class="batch-document-item ${doc.bodyClass || ""}" style="${breakStyle} margin: 0; padding: 0;">
          ${doc.html}
        </div>
      `;
    })
    .join("\n");
}

/**
 * Prints a batch of documents in a single print job.
 * Avoids spawning multiple print dialogs and ensures unified font embedding.
 */
export async function printBatchDocuments(
  documents: readonly BatchPrintDocument[],
  options?: Omit<DocumentPrintOptions, "title"> & { title?: string },
): Promise<void> {
  if (documents.length === 0) return;

  const title = options?.title || `batch-print-${documents.length}-docs`;
  const paperSize = options?.paperSize || documents[0].paperSize || "A4";
  const orientation = options?.orientation || documents[0].orientation || "portrait";
  const combinedHtml = buildBatchDocumentHtml(documents);

  await printHtmlDocument(combinedHtml, {
    ...options,
    title,
    paperSize,
    orientation,
    styles: [
      `
        .batch-document-item {
          display: block;
        }
      `,
      ...(options?.styles || []),
    ],
  });
}

export interface ExportPdfOptions extends Omit<DocumentPrintOptions, "title"> {
  filename: string;
}

/**
 * Exports an HTML element as a vector PDF.
 * Sets the document title to [filename].pdf ensuring the browser's PDF engine
 * pre-fills the exact filename without any canvas/bitmap screenshot degradation.
/**
 * Extracts all active CSS rules from the document's stylesheets as raw CSS strings.
 * Guarantees that CSS Modules, Tailwind classes, and styled-jsx rules are 100% inlined
 * and never lost when exported to standalone HTML or headless Chrome.
 */
export function extractAllDocumentStyles(): string {
  if (typeof document === "undefined") return "";

  const collected: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.cssRules && sheet.cssRules.length > 0) {
        const rules = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
        collected.push(rules);
      }
    } catch {
      if (sheet.ownerNode && sheet.ownerNode instanceof HTMLElement) {
        collected.push(sheet.ownerNode.outerHTML);
      }
    }
  }

  const styleElements = Array.from(document.querySelectorAll("style"));
  for (const el of styleElements) {
    if (el.textContent && !collected.includes(el.textContent)) {
      collected.push(el.textContent);
    }
  }

  return collected.join("\n");
}

/**
 * Exports an HTML element as a vector PDF.
 * Sets the document title to [filename].pdf ensuring the browser's PDF engine
 * pre-fills the exact filename without any canvas/bitmap screenshot degradation.
 * Reference: docs/Printlogic.md (Lines 9-17, 102-110)
 */
export async function exportElementPdf(
  element: HTMLElement,
  options: ExportPdfOptions,
): Promise<void> {
  const sanitizedFilename = options.filename.endsWith(".pdf")
    ? options.filename
    : `${options.filename}.pdf`;

  if (typeof document !== "undefined") {
    const extractedStyles = extractAllDocumentStyles();

    const elementClone = element.cloneNode(true) as HTMLElement;
    elementClone.style.zoom = "1";
    elementClone.style.transform = "none";

    const originalImages = Array.from(element.querySelectorAll("img"));
    const clonedImages = Array.from(elementClone.querySelectorAll("img"));

    originalImages.forEach((origImg, index) => {
      const clonedImg = clonedImages[index];
      if (!clonedImg) return;

      clonedImg.removeAttribute("srcset");
      clonedImg.removeAttribute("sizes");

      try {
        if (origImg.complete && origImg.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = origImg.naturalWidth;
          canvas.height = origImg.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(origImg, 0, 0);
            clonedImg.src = canvas.toDataURL("image/png");
          }
        } else if (origImg.currentSrc) {
          clonedImg.src = origImg.currentSrc;
        }
      } catch {
        if (origImg.currentSrc) {
          clonedImg.src = origImg.currentSrc;
        }
      }
    });

    const fullHtml = buildFullHtmlDocument(elementClone.outerHTML, {
      ...options,
      title: sanitizedFilename,
      styles: [
        extractedStyles,
        `
          @page {
            size: ${(options.paperSize || "A4").toUpperCase()} ${options.orientation || "portrait"};
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: auto !important;
            height: auto !important;
          }
          .po-print-root, .pr-print-root, .gr-print-root, .issue-request-print-root {
            position: static !important;
            display: block !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
            zoom: 1 !important;
            transform: none !important;
          }
          .po-print-page, .pr-print-page, .gr-print-page, .issue-request-page {
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page !important;
            page-break-after: always !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .po-print-page:last-child, .pr-print-page:last-child, .gr-print-page:last-child, .issue-request-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .po-approval-signature, .pr-approval-signature, .gr-approval-signature,
          .po-notes, .po-summary, .po-amount-words, .keep-together, [data-keep-together="true"] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        `,
        ...(options.styles || []),
      ],
    });

    try {
      const response = await fetch("/api/documents/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: fullHtml,
          filename: sanitizedFilename,
          paperSize: options.paperSize || "A4",
          orientation: options.orientation || "portrait",
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = sanitizedFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (err) {
      console.warn("Direct PDF generation failed, falling back to browser print:", err);
    }
  }

  await printElement(element, {
    ...options,
    title: sanitizedFilename,
  });
}

/**
 * Exports an HTML document string as a vector PDF.
 */
export async function exportHtmlPdf(
  bodyHtml: string,
  options: ExportPdfOptions,
): Promise<void> {
  const sanitizedFilename = options.filename.endsWith(".pdf")
    ? options.filename
    : `${options.filename}.pdf`;

  if (typeof window !== "undefined") {
    const fullHtml = buildFullHtmlDocument(bodyHtml, {
      ...options,
      title: sanitizedFilename,
    });

    try {
      const response = await fetch("/api/documents/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: fullHtml,
          filename: sanitizedFilename,
          paperSize: options.paperSize || "A4",
          orientation: options.orientation || "portrait",
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = sanitizedFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (err) {
      console.warn("Direct PDF generation failed, falling back to browser print:", err);
    }
  }

  await printHtmlDocument(bodyHtml, {
    ...options,
    title: sanitizedFilename,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
