"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { DashboardData } from "@/app/actions/erp-dashboard";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import styles from "./erp-dashboard.module.css";

const money = (value: number) =>
  `฿ ${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
const qty = (value: number) =>
  value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "-";
const dateTime = (value: string) =>
  value
    ? new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "-";
const stateLabel = {
  not_received: "ยังไม่รับ",
  partial: "รับบางส่วน",
  received: "รับครบ",
  overdue: "เกินกำหนด",
} as const;
const statusLabel: Record<string, string> = {
  draft: "รอดำเนินการ",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "รอรับสินค้า",
  partially_received: "รับบางส่วน",
  counting: "กำลังตรวจนับ",
  review: "รอตรวจสอบ",
  recount: "ตรวจนับใหม่",
};
const fulfillmentStatusTone = {
  not_received: "danger",
  partial: "pending",
  received: "success",
  overdue: "danger",
} satisfies Record<keyof typeof stateLabel, StatusTone>;
const workStatusTone: Record<string, StatusTone> = {
  draft: "neutral",
  pending_approval: "pending",
  approved: "success",
  sent: "pending",
  partially_received: "pending",
  counting: "info",
  review: "pending",
  recount: "danger",
};

function SectionTitle({
  children,
  href,
}: {
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className={styles.sectionTitle}>
      <h2>{children}</h2>
      {href ? (
        <Link href={href}>
          ดูทั้งหมด <span>›</span>
        </Link>
      ) : null}
    </div>
  );
}

function Empty({
  children = "ยังไม่มีข้อมูลในช่วงที่เลือก",
}: {
  children?: React.ReactNode;
}) {
  return <div className={styles.empty}>{children}</div>;
}

function Bars({ data }: { data: DashboardData["monthly"] }) {
  const max = Math.max(1, ...data.flatMap((item) => [item.po, item.received]));
  const compact = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
        ? `${Math.round(value / 1_000)}K`
        : value.toLocaleString("th-TH");
  return (
    <div className={styles.barChart}>
      <div className={styles.axisLabels}>
        {[1, 0.75, 0.5, 0.25, 0].map((step) => (
          <span key={step}>{compact(max * step)}</span>
        ))}
      </div>
      <div className={styles.barGrid}>
        {data.map((item) => (
          <div className={styles.barGroup} key={item.key}>
            <div className={styles.bars}>
              <div className={styles.barItem}>
                <span>{compact(item.po)}</span>
                <i
                  className={styles.poBar}
                  style={{ height: `${Math.max(2, (item.po / max) * 100)}%` }}
                  title={money(item.po)}
                />
              </div>
              <div className={styles.barItem}>
                <span>{compact(item.received)}</span>
                <i
                  className={styles.grBar}
                  style={{
                    height: `${Math.max(2, (item.received / max) * 100)}%`,
                  }}
                  title={money(item.received)}
                />
              </div>
            </div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MovementChart({ data }: { data: DashboardData["monthly"] }) {
  const rawMax = Math.max(
    1,
    ...data.flatMap((item) => [item.receipts, item.issues, item.adjustments]),
  );
  const max = Math.ceil(rawMax / 4) * 4;
  const width = 600;
  const height = 188;
  const left = 48;
  const right = 12;
  const top = 18;
  const bottom = 28;
  const x = (index: number) =>
    left + index * ((width - left - right) / Math.max(1, data.length - 1));
  const y = (value: number) =>
    top + (1 - value / max) * (height - top - bottom);
  const points = (key: "receipts" | "issues" | "adjustments") =>
    data.map((item, index) => `${x(index)},${y(item[key])}`).join(" ");
  return (
    <div className={styles.movementChart}>
      <svg
        aria-label="กราฟการเคลื่อนไหวสต็อก"
        className={styles.lineChart}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const lineY = top + step * (height - top - bottom);
          return (
            <g key={step}>
              <line
                className={styles.chartLine}
                x1={left}
                x2={width - right}
                y1={lineY}
                y2={lineY}
              />
              <text
                className={styles.axisText}
                textAnchor="end"
                x={left - 8}
                y={lineY + 3}
              >
                {qty(max * (1 - step))}
              </text>
            </g>
          );
        })}
        <line
          className={styles.axisLine}
          x1={left}
          x2={left}
          y1={top}
          y2={height - bottom}
        />
        <polyline className={styles.receiptPath} points={points("receipts")} />
        <polyline className={styles.issuePath} points={points("issues")} />
        <polyline
          className={styles.adjustPath}
          points={points("adjustments")}
        />
        {data.map((item, index) => (
          <g key={item.key}>
            <text
              className={styles.pointLabel}
              textAnchor="middle"
              x={x(index)}
              y={Math.max(11, y(item.receipts) - 8)}
            >
              {qty(item.receipts)}
            </text>
            <circle
              className={styles.receiptPoint}
              cx={x(index)}
              cy={y(item.receipts)}
              r="4"
            />
            <rect
              className={styles.issuePoint}
              height="7"
              width="7"
              x={x(index) - 3.5}
              y={y(item.issues) - 3.5}
            />
            {item.issues > 0 ? (
              <text
                className={styles.issueValue}
                textAnchor="middle"
                x={x(index)}
                y={Math.max(11, y(item.issues) - 8)}
              >
                {qty(item.issues)}
              </text>
            ) : null}
            <path
              className={styles.adjustPoint}
              d={`M ${x(index)} ${y(item.adjustments) - 5} l 5 9 h -10 z`}
            />
            {item.adjustments > 0 ? (
              <text
                className={styles.adjustValue}
                textAnchor="middle"
                x={x(index)}
                y={Math.max(11, y(item.adjustments) - 8)}
              >
                {qty(item.adjustments)}
              </text>
            ) : null}
            <text
              className={styles.monthLabel}
              textAnchor="middle"
              x={x(index)}
              y={height - 6}
            >
              {item.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ErpDashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [isDatePending, startDateTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(data.asOf);
  const [workTab, setWorkTab] = useState("all");
  const visibleWork = useMemo(
    () =>
      workTab === "all"
        ? data.work
        : data.work.filter((item) => item.tab === workTab),
    [data.work, workTab],
  );
  const kpis = [
    {
      label: "มูลค่า PO เดือนนี้",
      value: money(data.kpis.poValue),
      icon: "description",
      tone: "red",
      permission: "purchase" as const,
    },
    {
      label: "มูลค่ารับเข้าเดือนนี้",
      value: money(data.kpis.receivedValue),
      icon: "local_shipping",
      tone: "red",
      permission: "inventory" as const,
    },
    {
      label: "มูลค่าค้างรับ",
      value: money(data.kpis.pendingValue),
      icon: "pending_actions",
      tone: "red",
      permission: "purchase" as const,
    },
    {
      label: "อัตรารับครบ",
      value: `${data.kpis.receivedRate}%`,
      icon: "check_circle",
      tone: "green",
      permission: "purchase" as const,
    },
    {
      label: "อัตราส่งตรงเวลา",
      value: `${data.kpis.onTimeRate}%`,
      icon: "local_shipping",
      tone: "red",
      permission: "purchase" as const,
    },
    {
      label: data.asOf === data.today ? "สต็อกต่ำ" : "สต็อกต่ำ (ปัจจุบัน)",
      value: `${data.kpis.lowStock} รายการ`,
      icon: "warning",
      tone: "red",
      permission: "inventory" as const,
    },
  ].filter((item) => data.permissions[item.permission]);
  const fulfillmentTotal = Math.max(
    1,
    Object.values(data.fulfillmentCounts).reduce(
      (sum, value) => sum + value,
      0,
    ),
  );
  const fulfillmentCards = (
    ["not_received", "partial", "received", "overdue"] as const
  ).map((state) => ({
    state,
    count: data.fulfillmentCounts[state],
    percent: Math.round(
      (data.fulfillmentCounts[state] / fulfillmentTotal) * 100,
    ),
  }));
  const workTabs = [
    { key: "all", label: "ทั้งหมด" },
    ...(data.permissions.purchase
      ? [
          { key: "pr", label: "ขอซื้อ (PR)" },
          { key: "po", label: "สั่งซื้อ (PO)" },
        ]
      : []),
    ...(data.permissions.count ? [{ key: "count", label: "ตรวจนับ" }] : []),
    ...(data.permissions.issue ? [{ key: "issue", label: "เบิกใช้" }] : []),
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHeader}>
        <div>
          <h1>ภาพรวมระบบ ERP</h1>
          <p>สรุปภาพรวมการจัดซื้อ คลังสินค้า และการตรวจนับสต็อก</p>
        </div>
        <div className={styles.filters}>
          <label>
            บทบาท
            <select aria-label="บทบาท" defaultValue="current">
              <option value="current">{data.roleName}</option>
            </select>
          </label>
          <label>
            ช่วงข้อมูล
            <select aria-label="ช่วงข้อมูล" defaultValue="month">
              <option value="month">เดือนนี้</option>
            </select>
          </label>
          <label>
            คลังสินค้า
            <select aria-label="คลังสินค้า" defaultValue="all">
              <option value="all">ทุกคลัง</option>
            </select>
          </label>
          <label>
            ข้อมูล ณ วันที่
            <input
              aria-label="ข้อมูล ณ วันที่"
              aria-busy={isDatePending}
              max={data.today}
              onInput={(event) => {
                const nextDate = event.currentTarget.value;
                setSelectedDate(nextDate);
                if (nextDate)
                  startDateTransition(() =>
                    router.replace(`/workspace?asOf=${nextDate}`),
                  );
              }}
              type="date"
              value={selectedDate}
            />
          </label>
        </div>
      </header>

      <section className={styles.kpiGrid} aria-label="ตัวชี้วัดสำคัญ">
        {kpis.map((item, index) => (
          <article className={styles.kpi} key={item.label}>
            <span className={`${styles.kpiIcon} ${styles[item.tone]}`}>
              <span className="material-symbols-outlined">{item.icon}</span>
            </span>
            <div>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </div>
            <small
              className={
                index === 2 || index === 5 ? styles.badTrend : styles.goodTrend
              }
            >
              <span>↑</span> จากเดือนก่อน
            </small>
          </article>
        ))}
      </section>

      <div
        className={`${styles.chartGrid} ${!data.permissions.purchase || !data.permissions.inventory ? styles.singleChart : ""}`}
      >
        {data.permissions.purchase ? (
          <section className={styles.panel}>
            <SectionTitle>PO เทียบรับของจริงรายเดือน</SectionTitle>
            <p className={styles.unit}>มูลค่า (บาท)</p>
            <Bars data={data.monthly} />
            <div className={styles.legend}>
              <span>
                <i className={styles.poLegend} />
                มูลค่า PO (บาท)
              </span>
              <span>
                <i className={styles.grLegend} />
                มูลค่ารับของจริง (บาท)
              </span>
            </div>
          </section>
        ) : null}
        {data.permissions.inventory ? (
          <section className={styles.panel}>
            <SectionTitle>การเคลื่อนไหวสต็อก</SectionTitle>
            <p className={styles.unit}>จำนวนเอกสาร</p>
            <MovementChart data={data.monthly} />
            <div className={styles.legend}>
              <span>
                <i className={styles.receiptLegend} />
                รับเข้า (GR)
              </span>
              <span>
                <i className={styles.issueLegend} />
                เบิกใช้ (Issue)
              </span>
              <span>
                <i className={styles.adjustLegend} />
                ปรับปรุงสต็อก
              </span>
            </div>
          </section>
        ) : null}
      </div>

      {data.permissions.purchase ? (
        <section className={styles.panel}>
          <SectionTitle>สถานะการรับสินค้าตาม PO</SectionTitle>
          <div className={styles.fulfillmentCards}>
            {fulfillmentCards.map(({ state, count, percent }) => (
              <article key={state}>
                <span className={`${styles.roundIcon} ${styles[state]}`}>
                  <span className="material-symbols-outlined">
                    {state === "received"
                      ? "check"
                      : state === "overdue"
                        ? "warning"
                        : state === "partial"
                          ? "pending_actions"
                          : "description"}
                  </span>
                </span>
                <div>
                  <p>{stateLabel[state]}</p>
                  <strong>
                    {count} <small>รายการ ({percent}%)</small>
                  </strong>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.stackBar}>
            {fulfillmentCards.map(({ state, percent }) =>
              percent > 0 ? (
                <span
                  className={styles[state]}
                  key={state}
                  style={{ width: `${percent}%` }}
                >
                  {percent}%
                </span>
              ) : null,
            )}
          </div>
          <div className={`${styles.tableScroll} ${styles.desktopTable}`}>
            <table className={`${styles.dataTable} ${styles.fulfillmentTable}`}>
              <thead>
                <tr>
                  <th>เลขที่ PO</th>
                  <th>ผู้ขาย</th>
                  <th>กำหนดส่ง</th>
                  <th>จำนวนสั่ง</th>
                  <th>รับแล้ว</th>
                  <th>คงเหลือ</th>
                  <th>% รับครบ</th>
                  <th>สถานะ</th>
                  <th>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {data.fulfillment.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className={styles.documentNo} href="/purchase/po">
                        {item.number}
                      </Link>
                    </td>
                    <td>{item.vendor}</td>
                    <td
                      className={
                        item.state === "overdue" ? styles.dangerText : ""
                      }
                    >
                      {date(item.deliveryDate)}
                    </td>
                    <td className={styles.number}>{qty(item.ordered)}</td>
                    <td className={styles.number}>{qty(item.received)}</td>
                    <td className={styles.number}>{qty(item.pending)}</td>
                    <td
                      className={
                        item.rate === 100
                          ? styles.successText
                          : styles.dangerText
                      }
                    >
                      {item.rate}%
                    </td>
                    <td className={styles.statusCell}>
                      <StatusBadge tone={fulfillmentStatusTone[item.state]}>
                        {stateLabel[item.state]}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Link href="/reports/purchase/pending-receipts">
                          ดูรายละเอียด
                        </Link>
                        {item.state !== "received" ? (
                          <Link
                            className={styles.primaryAction}
                            href="/purchase/receipts"
                          >
                            รับสินค้า
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.fulfillment.length ? (
                  <tr>
                    <td colSpan={9}>
                      <Empty />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div
            aria-label="รายการสถานะการรับสินค้าบนมือถือ"
            className={styles.mobileList}
          >
            {data.fulfillment.map((item) => (
              <article className={styles.mobileCard} key={item.id}>
                <header>
                  <Link className={styles.documentNo} href="/purchase/po">
                    {item.number}
                  </Link>
                  <StatusBadge tone={fulfillmentStatusTone[item.state]}>
                    {stateLabel[item.state]}
                  </StatusBadge>
                </header>
                <p>{item.vendor}</p>
                <dl className={styles.mobileMetrics}>
                  <div>
                    <dt>กำหนดส่ง</dt>
                    <dd className={item.state === "overdue" ? styles.dangerText : ""}>
                      {date(item.deliveryDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>สั่ง / รับ</dt>
                    <dd>{qty(item.ordered)} / {qty(item.received)}</dd>
                  </div>
                  <div>
                    <dt>คงเหลือ</dt>
                    <dd>{qty(item.pending)} ({item.rate}%)</dd>
                  </div>
                </dl>
                <div className={styles.mobileActions}>
                  <Link href="/reports/purchase/pending-receipts">ดูรายละเอียด</Link>
                  {item.state !== "received" ? (
                    <Link className={styles.primaryAction} href="/purchase/receipts">
                      รับสินค้า
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
            {!data.fulfillment.length ? <Empty /> : null}
          </div>
          <div className={styles.controlNote}>
            <span className="material-symbols-outlined">info</span>{" "}
            ระบบไม่อนุญาตให้รับสินค้าเกินจำนวน PO{" "}
            <Link href="/reports/purchase/pending-receipts">
              ดูรายการ PO ทั้งหมด ›
            </Link>
          </div>
        </section>
      ) : null}

      <div className={styles.tripleGrid}>
        {data.permissions.inventory ? (
          <section className={styles.panel}>
            <SectionTitle href="/inventory/stock">
              {data.asOf === data.today
                ? "สินค้าสต็อกต่ำ"
                : "สินค้าสต็อกต่ำ (ยอดปัจจุบัน)"}
            </SectionTitle>
            <div className={styles.miniTable}>
              <div className={styles.miniHead}>
                <span>รหัสสินค้า</span>
                <span>ชื่อสินค้า</span>
                <span>คงเหลือ</span>
                <span>ขั้นต่ำ</span>
              </div>
              {data.lowStock.map((item) => (
                <div className={styles.miniRow} key={item.code}>
                  <b>{item.code}</b>
                  <span title={item.name}>{item.name}</span>
                  <strong className={styles.dangerText}>
                    {qty(item.available)}
                  </strong>
                  <span>
                    {qty(item.reorderPoint)} {item.unit}
                  </span>
                </div>
              ))}
              {!data.lowStock.length ? <Empty /> : null}
            </div>
          </section>
        ) : null}
        {data.permissions.count ? (
          <section className={styles.panel}>
            <SectionTitle href="/inventory/stock-counts">
              ผลต่างตรวจนับล่าสุด
            </SectionTitle>
            <div className={styles.miniTable}>
              <div className={styles.miniHead}>
                <span>รหัสสินค้า</span>
                <span>Lot No.</span>
                <span>ผลต่าง</span>
                <span>สถานะ</span>
              </div>
              {data.variances.map((item, index) => (
                <div
                  className={styles.miniRow}
                  key={`${item.code}-${item.lot}-${index}`}
                >
                  <b>{item.code}</b>
                  <span>{item.lot}</span>
                  <strong
                    className={
                      item.difference < 0
                        ? styles.dangerText
                        : styles.successText
                    }
                  >
                    {item.difference > 0 ? "+" : ""}
                    {qty(item.difference)}
                  </strong>
                  <StatusBadge
                    tone={item.state === "short" ? "danger" : "success"}
                  >
                    {item.state === "short" ? "ขาด" : "เกิน"}
                  </StatusBadge>
                </div>
              ))}
              {!data.variances.length ? (
                <Empty>ไม่พบผลต่างที่รอตรวจสอบ</Empty>
              ) : null}
            </div>
          </section>
        ) : null}
        {data.permissions.approvePurchase ? (
          <section className={styles.panel}>
            <SectionTitle>เอกสารรออนุมัติ</SectionTitle>
            <div className={styles.miniTable}>
              <div className={styles.miniHead}>
                <span>เลขที่เอกสาร</span>
                <span>ประเภท</span>
                <span>จำนวน</span>
                <span>วันขออนุมัติ</span>
              </div>
              {data.approvals.map((item) => (
                <Link
                  className={styles.miniRow}
                  href={item.href}
                  key={item.number}
                >
                  <b className={styles.documentNo}>{item.number}</b>
                  <span>{item.type}</span>
                  <span>{item.count}</span>
                  <span>{date(item.date)}</span>
                </Link>
              ))}
              {!data.approvals.length ? (
                <Empty>ไม่มีเอกสารรออนุมัติ</Empty>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <section className={styles.panel}>
        <SectionTitle>งานที่ต้องทำ</SectionTitle>
        <div className={styles.tabs}>
          {workTabs.map((tab) => (
            <button
              className={workTab === tab.key ? styles.activeTab : ""}
              key={tab.key}
              onClick={() => setWorkTab(tab.key)}
              type="button"
            >
              {tab.label} (
              {tab.key === "all"
                ? data.work.length
                : data.work.filter((item) => item.tab === tab.key).length}
              )
            </button>
          ))}
        </div>
        <div className={`${styles.tableScroll} ${styles.desktopTable}`}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>เลขที่เอกสาร</th>
                <th>งานที่ต้องทำ</th>
                <th>กำหนดวันที่</th>
                <th>ผู้รับผิดชอบ</th>
                <th>สถานะ</th>
                <th>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {visibleWork.map((item) => (
                <tr key={`${item.type}-${item.number}`}>
                  <td>
                    <b>{item.type}</b>
                  </td>
                  <td>
                    <Link className={styles.documentNo} href={item.href}>
                      {item.number}
                    </Link>
                  </td>
                  <td>{item.task}</td>
                  <td>{date(item.due)}</td>
                  <td>{item.owner || "-"}</td>
                  <td className={styles.statusCell}>
                    <StatusBadge
                      tone={workStatusTone[item.status] ?? "neutral"}
                    >
                      {statusLabel[item.status] ?? item.status}
                    </StatusBadge>
                  </td>
                  <td>
                    <Link className={styles.actionButton} href={item.href}>
                      ดูรายละเอียด
                    </Link>
                  </td>
                </tr>
              ))}
              {!visibleWork.length ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>ไม่มีงานในหมวดนี้</Empty>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div
          aria-label="รายการงานที่ต้องทำบนมือถือ"
          className={styles.mobileList}
        >
          {visibleWork.map((item) => (
            <article className={styles.mobileCard} key={`${item.type}-${item.number}`}>
              <header>
                <div>
                  <small>{item.type}</small>
                  <Link className={styles.documentNo} href={item.href}>
                    {item.number}
                  </Link>
                </div>
                <StatusBadge tone={workStatusTone[item.status] ?? "neutral"}>
                  {statusLabel[item.status] ?? item.status}
                </StatusBadge>
              </header>
              <p>{item.task}</p>
              <dl className={styles.mobileMeta}>
                <div><dt>กำหนดวันที่</dt><dd>{date(item.due)}</dd></div>
                <div><dt>ผู้รับผิดชอบ</dt><dd>{item.owner || "-"}</dd></div>
              </dl>
              <Link className={styles.mobileDetailLink} href={item.href}>
                ดูรายละเอียด <span aria-hidden="true">›</span>
              </Link>
            </article>
          ))}
          {!visibleWork.length ? <Empty>ไม่มีงานในหมวดนี้</Empty> : null}
        </div>
      </section>

      {data.permissions.audit ? (
        <section className={styles.panel}>
          <SectionTitle href="/settings/audit-logs">
            ความเคลื่อนไหวล่าสุด
          </SectionTitle>
          <div className={`${styles.tableScroll} ${styles.desktopTable}`}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>วันที่ เวลา</th>
                  <th>ผู้ใช้งาน</th>
                  <th>การดำเนินการ</th>
                  <th>เลขที่เอกสาร</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((item, index) => (
                  <tr key={`${item.at}-${index}`}>
                    <td>{dateTime(item.at)}</td>
                    <td>{item.actor}</td>
                    <td>{item.action}</td>
                    <td>{item.number || "-"}</td>
                    <td>{item.detail}</td>
                  </tr>
                ))}
                {!data.activity.length ? (
                  <tr>
                    <td colSpan={5}>
                      <Empty />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div
            aria-label="รายการความเคลื่อนไหวล่าสุดบนมือถือ"
            className={styles.mobileList}
          >
            {data.activity.map((item, index) => (
              <article className={styles.mobileCard} key={`${item.at}-${index}`}>
                <header>
                  <strong>{item.action}</strong>
                  <time dateTime={item.at}>{dateTime(item.at)}</time>
                </header>
                <p>{item.detail}</p>
                <div className={styles.activityMeta}>
                  <span>{item.actor}</span>
                  <b>{item.number || "-"}</b>
                </div>
              </article>
            ))}
            {!data.activity.length ? <Empty /> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
