"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { useApp } from "@/components/app-context";
import type { ProductRecord } from "./product-catalog";

interface ProductDetailModalProps {
  detailProduct: ProductRecord;
  onClose: () => void;
  navigateDetail: (dir: "prev" | "next") => void;
  currentDetailIdx: number;
  totalCount: number;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

type ThemePalette = {
  appBackground: string;
  body: string;
  border: string;
  divider: string;
  footer: string;
  imageBackground: string;
  imageFallback: string;
  modalBackground: string;
  muted: string;
  overlay: string;
  primary: string;
  primaryBorder: string;
};

const STATUS_ACTIVE = "ใช้งาน";
const STATUS_ACTIVE_LABEL = "Active / ใช้งาน";
const STATUS_INACTIVE_LABEL = "Inactive / ระงับ";
const DEFAULT_UNIT = "ชิ้น";

const LIGHT_THEME: ThemePalette = {
  appBackground: "#ffffff",
  body: "#1a1c1c",
  border: "#d1d1d1",
  divider: "rgba(26, 28, 28, 0.10)",
  footer: "rgba(248, 248, 248, 0.3)",
  imageBackground: "#ffffff",
  imageFallback: "#5b403d",
  modalBackground: "#ffffff",
  muted: "#5b403d",
  overlay: "#000000",
  primary: "#af101a",
  primaryBorder: "rgba(175, 16, 26, 0.30)",
};

const DARK_THEME: ThemePalette = {
  appBackground: "#0a0a0a",
  body: "#e2e2e2",
  border: "#333333",
  divider: "rgba(226, 226, 226, 0.10)",
  footer: "#181818",
  imageBackground: "#1e1e1e",
  imageFallback: "#a0a0a0",
  modalBackground: "#121212",
  muted: "#aeb8c2",
  overlay: "#0a0a0a",
  primary: "#ff4d4d",
  primaryBorder: "rgba(255, 77, 77, 0.55)",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `฿ ${value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getStatusLabel(status: string | null | undefined) {
  return status === STATUS_ACTIVE ? STATUS_ACTIVE_LABEL : STATUS_INACTIVE_LABEL;
}

function getCurrentDarkMode(fallback: boolean) {
  if (typeof document === "undefined") {
    return fallback;
  }

  return document.documentElement.classList.contains("dark") || fallback;
}

function buildFontFaceCss() {
  return `
    @font-face {
      font-family: "Inter";
      src: url("/fonts/static/Inter_18pt-Light.ttf") format("truetype");
      font-weight: 300;
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
  `;
}

function getSpecificationFields(product: ProductRecord) {
  return [
    ["Unit / หน่วยนับ", formatValue(product.unit || DEFAULT_UNIT), false],
    ["Part Number / หมายเลขชิ้นส่วน", formatValue(product.part_number), true],
    ["Model / รุ่น", formatValue(product.model), false],
    ["Material Grade / เกรดวัสดุ", formatValue(product.material), false],
    ["Standard / มาตรฐาน", formatValue(product.std_no), false],
    ["Plating / ชุบ", formatValue(product.plating), false],
    ["Sheets per unit / จำนวนแผ่น", formatValue(product.sheet_count), false],
    ["Workpieces per sheet / ชิ้นงานต่อแผ่น", formatValue(product.parts_per_sheet), false],
    ["Cost / ต้นทุน", formatCurrency(product.cost_price), false],
    ["Median Price / ราคากลาง", formatCurrency(product.selling_price), false],
  ] as const;
}

function buildSpecificationHtml(product: ProductRecord, isDarkMode: boolean) {
  const palette = isDarkMode ? DARK_THEME : LIGHT_THEME;
  const statusLabel = getStatusLabel(product.status);
  const imageMarkup = product.primary_image
    ? `<img src="${escapeHtml(product.primary_image)}" alt="Product Image" style="max-width:100%;max-height:100%;object-fit:contain;" />`
    : `<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;color:${palette.imageFallback};font-size:14px;font-weight:500;">ไม่มีรูปสินค้า</div>`;

  const fieldMarkup = getSpecificationFields(product)
    .map(
      ([label, value, accent]) => `
        <div style="border-bottom:1px solid ${accent ? palette.primaryBorder : palette.border};padding-bottom:8px;">
          <div style="margin-bottom:4px;font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${accent ? palette.primary : palette.muted};">${escapeHtml(label)}</div>
          <div style="font-size:14px;font-weight:${accent ? "700" : "500"};color:${accent ? palette.primary : palette.body};word-break:break-word;">${escapeHtml(value)}</div>
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="th" class="${isDarkMode ? "dark" : "light"}">
  <head>
    <meta charset="utf-8" />
    <title>Specification Sheet - ${escapeHtml(product.part_number || "product")}</title>
    <style>
      ${buildFontFaceCss()}
      @page { size: A5 landscape; margin: 0; }
      * {
        box-sizing: border-box;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 210mm;
        height: 148mm;
        background: ${palette.appBackground};
      }
      body {
        font-family: "Inter", "Noto Sans Thai", sans-serif;
        color: ${palette.body};
      }
      .sheet {
        width: 210mm;
        height: 148mm;
        border: 1px solid ${palette.border};
        background: ${palette.modalBackground};
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .header {
        padding: 32px 32px 16px;
      }
      .headline {
        font-size: 28px;
        line-height: 1;
        letter-spacing: -0.03em;
        text-transform: uppercase;
        color: ${palette.body};
        font-weight: 300;
      }
      .headline strong { font-weight: 700; }
      .subhead {
        margin-top: 4px;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: ${palette.muted};
        font-weight: 500;
      }
      .divider {
        height: 1px;
        margin: 0 32px;
        background: ${palette.divider};
      }
      .content {
        display: flex;
        flex: 1;
        gap: 32px;
        overflow: hidden;
        padding: 24px 32px;
      }
      .identity {
        width: 180px;
        flex-shrink: 0;
      }
      .preview {
        width: 180px;
        height: 180px;
        border: 1px solid ${palette.border};
        background: ${palette.imageBackground};
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        filter: grayscale(100%);
        opacity: ${isDarkMode ? "0.8" : "1"};
      }
      .identity-meta {
        margin-top: 24px;
        display: grid;
        gap: 16px;
      }
      .meta-label {
        display: block;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: ${palette.muted};
      }
      .status {
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: ${palette.primary};
      }
      .status-text {
        font-size: 13px;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: ${palette.primary};
        font-weight: 600;
      }
      .part-name {
        margin-top: 4px;
        font-size: 16px;
        line-height: 1.35;
        color: ${palette.body};
        font-weight: 700;
      }
      .meta-value {
        margin-top: 2px;
        display: block;
        font-size: 15px;
        color: ${palette.body};
        font-weight: 500;
      }
      .grid {
        flex: 1;
        overflow: hidden;
      }
      .grid-inner {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px 32px;
      }
      .footer {
        border-top: 1px solid ${palette.border};
        background: ${palette.footer};
        padding: 16px 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .footer-actions {
        display: flex;
        gap: 24px;
        color: ${palette.muted};
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }
      .footer-meta {
        color: ${palette.muted};
        font-size: 10px;
        font-weight: 500;
      }
      .footer-meta strong {
        color: ${palette.body};
        font-weight: 700;
      }
      .footer-status {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    </style>
  </head>
  <body>
    <section class="sheet">
      <div class="header">
        <div class="headline">Specification <strong>Sheet</strong></div>
        <div class="subhead">แผ่นข้อมูลจำเพาะทางเทคนิค</div>
      </div>
      <div class="divider"></div>
      <div class="content">
        <div class="identity">
          <div class="preview">${imageMarkup}</div>
          <div class="identity-meta">
            <div>
              <span class="meta-label">Part Name / ชื่อชิ้นงาน</span>
              <div class="part-name">${escapeHtml(formatValue(product.part_name))}</div>
            </div>
            <div>
              <span class="meta-label">ERP Code / รหัสสินค้า</span>
              <span class="meta-value">${escapeHtml(formatValue(product.erp_code))}</span>
            </div>
          </div>
        </div>
        <div class="grid">
          <div class="grid-inner">${fieldMarkup}</div>
        </div>
      </div>
      <div class="footer">
        <div class="footer-actions">
          <span>Print Label</span>
          <span>Export PDF</span>
        </div>
        <div class="footer-status">
          <span class="status-dot"></span>
          <span class="status-text">${escapeHtml(statusLabel)}</span>
        </div>
      </div>
    </section>
  </body>
</html>`;
}

function openPrintWindow(html: string, title: string) {
  const iframe = document.createElement("iframe");
  let hasPrinted = false;

  iframe.setAttribute("aria-hidden", "true");
  iframe.title = title;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 300);
  };

  iframe.onload = () => {
    if (hasPrinted) {
      return;
    }

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    hasPrinted = true;

    const handleAfterPrint = () => {
      frameWindow.removeEventListener("afterprint", handleAfterPrint);
      cleanup();
    };

    frameWindow.addEventListener("afterprint", handleAfterPrint);
    frameWindow.focus();

    window.setTimeout(() => {
      frameWindow.print();
    }, 250);
  };

  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    cleanup();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
}

async function exportSpecificationPdf({
  filename,
  html,
  isDarkMode,
}: {
  filename: string;
  html: string;
  isDarkMode: boolean;
}) {
  const html2pdf = (await import("html2pdf.js")).default;
  const parser = new DOMParser();
  const documentHtml = parser.parseFromString(html, "text/html");
  const sheet = documentHtml.querySelector<HTMLElement>(".sheet");

  if (!sheet) {
    throw new Error("Specification sheet template is missing.");
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.style.height = "148mm";
  container.style.background = isDarkMode ? DARK_THEME.appBackground : LIGHT_THEME.appBackground;
  documentHtml.querySelectorAll("style").forEach((style) => {
    container.appendChild(style.cloneNode(true));
  });
  container.appendChild(sheet);
  document.body.appendChild(container);

  try {
    await document.fonts.ready;

    await html2pdf()
      .set({
        filename,
        html2canvas: {
          backgroundColor: isDarkMode ? DARK_THEME.appBackground : LIGHT_THEME.appBackground,
          scale: 2,
          useCORS: true,
          windowHeight: 560,
          windowWidth: 794,
        },
        image: { quality: 0.98, type: "jpeg" },
        jsPDF: {
          format: [210, 148],
          orientation: "landscape",
          unit: "mm",
        },
        margin: 0,
      })
      .from(sheet)
      .save();
  } finally {
    container.remove();
  }
}

function DetailField({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`border-b pb-2 ${
        accent ? "border-primary/30 dark:border-[#ff4d4d]/55" : "border-outline dark:border-[#333333]"
      }`}
    >
      <label
        className={`mb-1 block text-[9px] uppercase tracking-[0.2em] ${
          accent ? "text-primary dark:text-[#ff4d4d]" : "text-on-surface-variant dark:text-[#aeb8c2]"
        }`}
        style={{ fontWeight: 700 }}
      >
        {label}
      </label>
      <span
        className={`block text-[14px] ${accent ? "text-primary dark:text-[#ff4d4d]" : "text-on-surface"}`}
        style={{ fontWeight: accent ? 700 : 500 }}
      >
        {value}
      </span>
    </div>
  );
}

export function ProductDetailModal({
  detailProduct,
  onClose,
  navigateDetail,
  currentDetailIdx,
  totalCount,
  prevDisabled,
  nextDisabled,
}: ProductDetailModalProps) {
  const { isDarkMode } = useApp();
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const handlePrintLabel = () => {
    const currentDarkMode = getCurrentDarkMode(isDarkMode);

    openPrintWindow(
      buildSpecificationHtml(detailProduct, currentDarkMode),
      `product-spec-${detailProduct.part_number || detailProduct.id}`,
    );
  };

  const handleExportPdf = async () => {
    const safePartNumber = (detailProduct.part_number || detailProduct.erp_code || detailProduct.id)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim();
    const currentDarkMode = getCurrentDarkMode(isDarkMode);

    await exportSpecificationPdf({
      filename: `${safePartNumber || "product-specification"}.pdf`,
      html: buildSpecificationHtml(detailProduct, currentDarkMode),
      isDarkMode: currentDarkMode,
    });
  };

  const statusActive = detailProduct.status === STATUS_ACTIVE;
  const statusLabel = getStatusLabel(detailProduct.status);
  const a5Style = useMemo(
    () =>
      ({
        width: "min(210mm, calc(100vw - 32px))",
        height: "min(148mm, calc(100vh - 32px))",
        minWidth: "min(210mm, calc(100vw - 32px))",
        minHeight: "min(148mm, calc(100vh - 32px))",
      }) satisfies React.CSSProperties,
    [],
  );

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-0 backdrop-blur-sm sm:p-4">
        <div
          className="relative flex flex-col overflow-hidden border border-outline bg-white shadow-[0_0_50px_rgba(0,0,0,0.05)] dark:border-[#333333] dark:bg-[#121212] dark:shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={a5Style}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-on-surface-variant transition-colors hover:bg-black/5 hover:text-on-surface dark:text-on-surface-variant dark:hover:bg-white/10 dark:hover:text-on-surface"
            type="button"
            title="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="px-4 pb-4 pt-8 sm:px-8">
            <h1
              className="text-[28px] uppercase leading-none tracking-tight text-on-surface"
              style={{ fontWeight: 300 }}
            >
              Specification <span style={{ fontWeight: 700 }}>Sheet</span>
            </h1>
            <p
              className="mt-1 text-[12px] uppercase tracking-[0.2em] text-on-surface-variant"
              style={{ fontWeight: 500 }}
            >
              แผ่นข้อมูลจำเพาะทางเทคนิค
            </p>
          </div>

          <div className="px-4 sm:px-8">
            <div className="h-px w-full bg-on-surface opacity-10" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-8 md:flex-row md:gap-8 md:overflow-hidden md:py-6">
            <div className="flex w-full shrink-0 flex-col items-center overflow-visible md:w-[180px] md:items-stretch md:overflow-hidden">
              <div className="flex h-[180px] w-[180px] shrink-0 items-center justify-center overflow-hidden border border-outline bg-white p-4 grayscale transition-all duration-700 hover:grayscale-0 dark:border-[#333333] dark:bg-[#1e1e1e] dark:opacity-80 dark:hover:opacity-100">
                {detailProduct.primary_image ? (
                  <img
                    alt={detailProduct.part_name || "รูปสินค้า"}
                    className="h-full w-full cursor-zoom-in object-contain"
                    src={detailProduct.primary_image}
                    onClick={() => setZoomImage(detailProduct.primary_image)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                )}
              </div>

              <div className="mt-4 w-full space-y-4 md:mt-6">
                <div>
                  <label
                    className="block text-[9px] uppercase tracking-[0.2em] text-on-surface-variant"
                    style={{ fontWeight: 700 }}
                  >
                    Part Name / ชื่อชิ้นงาน
                  </label>
                  <span
                    className="mt-1 block text-[16px] leading-snug text-on-surface"
                    style={{ fontWeight: 700 }}
                  >
                    {detailProduct.part_name || "-"}
                  </span>
                </div>

                <div>
                  <label
                    className="block text-[9px] uppercase tracking-[0.2em] text-on-surface-variant"
                    style={{ fontWeight: 700 }}
                  >
                    ERP Code / รหัสสินค้า
                  </label>
                  <span className="mt-0.5 block text-[15px] text-on-surface" style={{ fontWeight: 500 }}>
                    {detailProduct.erp_code || "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="custom-scrollbar w-full flex-1 overflow-visible pr-0 md:overflow-y-auto md:pr-2">
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                <DetailField
                  label="Unit / หน่วยนับ"
                  value={formatValue(detailProduct.unit || DEFAULT_UNIT)}
                />
                <DetailField
                  accent
                  label="Part Number / หมายเลขชิ้นส่วน"
                  value={formatValue(detailProduct.part_number)}
                />
                <DetailField label="Model / รุ่น" value={formatValue(detailProduct.model)} />
                <DetailField
                  label="Material Grade / เกรดวัสดุ"
                  value={formatValue(detailProduct.material)}
                />
                <DetailField label="Standard / มาตรฐาน" value={formatValue(detailProduct.std_no)} />
                <DetailField label="Plating / ชุบ" value={formatValue(detailProduct.plating)} />
                <DetailField
                  label="Sheets per unit / จำนวนแผ่น"
                  value={formatValue(detailProduct.sheet_count)}
                />
                <DetailField
                  label="Workpieces per sheet / ชิ้นงานต่อแผ่น"
                  value={formatValue(detailProduct.parts_per_sheet)}
                />
                <DetailField label="Cost / ต้นทุน" value={formatCurrency(detailProduct.cost_price)} />
                <DetailField
                  label="Median Price / ราคากลาง"
                  value={formatCurrency(detailProduct.selling_price)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline/50 bg-surface-container/30 px-4 py-3 dark:border-[#333333] dark:bg-[#181818] sm:px-8 sm:py-4">
            <div className="flex gap-4 sm:gap-6">
              <button
                onClick={handlePrintLabel}
                className="group flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-on-surface-variant transition-colors hover:text-primary"
                style={{ fontWeight: 700 }}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:scale-110">
                  print
                </span>
                Print Label
              </button>
              <button
                onClick={handleExportPdf}
                className="group flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-on-surface-variant transition-colors hover:text-primary"
                style={{ fontWeight: 700 }}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:scale-110">
                  file_download
                </span>
                Export PDF
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateDetail("prev")}
                disabled={prevDisabled}
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant transition-colors dark:border-[#333333] ${
                  prevDisabled
                    ? "cursor-not-allowed bg-transparent text-on-surface-variant/50"
                    : "bg-white text-on-surface hover:bg-surface-container-low dark:bg-[#121212] dark:hover:bg-[#1e1e1e]"
                }`}
                type="button"
                title="ชิ้นก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="whitespace-nowrap text-xs text-on-surface-variant" style={{ fontWeight: 600 }}>
                ชิ้นงานที่ <span className="text-on-surface" style={{ fontWeight: 700 }}>{currentDetailIdx + 1}</span> จาก{" "}
                {totalCount}
              </span>
              <button
                onClick={() => navigateDetail("next")}
                disabled={nextDisabled}
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant transition-colors dark:border-[#333333] ${
                  nextDisabled
                    ? "cursor-not-allowed bg-transparent text-on-surface-variant/50"
                    : "bg-white text-on-surface hover:bg-surface-container-low dark:bg-[#121212] dark:hover:bg-[#1e1e1e]"
                }`}
                type="button"
                title="ชิ้นถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className={`h-2 w-2 rounded-full bg-primary ${statusActive ? "dark:animate-pulse" : ""}`} />
                <span className="text-[10px] uppercase tracking-[0.15em] text-primary" style={{ fontWeight: 700 }}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {zoomImage ? (
        <div
          className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-5xl">
            <img
              alt="Zoomed Drawing"
              className="max-h-[90vh] max-w-full rounded bg-white p-4 object-contain shadow-2xl dark:bg-surface-container-lowest"
              src={zoomImage}
            />
            <button
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-none bg-black/60 text-white transition-colors hover:bg-black"
              onClick={() => setZoomImage(null)}
              type="button"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
