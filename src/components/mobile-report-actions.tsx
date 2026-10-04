"use client";

import { Download, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export type MobileReportAction = {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
};

export function MobileReportActions({ actions }: { actions: MobileReportAction[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return <div className="min-[901px]:hidden">
    <button
      aria-expanded={open}
      aria-label="เมนูส่งออก"
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold text-on-surface"
      onClick={() => setOpen(true)}
      type="button"
    >
      <Download size={18} />ส่งออก
    </button>
    {open ? <div className="mobile-sheet-overlay" onClick={close} role="presentation">
      <section aria-label="ส่งออกและพิมพ์" aria-modal="true" className="mobile-document-sheet" onClick={(event) => event.stopPropagation()} role="dialog">
        <div aria-hidden="true" className="mobile-sheet-handle" />
        <button aria-label="ปิดเมนูส่งออก" className="mobile-sheet-close" onClick={close} type="button"><X size={28} /></button>
        <div className="mobile-sheet-title"><h2>ส่งออกและพิมพ์</h2></div>
        <div className="mobile-sheet-actions">
          {actions.map((action) => <button
            className="mobile-sheet-secondary"
            disabled={action.disabled}
            key={action.label}
            onClick={() => { close(); action.onSelect(); }}
            type="button"
          >
            {action.icon}{action.label}
          </button>)}
        </div>
      </section>
    </div> : null}
  </div>;
}
