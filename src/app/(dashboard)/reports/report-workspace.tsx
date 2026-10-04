"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AVAILABLE_REPORT_CATALOG, REPORT_CATEGORY_META } from "@/lib/report-catalog";
import styles from "./report-workspace.module.css";

const STORAGE_KEY = "krc-report-workspace-collapsed";

const REPORT_ICONS: Record<string, string> = {
  "pending-receipts": "local_shipping",
  "purchase-by-vendor": "analytics",
  "stock-movement": "monitoring",
  "stock-issues": "inventory_2",
};

export function ReportWorkspace({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setCollapsed(localStorage.getItem(STORAGE_KEY) === "true"));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMobileOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const activeReport = useMemo(
    () => AVAILABLE_REPORT_CATALOG.find((report) => report.href === pathname) ?? AVAILABLE_REPORT_CATALOG[0],
    [pathname],
  );

  const toggleCollapsed = () => setCollapsed((current) => {
    const next = !current;
    localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  });

  const reportLinks = (mobile = false) => (
    <nav aria-label="เลือกรายงาน" className={mobile ? styles.mobileList : styles.reportList}>
      {(Object.keys(REPORT_CATEGORY_META) as Array<keyof typeof REPORT_CATEGORY_META>).map((category) => {
        const reports = AVAILABLE_REPORT_CATALOG.filter((report) => report.category === category);
        if (!reports.length) return null;
        return <section className={styles.reportGroup} key={category}>
          {!collapsed || mobile ? <h2>{REPORT_CATEGORY_META[category].label}</h2> : null}
          {reports.map((report) => {
            const active = report.href === pathname;
            return <Link
              aria-current={active ? "page" : undefined}
              className={active ? styles.activeReport : styles.reportLink}
              href={report.href}
              key={report.id}
              onClick={() => mobile && setMobileOpen(false)}
              title={collapsed && !mobile ? report.name : undefined}
            >
              <span aria-hidden="true" className="material-symbols-outlined">{REPORT_ICONS[report.id] ?? "description"}</span>
              {!collapsed || mobile ? <span>{report.name}</span> : null}
              {mobile && active ? <span aria-label="รายงานที่เลือก" className={`material-symbols-outlined ${styles.checked}`}>check_circle</span> : null}
            </Link>;
          })}
        </section>;
      })}
    </nav>
  );

  return <div className={`${styles.workspace} ${collapsed ? `${styles.collapsed} report-workspace-collapsed` : ""}`} data-report-workspace>
    <aside className={styles.rail} data-testid="report-rail">
      <header className={styles.railHeader}>
        {!collapsed ? <strong>รายงาน</strong> : <span className="material-symbols-outlined" aria-hidden="true">assessment</span>}
        <button aria-expanded={!collapsed} aria-label={collapsed ? "เปิดเมนูรายงาน" : "ปิดเมนูรายงาน"} onClick={toggleCollapsed} type="button">
          <span aria-hidden="true" className="material-symbols-outlined">{collapsed ? "chevron_right" : "chevron_left"}</span>
        </button>
      </header>
      {reportLinks()}
    </aside>

    <button aria-expanded={mobileOpen} className={styles.mobileSwitcher} onClick={() => setMobileOpen(true)} type="button">
      <span aria-hidden="true" className="material-symbols-outlined">{REPORT_ICONS[activeReport?.id ?? ""] ?? "description"}</span>
      <span><small>รายงาน</small><strong>{activeReport?.name ?? "เลือกรายงาน"}</strong></span>
      <span aria-hidden="true" className="material-symbols-outlined">expand_more</span>
    </button>

    <main className={styles.content}>{children}</main>

    {mobileOpen ? <div className={styles.mobileOverlay} onMouseDown={(event) => event.target === event.currentTarget && setMobileOpen(false)}>
      <section aria-label="เลือกรายงาน" aria-modal="true" className={styles.mobileSheet} role="dialog">
        <i aria-hidden="true" className={styles.handle} />
        <header><h2>เลือกรายงาน</h2><button aria-label="ปิด" onClick={() => setMobileOpen(false)} type="button"><span className="material-symbols-outlined">close</span></button></header>
        {reportLinks(true)}
      </section>
    </div> : null}
  </div>;
}
