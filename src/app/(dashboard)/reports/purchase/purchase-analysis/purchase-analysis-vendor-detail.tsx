"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Building2, ChevronDown, ChevronRight, ExternalLink, FileText, Phone, X } from "lucide-react";
import { getPurchaseAnalysisVendorDetailAction, type PurchaseAnalysisRow, type PurchaseAnalysisVendorDetail } from "@/app/actions/purchase-analysis";
import { DataTable, DataTableFrame } from "@/components/data-table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { purchaseAnalysisDeliveryLabel } from "@/lib/purchase-analysis";
import styles from "./purchase-analysis-report.module.css";

const money = (value: number) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (value: number) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 4 });
const percent = (value: number) => `${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}%`;
const date = (value: string) => value ? value.split("-").reverse().join("/") : "-";
const status: Record<string, { label: string; tone: StatusTone }> = {
  not_received: { label: "ยังไม่รับ", tone: "danger" },
  partial: { label: "รับบางส่วน", tone: "pending" },
  received: { label: "รับครบ", tone: "success" },
};

export function PurchaseAnalysisVendorDrawer({ row, startDate, endDate, onClose }: { row: PurchaseAnalysisRow; startDate: string; endDate: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<PurchaseAnalysisVendorDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"orders" | "vendor">("orders");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    closeRef.current?.focus();
    let active = true;
    startTransition(async () => {
      const result = await getPurchaseAnalysisVendorDetailAction({ vendorId: Number(row.group_id), startDate, endDate });
      if (!active) return;
      if (!result.data) setError(result.error ?? "ไม่สามารถโหลดรายละเอียดผู้ขายได้");
      else { setDetail(result.data); setExpanded(result.data.purchase_orders[0]?.id ?? null); }
    });
    return () => { active = false; document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); };
  }, [endDate, onClose, row.group_id, startDate]);

  const summary = detail?.summary;
  return <div className={styles.drawerOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="vendor-detail-title" aria-modal="true" className={styles.drawer} role="dialog">
      <header className={styles.drawerHeader}>
        <button aria-label="กลับ" className={styles.mobileBack} onClick={onClose}><ArrowLeft /></button>
        <h2 id="vendor-detail-title">รายละเอียดผู้ขาย</h2>
        <button ref={closeRef} aria-label="ปิด" className={styles.desktopClose} onClick={onClose}><X /></button>
      </header>
      {pending && !detail ? <div className={styles.drawerState}>กำลังโหลดรายละเอียด...</div> : error ? <div className={styles.drawerState}><p>{error}</p><button onClick={onClose}>ปิด</button></div> : detail && <>
        <div className={styles.vendorIdentity}><span><Building2 /></span><div><b>{detail.vendor.code}</b><p>{detail.vendor.name}</p></div></div>
        <div className={styles.vendorKpis}>
          <div><strong>{summary?.po_count ?? 0}</strong><span>จำนวน PO</span></div>
          <div><strong>{money(summary?.total_value ?? 0)}</strong><span>มูลค่า (บาท)</span></div>
          <div><strong className={styles.warnText}>{percent(summary?.received_rate ?? 0)}</strong><span>รับแล้ว</span></div>
          <div><strong className={styles.dangerText}>{money(summary?.pending_value ?? 0)}</strong><span>ค้างรับ</span></div>
          <div><strong className={styles.goodText}>{percent(summary?.on_time_rate ?? 0)}</strong><span>ส่งตรงเวลา</span></div>
        </div>
        <div className={styles.drawerTabs} role="tablist"><button aria-selected={tab === "orders"} className={tab === "orders" ? styles.activeDrawerTab : ""} onClick={() => setTab("orders")} role="tab">รายการสั่งซื้อ ({detail.purchase_orders.length})</button><button aria-selected={tab === "vendor"} className={tab === "vendor" ? styles.activeDrawerTab : ""} onClick={() => setTab("vendor")} role="tab">ข้อมูลผู้ขาย</button></div>
        <div className={styles.drawerBody}>
          {tab === "vendor" ? <div className={styles.vendorProfile}>
            <section aria-labelledby="vendor-registration-title" className={styles.vendorSection}>
              <h3 id="vendor-registration-title"><FileText />ข้อมูลจดทะเบียน</h3>
              <dl><div><dt>เลขประจำตัวผู้เสียภาษี</dt><dd>{detail.vendor.tax_no || "-"}</dd></div><div><dt>สาขา</dt><dd>{detail.vendor.branch || "-"}</dd></div></dl>
            </section>
            <section aria-labelledby="vendor-contact-title" className={styles.vendorSection}>
              <h3 id="vendor-contact-title"><Phone />ข้อมูลติดต่อ</h3>
              <dl><div><dt>ผู้ติดต่อ</dt><dd>{detail.vendor.contact_name || "-"}</dd></div><div><dt>โทรศัพท์</dt><dd>{detail.vendor.phone || "-"}</dd></div><div><dt>อีเมล</dt><dd>{detail.vendor.email || "-"}</dd></div><div className={styles.vendorAddress}><dt>ที่อยู่</dt><dd>{detail.vendor.address || "-"}</dd></div></dl>
            </section>
          </div> : <>
            <div className={styles.desktopOrders}>
              <DataTableFrame className={styles.drawerTableFrame}>
                <DataTable className={styles.drawerTable}>
                  <thead><tr><th aria-label="ขยายรายการ" /><th>เลขที่ PO</th><th>วันที่</th><th>กำหนดส่ง</th><th>สถานะ</th><th>มูลค่า (บาท)</th><th>รับแล้ว</th><th>ค้างรับ</th></tr></thead>
                  <tbody>{detail.purchase_orders.map((po) => { const open = expanded === po.id; const poStatus = status[po.status] ?? status.not_received; return <Fragment key={po.id}>
                    <tr className={open ? styles.expandedPoRow : ""}>
                      <td><button aria-expanded={open} aria-label={`${open ? "ย่อ" : "ขยาย"} ${po.po_number}`} className={styles.poToggle} onClick={() => setExpanded(open ? null : po.id)}>{open ? <ChevronDown /> : <ChevronRight />}</button></td>
                      <td><button aria-expanded={open} className={styles.poNumberButton} onClick={() => setExpanded(open ? null : po.id)}>{po.po_number}</button></td>
                      <td>{date(po.document_date)}</td>
                      <td>{purchaseAnalysisDeliveryLabel(po.items.map((item) => item.delivery_date))}</td>
                      <td><StatusBadge tone={poStatus.tone}>{poStatus.label}</StatusBadge></td>
                      <td>{money(po.total_value)}</td>
                      <td className={po.received_rate > 0 ? styles.goodText : styles.dangerText}>{percent(po.received_rate)}</td>
                      <td className={po.pending_value > 0 ? styles.warnText : styles.goodText}>{money(po.pending_value)}</td>
                    </tr>
                    {open && <tr className={styles.poDetailRow}><td colSpan={8}>
                      <div className={styles.orderDetailTitle}><b>รายการสินค้า ({po.items.length} รายการ)</b><a href={`/purchase/po?q=${encodeURIComponent(po.po_number)}`}>เปิดเอกสาร PO <ExternalLink /></a></div>
                      <DataTableFrame className={styles.itemTableFrame}>
                        <DataTable className={styles.drawerItemTable}>
                          <thead><tr><th>#</th><th>รหัสสินค้า</th><th>รายการสินค้า</th><th>กำหนดส่ง</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>มูลค่าสุทธิ</th><th>รับแล้ว</th><th>ค้างรับ</th></tr></thead>
                          <tbody>{po.items.map((item) => <tr key={item.id}><td>{item.line_no}</td><td><b>{item.item_code}</b></td><td className={styles.drawerItemName}>{item.item_name}</td><td>{date(item.delivery_date)}</td><td>{qty(item.ordered_qty)}</td><td>{item.unit_name}</td><td>{money(item.unit_price)}</td><td>{money(item.net_value)}</td><td className={styles.goodText}>{qty(item.received_qty)}</td><td className={item.pending_qty > 0 ? styles.warnText : styles.goodText}>{qty(item.pending_qty)}</td></tr>)}</tbody>
                        </DataTable>
                      </DataTableFrame>
                    </td></tr>}
                  </Fragment>; })}</tbody>
                </DataTable>
              </DataTableFrame>
            </div>
            <div className={`${styles.orders} ${styles.mobileOrders}`}>
            {detail.purchase_orders.map((po) => { const open = expanded === po.id; const poStatus = status[po.status] ?? status.not_received; return <article className={`${styles.order} ${open ? styles.openOrder : ""}`} key={po.id}>
              <button aria-expanded={open} className={styles.orderRow} onClick={() => setExpanded(open ? null : po.id)}>
                <span className={styles.orderChevron}>{open ? <ChevronDown /> : <ChevronRight />}</span>
                <strong>{po.po_number}</strong>
                <span data-label="วันที่">{date(po.document_date)}</span>
                <span data-label="กำหนดส่ง">{purchaseAnalysisDeliveryLabel(po.items.map((item) => item.delivery_date))}</span>
                <span><StatusBadge tone={poStatus.tone}>{poStatus.label}</StatusBadge></span>
                <b data-label="มูลค่า (บาท)">{money(po.total_value)}</b>
                <b className={po.received_rate > 0 ? styles.goodText : styles.dangerText} data-label="รับแล้ว">{percent(po.received_rate)}</b>
                <b className={po.pending_value > 0 ? styles.warnText : styles.goodText} data-label="ค้างรับ">{money(po.pending_value)}</b>
              </button>
              {open && <div className={styles.orderDetail}>
                <div className={styles.orderDetailTitle}><b>รายการสินค้า ({po.items.length} รายการ)</b><a href={`/purchase/po?q=${encodeURIComponent(po.po_number)}`}>เปิดเอกสาร PO <ExternalLink /></a></div>
                <div className={styles.itemTable}><div className={styles.itemHead}><span>#</span><span>รหัสสินค้า</span><span>รายการสินค้า</span><span>กำหนดส่ง</span><span>จำนวน</span><span>หน่วย</span><span>ราคา/หน่วย</span><span>มูลค่าสุทธิ</span><span>รับแล้ว</span><span>ค้างรับ</span></div>
                  {po.items.map((item) => <div className={styles.itemRow} key={item.id}><span className={styles.lineNo}>{item.line_no}</span><b>{item.item_code}</b><span className={styles.itemName}>{item.item_name}</span><span data-label="กำหนดส่ง">{date(item.delivery_date)}</span><span data-label="จำนวน">{qty(item.ordered_qty)}</span><span>{item.unit_name}</span><span data-label="ราคา/หน่วย">{money(item.unit_price)}</span><span data-label="มูลค่าสุทธิ">{money(item.net_value)}</span><span className={styles.goodText} data-label="รับแล้ว">{qty(item.received_qty)}</span><span className={item.pending_qty > 0 ? styles.warnText : styles.goodText} data-label="ค้างรับ">{qty(item.pending_qty)}</span></div>)}
                </div>
                <a className={styles.mobilePoLink} href={`/purchase/po?q=${encodeURIComponent(po.po_number)}`}>เปิดเอกสาร PO <ExternalLink /></a>
              </div>}
            </article>; })}
            </div>
          </>}
        </div>
      </>}
    </section>
  </div>;
}
