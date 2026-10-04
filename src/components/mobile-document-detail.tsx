"use client";

import { ArrowLeft, ChevronRight, MoreVertical } from "lucide-react";
import type { ReactNode } from "react";

type Field = { label: string; value: ReactNode };
type Item = { code: ReactNode; details: Field[]; id: string | number; name: ReactNode; trailing?: ReactNode };

export function MobileDocumentDetail({
  actions,
  fields,
  items,
  onClose,
  status,
  title,
}: {
  actions: ReactNode;
  fields: Field[];
  items: Item[];
  onClose: () => void;
  status: ReactNode;
  title: string;
}) {
  return <section className="fixed inset-0 z-[125] flex flex-col overflow-hidden bg-background text-on-surface md:hidden">
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-3">
      <button aria-label="ย้อนกลับ" className="grid size-11 place-items-center" onClick={onClose} type="button"><ArrowLeft size={25} /></button>
      <h2 className="min-w-0 flex-1 truncate text-[20px] font-extrabold">{title}</h2>
      {status}
      <button aria-label="เมนูเพิ่มเติม" className="grid size-11 place-items-center" type="button"><MoreVertical size={23} /></button>
    </header>
    <div className="flex-1 overflow-y-auto pb-24">
      <section className="px-4 py-4">
        <h3 className="mb-2 text-[15px] font-bold text-secondary">ข้อมูลเอกสาร</h3>
        <dl className="mobile-detail-definition">{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      </section>
      <div className="h-3 bg-surface-container-low" />
      <section>
        <h3 className="border-b border-outline-variant px-4 py-3 text-[17px] font-extrabold">รายการสินค้า ({items.length})</h3>
        <div className="mobile-item-ledger">{items.map((item) => <article className="mobile-item-row" key={item.id}>
          <div className="min-w-0 flex-1"><strong>{item.code}</strong><h4>{item.name}</h4><dl>{item.details.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></div>
          {item.trailing ? <div className="shrink-0 text-right font-bold">{item.trailing}</div> : null}
          <ChevronRight className="mt-1 shrink-0" size={20} />
        </article>)}</div>
      </section>
    </div>
    <footer className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-outline-variant bg-surface-container-lowest p-3 pb-[max(12px,env(safe-area-inset-bottom))]">{actions}</footer>
  </section>;
}
