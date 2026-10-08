"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";

export function ListFilterToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`grid gap-3 ${className}`}>{children}</div>;
}

/** Mobile-only entry point: keeps a list page to search + one filter action. */
export function MobileListFilters({
  activeCount = 0,
  children,
  className = "md:hidden",
  formId,
  onClear,
  resultLabel,
  search,
  title = "ตัวกรอง",
}: {
  activeCount?: number;
  children: ReactNode;
  className?: string;
  formId?: string;
  onClear?: () => void;
  resultLabel?: string;
  search: ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);
  const apply = () => {
    const form = formId ? document.getElementById(formId) : null;
    if (form instanceof HTMLFormElement) form.requestSubmit();
    close();
  };

  return <div className={className}>
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">{search}</div>
      <button ref={triggerRef} aria-expanded={open} aria-label="เปิดตัวกรอง" className={`inline-flex h-[38px] shrink-0 items-center gap-1 rounded-[4px] border px-3 text-[12px] font-bold ${activeCount ? "border-primary text-primary" : "border-outline-variant text-on-surface"}`} onClick={() => setOpen(true)} type="button"><SlidersHorizontal size={17} />ตัวกรอง{activeCount ? <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] text-white">{activeCount}</span> : null}</button>
    </div>
    {activeCount ? <div className="mt-2 flex items-center gap-2 text-[11px]"><span className="font-bold text-primary">ใช้ตัวกรอง {activeCount} รายการ</span>{onClear ? <button className="font-semibold text-secondary underline" onClick={onClear} type="button">ล้างค่า</button> : null}</div> : null}
    {open ? <div className="mobile-filter-backdrop fixed inset-0 z-[90] bg-black/35" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <section aria-label={title} aria-modal="true" className="mobile-filter-sheet absolute inset-x-0 bottom-0 mx-auto flex h-[calc(100dvh-8px)] max-h-[calc(100dvh-8px)] flex-col rounded-t-[12px] bg-background shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:max-w-[560px]" role="dialog">
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant" />
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant px-4"><h2 className="text-[18px] font-bold">{title}</h2><button aria-label="ปิดตัวกรอง" className="grid size-10 place-items-center" onClick={close} type="button"><X size={21} /></button></header>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-4"><div className="grid gap-3">{children}</div></div>
        <footer className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-2 border-t border-outline-variant bg-background px-3 pt-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}><button className="h-11 rounded-[4px] border border-primary text-[13px] font-bold text-primary" onClick={() => { onClear?.(); close(); }} type="button">ล้างค่า</button><button className="h-11 rounded-[4px] bg-primary text-[13px] font-bold text-white" onClick={apply} type="button">{resultLabel ?? "แสดงผล"}</button></footer>
      </section>
    </div> : null}
  </div>;
}

export function ListSearchField({
  className = "",
  defaultValue,
  name,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
        size={18}
      />
      <input
        aria-label="ค้นหา"
        className="h-[38px] w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-[13px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/65 focus:border-primary"
        defaultValue={defaultValue}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

export function ListDateRangeFilter({
  active,
  className = "",
  defaultEndValue,
  defaultStartValue,
  endName,
  endValue,
  label = "ช่วงวันที่",
  maxEnd,
  maxStart,
  onEndChange,
  onRangeChange,
  onStartChange,
  startName,
  startValue,
  submitOnChange = false,
}: {
  active?: boolean;
  className?: string;
  defaultEndValue?: string;
  defaultStartValue?: string;
  endName?: string;
  endValue?: string;
  label?: string;
  maxEnd?: string;
  maxStart?: string;
  minEnd?: string;
  onEndChange?: (value: string, event?: ChangeEvent<HTMLInputElement>) => void;
  onRangeChange?: (value: DateRangeValue) => void;
  onStartChange?: (value: string, event?: ChangeEvent<HTMLInputElement>) => void;
  startName?: string;
  startValue?: string;
  submitOnChange?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlled = startValue !== undefined || endValue !== undefined;
  const [internalValue, setInternalValue] = useState<DateRangeValue>({
    startDate: startValue ?? defaultStartValue ?? "",
    endDate: endValue ?? defaultEndValue ?? "",
  });
  const value = controlled
    ? { startDate: startValue ?? "", endDate: endValue ?? "" }
    : internalValue;

  const isActive = active ?? Boolean(value.startDate || value.endDate);

  const handleRangeChange = (nextValue: DateRangeValue) => {
    if (!controlled) setInternalValue(nextValue);
    onRangeChange?.(nextValue);
    if (!onRangeChange) {
      if (nextValue.startDate !== value.startDate) onStartChange?.(nextValue.startDate);
      if (nextValue.endDate !== value.endDate) onEndChange?.(nextValue.endDate);
    }
    if (submitOnChange) {
      window.requestAnimationFrame(() => containerRef.current?.closest("form")?.requestSubmit());
    }
  };

  return (
    <div ref={containerRef} className={`relative min-w-0 ${isActive ? "[&_button:first-of-type]:border-primary" : ""} ${className}`}>
      <span className="pointer-events-none absolute left-3 top-0 z-10 -translate-y-1/2 bg-surface-container-lowest px-1 text-[11px] font-semibold leading-4 text-on-surface-variant">
        {label}
      </span>
      <DateRangePicker
        maxDate={maxEnd ?? maxStart}
        onChange={handleRangeChange}
        value={value}
      />
      {startName ? <input name={startName} type="hidden" value={value.startDate} /> : null}
      {endName ? <input name={endName} type="hidden" value={value.endDate} /> : null}
    </div>
  );
}

export function ListFilterButton({
  children,
  className = "",
  icon,
  tone = "secondary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      className={`inline-flex h-[38px] items-center justify-center gap-2 rounded-[4px] border px-4 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        tone === "primary"
          ? "border-primary bg-primary text-white hover:bg-primary/92"
          : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:text-primary"
      } ${className}`}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function ListFilterSelect({
  children,
  className = "",
  defaultValue,
  disabled = false,
  label,
  name,
  onNativeChange,
  onChange,
  value,
}: {
  children: ReactNode;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name?: string;
  onNativeChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const selectedValue = value ?? defaultValue ?? "";
  const active = !["", "all", "ALL", "ทั้งหมด"].includes(selectedValue);

  return (
    <label
      className={`relative block h-[38px] rounded-[4px] border bg-surface-container-lowest transition-colors focus-within:border-primary ${
        active ? "border-primary" : "border-outline-variant"
      } ${className}`}
    >
      <span className="pointer-events-none absolute left-3 top-0 z-10 -translate-y-1/2 bg-surface-container-lowest px-1 text-[11px] font-semibold leading-4 text-on-surface-variant">
        {label}
      </span>
      <select
        aria-label={label}
        className="h-full w-full bg-transparent px-3 pb-1 pt-2 text-[13px] font-semibold text-on-surface outline-none dark:[color-scheme:dark]"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onChange?.(event.target.value);
          onNativeChange?.(event);
        }}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}
