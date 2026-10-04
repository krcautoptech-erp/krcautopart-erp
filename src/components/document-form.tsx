"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "@/components/toast";
import "./document-form.css";

export type SavedDocument = { id: number; number: string };

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

export function DocumentFormFooter({ saved, pending, summary, onClose, onPrint, onNext, children }: {
  saved: SavedDocument | null; pending: boolean; summary: ReactNode;
  onClose: () => void; onPrint: (id: number) => Promise<void>; onNext: () => void; children?: ReactNode;
}) {
  const [printing, setPrinting] = useState(false);
  return <footer className="document-form-footer">
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
