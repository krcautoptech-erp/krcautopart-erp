"use client";

import "./stock-count.css";
import "./stock-count-mobile.css";
import "./stock-count-visual.css";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardCheck,
  Printer,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveStockCountAction,
  cancelStockCountAction,
  getStockCountDetailAction,
  returnStockCountAction,
  saveStockCountEntriesAction,
  startStockCountAction,
  submitStockCountAction,
  type StockCountDetail,
} from "@/app/actions/stock-counts";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { useHasPermission } from "@/components/permission-context";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { printElement } from "@/lib/document-print";
import {
  stockCountDifference,
  stockCountStatusLabel,
  validateStockCountReview,
} from "@/lib/stock-counts";

type Entry = { value: string; reason: string };
const qty = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("th-TH", { maximumFractionDigits: 4 });
const statusTone: Record<StockCountDetail["header"]["status"], StatusTone> = {
  draft: "neutral",
  counting: "info",
  review: "pending",
  recount: "danger",
  approved: "success",
  cancelled: "danger",
};

export function StockCountWorkspace({
  documentContext,
  initialDetail,
}: {
  documentContext: CompanyDocumentContext;
  initialDetail: StockCountDetail;
}) {
  const router = useRouter();
  const canCount = useHasPermission("stock_count.count");
  const canReview = useHasPermission("stock_count.review");
  const canApprove = useHasPermission("stock_count.approve");
  const canCancel = useHasPermission("stock_count.create");
  const canExport = useHasPermission("stock_count.export");
  const [pending, startTransition] = useTransition();
  const printRootRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState(initialDetail);
  const [tab, setTab] = useState<"count" | "review" | "general" | "history">(
    detail.header.status === "review" || detail.header.status === "approved"
      ? "review"
      : "count",
  );
  const [query, setQuery] = useState("");
  const [mobileIndex, setMobileIndex] = useState(0);
  const [mobileLotIndex, setMobileLotIndex] = useState(0);
  const [dialog, setDialog] = useState<
    null | "submit" | "return" | "approve" | "cancel"
  >(null);
  const [dialogReason, setDialogReason] = useState("");
  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      detail.items.flatMap((item) =>
        item.lots.map((lot) => [
          lot.id,
          {
            value: lot.countedQty === null ? "" : String(lot.countedQty),
            reason: lot.reason,
          },
        ]),
      ),
    ),
  );
  const [original, setOriginal] = useState(() => JSON.stringify(entries));
  const editable = detail.header.status === "counting" && canCount;
  const visibleItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("th");
    return detail.items.filter(
      (item) =>
        !value ||
        `${item.itemCode} ${item.itemName} ${item.lots.map((lot) => lot.lotNumber).join(" ")}`
          .toLocaleLowerCase("th")
          .includes(value),
    );
  }, [detail.items, query]);
  const currentItem =
    visibleItems[Math.min(mobileIndex, Math.max(0, visibleItems.length - 1))];
  const currentLot = currentItem?.lots[
    Math.min(mobileLotIndex, Math.max(0, currentItem.lots.length - 1))
  ];
  const flat = detail.items.flatMap((item) =>
    item.lots.map((lot) => ({ ...lot, item })),
  );
  const parsed = flat.map((lot) => ({
    id: lot.id,
    systemQty: lot.systemQty,
    countedQty:
      entries[lot.id]?.value === "" ? null : Number(entries[lot.id]?.value),
    reason: entries[lot.id]?.reason ?? "",
  }));
  const reviewError = validateStockCountReview(parsed);
  const completed = parsed.filter((entry) => entry.countedQty !== null).length;
  const variance = parsed.filter(
    (entry) =>
      entry.countedQty !== null &&
      stockCountDifference(entry.systemQty, entry.countedQty) !== 0,
  );
  const dirty = JSON.stringify(entries) !== original;
  useUnsavedChanges(`stock-count-${detail.header.id}`, dirty);
  const refresh = async () => {
    const result = await getStockCountDetailAction(detail.header.id);
    if ("data" in result && result.data) {
      setDetail(result.data);
      router.refresh();
    }
  };
  const start = () =>
    startTransition(async () => {
      const result = await startStockCountAction(detail.header.id);
      if (!("success" in result)) {
        toast.error(result.error);
        return;
      }
      await refresh();
      toast.success("เริ่มรอบตรวจนับแล้ว");
    });
  const save = (thenSubmit = false) =>
    startTransition(async () => {
      const invalid = parsed.find(
        (entry) =>
          entry.countedQty !== null &&
          (!Number.isFinite(entry.countedQty) ||
            entry.countedQty < 0 ||
            Number(entry.countedQty.toFixed(4)) !== entry.countedQty),
      );
      if (invalid) {
        toast.error(
          "จำนวนตรวจนับต้องไม่น้อยกว่า 0 และมีทศนิยมไม่เกิน 4 ตำแหน่ง",
        );
        return;
      }
      const saved = JSON.parse(original) as Record<number, Entry>;
      const changed = parsed.filter(
        (entry) =>
          JSON.stringify(entries[entry.id]) !== JSON.stringify(saved[entry.id]),
      );
      if (changed.length) {
        const result = await saveStockCountEntriesAction(
          detail.header.id,
          changed.map((entry) => ({
            id: entry.id,
            countedQty: entry.countedQty,
            reason: entry.reason,
          })),
        );
        if (!("success" in result)) {
          toast.error(result.error);
          return;
        }
        setOriginal(JSON.stringify(entries));
      }
      if (thenSubmit) {
        const submitted = await submitStockCountAction(detail.header.id);
        if (!("success" in submitted)) {
          toast.error(submitted.error);
          return;
        }
        setDialog(null);
        toast.success("ส่งผลตรวจนับให้ผู้ตรวจสอบแล้ว");
      } else toast.success("บันทึกผลตรวจนับแล้ว");
      await refresh();
    });
  const runReasonAction = () =>
    startTransition(async () => {
      const action =
        dialog === "approve"
          ? approveStockCountAction
          : dialog === "return"
            ? returnStockCountAction
            : cancelStockCountAction;
      const result = await action(detail.header.id, dialogReason);
      if (!("success" in result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        dialog === "approve"
          ? `อนุมัติแล้ว${result.adjustmentNumber ? ` · ${result.adjustmentNumber}` : ""}`
          : dialog === "return"
            ? "ส่งกลับตรวจนับแล้ว"
            : "ยกเลิกรอบแล้ว",
      );
      setDialog(null);
      setDialogReason("");
      await refresh();
    });
  const setEntry = (id: number, patch: Partial<Entry>) =>
    setEntries((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  const printBlindCount = async () => {
    if (!printRootRef.current) return;
    await printElement(printRootRef.current, {
      title: detail.header.countNumber,
      paperSize: "A4",
      orientation: "portrait",
      bodyClass: "printing-stock-count",
    });
  };
  return (
    <section className="stock-count-document">
      <header className="stock-count-document-header">
        <div className="stock-count-title-block">
          <div>
            <h1>{detail.header.countNumber}</h1>
            <StatusBadge tone={statusTone[detail.header.status]}>
              {stockCountStatusLabel[detail.header.status]}
            </StatusBadge>
          </div>
          <div className="stock-count-header-progress">
            <div className="stock-count-progress">
              <i
                style={{
                  width: `${flat.length ? (completed / flat.length) * 100 : 0}%`,
                }}
              />
            </div>
            <b>
              {flat.length ? Math.round((completed / flat.length) * 100) : 0}%
            </b>
          </div>
        </div>
        <div className="stock-count-header-actions">
          {canExport && (
            <button
              className="stock-count-secondary"
              onClick={printBlindCount}
            >
              <Printer size={16} />
              พิมพ์ใบตรวจนับ
            </button>
          )}
          <Link
            className="stock-count-secondary"
            href="/inventory/stock-counts"
          >
            <ArrowLeft size={16} />
            กลับ
          </Link>
        </div>
      </header>
      <dl className="stock-count-meta">
        <div>
          <dt>คลังสินค้า</dt>
          <dd>{detail.header.warehouseName}</dd>
        </div>
        <div>
          <dt>วันที่เอกสาร</dt>
          <dd>{formatDisplayDate(detail.header.documentDate)}</dd>
        </div>
        <div>
          <dt>ผู้รับผิดชอบ</dt>
          <dd>{detail.header.assignedToName}</dd>
        </div>
        <div>
          <dt>ขอบเขตรายการ</dt>
          <dd>{detail.header.selectionScope === "selected" ? "เลือกเฉพาะสินค้า" : "สินค้าทั้งหมด"}</dd>
        </div>
        <div>
          <dt>หมายเหตุ</dt>
          <dd>{detail.header.notes || "-"}</dd>
        </div>
      </dl>
      <nav className="stock-count-tabs">
        <button
          className={tab === "count" ? "active" : ""}
          onClick={() => setTab("count")}
        >
          รายการตรวจนับ
        </button>
        <button
          className={tab === "review" ? "active" : ""}
          onClick={() => setTab("review")}
        >
          สรุปผลต่าง <span>{variance.length}</span>
        </button>
        <button
          className={tab === "general" ? "active" : ""}
          onClick={() => setTab("general")}
        >
          ข้อมูลทั่วไป
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          ประวัติ
        </button>
      </nav>
      {tab === "count" ? (
        <>
          <div className="stock-count-toolbar">
            <label className="stock-count-search">
              <Search size={17} />
              <input
                placeholder="ค้นหาสินค้า หรือ Lot..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMobileIndex(0);
                }}
              />
            </label>
            <span>
              {completed}/{flat.length} จุดนับ · เหลือ {flat.length - completed}
            </span>
          </div>
          <div className="stock-count-entry-desktop">
            {visibleItems.map((item) => (
              <section className="stock-count-item-group" key={item.id}>
                <header>
                  <div>
                <ChevronDown size={15} />
                    <strong>{item.itemCode}</strong>
                    <span>{item.itemName}</span>
                  </div>
                  <small>{item.lots.length} Lot</small>
                </header>
                <table className="erp-data-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Lot</th>
                      <th>วันที่รับเข้า</th>
                      <th>วันหมดอายุ</th>
                      <th>จำนวนในระบบ</th>
                      <th>จำนวนที่นับได้ *</th>
                      <th>ผลต่าง</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lots.map((lot, index) => {
                      const value = entries[lot.id]?.value ?? "";
                      const counted = value === "" ? null : Number(value);
                      const diff =
                        counted === null || !Number.isFinite(counted)
                          ? null
                          : stockCountDifference(lot.systemQty, counted);
                      return (
                        <tr key={lot.id}>
                          <td>{index + 1}</td>
                          <td className="font-bold">
                            {lot.lotNumber || "ไม่แยก Lot"}
                          </td>
                          <td>
                            {lot.receivedAt
                              ? formatDisplayDate(lot.receivedAt)
                              : "-"}
                          </td>
                          <td>
                            {lot.expiryDate
                              ? formatDisplayDate(lot.expiryDate)
                              : "-"}
                          </td>
                          <td className="text-right">
                            {qty(lot.systemQty)} {item.unitName}
                          </td>
                          <td>
                            <input
                              aria-label={`ยอดนับจริง ${item.itemCode} ${lot.lotNumber}`}
                              disabled={!editable}
                              min="0"
                              step="0.0001"
                              type="number"
                              value={value}
                              onChange={(event) =>
                                setEntry(lot.id, { value: event.target.value })
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter")
                                  (
                                    event.currentTarget
                                      .closest("tr")
                                      ?.nextElementSibling?.querySelector(
                                        "input",
                                      ) as HTMLInputElement | null
                                  )?.focus();
                              }}
                            />
                          </td>
                          <td
                            className={`text-right font-bold ${diff && diff > 0 ? "text-emerald-700" : diff && diff < 0 ? "text-red-600" : ""}`}
                          >
                            {diff === null
                              ? "—"
                              : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                          </td>
                          <td>
                            <input
                              aria-label={`เหตุผล ${item.itemCode} ${lot.lotNumber}`}
                              disabled={!editable || !diff}
                              maxLength={500}
                              placeholder={diff ? "ระบุเหตุผล..." : "—"}
                              value={entries[lot.id]?.reason ?? ""}
                              onChange={(event) =>
                                setEntry(lot.id, { reason: event.target.value })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
          <div className="stock-count-entry-mobile">
            {currentItem ? (
              <>
                <div className="stock-count-mobile-index">
                  <span>
                    รายการ {Math.min(mobileIndex + 1, visibleItems.length)} /{" "}
                    {visibleItems.length}
                  </span>
                  <strong>{currentItem.itemCode}</strong>
                  <p>{currentItem.itemName}</p>
                </div>
                {currentItem.lots.length > 1 && (
                  <label className="stock-count-mobile-lot-picker">
                    <span>Lot</span>
                    <select
                      value={currentLot?.id ?? ""}
                      onChange={(event) =>
                        setMobileLotIndex(
                          currentItem.lots.findIndex(
                            (lot) => lot.id === Number(event.target.value),
                          ),
                        )
                      }
                    >
                      {currentItem.lots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.lotNumber || "ไม่แยก Lot"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {currentLot && (() => {
                  const lot = currentLot;
                  const value = entries[lot.id]?.value ?? "";
                  const counted = value === "" ? null : Number(value);
                  const diff =
                    counted === null
                      ? null
                      : stockCountDifference(lot.systemQty, counted);
                  return (
                    <article key={lot.id}>
                      <header>
                        <strong>{lot.lotNumber || "ไม่แยก Lot"}</strong>
                        <span>
                          ยอดระบบ {qty(lot.systemQty)} {currentItem.unitName}
                        </span>
                      </header>
                      {lot.expiryDate && (
                        <small>
                          หมดอายุ {formatDisplayDate(lot.expiryDate)}
                        </small>
                      )}
                      <dl className="stock-count-mobile-lot-meta">
                        <div><dt>วันที่รับเข้า</dt><dd>{lot.receivedAt ? formatDisplayDate(lot.receivedAt) : "-"}</dd></div>
                        <div><dt>วันหมดอายุ</dt><dd>{lot.expiryDate ? formatDisplayDate(lot.expiryDate) : "-"}</dd></div>
                        <div><dt>จำนวนในระบบ</dt><dd>{qty(lot.systemQty)} {currentItem.unitName}</dd></div>
                      </dl>
                      <label>
                        <span>ยอดนับจริง</span>
                        <input
                          disabled={!editable}
                          inputMode="decimal"
                          min="0"
                          step="0.0001"
                          type="number"
                          value={value}
                          onChange={(event) =>
                            setEntry(lot.id, { value: event.target.value })
                          }
                        />
                      </label>
                      <div className={diff ? "variance" : ""}>
                        ผลต่าง{" "}
                        <strong>
                          {diff === null
                            ? "—"
                            : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                        </strong>
                      </div>
                      {diff !== null && diff !== 0 && (
                        <label>
                          <span>เหตุผล *</span>
                          <input
                            disabled={!editable}
                            value={entries[lot.id]?.reason ?? ""}
                            onChange={(event) =>
                              setEntry(lot.id, { reason: event.target.value })
                            }
                          />
                        </label>
                      )}
                    </article>
                  );
                })()}
                <footer>
                  <button
                    disabled={mobileIndex === 0}
                    onClick={() => {
                      setMobileIndex((value) => value - 1);
                      setMobileLotIndex(0);
                    }}
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    disabled={mobileIndex >= visibleItems.length - 1}
                    onClick={() => {
                      setMobileIndex((value) => value + 1);
                      setMobileLotIndex(0);
                    }}
                  >
                    รายการถัดไป
                  </button>
                </footer>
              </>
            ) : (
              <p>ไม่พบรายการ</p>
            )}
          </div>
        </>
      ) : tab === "review" ? (
        <StockCountReview detail={detail} entries={entries} />
      ) : tab === "general" ? (
        <StockCountGeneral detail={detail} />
      ) : (
        <StockCountHistory detail={detail} />
      )}
      <footer className="stock-count-sticky-actions">
        <span>
          {dirty
            ? "มีข้อมูลที่ยังไม่บันทึก"
            : `${completed}/${flat.length} จุดนับ · ต่าง ${variance.length}`}
        </span>
        <div>
          {["draft", "recount"].includes(detail.header.status) && canCount && (
            <button
              className="stock-count-primary"
              disabled={pending}
              onClick={start}
            >
              <ClipboardCheck size={17} />
              {detail.header.status === "recount"
                ? "เริ่มตรวจนับใหม่"
                : "เริ่มตรวจนับ"}
            </button>
          )}
          {editable && (
            <>
              <button
                className="stock-count-secondary"
                disabled={pending || !dirty}
                onClick={() => save()}
              >
                <Save size={17} />
                บันทึกทั้งหมด
              </button>
              <button
                className="stock-count-primary"
                disabled={pending || Boolean(reviewError)}
                onClick={() => setDialog("submit")}
              >
                <Check size={17} />
                ส่งตรวจสอบ
              </button>
            </>
          )}
          {detail.header.status === "review" && canReview && (
            <button
              className="stock-count-secondary"
              onClick={() => setDialog("return")}
            >
              <RotateCcw size={17} />
              ส่งกลับตรวจนับ
            </button>
          )}
          {detail.header.status === "review" && canApprove && (
            <button
              className="stock-count-primary"
              onClick={() => setDialog("approve")}
            >
              <Check size={17} />
              อนุมัติและปรับสต็อก
            </button>
          )}
          {!["approved", "cancelled"].includes(detail.header.status) &&
            canCancel && (
              <button
                className="stock-count-danger"
                onClick={() => setDialog("cancel")}
              >
                <X size={17} />
                ยกเลิก
              </button>
            )}
        </div>
      </footer>
      <div className="stock-count-print-root" ref={printRootRef}>
        <BlindCountSheet detail={detail} documentContext={documentContext} />
      </div>
      {dialog && (
        <div className="stock-count-dialog-overlay">
          <section className="stock-count-dialog" role="alertdialog">
            <h2>
              {dialog === "submit"
                ? "ส่งผลตรวจนับให้ผู้ตรวจสอบ?"
                : dialog === "approve"
                  ? "ยืนยันอนุมัติและปรับสต็อก"
                  : dialog === "return"
                    ? "ส่งกลับให้ตรวจนับใหม่"
                    : "ยกเลิกรอบตรวจนับ"}
            </h2>
            <p>
              {dialog === "submit"
                ? `ตรวจครบ ${completed} จุดนับ และพบผลต่าง ${variance.length} จุด`
                : dialog === "approve"
                  ? `ระบบจะสร้างใบปรับปรุงจากผลต่าง ${variance.length} จุด และบันทึก Audit Log`
                  : "ระบุเหตุผลเพื่อเก็บในประวัติเอกสาร"}
            </p>
            {dialog !== "submit" && (
              <textarea
                autoFocus
                maxLength={500}
                placeholder="ระบุเหตุผล..."
                value={dialogReason}
                onChange={(event) => setDialogReason(event.target.value)}
              />
            )}
            <footer>
              <button
                className="stock-count-secondary"
                onClick={() => setDialog(null)}
              >
                ปิด
              </button>
              <button
                className="stock-count-primary"
                disabled={
                  pending || (dialog !== "submit" && !dialogReason.trim())
                }
                onClick={() =>
                  dialog === "submit" ? save(true) : runReasonAction()
                }
              >
                {pending ? "กำลังดำเนินการ..." : "ยืนยัน"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function StockCountReview({
  detail,
  entries,
}: {
  detail: StockCountDetail;
  entries: Record<number, Entry>;
}) {
  const rows = detail.items
    .flatMap((item) =>
      item.lots.map((lot) => {
        const counted =
          entries[lot.id]?.value === ""
            ? lot.countedQty
            : Number(entries[lot.id]?.value);
        const difference =
          counted === null
            ? null
            : stockCountDifference(lot.systemQty, counted);
        return {
          item,
          lot,
          counted,
          difference,
          reason: entries[lot.id]?.reason || lot.reason,
        };
      }),
    )
    .filter((row) => row.counted !== null && row.difference !== 0);
  return (
    <div className="stock-count-review">
      <div className="stock-count-table-wrap">
        <table className="erp-data-table min-w-[900px]">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>Lot</th>
              <th>ยอดระบบ</th>
              <th>ยอดนับจริง</th>
              <th>ผลต่าง</th>
              <th>หน่วย</th>
              <th>เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, lot, counted, difference, reason }) => (
              <tr key={lot.id}>
                <td>
                  <strong>{item.itemCode}</strong>
                  <small>{item.itemName}</small>
                </td>
                <td>{lot.lotNumber || "ไม่แยก Lot"}</td>
                <td className="text-right">{qty(lot.systemQty)}</td>
                <td className="text-right">{qty(counted)}</td>
                <td
                  className={`text-right font-bold ${(difference ?? 0) > 0 ? "text-emerald-700" : "text-red-600"}`}
                >
                  {(difference ?? 0) > 0 ? "+" : ""}
                  {qty(difference)}
                </td>
                <td>{item.unitName}</td>
                <td>
                  {reason || <span className="text-red-600">ยังไม่ระบุ</span>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="h-28 text-center text-secondary">
                  ไม่พบผลต่าง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detail.header.returnReason && (
        <p className="stock-count-notice">
          เหตุผลที่ส่งกลับ: {detail.header.returnReason}
        </p>
      )}
      {detail.header.approvalReason && (
        <p className="stock-count-notice success">
          อนุมัติ: {detail.header.approvalReason}
        </p>
      )}
    </div>
  );
}

function StockCountGeneral({ detail }: { detail: StockCountDetail }) {
  return (
    <dl className="stock-count-general">
      <div>
        <dt>เลขที่รอบตรวจนับ</dt>
        <dd>{detail.header.countNumber}</dd>
      </div>
      <div>
        <dt>สถานะ</dt>
        <dd>{stockCountStatusLabel[detail.header.status]}</dd>
      </div>
      <div>
        <dt>คลังสินค้า</dt>
        <dd>{detail.header.warehouseName}</dd>
      </div>
      <div>
        <dt>วันที่เอกสาร</dt>
        <dd>{formatDisplayDate(detail.header.documentDate)}</dd>
      </div>
      <div>
        <dt>จุดตัดยอด</dt>
        <dd>{new Date(detail.header.snapshotAt).toLocaleString("th-TH")}</dd>
      </div>
      <div>
        <dt>ผู้รับผิดชอบ</dt>
        <dd>{detail.header.assignedToName}</dd>
      </div>
      <div>
        <dt>ผู้สร้าง</dt>
        <dd>{detail.header.createdByName}</dd>
      </div>
      <div>
        <dt>หมายเหตุ</dt>
        <dd>{detail.header.notes || "-"}</dd>
      </div>
    </dl>
  );
}

function StockCountHistory({ detail }: { detail: StockCountDetail }) {
  const events = [
    {
      label: "สร้างรอบตรวจนับ",
      actor: detail.header.createdByName,
      at: detail.header.createdAt,
    },
    ...(detail.header.returnReason
      ? [
          {
            label: `ส่งกลับตรวจนับ: ${detail.header.returnReason}`,
            actor: "ผู้ตรวจสอบ",
            at: "",
          },
        ]
      : []),
    ...(detail.header.approvalReason
      ? [
          {
            label: `อนุมัติ: ${detail.header.approvalReason}`,
            actor: "ผู้อนุมัติ",
            at: "",
          },
        ]
      : []),
  ];
  return (
    <ol className="stock-count-history">
      {events.map((event, index) => (
        <li key={`${event.label}-${index}`}>
          <span>{index + 1}</span>
          <div>
            <strong>{event.label}</strong>
            <p>
              {event.actor}
              {event.at
                ? ` · ${new Date(event.at).toLocaleString("th-TH")}`
                : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BlindCountSheet({
  detail,
  documentContext,
}: {
  detail: StockCountDetail;
  documentContext: CompanyDocumentContext;
}) {
  const rows = detail.items.flatMap((item) =>
    item.lots.map((lot, lotIndex) => ({ item, lot, lotIndex })),
  );
  const rowsPerPage = 12;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) },
    (_, pageIndex) =>
      rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage),
  );

  return (
    <>
      {pages.map((pageRows, pageIndex) => (
        <article className="stock-count-sheet" key={pageIndex}>
          <CompanyDocumentHeader
            context={documentContext}
            priority={pageIndex === 0}
          />
          <section className="stock-count-sheet-heading">
            <div aria-hidden="true" />
            <h1>ใบตรวจนับสต็อกจริง (BLIND COUNT)</h1>
            <dl>
              <div><dt>เลขที่ :</dt><dd>{detail.header.countNumber}</dd></div>
              <div><dt>วันที่ :</dt><dd>{formatDisplayDate(detail.header.documentDate)}</dd></div>
            </dl>
          </section>
          <dl className="stock-count-sheet-meta">
            <div><dt>คลังสินค้า</dt><dd>{detail.header.warehouseName}</dd></div>
            <div><dt>วันที่ตรวจนับ</dt><dd>{formatDisplayDate(detail.header.documentDate)}</dd></div>
            <div><dt>ผู้ตรวจนับ</dt><dd>{detail.header.assignedToName}</dd></div>
            <div><dt>จุดตัดยอด</dt><dd>{new Date(detail.header.snapshotAt).toLocaleString("th-TH")}</dd></div>
          </dl>
          <div className="stock-count-sheet-table-wrap">
            <table>
              <colgroup>
                <col className="stock-count-sheet-col-no" />
                <col className="stock-count-sheet-col-item" />
                <col className="stock-count-sheet-col-lot" />
                <col className="stock-count-sheet-col-expiry" />
                <col className="stock-count-sheet-col-unit" />
                <col className="stock-count-sheet-col-count" />
                <col className="stock-count-sheet-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>รหัส / ชื่อสินค้า</th><th>Lot</th>
                  <th>วันหมดอายุ</th><th>หน่วย</th><th>ยอดนับจริง</th><th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ item, lot, lotIndex }) => (
                  <tr key={lot.id}>
                    <td>{lotIndex ? "" : item.lineNo}</td>
                    <td><b>{item.itemCode}</b><span className="stock-count-sheet-item-name">{item.itemName}</span></td>
                    <td>{lot.lotNumber || "—"}</td>
                    <td>{lot.expiryDate ? formatDisplayDate(lot.expiryDate) : "—"}</td>
                    <td>{item.unitName}</td><td></td><td></td>
                  </tr>
                ))}
                {Array.from({ length: rowsPerPage - pageRows.length }, (_, index) => (
                  <tr aria-hidden="true" key={`blank-${index}`}><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="stock-count-sheet-signatures" data-keep-together="true">
            <div><strong>ผู้ตรวจนับ</strong><span></span><small>วันที่ ____/____/________</small></div>
            <div><strong>ผู้ทวนสอบ</strong><span></span><small>วันที่ ____/____/________</small></div>
          </section>
          <CompanyDocumentFooter
            context={documentContext}
            currentPage={pageIndex + 1}
            placement="page"
            printedBy={detail.header.createdByName}
            totalPages={pages.length}
          />
        </article>
      ))}
    </>
  );
}
