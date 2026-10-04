import type { AssetRecord } from "./assets.ts";
import { printHtmlDocument } from "./document-print.ts";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildAssetTagPrintHtml(asset: AssetRecord, qrUrl: string): string {
  const itemCode = escapeHtml(asset.itemCode || "-");
  const itemName = escapeHtml(asset.itemName || "-");
  const serialNumber = escapeHtml(asset.serialNumber || "-");
  const departmentName = escapeHtml(asset.departmentName || "ส่วนกลาง");
  const receiptDate = escapeHtml(asset.receiptDate || "-");

  return `
    <div style="display: flex; justify-content: center; align-items: flex-start; padding: 5mm;">
      <div style="
        width: 85mm;
        box-sizing: border-box;
        border: 0.3mm solid #000000;
        border-radius: 1.5mm;
        background: #ffffff;
        padding: 3mm 4mm;
        color: #000000;
        font-family: 'Inter', 'Sarabun', 'Noto Sans Thai', sans-serif;
      ">
        <!-- Tag Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 0.3mm solid #000000; padding-bottom: 2mm;">
          <div style="display: flex; align-items: center; gap: 1.5mm;">
            <span style="display: inline-grid; width: 6mm; height: 6mm; place-items: center; background: #000000; color: #ffffff; font-size: 8pt; font-weight: 900; line-height: 1;">
              KRC
            </span>
            <span style="font-size: 9pt; font-weight: 800; letter-spacing: -0.02em;">KRC AUTOPART</span>
          </div>
          <span style="font-size: 7pt; font-weight: 700; color: #555555;">FIXED ASSET TAG</span>
        </div>

        <!-- Tag Content -->
        <div style="display: flex; align-items: flex-start; gap: 3mm; margin-top: 2.5mm;">
          <!-- QR Image -->
          <div style="width: 20mm; height: 20mm; flex-shrink: 0; border: 0.2mm solid #cccccc; padding: 0.5mm; background: #ffffff;">
            <img
              src="${qrUrl}"
              alt="QR ${serialNumber}"
              style="width: 100%; height: 100%; object-fit: contain; display: block;"
            />
          </div>

          <!-- Details -->
          <div style="flex: 1; min-width: 0; line-height: 1.25;">
            <div style="margin-bottom: 1.5mm;">
              <span style="display: block; font-size: 6.5pt; font-weight: 700; color: #666666;">รหัสทรัพย์สิน</span>
              <p style="margin: 0; font-size: 8.5pt; font-weight: 800; color: #000000; word-break: break-all;">${itemCode}</p>
            </div>
            <div style="margin-bottom: 1.5mm;">
              <span style="display: block; font-size: 6.5pt; font-weight: 700; color: #666666;">ชื่อรายการ</span>
              <p style="margin: 0; font-size: 8pt; font-weight: 600; color: #222222; word-break: break-word;">${itemName}</p>
            </div>
            <div>
              <span style="display: block; font-size: 6.5pt; font-weight: 700; color: #666666;">SERIAL NUMBER</span>
              <p style="margin: 0; font-family: monospace; font-size: 8.5pt; font-weight: 900; color: #bd0d1a; letter-spacing: 0.03em;">${serialNumber}</p>
            </div>
          </div>
        </div>

        <!-- Tag Footer -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 0.2mm solid #cccccc; margin-top: 2.5mm; padding-top: 1.5mm; font-size: 7pt; font-weight: 600; color: #555555;">
          <span>แผนก: ${departmentName}</span>
          <span>วันที่รับ: ${receiptDate}</span>
        </div>
      </div>
    </div>
  `;
}

export async function printAssetTag(asset: AssetRecord, qrUrl: string): Promise<void> {
  const html = buildAssetTagPrintHtml(asset, qrUrl);
  await printHtmlDocument(html, {
    title: `asset-tag-${asset.itemCode || asset.serialNumber}`,
    paperSize: "A5",
    orientation: "portrait",
    styles: [
      `
        @page {
          size: auto;
          margin: 4mm;
        }
      `,
    ],
  });
}
