"use client";

import { ChevronRight, MoreVertical, X } from "lucide-react";
import { useState, type Key, type ReactNode } from "react";

export type MobileDocumentRow = {
  details: Array<{ label: string; value: ReactNode }>;
  id: Key;
  meta: ReactNode;
  status: ReactNode;
  subtitle: ReactNode;
  title: ReactNode;
};

type MobileDocumentListProps = {
  actions: (row: MobileDocumentRow, close: () => void) => ReactNode;
  className?: string;
  emptyText: string;
  rows: MobileDocumentRow[];
};

export function MobileDocumentList({ actions, className = "md:hidden", emptyText, rows }: MobileDocumentListProps) {
  const [selected, setSelected] = useState<MobileDocumentRow | null>(null);
  const close = () => setSelected(null);

  return (
    <div className={className}>
      <div className="mobile-document-ledger">
        {rows.map((row) => (
          <button
            className="mobile-document-row"
            key={row.id}
            onClick={() => setSelected(row)}
            type="button"
          >
            <span className="min-w-0 flex-1 text-left">
              <strong className="mobile-document-number">{row.title}</strong>
              <span className="mobile-document-subtitle">{row.subtitle}</span>
              <span className="mobile-document-meta">{row.meta}</span>
            </span>
            <span className="mobile-document-status">{row.status}</span>
            <MoreVertical aria-hidden="true" className="shrink-0 text-secondary" size={20} />
            <ChevronRight aria-hidden="true" className="shrink-0 text-on-surface" size={22} />
          </button>
        ))}
        {rows.length === 0 ? <p className="mobile-document-empty">{emptyText}</p> : null}
      </div>

      {selected ? (
        <div className="mobile-sheet-overlay" onClick={close} role="presentation">
          <section
            aria-label={`รายละเอียด ${String(selected.title)}`}
            aria-modal="true"
            className="mobile-document-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div aria-hidden="true" className="mobile-sheet-handle" />
            <button aria-label="ปิด" className="mobile-sheet-close" onClick={close} type="button">
              <X size={28} />
            </button>
            <div className="mobile-sheet-title">
              <h2>{selected.title}</h2>
              {selected.status}
            </div>
            <dl className="mobile-sheet-details">
              {selected.details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mobile-sheet-actions">{actions(selected, close)}</div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
