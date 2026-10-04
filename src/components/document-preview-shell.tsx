"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Maximize,
  Minus,
  Plus,
  Printer,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PdfExportIcon } from "@/components/pdf-export-button";
import styles from "./document-preview-shell.module.css";

const PX_PER_MM = 96 / 25.4;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const SCALE_STEP = 0.1;

type PaperOption = { label: string; value: string };

type DocumentPreviewShellProps = {
  ariaLabel: string;
  children: ReactNode;
  currentPage?: number;
  documentNumber?: string;
  extraActions?: ReactNode;
  isBusy?: boolean;
  onClose: () => void;
  onExportPdf: () => void | Promise<void>;
  onPaperChange?: (value: string) => void;
  onPrint: () => void | Promise<void>;
  paperHeightMm: number;
  paperLabel: string;
  paperOptions?: PaperOption[];
  paperValue?: string;
  paperWidthMm: number;
  statusDate?: string;
  statusDescription?: string;
  statusLabel?: string;
  title: string;
  totalPages?: number;
};

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function DocumentPreviewShell({
  ariaLabel,
  children,
  currentPage = 1,
  documentNumber,
  extraActions,
  isBusy = false,
  onClose,
  onExportPdf,
  onPaperChange,
  onPrint,
  paperHeightMm,
  paperLabel,
  paperOptions,
  paperValue,
  paperWidthMm,
  statusDate,
  statusDescription,
  statusLabel,
  title,
  totalPages = 1,
}: DocumentPreviewShellProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const dragRef = useRef<{ left: number; top: number; x: number; y: number } | null>(null);
  const fitScaleRef = useRef(0.7);
  const [scale, setScale] = useState(0.7);
  const [zoomOpen, setZoomOpen] = useState(false);

  const fitToPage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const horizontalPadding = mobile ? 24 : 56;
    const verticalPadding = mobile ? 40 : 48;
    const widthScale = (canvas.clientWidth - horizontalPadding) / (paperWidthMm * PX_PER_MM);
    const heightScale = (canvas.clientHeight - verticalPadding) / (paperHeightMm * PX_PER_MM);
    const nextScale = clampScale(Math.min(widthScale, heightScale, mobile ? 0.72 : 0.82));
    fitScaleRef.current = nextScale;
    setScale(nextScale);
    canvas.scrollTo({ left: 0, top: 0 });
  }, [paperHeightMm, paperWidthMm]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitToPage);
    window.addEventListener("resize", fitToPage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitToPage);
    };
  }, [fitToPage]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const updateScale = (next: number) => {
    setScale(clampScale(Math.round(next * 100) / 100));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      dragRef.current = {
        left: canvasRef.current?.scrollLeft ?? 0,
        top: canvasRef.current?.scrollTop ?? 0,
        x: event.clientX,
        y: event.clientY,
      };
    } else if (points.length === 2) {
      pinchRef.current = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        scale,
      };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 2 && pinchRef.current) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      updateScale(pinchRef.current.scale * (distance / Math.max(1, pinchRef.current.distance)));
      return;
    }
    if (points.length === 1 && dragRef.current && canvasRef.current && scale > fitScaleRef.current + 0.01) {
      canvasRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x);
      canvasRef.current.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y);
    }
  };

  const releasePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };

  const zoomControls = (
    <div aria-label="ควบคุมการซูม" className={styles.zoomControls} role="group">
      <button aria-label="ซูมออก" disabled={scale <= MIN_SCALE} onClick={() => updateScale(scale - SCALE_STEP)} type="button">
        <Minus aria-hidden="true" size={17} />
      </button>
      <button aria-label="กลับไปขนาด 100 เปอร์เซ็นต์" className={styles.zoomValue} onClick={() => updateScale(1)} type="button">
        {Math.round(scale * 100)}%
      </button>
      <button aria-label="ซูมเข้า" disabled={scale >= MAX_SCALE} onClick={() => updateScale(scale + SCALE_STEP)} type="button">
        <Plus aria-hidden="true" size={17} />
      </button>
    </div>
  );

  return (
    <div aria-label={ariaLabel} aria-modal="true" className={styles.shell} role="dialog">
      <aside className={styles.rail}>
        <div aria-label="KRC ERP" className={styles.brand}><b>KRC</b><span>ERP</span></div>
        <div className={styles.railPrimary}>
          <ShellButton icon={<ArrowLeft size={25} />} label="ปิด" onClick={onClose} />
          <ShellButton disabled={isBusy} icon={<Printer size={27} />} label="พิมพ์" onClick={onPrint} primary />
          <ShellButton disabled={isBusy} icon={<PdfExportIcon size={27} />} label="ส่งออก PDF" onClick={onExportPdf} primary />
          <ShellButton icon={<Maximize size={26} />} label="พอดีหน้า" onClick={fitToPage} />
          <ShellButton icon={<Search size={27} />} label="ซูม" onClick={() => setZoomOpen((value) => !value)} />
          {zoomOpen ? zoomControls : null}
        </div>
        {statusLabel ? (
          <div className={styles.railStatus}>
            <CheckCircle2 aria-hidden="true" size={25} />
            <strong>{statusLabel}</strong>
            {statusDate ? <time>{statusDate}</time> : null}
          </div>
        ) : null}
      </aside>

      <header className={styles.header}>
        <button aria-label="ปิดตัวอย่าง" className={styles.mobileClose} onClick={onClose} type="button"><ArrowLeft size={25} /></button>
        <h1>{title}</h1>
        <div className={styles.meta}>
          {documentNumber ? <span><small>เลขที่เอกสาร</small><b>{documentNumber}</b></span> : null}
          <span>
            <small>ขนาดกระดาษ</small>
            {paperOptions && paperValue && onPaperChange ? (
              <select aria-label="ขนาดกระดาษ" onChange={(event) => onPaperChange(event.target.value)} value={paperValue}>
                {paperOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : <b>{paperLabel}</b>}
          </span>
          <span><small>หน้า</small><b>{currentPage} / {totalPages}</b></span>
        </div>
        {statusLabel ? (
          <div className={styles.mobileStatus}>
            <span className={styles.mobileStatusBadge}>
              <CheckCircle2 aria-hidden="true" size={18} />
              <strong>{statusLabel}</strong>
            </span>
            {statusDate ? <time>{statusDate}</time> : null}
          </div>
        ) : null}
      </header>

      <main
        className={styles.canvas}
        onPointerCancel={releasePointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        ref={canvasRef}
      >
        {extraActions ? <div className={styles.extraActions}>{extraActions}</div> : null}
        {statusDescription ? <p className={styles.srOnly}>{statusDescription}</p> : null}
        <div className={styles.documentStage} style={{ zoom: scale }}>{children}</div>
      </main>

      <nav aria-label="คำสั่งตัวอย่างเอกสาร" className={styles.mobileDock}>
        <ShellButton disabled={isBusy} icon={<Printer size={25} />} label="พิมพ์" onClick={onPrint} primary />
        <ShellButton disabled={isBusy} icon={<PdfExportIcon size={25} />} label="ส่งออก PDF" onClick={onExportPdf} primary />
        <ShellButton icon={<Maximize size={25} />} label="พอดีหน้า" onClick={fitToPage} />
        <ShellButton icon={<Search size={25} />} label="ซูม" onClick={() => setZoomOpen((value) => !value)} />
        {zoomOpen ? <div className={styles.mobileZoom}>{zoomControls}</div> : null}
      </nav>
    </div>
  );
}

function ShellButton({
  disabled,
  icon,
  label,
  onClick,
  primary = false,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  primary?: boolean;
}) {
  return (
    <button className={primary ? styles.primaryAction : styles.action} disabled={disabled} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}
