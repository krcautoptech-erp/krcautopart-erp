"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Info, X } from "lucide-react";
import { formatIssueLotNumber, formatIssueQuantity, suggestIssueLots, skipsIssueFifo, type IssueAllocation, type IssueLot } from "@/lib/stock-issues";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { runEnterAction } from "@/components/keyboard-workflow";

type Props = {
  code: string; name: string; quantity: number; unitName: string; lots: IssueLot[];
  allocations?: IssueAllocation[]; reason?: string;
  onClose: () => void;
  onConfirm: (allocations: IssueAllocation[], reason: string, quantity: number) => void;
};

export function LotAllocationDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [requested, setRequested] = useState(String(props.quantity || ""));
  const quantity = Number(requested);
  const suggested = suggestIssueLots(props.lots, quantity);
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries((props.allocations ?? suggested).map((item) => [item.lotId, String(item.quantity)])));
  const [quantityError, setQuantityError] = useState("");
  const stockTotal = props.lots.reduce((sum, lot) => sum + lot.onHandQty, 0);
  const [reason, setReason] = useState(props.reason ?? "");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const allocations = props.lots.flatMap((lot) => Number(amounts[lot.id]) > 0 ? [{ lotId: lot.id, quantity: Number(amounts[lot.id]) }] : []);
  const total = allocations.reduce((sum, item) => sum + item.quantity, 0);
  const override = skipsIssueFifo(props.lots, allocations);
  const valid = Number.isFinite(quantity) && quantity > 0 && Math.abs(total - quantity) < 0.00001 && props.lots.every((lot) => {
    const value = Number(amounts[lot.id] || 0);
    return Number.isFinite(value) && value >= 0 && value <= lot.onHandQty && Math.abs(value * 10000 - Math.round(value * 10000)) < 0.000001;
  }) && (!override || reason.trim().length > 0);
  const confirm = () => props.onConfirm(allocations, override ? reason.trim() : "", quantity);
  return <dialog ref={dialog} className="issue-lot-dialog" aria-labelledby="issue-lot-title" onCancel={(event) => { event.preventDefault(); props.onClose(); }} onKeyDown={(event) => { if (valid) runEnterAction(event, confirm); }}>
    <header><h2 id="issue-lot-title">เลือก Lot – {props.code}</h2><button type="button" aria-label="ปิดหน้าต่างเลือก Lot" onClick={props.onClose}><X size={21} /></button></header>
    <div className="issue-lot-body">
      <dl className="issue-lot-meta"><dt>รหัสสินค้า</dt><dd>{props.code}</dd><dt>สินค้า / รายการ</dt><dd>{props.name}</dd><dt>จำนวนที่ต้องเบิก</dt><dd><input aria-label="จำนวนที่ต้องเบิก" className="issue-requested-quantity" type="number" min="0.0001" step="0.0001" value={requested} onChange={(event) => { if (Number(event.target.value) > stockTotal || Number(event.target.value) < 0) { setQuantityError(`จำนวนเบิกต้องไม่เกินคงเหลือ ${formatIssueQuantity(stockTotal)} ${props.unitName}`); return; } setQuantityError(""); setRequested(event.target.value); setAmounts(Object.fromEntries(suggestIssueLots(props.lots, Number(event.target.value)).map((item) => [item.lotId, String(item.quantity)]))); }} /> <span>{props.unitName}</span></dd><dt>คงเหลือรวม</dt><dd className="issue-lot-green">{formatIssueQuantity(props.lots.reduce((sum, lot) => sum + lot.onHandQty, 0))} <span>{props.unitName}</span></dd></dl>
      <h3><ChevronRight size={18} />รายการ Lot <small>(เรียงตามวันที่รับเข้า · เก่าไปใหม่)</small></h3>
      <div className="issue-lot-head"><span>เลือก</span><span>Lot No.</span><span>วันที่รับเข้า</span><span>คงเหลือ</span><span>จำนวนเบิก</span><span>หน่วย</span><span aria-hidden="true" /></div>
      <div className="issue-lot-rows">{props.lots.map((lot, index) => <div className={`issue-lot-row ${Number(amounts[lot.id]) > 0 ? "is-selected" : ""}`} key={lot.id}>
        <input aria-label={`เลือก ${formatIssueLotNumber(lot.lotNumber)}`} type="checkbox" checked={Number(amounts[lot.id]) > 0} onChange={(event) => setAmounts((current) => ({ ...current, [lot.id]: event.target.checked ? String(Math.min(lot.onHandQty, Math.max(0, quantity - total))) : "0" }))} />
        <strong>{formatIssueLotNumber(lot.lotNumber)}</strong><span>{formatDisplayDate(lot.receivedAt)}</span><span className="issue-lot-green">{formatIssueQuantity(lot.onHandQty)}</span>
        <label className="issue-lot-amount"><span>จำนวนเบิก</span><input aria-label={`จำนวนเบิก ${formatIssueLotNumber(lot.lotNumber)}`} type="number" min="0" max={lot.onHandQty} step="0.0001" value={amounts[lot.id] ?? "0"} onChange={(event) => { const limit = Math.max(0, Math.min(lot.onHandQty, quantity - total + (Number(amounts[lot.id]) || 0))); if (Number(event.target.value) > limit || Number(event.target.value) < 0) { setQuantityError(`Lot ${formatIssueLotNumber(lot.lotNumber)} เบิกได้ไม่เกิน ${formatIssueQuantity(limit)} ${props.unitName} (ไม่เกินยอดคงเหลือและจำนวนที่ต้องเบิก)`); return; } setQuantityError(""); setAmounts((current) => ({ ...current, [lot.id]: event.target.value })); }} /></label><span>{props.unitName}</span>
        {index === 0 ? <span className="issue-lot-badge">แนะนำ FIFO</span> : <span className="issue-lot-badge-empty" />}
      </div>)}</div>
      {props.lots.length === 0 && <p>ไม่พบ Lot คงเหลือ กรุณาโหลดข้อมูลใหม่</p>}
      {quantityError && <p role="alert" className="issue-lot-quantity-error">{quantityError}</p>}
      {Math.abs(total - quantity) > 0.00001 && <p role="status" className="issue-lot-quantity-error">จำนวนที่เลือกจาก Lot ต้องเท่ากับจำนวนที่ต้องเบิก</p>}
      {override && <div className="issue-lot-exception"><p><AlertTriangle size={17} />ข้าม FIFO: Lot เก่าสุดคือ {formatIssueLotNumber(props.lots[0]?.lotNumber ?? "")}</p><label>เหตุผลข้าม FIFO <b>*</b><input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเหตุผลที่เลือก Lot นี้" /></label></div>}
      <p className="issue-lot-total">รวมจำนวนที่เลือก <strong className={valid ? "issue-lot-green" : ""}>{formatIssueQuantity(total)} / {formatIssueQuantity(quantity || 0)}</strong> {props.unitName}</p>
      <p className="issue-lot-note"><Info size={19} />ระบบแนะนำให้ใช้ Lot เก่าที่สุด (FIFO) โปรดยืนยัน Lot ที่หยิบจริง</p>
    </div>
    <footer><button type="button" onClick={props.onClose}>ยกเลิก</button><button type="button" disabled={!valid} onClick={confirm}>ยืนยัน Lot</button></footer>
    <style>{`
      .issue-lot-quantity-error { color: var(--issue-warning-text); background: var(--issue-warning-bg); padding: 8px; margin-top: 8px; font-size: 12px; }
      .issue-lot-row input[type=checkbox] { border-radius: 50%; }
      @media(max-width:639px) { .issue-lot-badge-empty { display: none; } }

      .issue-requested-quantity { width: 100px; border: 1px solid var(--issue-border); border-radius: 3px; padding: 5px 8px; line-height: 1.7; } .issue-lot-dialog input { line-height: 1.7; } .issue-lot-dialog { position: fixed; inset: 0; margin: auto; width: min(620px, calc(100vw - 40px)); max-height: 92dvh; padding: 0; border: 1px solid var(--issue-border); border-radius: 8px; background: var(--surface-container-lowest-color); color: var(--on-surface-color); box-shadow: 0 8px 28px #0003; font-size: 14px; }
      .issue-lot-dialog[open] { display: flex; flex-direction: column; } .issue-lot-dialog::backdrop { background: #0002; }
      .issue-lot-dialog header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--issue-border); } .issue-lot-dialog h2 { font-size: 17px; font-weight: 700; }
      .issue-lot-body { padding: 18px 20px; overflow-y: auto; min-height: 0; } .issue-lot-meta { display: grid; grid-template-columns: 145px minmax(0,1fr); gap: 8px 10px; margin-bottom: 14px; } .issue-lot-meta dd { overflow-wrap: anywhere; } .issue-lot-meta dd > span { margin-left: 16px; color: var(--on-surface-color); }
      .issue-lot-dialog h3 { display: flex; align-items: center; gap: 3px; padding: 9px 5px; background: var(--surface-container-color); font-weight: 700; } .issue-lot-dialog h3 svg { color: var(--issue-accent); flex-shrink: 0; } .issue-lot-dialog small { font-size: 12px; }
      .issue-lot-head,.issue-lot-row { display: grid; grid-template-columns: 24px minmax(96px,1fr) 78px 54px 85px 36px 76px; align-items: center; gap: 7px; padding: 11px 5px; } .issue-lot-head { font-size: 11px; font-weight: 700; background: var(--surface-container-low-color); border: 1px solid var(--issue-border); margin-top: 9px; } .issue-lot-row { border-bottom: 1px solid var(--issue-border); font-size: 12px; } .issue-lot-row strong { overflow-wrap: anywhere; } .issue-lot-row input[type=checkbox] { accent-color: var(--issue-accent); width: 17px; height: 17px; }
      .issue-lot-amount > span { display: none; } .issue-lot-amount input,.issue-lot-exception input { width: 100%; min-width: 0; height: 34px; border: 1px solid var(--issue-border); border-radius: 3px; padding: 0 8px; background: var(--surface-container-lowest-color); } .issue-lot-amount input { text-align: center; } .issue-lot-green { color: var(--issue-success); font-weight: 700; } .issue-lot-badge { justify-self: start; border-radius: 3px; padding: 3px 7px; color: white; background: #009b69; font-size: 11px; }
      .issue-lot-exception { margin-top: 14px; } .issue-lot-exception p { display: flex; align-items: center; gap: 6px; border: 1px solid var(--issue-warning-border); background: var(--issue-warning-bg); padding: 9px; color: var(--issue-warning-text); font-size: 12px; } .issue-lot-exception label { display: block; margin-top: 10px; font-size: 12px; color: var(--issue-accent); } .issue-lot-exception input { display: block; margin-top: 5px; color: var(--on-surface-color); }
      .issue-lot-total { display: flex; justify-content: flex-end; gap: 12px; align-items: baseline; margin: 18px 0; font-size: 12px; } .issue-lot-total strong { font-size: 17px; } .issue-lot-note { display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--issue-info-bg); border: 1px solid var(--issue-info-border); border-radius: 4px; color: var(--issue-info-text); font-size: 12px; } .issue-lot-note svg { flex-shrink: 0; }
      .issue-lot-dialog footer { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px 18px; } .issue-lot-dialog footer button { height: 40px; padding: 0 22px; border: 1px solid var(--issue-border); border-radius: 4px; font-weight: 700; } .issue-lot-dialog footer button:last-child { background: #c8101e; color: white; border-color: var(--issue-accent); } .issue-lot-dialog button:disabled { opacity: .45; cursor: not-allowed; }
      @media(max-width:639px) { .issue-lot-dialog { inset: auto 0 0; width: 100%; max-height: 95dvh; margin: 0; border-radius: 12px 12px 0 0; } .issue-lot-dialog::before { content: ''; width: 34px; height: 4px; background: #939aa5; margin: 7px auto 0; border-radius: 3px; flex-shrink: 0; } .issue-lot-dialog header { padding: 12px 16px; } .issue-lot-body { padding: 16px; } .issue-lot-meta { grid-template-columns: 125px minmax(0,1fr); gap: 12px; font-size: 13px; } .issue-lot-head { display: none; } .issue-lot-row { grid-template-columns: 22px minmax(70px,1fr) 85px 55px; border: 1px solid var(--issue-border); border-radius: 4px; margin-top: 10px; padding: 10px; } .issue-lot-row.is-selected { border-color: var(--issue-accent); } .issue-lot-amount { grid-column: 2 / 4; display: flex; gap: 8px; align-items: center; } .issue-lot-amount > span { display: block; font-size: 11px; white-space: nowrap; } .issue-lot-amount input { width: 80px; } .issue-lot-badge { grid-column: 2 / -1; } .issue-lot-dialog footer { padding: 12px 16px max(16px,env(safe-area-inset-bottom)); border-top: 1px solid var(--issue-border); } .issue-lot-dialog footer button { flex: 1; padding: 0 10px; } }
    `}</style>
  </dialog>;
}
