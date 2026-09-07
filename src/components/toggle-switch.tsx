"use client";

import { Check } from "lucide-react";

export function ToggleSwitch({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label?: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label ?? (checked ? "เปิด" : "ปิด")}
      className={`flex items-center gap-3 overflow-visible disabled:cursor-not-allowed disabled:opacity-50 ${label ? "min-h-10 w-full justify-between" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      {label ? <span className="flex min-w-0 flex-1 items-center gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center border ${checked ? "border-primary bg-primary text-white" : "border-outline-variant bg-surface-container-lowest"}`}>{checked ? <Check size={14} strokeWidth={3} /> : null}</span><span className="min-w-0 whitespace-normal py-0.5 text-left text-[13px] font-semibold leading-[1.55]">{label}</span></span> : null}
      <ToggleSwitchVisual checked={checked} />
    </button>
  );
}

export function ToggleSwitchVisual({ active, checked = active ?? false }: { active?: boolean; checked?: boolean }) {
  return (
      <span aria-hidden="true" className={`relative h-[28px] w-[66px] shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"}`}>
        <span className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-black leading-none text-white ${checked ? "left-[10px]" : "right-[8px]"}`}>{checked ? "ON" : "OFF"}</span>
        <span className={`absolute left-0 top-[3px] h-[22px] w-[22px] rounded-full border border-black/5 bg-white shadow-sm transition-transform ${checked ? "translate-x-[41px]" : "translate-x-[3px]"}`} />
      </span>
  );
}
