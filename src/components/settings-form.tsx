"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { CompanyFormLogo } from "@/components/company-logo";

export const settingsControlClass =
  "h-9 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-2.5 text-[14px] outline-none transition-colors focus:border-primary disabled:bg-surface-container disabled:text-on-surface-variant";

export function SettingsField({ children, label, required = false }: { children: ReactNode; label: string; required?: boolean }) {
  return <label className="min-w-0 text-[14px] font-semibold text-on-surface">{label}{required ? <span className="text-primary"> *</span> : null}<span className="mt-1 block">{children}</span></label>;
}

export function SettingsModalHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return <header className="flex h-[58px] shrink-0 items-center border-b border-outline-variant bg-surface-container-lowest px-4 text-on-surface"><CompanyFormLogo/><span className="mx-3 h-7 w-px bg-outline-variant"/><h2 className="text-[20px] font-bold">{title}</h2><button aria-label="ปิด" className="ml-auto grid h-10 w-10 place-items-center" onClick={onClose} type="button"><X size={22}/></button></header>;
}

export function SettingsModalFooter({ completeText, disabled, onCancel, onSubmit, submitText }: { completeText?: string; disabled?: boolean; onCancel: () => void; onSubmit: () => void; submitText: string }) {
  return <footer className="flex shrink-0 flex-col gap-2 border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant">{completeText ? <><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white"><Check size={13}/></span>{completeText}</> : null}</div><div className="ml-auto grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><button className="h-10 min-w-24 rounded-[3px] border border-outline-variant px-5 text-[13px] font-bold" disabled={disabled} onClick={onCancel} type="button">ยกเลิก</button><button className="h-10 min-w-32 rounded-[3px] bg-primary px-5 text-[13px] font-bold text-on-primary disabled:opacity-50" disabled={disabled} onClick={onSubmit} type="button">{submitText}</button></div></footer>;
}

export function SettingsAccordion({ children, number, open, onToggle, subtitle, title }: { children?: ReactNode; number: string; open: boolean; onToggle: () => void; subtitle?: string; title: string }) {
  return <section className="border border-outline-variant bg-surface-container-lowest first:rounded-t-[4px] last:rounded-b-[4px]"><button aria-expanded={open} className="flex min-h-10 w-full items-center gap-2.5 px-3 py-1.5 text-left" onClick={onToggle} type="button"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-black text-on-primary">{number}</span><span className="min-w-0"><strong className="block text-[15px]">{title}</strong>{subtitle ? <span className="block text-[12px] leading-4 text-on-surface-variant">{subtitle}</span> : null}</span><ChevronDown className={`ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} size={17}/></button>{open ? <div className="border-t border-outline-variant px-3 py-3">{children}</div> : null}</section>;
}

export function SettingsSegmented<T extends string>({ label, onChange, options, value }: { label: string; onChange: (value: T) => void; options: { label: string; value: T; help?: string }[]; value: T }) {
  return <fieldset><legend className="mb-1.5 text-[12px] font-semibold">{label}</legend><div className={`grid gap-1.5 ${options.length === 3 ? "sm:grid-cols-3" : "grid-cols-2"}`}>{options.map((option)=><button aria-pressed={value === option.value} className={`min-h-9 rounded-[3px] border px-2 py-1.5 text-left text-[12px] transition-colors ${value === option.value ? "border-primary bg-primary/5 font-bold text-primary" : "border-outline-variant bg-surface-container-lowest"}`} key={option.value} onClick={()=>onChange(option.value)} type="button"><span className="block">{option.label}</span>{option.help ? <span className="block text-[10px] font-normal leading-4 text-on-surface-variant">{option.help}</span> : null}</button>)}</div></fieldset>;
}

export function SettingsRadioGroup<T extends string>({ label, onChange, options, value }: { label: string; onChange: (value: T) => void; options: { label: string; value: T }[]; value: T }) {
  return <fieldset><legend className="mb-2 text-[14px] font-semibold">{label}</legend><div className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2">{options.map((option)=><label className="flex cursor-pointer items-center gap-2 text-[14px]" key={option.value}><input checked={value === option.value} className="peer sr-only" name={label} onChange={()=>onChange(option.value)} type="radio"/><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#aeb7c4] bg-white peer-checked:border-[1.5px] peer-checked:border-primary"><span className={`h-2 w-2 rounded-full ${value === option.value ? "bg-primary" : "bg-transparent"}`}/></span><span className={value === option.value ? "font-semibold text-on-surface" : "text-on-surface-variant"}>{option.label}</span></label>)}</div></fieldset>;
}
