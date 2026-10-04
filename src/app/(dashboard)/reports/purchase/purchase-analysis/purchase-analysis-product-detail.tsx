"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Package, X } from "lucide-react";
import { getPurchaseAnalysisProductDetailAction, type PurchaseAnalysisProductDetail, type PurchaseAnalysisRow } from "@/app/actions/purchase-analysis";
import { DataTable, DataTableFrame } from "@/components/data-table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import styles from "./purchase-analysis-report.module.css";

const money = (value: number) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (value: number) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 4 });
const percent = (value: number) => `${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}%`;
const date = (value: string) => value ? value.split("-").reverse().join("/") : "-";
const statuses: Record<string, { label: string; tone: StatusTone }> = {
  not_received: { label: "ยังไม่รับ", tone: "danger" },
  partial: { label: "รับบางส่วน", tone: "pending" },
  received: { label: "รับครบ", tone: "success" },
};

export function PurchaseAnalysisProductDrawer({ row, startDate, endDate, onClose }: { row: PurchaseAnalysisRow; startDate: string; endDate: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<PurchaseAnalysisProductDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"orders" | "product">("orders");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    closeRef.current?.focus();
    let active = true;
    startTransition(async () => {
      const result = await getPurchaseAnalysisProductDetailAction({ productKey: row.group_id, startDate, endDate });
      if (!active) return;
      if (!result.data) setError(result.error ?? "ไม่สามารถโหลดรายละเอียดสินค้าได้");
      else { setDetail(result.data); setExpanded(result.data.purchase_orders[0]?.id ?? null); }
    });
    return () => { active = false; document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); };
  }, [endDate, onClose, row.group_id, startDate]);

  const summary = detail?.summary;
  return <div className={styles.drawerOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="product-detail-title" aria-modal="true" className={`${styles.drawer} ${styles.productDrawer}`} role="dialog">
      <header className={styles.drawerHeader}>
        <button aria-label="กลับ" className={styles.mobileBack} onClick={onClose}><ArrowLeft /></button>
        <h2 id="product-detail-title">รายละเอียดสินค้า</h2>
        <button ref={closeRef} aria-label="ปิด" className={styles.desktopClose} onClick={onClose}><X /></button>
      </header>
      {pending && !detail ? <div className={styles.drawerState}>กำลังโหลดรายละเอียด...</div> : error ? <div className={styles.drawerState}><p>{error}</p><button onClick={onClose}>ปิด</button></div> : detail && <>
        <div className={styles.vendorIdentity}><span><Package /></span><div><b>{detail.product.code}</b><p>{detail.product.name}</p><small>{detail.product.item_type_name || "ไม่ระบุประเภท"} · หน่วย: {detail.product.unit_name}</small></div></div>
        <div className={styles.vendorKpis}>
          <div><strong>{summary?.po_count ?? 0}</strong><span>จำนวน PO</span></div>
          <div><strong>{money(summary?.total_value ?? 0)}</strong><span>มูลค่า (บาท)</span></div>
          <div><strong className={styles.goodText}>{qty(summary?.received_qty ?? 0)}</strong><span>รับแล้ว</span></div>
          <div><strong className={styles.dangerText}>{qty(summary?.pending_qty ?? 0)}</strong><span>ค้างรับ</span></div>
          <div><strong className={styles.goodText}>{percent(summary?.on_time_rate ?? 0)}</strong><span>ส่งตรงเวลา</span></div>
        </div>
        <div className={styles.drawerTabs} role="tablist"><button aria-selected={tab === "orders"} className={tab === "orders" ? styles.activeDrawerTab : ""} onClick={() => setTab("orders")} role="tab">รายการสั่งซื้อ ({detail.purchase_orders.length})</button><button aria-selected={tab === "product"} className={tab === "product" ? styles.activeDrawerTab : ""} onClick={() => setTab("product")} role="tab">ข้อมูลสินค้า</button></div>
        <div className={styles.drawerBody}>
          {tab === "product" ? <div className={styles.vendorProfile}><section className={styles.vendorSection}><h3><Package />ข้อมูลสินค้า</h3><dl><div><dt>รหัสสินค้า</dt><dd>{detail.product.code}</dd></div><div><dt>ชื่อสินค้า</dt><dd>{detail.product.name}</dd></div><div><dt>ประเภทสินค้า</dt><dd>{detail.product.item_type_name || "-"}</dd></div><div><dt>หน่วย</dt><dd>{detail.product.unit_name}</dd></div></dl></section></div> : <>
            <div className={styles.desktopOrders}>
              <DataTableFrame className={styles.drawerTableFrame}>
                <DataTable className={styles.productDrawerTable}>
                  <thead><tr><th aria-label="ขยายรายการ" /><th>เลขที่ PO</th><th>ผู้ขาย</th><th>วันที่เอกสาร</th><th>กำหนดส่งสินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>มูลค่า</th><th>รับแล้ว</th><th>ค้างรับ</th><th>สถานะ</th></tr></thead>
                  <tbody>{detail.purchase_orders.map((po) => { const open = expanded === po.id; const poStatus = statuses[po.status] ?? statuses.not_received; return <Fragment key={po.id}>
                    <tr className={open ? styles.expandedPoRow : ""}>
                      <td><button aria-expanded={open} aria-label={`${open ? "ย่อ" : "ขยาย"} ${po.po_number}`} className={styles.poToggle} onClick={() => setExpanded(open ? null : po.id)}>{open ? <ChevronDown /> : <ChevronRight />}</button></td>
                      <td><button aria-expanded={open} className={styles.poNumberButton} onClick={() => setExpanded(open ? null : po.id)}>{po.po_number}</button></td>
                      <td className={styles.productVendorName}><b>{po.vendor_code}</b><span>{po.vendor_name}</span></td>
                      <td>{date(po.document_date)}</td><td>{date(po.delivery_date)}</td><td>{qty(po.ordered_qty)}</td><td>{money(po.unit_price)}</td><td>{money(po.total_value)}</td><td className={styles.goodText}>{qty(po.received_qty)}</td><td className={po.pending_qty > 0 ? styles.warnText : styles.goodText}>{qty(po.pending_qty)}</td><td><StatusBadge tone={poStatus.tone}>{poStatus.label}</StatusBadge></td>
                    </tr>
                    {open && <tr className={styles.poDetailRow}><td colSpan={11}><div className={styles.productOrderDetail}>
                      <dl><div><dt>เลขที่ PO</dt><dd>{po.po_number}</dd></div><div><dt>ผู้ขาย</dt><dd className={styles.productVendorName}>{po.vendor_code} · {po.vendor_name}</dd></div><div><dt>วันที่เอกสาร</dt><dd>{date(po.document_date)}</dd></div><div><dt>กำหนดส่งสินค้า</dt><dd>{date(po.delivery_date)}</dd></div><div><dt>จำนวน</dt><dd>{qty(po.ordered_qty)} {detail.product.unit_name}</dd></div><div><dt>ราคา/หน่วย</dt><dd>{money(po.unit_price)}</dd></div><div><dt>มูลค่า</dt><dd>{money(po.total_value)}</dd></div><div><dt>รับแล้ว</dt><dd>{qty(po.received_qty)}</dd></div><div><dt>ค้างรับ</dt><dd>{qty(po.pending_qty)}</dd></div></dl>
                      <Link href={`/purchase/po?q=${encodeURIComponent(po.po_number)}`}>เปิดเอกสาร PO <ExternalLink /></Link>
                    </div></td></tr>}
                  </Fragment>; })}</tbody>
                </DataTable>
              </DataTableFrame>
            </div>
            <div className={`${styles.orders} ${styles.mobileOrders}`}>
              {detail.purchase_orders.map((po) => { const open = expanded === po.id; const poStatus = statuses[po.status] ?? statuses.not_received; return <article className={`${styles.productOrder} ${open ? styles.openOrder : ""}`} key={po.id}>
                <button aria-expanded={open} className={styles.productOrderRow} onClick={() => setExpanded(open ? null : po.id)}>
                  <span className={styles.orderChevron}>{open ? <ChevronDown /> : <ChevronRight />}</span><strong>{po.po_number}</strong><StatusBadge tone={poStatus.tone}>{poStatus.label}</StatusBadge>
                  <span className={styles.productVendorName}><b>{po.vendor_code}</b> · {po.vendor_name}</span>
                  <span data-label="วันที่เอกสาร">{date(po.document_date)}</span><span data-label="กำหนดส่งสินค้า">{date(po.delivery_date)}</span><span data-label="จำนวน">{qty(po.ordered_qty)} {detail.product.unit_name}</span><span data-label="มูลค่า">{money(po.total_value)}</span><span className={styles.goodText} data-label="รับแล้ว">{qty(po.received_qty)}</span><span className={po.pending_qty > 0 ? styles.warnText : styles.goodText} data-label="ค้างรับ">{qty(po.pending_qty)}</span>
                </button>
                {open && <div className={styles.productMobileDetail}><dl><div><dt>ราคา/หน่วย</dt><dd>{money(po.unit_price)}</dd></div><div><dt>สถานะรับ</dt><dd>{percent(po.received_rate)}</dd></div></dl><Link href={`/purchase/po?q=${encodeURIComponent(po.po_number)}`}>เปิดเอกสาร PO <ExternalLink /></Link></div>}
              </article>; })}
            </div>
          </>}
        </div>
      </>}
    </section>
  </div>;
}
