"use client";

import { AlertTriangle, BookOpen, CheckCircle2, CircleDot, HelpCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  HELP_CONTENT_VERSION,
  filterHelpGuides,
  getHelpGuide,
  type HelpGuide,
} from "@/lib/help-center";

type Props = {
  guideIds?: readonly string[];
  isOwner?: boolean;
  pathname: string;
  permissionCodes?: readonly string[];
  onClose: () => void;
};

const groups: HelpGuide["group"][] = ["เริ่มต้นใช้งาน", "ข้อมูลกลาง", "จัดซื้อและคลัง", "ตั้งค่าระบบ"];

export function ErpHelpCenter({ guideIds, isOwner = false, pathname, permissionCodes, onClose }: Props) {
  const routeGuide = getHelpGuide(pathname, typeof window === "undefined" ? "" : window.location.search);
  const accessibleGuides = useMemo(() => {
    const allowedIds = guideIds ? new Set(guideIds) : null;
    return filterHelpGuides("", permissionCodes, isOwner).filter((guide) => !allowedIds || allowedIds.has(guide.id));
  }, [guideIds, isOwner, permissionCodes]);
  const initialGuide = accessibleGuides.find((guide) => guide.id === routeGuide.id) ?? accessibleGuides[0] ?? routeGuide;
  const [selectedId, setSelectedId] = useState(initialGuide.id);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const visibleSearch = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("[data-help-search]") ?? [])
        .find((element) => element.getClientRects().length > 0);
      (visibleSearch ?? dialogRef.current)?.focus();
    });

    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleDialogKeydown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDialogKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const filteredGuides = useMemo(() => {
    const matchedIds = new Set(filterHelpGuides(query).map((guide) => guide.id));
    return accessibleGuides.filter((guide) => matchedIds.has(guide.id));
  }, [accessibleGuides, query]);

  const activeGuide = accessibleGuides.find((guide) => guide.id === selectedId) ?? initialGuide;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:p-3" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="erp-help-title" aria-modal="true" className="flex h-full w-full flex-col overflow-hidden bg-surface-container-lowest text-on-surface shadow-2xl sm:h-[min(760px,calc(100vh-24px))] sm:max-w-[1080px] sm:rounded-[6px] sm:border sm:border-outline-variant" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="flex min-h-[62px] shrink-0 items-center gap-3 border-b border-outline-variant px-4 sm:px-5">
          <HelpCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold sm:text-[17px]" id="erp-help-title">ศูนย์ช่วยเหลือและคู่มือการใช้งานระบบ ERP</h2>
            <p className="hidden truncate text-[11px] text-on-surface-variant sm:block">คู่มือปฏิบัติงานตามหน้าปัจจุบัน พร้อมขั้นตอนและแนวทางแก้ปัญหา</p>
          </div>
          <button aria-label="ปิดคู่มือ" className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] hover:bg-surface-container" onClick={onClose} type="button"><X size={21} /></button>
        </header>

        <div className="border-b border-outline-variant p-3 md:hidden">
          <label className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={17} />
            <input aria-label="ค้นหาคู่มือ" className="h-10 w-full rounded-[4px] border border-outline-variant bg-background pl-9 pr-3 text-[13px] outline-none focus:border-primary" data-help-search onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาหน้าหรืองานที่ต้องการ" value={query} />
          </label>
          {filteredGuides.length > 0 ? (
            <select aria-label="เลือกหัวข้อคู่มือ" className="mt-2 h-10 w-full rounded-[4px] border border-outline-variant bg-background px-3 text-[13px] font-semibold" onChange={(event) => setSelectedId(event.target.value)} value={filteredGuides.some((guide) => guide.id === activeGuide.id) ? activeGuide.id : ""}>
              {!filteredGuides.some((guide) => guide.id === activeGuide.id) ? <option disabled value="">เลือกหัวข้อคู่มือ</option> : null}
              {filteredGuides.map((guide) => <option key={guide.id} value={guide.id}>{guide.title}</option>)}
            </select>
          ) : <p className="mt-2 rounded-[4px] bg-surface-container-low px-3 py-3 text-[12px] text-on-surface-variant">ไม่พบคู่มือที่ค้นหา</p>}
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-r border-outline-variant bg-surface-container-low p-3 md:block">
            <label className="relative mb-3 block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
              <input aria-label="ค้นหาคู่มือ" className="h-9 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest pl-9 pr-3 text-[12px] outline-none focus:border-primary" data-help-search onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาคู่มือ" value={query} />
            </label>
            {groups.map((group) => {
              const guides = filteredGuides.filter((guide) => guide.group === group);
              if (!guides.length) return null;
              return <nav aria-label={group} className="mb-4" key={group}>
                <h3 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">{group}</h3>
                {guides.map((guide) => <button aria-current={activeGuide.id === guide.id ? "page" : undefined} className={`mb-0.5 flex min-h-9 w-full items-center gap-2 rounded-[4px] px-2.5 py-2 text-left text-[12px] font-semibold leading-4 transition-colors ${activeGuide.id === guide.id ? "bg-primary text-on-primary" : "hover:bg-surface-container-high"}`} key={guide.id} onClick={() => setSelectedId(guide.id)} type="button"><BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" /><span>{guide.title}</span></button>)}
              </nav>;
            })}
            {filteredGuides.length === 0 ? <p className="px-2 py-4 text-[12px] text-on-surface-variant">ไม่พบคู่มือที่ค้นหา</p> : null}
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="mx-auto max-w-[720px]">
              <div className="border-b border-outline-variant pb-4">
                <p className="text-[11px] font-bold text-primary">คู่มือปฏิบัติงาน</p>
                <h3 className="mt-0.5 text-[21px] font-bold leading-tight sm:text-[24px]">{activeGuide.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-on-surface-variant">{activeGuide.purpose}</p>
              </div>

              <GuideBlock icon={<CircleDot size={17} />} title="ก่อนเริ่มงาน">
                <BulletList items={activeGuide.prerequisites} />
              </GuideBlock>

              <GuideBlock icon={<BookOpen size={17} />} title="ขั้นตอนการปฏิบัติงาน">
                <ol className="space-y-3">
                  {activeGuide.steps.map((step, index) => <li className="grid grid-cols-[26px_1fr] gap-2" key={step.title}><span className="grid h-[24px] w-[24px] place-items-center rounded-full bg-primary text-[11px] font-bold text-on-primary">{index + 1}</span><div><strong className="block text-[13px] leading-5">{step.title}</strong><p className="mt-0.5 text-[12px] leading-5 text-on-surface-variant">{step.detail}</p></div></li>)}
                </ol>
              </GuideBlock>

              <GuideBlock icon={<CircleDot size={17} />} title="ข้อมูลและคำสั่งสำคัญ">
                <dl className="overflow-hidden rounded-[4px] border border-outline-variant">
                  {activeGuide.reference.map((item) => <div className="grid border-b border-outline-variant last:border-0 sm:grid-cols-[170px_1fr]" key={item.term}><dt className="bg-surface-container-low px-3 py-2 text-[12px] font-bold">{item.term}</dt><dd className="px-3 py-2 text-[12px] leading-5 text-on-surface-variant">{item.detail}</dd></div>)}
                </dl>
              </GuideBlock>

              <GuideBlock icon={<CheckCircle2 size={17} />} title="ผลลัพธ์ที่ต้องตรวจหลังทำรายการ">
                <BulletList items={activeGuide.completion} />
              </GuideBlock>

              <GuideBlock icon={<AlertTriangle size={17} />} title="เมื่อทำรายการไม่สำเร็จ">
                <BulletList items={activeGuide.troubleshooting} />
              </GuideBlock>
            </div>
          </main>
        </div>

        <footer className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-low px-4 text-[11px] text-on-surface-variant sm:px-5">
          <span className="truncate">คู่มือเวอร์ชัน {HELP_CONTENT_VERSION} · อ้างอิงกระบวนการปัจจุบันของ KRC ERP</span>
          <button className="h-9 shrink-0 rounded-[4px] bg-primary px-5 text-[12px] font-bold text-on-primary" onClick={onClose} type="button">ปิดคู่มือ</button>
        </footer>
      </section>
    </div>
  );
}

function GuideBlock({ children, icon, title }: { children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return <section className="border-b border-outline-variant py-4 last:border-0"><h4 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-on-surface"><span className="text-primary">{icon}</span>{title}</h4>{children}</section>;
}

function BulletList({ items }: { items: readonly string[] }) {
  return <ul className="space-y-1.5">{items.map((item) => <li className="grid grid-cols-[12px_1fr] gap-2 text-[12px] leading-5 text-on-surface-variant" key={item}><span aria-hidden="true" className="mt-[8px] h-1 w-1 rounded-full bg-primary" />{item}</li>)}</ul>;
}
