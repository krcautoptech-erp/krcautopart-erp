"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "@/components/toast";
import { ChevronDown, MoreVertical, Plus, Search } from "lucide-react";
import "./document-form.css";

export type SavedDocument = { id: number; number: string };

export function DocumentMobileWorkspace({ children, initialTab = "items" }: { children: ReactNode; initialTab?: "document" | "items" }) {
  const [tab, setTab] = useState(initialTab);
  return <div className="document-mobile-workspace" data-mobile-tab={tab} onInvalidCapture={(event) => {
    if ((event.target as HTMLElement).closest(".document-metadata-section")) setTab("document");
  }}>
    <nav className="document-mobile-tabs" aria-label="ส่วนของเอกสาร">
      <button type="button" aria-pressed={tab === "document"} onClick={() => setTab("document")}>ข้อมูลเอกสาร</button>
      <button type="button" aria-pressed={tab === "items"} onClick={() => setTab("items")}>รายการสินค้า</button>
    </nav>
    <div className="document-mobile-workspace-content">{children}</div>
  </div>;
}

export function useDocumentPreviewScale(maxScale = 0.73) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(maxScale);
  useEffect(() => {
    if (!container) return;
    const resize = () => setScale(Math.min(maxScale, Math.max(0.2, (container.clientWidth - 20) / 793.7)));
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [container, maxScale]);
  return [setContainer, scale] as const;
}

export function DocumentProductName({ name }: { name: string }) {
  return <span className="document-product">{name}</span>;
}

export function DocumentEntryTable({ className = "", children }: { className?: string; children: ReactNode }) {
  return <table className={`document-entry-table document-mobile-entry ${className}`}>{children}</table>;
}

export function DocumentMobileItemToolbar({ onAdd, disabled, children, search }: { onAdd: () => void; disabled?: boolean; children?: ReactNode; search?: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return <div className="document-mobile-item-toolbar">
    <button type="button" className="document-mobile-add" disabled={disabled} onClick={onAdd}><Plus size={20} />เพิ่มสินค้า</button>
    {search && <button type="button" aria-label="ค้นหารายการสินค้า" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={20} /></button>}
    {children && <details><summary aria-label="เครื่องมือรายการเพิ่มเติม"><MoreVertical size={20} /></summary><div className="document-mobile-tools">{children}</div></details>}
    {searchOpen && <div className="document-mobile-search">{search}</div>}
  </div>;
}

export function DocumentFormPurpose({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="document-mobile-purpose" data-open={open}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>วัตถุประสงค์ในการขอซื้อ<ChevronDown size={20} /></button>
    <div>{children}</div>
  </div>;
}

export function DocumentFormFooter({ saved, pending, summary, onClose, onPrint, onNext, children }: {
  saved: SavedDocument | null; pending: boolean; summary: ReactNode;
  onClose: () => void; onPrint: (id: number) => Promise<void>; onNext: () => void; children?: ReactNode;
}) {
  const [printing, setPrinting] = useState(false);
  return <footer className="document-form-footer document-purchase-footer">
    {saved ? <span className="saved" role="status">บันทึกแล้ว · {saved.number}</span> : <span className="summary">{summary}</span>}
    <button type="button" disabled={pending || printing} onClick={onClose}>{saved ? "ปิด" : "ยกเลิก"}</button>
    <button type="button" disabled={!saved || pending || printing} onClick={async () => {
      if (!saved || printing) return;
      setPrinting(true);
      try { await onPrint(saved.id); } catch { toast.error("ไม่สามารถเปิดเอกสารได้ กรุณาลองใหม่"); } finally { setPrinting(false); }
    }}>{printing ? "กำลังเปิด..." : "พิมพ์"}</button>
    <button type="button" disabled={!saved || pending || printing} onClick={onNext}>สร้างใบถัดไป</button>
    {!saved && children}
  </footer>;
}
